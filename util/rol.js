/**
 * util/rol.js — Tepki Rol & Rol Butonu motoru
 *
 * DB ŞEMASI
 * ---------
 * tepkirol.<guildId>.<messageId> = {
 *   kanalId: string,
 *   tur: "emoji" | "buton",
 *   secim: "tek" | "cok",          // tek = yalnız bir rol aktif
 *   baslik: string,
 *   aciklama: string,
 *   roller: [ { emoji?: string, rolId: string, label?: string, style?: number } ]
 * }
 * rolbuton.<guildId> = [ { kanalId, messageId }, ... ]   // listeleme için
 *
 * Metinler `dil/{tr,en}.js → tepkirol.*` altında; burası yalnızca
 * varsayılan metni `t(lang, ...)` ile çeker.
 */
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits
} = require("discord.js");
const db = require("croxydb");
const { getLang, t } = require("../dil");

const MAX_ROL = 20;
const BUTON_SATIR = 5;

/** `<:ad:id>` / `<a:ad:id>` / unicode → kıyaslanabilir anahtar. */
function emojiAnahtar(e) {
  if (!e) return "";
  const s = String(e).trim();
  const m = /^<a?:([a-zA-Z0-9_~]+):(\d+)>$/.exec(s);
  if (m) return `:${m[1]}:${m[2]}`;
  return s;
}

/** Bir ReactionEmoji ile hedef emoji metni eşleşiyor mu? */
function emojiEsle(reactionEmoji, hedef) {
  if (!reactionEmoji) return false;
  if (reactionEmoji.id) {
    return emojiAnahtar(hedef) === `:${reactionEmoji.name}:${reactionEmoji.id}`;
  }
  return emojiAnahtar(hedef) === emojiAnahtar(reactionEmoji.name || reactionEmoji.toString());
}

function kayitGetir(guildId, messageId) {
  const r = db.fetch(`tepkirol.${guildId}.${messageId}`);
  return r && Array.isArray(r.roller) ? r : null;
}

function kayitYaz(guildId, messageId, kayit) {
  db.set(`tepkirol.${guildId}.${messageId}`, kayit);
}

function kayitSil(guildId, messageId) {
  try { db.delete(`tepkirol.${guildId}.${messageId}`); } catch {}
  try {
    const liste = (db.fetch(`rolbuton.${guildId}`) || []).filter(x => x.messageId !== messageId);
    if (liste.length) db.set(`rolbuton.${guildId}`, liste);
    else db.delete(`rolbuton.${guildId}`);
  } catch {}
}

function guildKayitlari(guildId) {
  const all = db.all() || {};
  const on = `tepkirol.${guildId}.`;
  return Object.entries(all)
    .filter(([k]) => k.startsWith(on))
    .map(([k, v]) => ({ messageId: k.slice(on.length), ...(v || {}) }))
    .filter(x => Array.isArray(x.roller));
}

/**
 * Emoji tepkisi → rol ver/al.
 * @returns {Promise<"rol-verildi"|"rol-alindi"|"rol-yok"|null>}
 */
async function emojiTepkiIsle(reaction, user, eklendi) {
  const guild = reaction?.message?.guild;
  if (!guild || !user || user.bot) return null;
  const messageId = reaction?.message?.id;
  if (!messageId) return null;

  const kayit = kayitGetir(guild.id, messageId);
  if (!kayit || kayit.tur === "buton") return null;

  const hedef = (kayit.roller || []).find(r => emojiEsle(reaction.emoji, r.emoji));
  if (!hedef) return null;

  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return null;
  const rol = guild.roles.cache.get(hedef.rolId) || await guild.roles.fetch(hedef.rolId).catch(() => null);
  if (!rol) return "rol-yok";

  try {
    if (eklendi) {
      if (kayit.secim === "tek") {
        const digerleri = (kayit.roller || [])
          .filter(r => r.rolId !== hedef.rolId)
          .map(r => guild.roles.cache.get(r.rolId))
          .filter(Boolean)
          .filter(r => member.roles.cache.has(r.id));
        if (digerleri.length) {
          await member.roles.remove(digerleri.map(r => r.id), "Tepki rol: tek seçim").catch(() => {});
        }
      }
      if (!member.roles.cache.has(rol.id)) {
        await member.roles.add(rol.id, "Tepki rol").catch(() => {});
        return "rol-verildi";
      }
    } else if (member.roles.cache.has(rol.id)) {
      await member.roles.remove(rol.id, "Tepki rol kaldırıldı").catch(() => {});
      return "rol-alindi";
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Butona basıldığında çağırılır (interactionCreate'ten).
 * @returns {Promise<"rol-verildi"|"rol-alindi"|"rol-yok"|"tek-secim"|null>}
 */
async function butonIsle(interaction, messageId, rolId) {
  const guild = interaction.guild;
  if (!guild) return null;
  const kayit = kayitGetir(guild.id, messageId);
  if (!kayit || kayit.tur !== "buton") return null;

  const hedef = (kayit.roller || []).find(r => r.rolId === rolId);
  if (!hedef) return null;

  const member = interaction.member;
  if (!member) return null;
  const rol = guild.roles.cache.get(rolId) || await guild.roles.fetch(rolId).catch(() => null);
  if (!rol) return "rol-yok";

  try {
    if (member.roles.cache.has(rol.id)) {
      if (kayit.secim === "tek") return "tek-secim";
      await member.roles.remove(rol.id, "Rol butonu").catch(() => {});
      return "rol-alindi";
    }
    if (kayit.secim === "tek") {
      const digerleri = (kayit.roller || [])
        .filter(r => r.rolId !== rolId)
        .map(r => guild.roles.cache.get(r.rolId))
        .filter(Boolean)
        .filter(r => member.roles.cache.has(r.id));
      if (digerleri.length) {
        await member.roles.remove(digerleri.map(r => r.id), "Tepki rol: tek seçim").catch(() => {});
      }
    }
    await member.roles.add(rol.id, "Rol butonu").catch(() => {});
    return "rol-verildi";
  } catch {
    return null;
  }
}

/** Panel embed'i + bileşenleri. */
function panelOlustur(guild, kayit, lang) {
  const embed = new EmbedBuilder()
    .setColor("#ee7621")
    .setTitle(kayit.baslik || t(lang, "tepkirol.varsayilanBaslik"))
    .setDescription(
      kayit.aciklama ||
      `${t(lang, "tepkirol.varsayilanAciklama")}\n` +
      (kayit.secim === "tek" ? t(lang, "tepkirol.tekSecimNotu") : t(lang, "tepkirol.cokSecimNotu"))
    )
    .setFooter({ text: t(lang, "tepkirol.panelFt") });

  const roller = (kayit.roller || []).slice(0, MAX_ROL);
  const bilesenler = [];

  if (kayit.tur === "buton") {
    for (let i = 0; i < roller.length; i += BUTON_SATIR) {
      const row = new ActionRowBuilder();
      for (const r of roller.slice(i, i + BUTON_SATIR)) {
        const rol = guild.roles.cache.get(r.rolId);
        if (!rol) continue;
        const btn = new ButtonBuilder()
          .setCustomId(`rr_${rol.id}`)
          .setLabel((r.label || rol.name).slice(0, 80))
          .setStyle(r.style || ButtonStyle.Secondary);
        if (r.emoji) btn.setEmoji(r.emoji);
        row.addComponents(btn);
      }
      if (row.components.length) bilesenler.push(row);
    }
  }

  return { embeds: [embed], components: bilesenler };
}

/** Yeni panel mesajı gönderir ve kaydı yazar. */
async function rolMesajiGonder(client, guild, channel, ayar, lang = "tr") {
  const taslak = {
    kanalId: channel.id,
    tur: ayar.tur === "buton" ? "buton" : "emoji",
    secim: ayar.secim === "tek" ? "tek" : "cok",
    baslik: ayar.baslik || "",
    aciklama: ayar.aciklama || "",
    roller: (ayar.roller || []).slice(0, MAX_ROL)
  };

  const payload = panelOlustur(guild, taslak, lang);
  const mesaj = await channel.send(payload);
  if (taslak.tur === "emoji") {
    for (const r of taslak.roller) await mesaj.react(r.emoji).catch(() => {});
  }

  kayitYaz(guild.id, mesaj.id, taslak);
  if (taslak.tur === "buton") {
    const liste = db.fetch(`rolbuton.${guild.id}`) || [];
    liste.push({ kanalId: channel.id, messageId: mesaj.id });
    db.set(`rolbuton.${guild.id}`, liste);
  }
  return mesaj;
}

/** Var olan panel mesajını yeni içerikle yerinde günceller (silip yeniden atmaz). */
async function rolMesajiYenile(client, guild, messageId) {
  const kayit = kayitGetir(guild.id, messageId);
  if (!kayit) return null;
  const channel = guild.channels.cache.get(kayit.kanalId) ||
    await guild.channels.fetch(kayit.kanalId).catch(() => null);
  if (!channel) return null;

  const mesaj = await channel.messages.fetch(messageId).catch(() => null);
  const lang = await getLang(guild.ownerId).catch(() => "tr");
  const payload = panelOlustur(guild, kayit, lang);

  if (mesaj) {
    await mesaj.edit(payload).catch(() => {});
    // Emoji modunda yeni rollerin tepkisi eksik olabilir
    if (kayit.tur === "emoji") {
      for (const r of kayit.roller) await mesaj.react(r.emoji).catch(() => {});
    }
    return mesaj;
  }

  const yeni = await channel.send(payload);
  if (kayit.tur === "emoji") {
    for (const r of kayit.roller) await yeni.react(r.emoji).catch(() => {});
  }
  kayitSil(guild.id, messageId);
  kayitYaz(guild.id, yeni.id, kayit);
  if (kayit.tur === "buton") {
    const liste = (db.fetch(`rolbuton.${guild.id}`) || []).map(x =>
      x.messageId === messageId ? { kanalId: channel.id, messageId: yeni.id } : x
    );
    db.set(`rolbuton.${guild.id}`, liste);
  }
  return yeni;
}

module.exports = {
  emojiAnahtar,
  emojiEsle,
  kayitGetir,
  kayitYaz,
  kayitSil,
  guildKayitlari,
  emojiTepkiIsle,
  butonIsle,
  panelOlustur,
  rolMesajiGonder,
  rolMesajiYenile,
  MAX_ROL,
  PermissionFlagsBits
};

/** Discord hata kodu/etiketini insan diline çevirir. */
function izinHatasi(e) {
  const kod = e?.code;
  if (kod === 50013) return "50013";
  if (kod === 50035) return "50035";
  return null;
}

module.exports.izinHatasi = izinHatasi;
