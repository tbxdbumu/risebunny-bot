/**
 * komutlar/toplurol.js — Toplu rol verme / silme
 *
 * KULLANIM
 *   r!toplurol ver @rol [hedef]      → role ekle
 *   r!toplurol sil @rol [hedef]      → rolden çıkar
 *   r!toplurol liste [@rol]          → role sahip üyeler
 *   r!toplurol say @rol              → üye sayısı
 *
 * HEDEFLER
 *   insanlar | humans         → insan üyeler
 *   botlar | bots             → botlar
 *   herkes | everyone         → tüm üyeler
 *   kayıtsız | unregistered   → "kayıtsız" rolüne sahip üyeler
 *   seviye <n> | level <n>    → seviyesi >= n olanlar
 *   altı @rol | below @rol    → @rol'ün altındaki rollere sahip olanlar
 *   @rol1 @rol2               → @rol1'e sahip olanları @rol2 işlemi için hedefle
 *   (hedef yok)               → herkes
 *
 * GÜVENLİK
 * - İşlem öncesi onay butonlu mesaj gönderilir (5 dk).
 * - Rol, botun en üst rolünün üstündeyse reddedilir.
 * - Sunucu başına aynı anda yalnızca 1 işlem çalışır.
 * - Discord rate limit'i için 250ms bekleme; hata olursa üye atlanır.
 */
const {
  EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const { xpSeviye } = require("../utils");

const CALISAN = new Map(); // guildId → { basladi }
const ONAY = new Map();    // onayId → { guildId, userId, islem, rolId, hedef }
const ADIM_GECIKME = 250;
const MAX_LISTE = 50;

const uyu = (s) => {
  const v = String(s || "").toLowerCase();
  if (["insanlar", "humans", "human", "kullanıcılar", "kullanicilar"].includes(v)) return "insanlar";
  if (["botlar", "bots", "bot"].includes(v)) return "botlar";
  if (["herkes", "everyone", "all", "tümü", "tumu"].includes(v)) return "herkes";
  if (["kayıtsız", "kayitsiz", "unregistered", "unreg"].includes(v)) return "kayıtsız";
  if (["seviye", "level"].includes(v)) return "seviye";
  if (["altı", "alti", "below", "under"].includes(v)) return "altı";
  return null;
};

function rolBul(message, args) {
  const arr = [...message.mentions.roles.values()].filter(r => r.id !== message.guild.id);
  if (arr.length) return arr[0];
  for (const a of args) {
    if (/^\d{15,22}$/.test(a)) {
      const r = message.guild.roles.cache.get(a);
      if (r) return r;
    }
  }
  return null;
}

/** İşlem rolü = ilk etiketlenen rol. `ver @rol ...` biçiminde args[1]. */
function islemRolBul(message, args) {
  const arr = [...message.mentions.roles.values()].filter(r => r.id !== message.guild.id);
  if (arr.length) return { rol: arr[0], digerleri: arr.slice(1) };
  for (const a of args) {
    if (/^\d{15,22}$/.test(a)) {
      const r = message.guild.roles.cache.get(a);
      if (r) return { rol: r, digerleri: [] };
    }
  }
  return { rol: null, digerleri: [] };
}

function rolBulById(gid, id) {
  return null; // message.guild kullanılır
}

/** Hedef üyeleri çözer. */
async function hedefCoz(message, hedefLive) {
  const guild = message.guild;
  await guild.members.fetch().catch(() => {}); // tüm üyeleri yükle
  const uyeler = [...guild.members.cache.values()];
  const { tip, arg } = hedefLive;

  if (tip === "herkes") return uyeler;

  if (tip === "insanlar") return uyeler.filter(m => !m.user.bot);
  if (tip === "botlar") return uyeler.filter(m => m.user.bot);

  if (tip === "kayıtsız") {
    const rolId = db.fetch(`kayitsiz_${guild.id}`) ||
                  db.fetch(`y-kayıtsız_${guild.id}`) ||
                  db.fetch(`kayitsizRol_${guild.id}`);
    if (!rolId) return null;
    return uyeler.filter(m => m.roles.cache.has(rolId));
  }

  if (tip === "seviye") {
    const n = Math.max(1, parseInt(arg, 10) || 1);
    return uyeler.filter(m => {
      const xp = Number(db.fetch(`xp_${m.id}`) || 0);
      return xpSeviye(xp) >= n;
    });
  }

  if (tip === "altı") {
    const altRol = guild.roles.cache.get(arg);
    if (!altRol) return null;
    return uyeler.filter(m => {
      const enUst = m.roles.highest;
      return enUst && altRol.position > enUst.position;
    });
  }

  if (tip === "rol") {
    const hedefRol = guild.roles.cache.get(arg);
    if (!hedefRol) return null;
    return uyeler.filter(m => m.roles.cache.has(hedefRol.id));
  }

  return uyeler;
}

/** Hedef argümanlarını ayrıştırır. */
function hedefArgParse(message, args, digerleri) {
  const { rol: islemRol } = islemRolBul(message, args);
  if (!islemRol) return null;

  // İşlem rolü ve (varsa) diğer roller dışındaki kelimeler
  const rolIdleri = new Set([islemRol.id, ...(digerleri || []).map(r => r.id)]);
  const metin = args
    .slice(1) // "ver"/"sil"
    .filter(a => !(/^\d{15,22}$/.test(a) && rolIdleri.has(a)) && !a.startsWith("<@&"))
    .join(" ")
    .trim();

  if (!metin) return { islemRol, hedef: { tip: "herkes", arg: null } };

  const parcalar = metin.split(/\s+/);
  const tip = uyu(parcalar[0]);

  if (tip === "seviye")
    return { islemRol, hedef: { tip: "seviye", arg: parcalar[1] } };
  if (tip === "altı")
    return { islemRol, hedef: { tip: "altı", arg: (digerleri && digerleri[0] && digerleri[0].id) || null } };
  if (tip)
    return { islemRol, hedef: { tip, arg: null } };

  // Metin bir rol adı ise onu hedef rol olarak kullan (isimle)
  const isimle = message.guild.roles.cache.find(r => r.name.toLowerCase() === metin.toLowerCase());
  if (isimle) return { islemRol, hedef: { tip: "rol", arg: isimle.id } };

  return { islemRol, hedef: { tip: "herkes", arg: null } };
}

/** Aynı anda aynı üyeye aynı işlemi yapan kuyruk. */
async function topluCalistir(client, guild, islem, rolId, uyeler, lang) {
  const rol = guild.roles.cache.get(rolId) || await guild.roles.fetch(rolId).catch(() => null);
  if (!rol) return null;

  let ok = 0, atla = 0, hata = 0;
  const bas = Date.now();
  const arr = [...uyeler];

  for (let i = 0; i < arr.length; i++) {
    const m = arr[i];
    try {
      const varMi = m.roles.cache.has(rol.id);
      if (islem === "ver") {
        if (varMi) { atla++; continue; }
        await m.roles.add(rol.id, "Toplu rol: ver");
        ok++;
      } else {
        if (!varMi) { atla++; continue; }
        await m.roles.remove(rol.id, "Toplu rol: sil");
        ok++;
      }
    } catch {
      hata++;
    }
    // Her 50 üyede bir durum güncellemesi
    if (i > 0 && i % 50 === 0) await new Promise(r => setTimeout(r, ADIM_GECIKME));
    else await new Promise(r => setTimeout(r, 60));
  }

  return { ok, atla, hata, sure: Math.round((Date.now() - bas) / 1000) };
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const gid = message.guild.id;

  if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
    return message.reply(t(lang, "toplurol.yetki"));
  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return message.reply(t(lang, "toplurol.botYetki"));

  const sub = (args[0] || "").toLowerCase();
  const isVer = ["ver", "add", "given"].includes(sub);
  const isSil = ["sil", "remove", "al"].includes(sub);
  const isListe = ["liste", "list"].includes(sub);
  const isSay = ["say", "count"].includes(sub);

  if (!isVer && !isSil && !isListe && !isSay) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#ee7621")
        .setTitle(t(lang, "toplurol.yardimBaslik"))
        .setDescription(t(lang, "toplurol.yardimIcerik"))]
    });
  }

  // liste / say
  if (isListe || isSay) {
    const rol = rolBul(message, args.slice(1));
    if (!rol) return message.reply(t(lang, "toplurol.rolGerek"));
    await message.guild.members.fetch().catch(() => {});
    const sahipler = message.guild.members.cache.filter(m => m.roles.cache.has(rol.id));
    if (!sahipler.size) return message.reply(t(lang, "toplurol.listeYok"));
    if (isSay) return message.reply(t(lang, "toplurol.sayi", { adet: sahipler.size, rol: `<@&${rol.id}>` }));

    const arr = [...sahipler.values()].slice(0, MAX_LISTE);
    const satirlar = arr.map(m => `<@${m.id}> (${m.user.tag})`);
    const ek = sahipler.size > MAX_LISTE ? "\n" + t(lang, "toplurol.cokUye", { adet: sahipler.size, n: MAX_LISTE }) : "";
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#ee7621")
        .setTitle(t(lang, "toplurol.listeBaslik", { rol: rol.name }))
        .setDescription(satirlar.join("\n").slice(0, 3800) + ek)]
    });
  }

  // ver / sil
  const { rol: _islemRol, digerleri } = islemRolBul(message, args);
  const parse = hedefArgParse(message, args, digerleri);
  if (!parse) return message.reply(t(lang, "toplurol.rolGerek"));
  const { islemRol, hedef } = parse;

  // Bot rolü kontrolü
  const botEnUst = message.guild.members.me.roles.highest;
  if (islemRol.position >= botEnUst.position) {
    return message.reply(t(lang, "toplurol.rolYuksek", { rol: islemRol.name }));
  }

  // Akan işlem kontrolü
  if (CALISAN.has(gid)) {
    return message.reply(t(lang, "toplurol.islemDevam"));
  }

  // Hedef üyeleri çöz
  const uyeler = await hedefCoz(message, hedef);
  if (!uyeler) return message.reply(t(lang, "toplurol.hedefGerek"));
  if (!uyeler.length) return message.reply(t(lang, "toplurol.hedefYok"));

  const islemAd = isVer ? t(lang, "toplurol.verBaslik") : t(lang, "toplurol.silBaslik");

  // Onay butonu
  const onayId = `${gid}_${message.author.id}_${Date.now()}`;
  ONAY.set(onayId, { guildId: gid, userId: message.author.id, islem: isVer ? "ver" : "sil", rolId: islemRol.id, uyeler });

  // 5 dk sonra onayı düşür
  setTimeout(() => ONAY.delete(onayId), 5 * 60 * 1000);

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`trv_yes_${onayId}`).setLabel(t(lang, "toplurol.onayBtn")).setStyle(ButtonStyle.Success).setEmoji("✅"),
    new ButtonBuilder().setCustomId(`trv_no_${onayId}`).setLabel(t(lang, "toplurol.iptalBtn")).setStyle(ButtonStyle.Secondary).setEmoji("✖️")
  );

  return message.reply({
    embeds: [new EmbedBuilder().setColor("#f1c40f")
      .setTitle(t(lang, "toplurol.onayBaslik"))
      .setDescription(t(lang, "toplurol.onayAciklama", {
        islem: islemAd,
        adet: uyeler.length,
        rol: `<@&${islemRol.id}>`
      }))],
    components: [row]
  });
};

/** Button handler buradan çağırır. */
exports.onayIsle = async (client, interaction, lang) => {
  const id = interaction.customId || "";
  const onayMi = id.startsWith("trv_yes_");
  const onayId = onayMi ? id.slice("trv_yes_".length) : id.slice("trv_no_".length);
  const kayit = ONAY.get(onayId);
  if (!kayit) return interaction.reply({ content: t(lang, "toplurol.iptal"), ephemeral: true }).catch(() => {});
  ONAY.delete(onayId);

  if (!onayMi) {
    return interaction.update({
      embeds: [new EmbedBuilder().setColor("Red").setTitle(t(lang, "toplurol.iptal"))],
      components: []
    }).catch(() => {});
  }

  // Sadece çağıran kişi onaylayabilir
  if (interaction.user.id !== kayit.userId)
    return interaction.reply({ content: t(lang, "ortak.yetki", { yetki: "—" }), ephemeral: true }).catch(() => {});

  if (CALISAN.has(kayit.guildId)) {
    return interaction.update({
      embeds: [new EmbedBuilder().setColor("Red").setDescription(t(lang, "toplurol.islemDevam"))],
      components: []
    }).catch(() => {});
  }

  const guild = interaction.guild;
  const rol = guild.roles.cache.get(kayit.rolId);
  if (!rol) return interaction.update({
    embeds: [new EmbedBuilder().setColor("Red").setDescription(t(lang, "toplurol.hedefYok"))],
    components: []
  }).catch(() => {});

  CALISAN.set(kayit.guildId, true);
  const islemAd = kayit.islem === "ver" ? t(lang, "toplurol.verBaslik") : t(lang, "toplurol.silBaslik");

  await interaction.update({
    embeds: [new EmbedBuilder().setColor("#3498db")
      .setTitle(t(lang, "toplurol.baslatildi", { islem: islemAd, rol: `<@&${kayit.rolId}>`, adet: kayit.uyeler.length }))],
    components: []
  }).catch(() => {});

  try {
    const r = await topluCalistir(client, guild, kayit.islem, kayit.rolId, kayit.uyeler, lang);
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(r.hata ? "#e67e22" : "Green")
        .setTitle(t(lang, "toplurol.bitti", { ok: r.ok, atla: r.atla, hata: r.hata, sure: r.sure }).split("\n")[0])
        .setDescription(t(lang, "toplurol.bitti", { ok: r.ok, atla: r.atla, hata: r.hata, sure: r.sure }))]
    }).catch(() => {});
  } catch (e) {
    await interaction.followUp({ content: t(lang, "ortak.hata"), flags: 64 }).catch(() => {});
  } finally {
    CALISAN.delete(kayit.guildId);
  }
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["toplurol", "bulkrole", "toplu-rol"], permLevel: 0, kategori: "rol" };
exports.help = { name: "toplurol", description: "Toplu rol verir/siler/listeler.", usage: "toplurol ver|sil|liste|say @rol [hedef]" };
