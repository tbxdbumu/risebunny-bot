/**
 * r!girisrol — Sunucuya giren kullanıcıya otomatik rol ver.
 *
 * NEDEN AYRI KOMUT: eski `r!otorol-ayarla` sadece "bir rol + bir kanal"
 * biliyordu ve sunucuya giren herkese (botlar dahil) aynı rolü veriyordu.
 * Burada rol listesi, zamanlama ve istisnalar var.
 *
 * ── Alt komutlar ──
 *   ekle @rol [@rol2 ...]   rol(ler)i listeye EKLER (çoklu, sırayla verilir)
 *   sil @rol | --hepsi      listeden çıkarır / listeyi tamamen temizler
 *   liste                   mevcut ayarı gösterir
 *   kapat / aç              otomatik rolü devre dışı / etkin
 *   kanal #kanal | kanal-sil  bildirim kanalı (opsiyonel)
 *   bot [aç|kapat]          botlara da rol verilsin mi (varsayılan: HAYIR)
 *   misafir [aç|kapat]      yeni hesap (< N gün) rol almasın (varsayılan: HAYIR)
 *   rol [aç|kapat]          rol verilemeden önce "kayıtsız/sorgulanan" rolünü
 *                           otomatik kaldır (varsayılan: aç)
 *
 * ── DB anahtarları (hepsi sunucu bazlı) ──
 *   girisrol_idler_<gid>   string[]  verilecek rol ID'leri (sırayla)
 *   girisrol_acik_<gid>    0|1       açık mı (yok = açık, liste varsa)
 *   girisrol_kanal_<gid>   string    bildirim kanalı
 *   girisrol_bot_<gid>     0|1       botlara rol ver
 *   girisrol_misafir_<gid> 0|1       yeni hesabı atla
 *   girisrol_rolsil_<gid>  0|1       eski kayıtsız rolünü kaldır
 *
 * ── Yetki ──
 * Yalnızca `ManageGuild` (Sunucuyu Yönet). Ayrıca botun rolü, verilecek
 * rolün ÜSTÜNDE değilse Discord API zaten reddeder → tek tek denenir,
 * başarısızlar rapora yazılır (hepsi patlarsa sessiz kalmaz).
 */
const Discord = require("discord.js");
const db = require("croxydb");
const { getLangSync } = require("../dil");
const { ownerLog } = require("../utils");

const ALIASES = ["girisrol", "girişrol", "giris-rol", "giriş-rol", "joinrole", "join-role", "giriş-rol-ayarla"];

/* ───────────────────────────── Yardımcılar ───────────────────────────── */

/** Sunucunun otomatik giriş rolü ayarını tek nesnede döner. */
function ayarAl(guildId) {
  const gid = String(guildId);
  let idler = [];
  try {
    const ham = db.fetch(`girisrol_idler_${gid}`);
    if (Array.isArray(ham)) idler = ham.map(String);
    else if (typeof ham === "string" && ham) idler = [ham]; // eski tek rol kaydı
  } catch {}

  const bayrak = (ad, varsayilan = false) => {
    try {
      const v = db.fetch(`girisrol_${ad}_${gid}`);
      if (v === undefined || v === null) return varsayilan;
      return v === 1 || v === true || v === "1" || v === "true";
    } catch { return varsayilan; }
  };

  let kanal = null;
  try { kanal = db.fetch(`girisrol_kanal_${gid}`) || null; } catch {}

  return {
    idler,
    // liste varsa ve kapatılmadıysa açıktır
    acik: idler.length > 0 && bayrak("acik", true),
    kanal,
    botlara: bayrak("bot", false),
    yeniHesabiAtla: bayrak("misafir", false),
    kayitsizRolunuSil: bayrak("rolsil", true),
  };
}

/** Ayarları kaydeder. */
function ayarYaz(guildId, alan, deger) {
  const gid = String(guildId);
  const anahtar = `girisrol_${alan}_${gid}`;
  try {
    if (deger === null || deger === undefined) db.delete(anahtar);
    else db.set(anahtar, deger);
    return true;
  } catch { return false; }
}

/**
 * Üyeye girilen rolleri sırayla verir.
 * @returns {{verilen:string[], atlanan:string[], hata:string[]}}
 */
async function rolVer(member, idler, secenek = {}) {
  const guild = member.guild;
  const sonuc = { verilen: [], atlanan: [], hata: [] };
  if (!guild || !idler?.length) return sonuc;

  // Rol verilemeden önce eski "kayıtsız/sorgulanan" rolünü kaldır (opsiyonel)
  if (secenek.kayitsizRolunuSil !== false) {
    let eski = null;
    try { eski = db.fetch(`otoRL_${guild.id}`) || null; } catch {}
    if (eski && !idler.includes(String(eski))) {
      try {
        if (member.roles.cache.has(String(eski))) {
          await member.roles.remove(String(eski), "Giriş rolü verildi").catch(() => {});
        }
      } catch {}
    }
  }

  for (const id of idler) {
    const rol = guild.roles.cache.get(String(id));
    if (!rol) { sonuc.atlanan.push(String(id)); continue; }
    // Zaten varsa dokunma
    if (member.roles.cache.has(rol.id)) { sonuc.atlanan.push(rol.id); continue; }
    try {
      // rol.id geçilmeli — nesne geçilirse discord.js bunu resolvable sayar ama
      // mock/cache karşılaştırmalarında ve hata ayıklamada belirsizleşir.
      await member.roles.add(rol.id, "Otomatik giriş rolü");
      sonuc.verilen.push(rol.id);
    } catch (e) {
      sonuc.hata.push(rol.id);
    }
  }
  return sonuc;
}

/** Botun rol hiyerarşisi yeterli mi — kullanıcıya net cevap için. */
function hiyerarsiSorunu(guild, botMember, idler) {
  if (!botMember) return { sorunlu: idler.slice() };
  const botEn = botMember.roles.highest.position;
  const sorunlu = [];
  for (const id of idler) {
    const r = guild.roles.cache.get(String(id));
    if (!r || r.position >= botEn) sorunlu.push(String(id));
  }
  return { sorunlu };
}

/** Yeni hesap kontrolü (varsayılan 7 gün). */
const MISAFIR_GUN = Math.max(0, Number(process.env.GIRISROL_MISAFIR_GUN || 7) || 7);
function yeniHesapMi(user) {
  try { return (Date.now() - user.createdTimestamp) < MISAFIR_GUN * 86400000; }
  catch { return false; }
}

/* ───────────────────────────── Komut ───────────────────────────── */

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  const p = (() => { try { return db.fetch(`prefix.${message.guild.id}`) || ""; } catch { return ""; } })() || "r!";
  const s = (tr, en) => (EN ? en : tr);

  if (!message.guild) return message.channel.send(s("Bu komut sadece sunucuda çalışır.", "This command only works in servers."));
  if (!message.member?.permissions.has(Discord.PermissionFlagsBits.ManageGuild)) {
    return message.channel.send(s("Bu komut için **Sunucuyu Yönet** yetkisi gerekir.", "You need **Manage Server** for this command."));
  }

  const gid = message.guild.id;
  const alt = (args[0] || "").toLowerCase().replace(/^"+|"+$/g, "");
  const ayar = ayarAl(gid);

  const embed = (baslik, aciklama, renk = "Green") =>
    new Discord.EmbedBuilder().setColor(renk).setTitle(baslik).setDescription(aciklama)
      .setFooter({ text: "RiseBunny" }).setTimestamp();

  /* ── Yardım / alt komutsuz ── */
  if (!alt || alt === "yardim" || alt === "help" || alt === "?" ) {
    const rolList = ayar.idler.length
      ? ayar.idler.map(id => { const r = message.guild.roles.cache.get(id); return r ? `${r}` : `\`${id}\` *(silinmiş)*`; }).join(", ")
      : s("*(yok)*", "*(none)*");
    const kanal = ayar.kanal
      ? (message.guild.channels.cache.get(ayar.kanal) ? `<#${ayar.kanal}>` : `\`${ayar.kanal}\` *(silinmiş)*`)
      : s("*(kapalı)*", "*(off)*");

    return message.channel.send({ embeds: [embed(
      s("🚪 Giriş Rolü Ayarları", "🚪 Join Role Settings"),
      s(
        `**Durum:** ${ayar.acik ? "✅ Açık" : "❌ Kapalı"}\n` +
        `**Verilecek roller:** ${rolList}\n` +
        `**Bildirim kanalı:** ${kanal}\n` +
        `**Botlara rol:** ${ayar.botlara ? "açık" : "kapalı"}\n` +
        `**Yeni hesap (< ${MISAFIR_GUN} gün) atlanır:** ${ayar.yeniHesabiAtla ? "evet" : "hayır"}\n` +
        `**Eski kayıtsız rolü kaldırılır:** ${ayar.kayitsizRolunuSil ? "evet" : "hayır"}\n\n` +
        `**Alt komutlar**\n` +
        `\`${p}girisrol ekle @rol [@rol2]\` — rol ekle (çoklu)\n` +
        `\`${p}girisrol sil @rol\` — tek rolü çıkar\n` +
        `\`${p}girisrol sil --hepsi\` — tüm listeyi temizle\n` +
        `\`${p}girisrol kanal #kanal\` — hoş geldin bildirimi\n` +
        `\`${p}girisrol kanal-sil\` — bildirimi kapat\n` +
        `\`${p}girisrol bot aç|kapat\` — botlara rol verilsin mi\n` +
        `\`${p}girisrol misafir aç|kapat\` — yeni hesapları atla\n` +
        `\`${p}girisrol rol aç|kapat\` — kayıtsız rolünü otomatik kaldır\n` +
        `\`${p}girisrol kapat\` / \`${p}girisrol aç\` — sistemi durdur/başlat\n` +
        `\`${p}girisrol liste\` — kısa özet`,
        `**Status:** ${ayar.acik ? "✅ On" : "❌ Off"}\n` +
        `**Roles to give:** ${rolList}\n` +
        `**Log channel:** ${kanal}\n` +
        `**Include bots:** ${ayar.botlara ? "on" : "off"}\n` +
        `**Skip new accounts (< ${MISAFIR_GUN}d):** ${ayar.yeniHesabiAtla ? "yes" : "no"}\n` +
        `**Remove old unverified role:** ${ayar.kayitsizRolunuSil ? "yes" : "no"}\n\n` +
        `**Subcommands**\n` +
        `\`${p}girisrol ekle @role [@role2]\` — add role(s)\n` +
        `\`${p}girisrol sil @role\` — remove one\n` +
        `\`${p}girisrol sil --all\` — clear the list\n` +
        `\`${p}girisrol kanal #channel\` — welcome log channel\n` +
        `\`${p}girisrol kanal-sil\` — turn logging off\n` +
        `\`${p}girisrol bot on|off\` — include bots\n` +
        `\`${p}girisrol misafir on|off\` — skip new accounts\n` +
        `\`${p}girisrol rol on|off\` — strip old unverified role\n` +
        `\`${p}girisrol kapat\` / \`aç\` — disable / enable\n` +
        `\`${p}girisrol liste\` — short summary`
      ),
      "Blue"
    )] });
  }

  /* ── EKLE ── */
  if (["ekle", "add"].includes(alt)) {
    const hedefler = [];
    for (const r of message.mentions.roles.values()) hedefler.push(r.id);
    // etiket dışında ham ID de kabul et
    for (const a of args.slice(1)) {
      const id = String(a).replace(/[<@&>]/g, "");
      if (/^\d{15,25}$/.test(id) && !hedefler.includes(id)) hedefler.push(id);
    }
    if (!hedefler.length) {
      return message.channel.send(embed(s("❌ Rol belirtilmedi", "❌ No role given"),
        s(`Bir rol etiketle: \`${p}girisrol ekle @rol\``, `Mention a role: \`${p}girisrol ekle @role\``), "Red"));
    }

    const botMember = message.guild.members.me;
    const botEn = botMember?.roles.highest.position ?? 0;
    const eklenecek = [], zatenVar = [], yuksek = [];
    for (const id of hedefler) {
      const rol = message.guild.roles.cache.get(id);
      if (!rol) continue;
      // @everyone ya da yönetilemez rol
      if (rol.id === message.guild.id) { yuksek.push(rol); continue; }
      if (rol.managed) { yuksek.push(rol); continue; }
      if (rol.position >= botEn) { yuksek.push(rol); continue; }
      if (ayar.idler.includes(rol.id)) { zatenVar.push(rol); continue; }
      eklenecek.push(rol.id);
    }

    if (!eklenecek.length) {
      const neden = yuksek.length
        ? s(`Şu roller verilemez (botun rolünden yukarıda, @everyone ya da entegrasyon rolü): ${yuksek.map(r => r.name).join(", ")}`,
            `These roles cannot be assigned (above the bot's role, @everyone, or managed): ${yuksek.map(r => r.name).join(", ")}`)
        : s("Bu roller zaten listede.", "Those roles are already in the list.");
      return message.channel.send(embed(s("⚠️ Eklenmedi", "⚠️ Nothing added"), neden, "Orange"));
    }

    const yeni = [...ayar.idler, ...eklenecek];
    ayarYaz(gid, "idler", yeni);
    ayarYaz(gid, "acik", 1);

    const satirlar = [
      s(`**Eklendi:** ${eklenecek.map(id => `<@&${id}>`).join(", ")}`,
        `**Added:** ${eklenecek.map(id => `<@&${id}>`).join(", ")}`),
      zatenVar.length ? s(`**Zaten listede:** ${zatenVar.map(r => r.name).join(", ")}`, `**Already listed:** ${zatenVar.map(r => r.name).join(", ")}`) : "",
      yuksek.length ? s(`**Atlandı:** ${yuksek.map(r => r.name).join(", ")} *(botun rolünden yukarıda / yönetilemez)*`, `**Skipped:** ${yuksek.map(r => r.name).join(", ")} *(above bot role / not assignable)*`) : "",
      "",
      s(`Sunucuya yeni biri girdiğinde bu roller **sırayla** verilir. Sistem **açık**.`,
        `New members will receive these roles **in order**. The system is **on**.`),
    ].filter(Boolean).join("\n");

    await message.channel.send(embed(s("✅ Giriş rolü eklendi", "✅ Join role added"), satirlar));

    return ownerLog(client, new Discord.EmbedBuilder().setColor("Green")
      .setTitle("🚪 Giriş rolü eklendi")
      .setDescription(`**Sunucu:** ${message.guild.name} (\`${gid}\`)\n**Yetkili:** ${message.author.tag}\n**Eklenen:** ${eklenecek.map(id => `<@&${id}>`).join(", ")}`)
      .setTimestamp()).catch(() => {});
  }

  /* ── SİL ── */
  if (["sil", "kaldir", "kaldır", "remove", "delete"].includes(alt)) {
    const hepsi = args.slice(1).some(a => ["--hepsi", "--all", "-a", "hepsi", "all"].includes(String(a).toLowerCase()));
    if (hepsi) {
      ayarYaz(gid, "idler", null);
      ayarYaz(gid, "acik", 0);
      return message.channel.send(embed(s("🗑️ Liste temizlendi", "🗑️ List cleared"),
        s("Otomatik giriş rolü kapatıldı, tüm roller listeden çıkarıldı. Yeniden açmak için `" + p + "girisrol ekle @rol`.",
          "Autorole disabled and every role removed. Re-enable with `" + p + "girisrol ekle @role`."), "Orange"));
    }

    const hedefler = [];
    for (const r of message.mentions.roles.values()) hedefler.push(r.id);
    for (const a of args.slice(1)) {
      const id = String(a).replace(/[<@&>]/g, "");
      if (/^\d{15,25}$/.test(id) && !hedefler.includes(id)) hedefler.push(id);
    }
    if (!hedefler.length) {
      return message.channel.send(embed(s("❌ Rol belirtilmedi", "❌ No role given"),
        s(`\`${p}girisrol sil @rol\` ya da hepsini silmek için \`${p}girisrol sil --hepsi\``,
          `\`${p}girisrol sil @role\` or \`${p}girisrol sil --all\` to clear everything`), "Red"));
    }

    const kalan = ayar.idler.filter(id => !hedefler.includes(id));
    const cikan = ayar.idler.filter(id => hedefler.includes(id));
    if (!cikan.length) {
      return message.channel.send(embed(s("⚠️ Listede yok", "⚠️ Not in the list"),
        s("Bu roller zaten listede değil.", "Those roles are not in the list."), "Orange"));
    }

    ayarYaz(gid, "idler", kalan.length ? kalan : null);
    if (!kalan.length) ayarYaz(gid, "acik", 0);

    return message.channel.send(embed(s("🗑️ Rol çıkarıldı", "🗑️ Role removed"),
      s(`**Çıkarılan:** ${cikan.map(id => `<@&${id}>`).join(", ")}\n**Kalan:** ${kalan.length ? kalan.map(id => `<@&${id}>`).join(", ") : "*(yok — sistem kapandı)*"}`,
        `**Removed:** ${cikan.map(id => `<@&${id}>`).join(", ")}\n**Remaining:** ${kalan.length ? kalan.map(id => `<@&${id}>`).join(", ") : "*(none — system off)*"}`),
      kalan.length ? "Green" : "Orange"));
  }

  /* ── LİSTE ── */
  if (["liste", "list", "durum", "status"].includes(alt)) {
    const rolList = ayar.idler.map(id => {
      const r = message.guild.roles.cache.get(id);
      return r ? `${r}` : `\`${id}\` *(silinmiş)*`;
    }).join("\n") || s("*(yok)*", "*(none)*");
    const kanal = ayar.kanal
      ? (message.guild.channels.cache.get(ayar.kanal) ? `<#${ayar.kanal}>` : `\`${ayar.kanal}\` *(silinmiş)*`)
      : s("*(kapalı)*", "*(off)*");

    // Rol hiyerarşisi uyarısı — sessiz başarısızlığı önler
    const { sorunlu } = hiyerarsiSorunu(message.guild, message.guild.members.me, ayar.idler);
    const uyari = sorunlu.length
      ? `\n\n⚠️ ${s("Şu roller botun rolünden yukarıda, verilemez:", "These roles are above the bot's role and cannot be assigned:")} ${sorunlu.map(id => `<@&${id}>`).join(", ")}\n${s("**Çözüm:** Botun rolünü Sunucu Ayarları → Roller'den yukarı taşı.", "**Fix:** drag the bot's role higher in Server Settings → Roles.")}`
      : "";

    return message.channel.send({ embeds: [embed(
      s(`${ayar.acik ? "✅" : "❌"} Giriş Rolü — ${message.guild.name}`, `${ayar.acik ? "✅" : "❌"} Join Role — ${message.guild.name}`),
      s(`**Durum:** ${ayar.acik ? "Açık" : "Kapalı"}\n**Roller:**\n${rolList}\n**Kanal:** ${kanal}\n**Botlar:** ${ayar.botlara ? "dahil" : "hariç"}\n**Yeni hesap atlama:** ${ayar.yeniHesabiAtla ? `evet (< ${MISAFIR_GUN} gün)` : "hayır"}\n**Kayıtsız rolü kaldır:** ${ayar.kayitsizRolunuSil ? "evet" : "hayır"}`,
        `**Status:** ${ayar.acik ? "On" : "Off"}\n**Roles:**\n${rolList}\n**Channel:** ${kanal}\n**Bots:** ${ayar.botlara ? "included" : "excluded"}\n**Skip new accounts:** ${ayar.yeniHesabiAtla ? `yes (< ${MISAFIR_GUN}d)` : "no"}\n**Strip unverified role:** ${ayar.kayitsizRolunuSil ? "yes" : "no"}`) + uyari,
      ayar.acik ? "Green" : "Red")] });
  }

  /* ── KAPAT / AÇ ── */
  if (["kapat", "off", "kapa"].includes(alt)) {
    if (!ayar.idler.length) {
      return message.channel.send(embed(s("⚠️ Zaten kapalı", "⚠️ Already off"),
        s("Hiç rol tanımlı değil. `" + p + "girisrol ekle @rol` ile başla.", "No roles configured. Start with `" + p + "girisrol ekle @role`."), "Orange"));
    }
    ayarYaz(gid, "acik", 0);
    return message.channel.send(embed(s("⏸️ Giriş rolü kapatıldı", "⏸️ Join role disabled"),
      s("Sunucuya girenlere artık otomatik rol verilmiyor. Roller ve kanal ayarı **silinmedi** — `" + p + "girisrol aç` ile aynen devam eder.",
        "New members no longer get roles automatically. Your role list and channel are **kept** — `" + p + "girisrol aç` resumes exactly where you left off."), "Orange"));
  }

  if (["ac", "aç", "on", "ac_kapa"].includes(alt)) {
    if (!ayar.idler.length) {
      return message.channel.send(embed(s("⚠️ Rol yok", "⚠️ No roles"),
        s(`Önce rol ekle: \`${p}girisrol ekle @rol\``, `Add roles first: \`${p}girisrol ekle @role\``), "Orange"));
    }
    ayarYaz(gid, "acik", 1);
    return message.channel.send(embed(s("▶️ Giriş rolü açıldı", "▶️ Join role enabled"),
      s(`Yeni gelenlere şu roller verilecek: ${ayar.idler.map(id => `<@&${id}>`).join(", ")}`,
        `New members will receive: ${ayar.idler.map(id => `<@&${id}>`).join(", ")}`), "Green"));
  }

  /* ── KANAL ── */
  if (["kanal", "channel"].includes(alt)) {
    const ch = message.mentions.channels.first();
    if (!ch) {
      return message.channel.send(embed(s("❌ Kanal belirtilmedi", "❌ No channel given"),
        s(`\`${p}girisrol kanal #hosgeldin\``, `\`${p}girisrol kanal #welcome\``), "Red"));
    }
    if (!ch.isTextBased()) {
      return message.channel.send(embed(s("❌ Metin kanalı değil", "❌ Not a text channel"),
        s("Bir metin kanalı seç.", "Pick a text channel."), "Red"));
    }
    const izin = ch.permissionsFor(message.guild.members.me);
    if (!izin?.has(Discord.PermissionFlagsBits.SendMessages)) {
      return message.channel.send(embed(s("❌ İzin yok", "❌ Missing permission"),
        s(`O kanala mesaj atamıyorum. <#${ch.id}> kanalında **Mesaj Gönder** iznini ver.`,
          `I cannot send messages there. Grant **Send Messages** in <#${ch.id}>.`), "Red"));
    }
    ayarYaz(gid, "kanal", ch.id);
    return message.channel.send(embed(s("✅ Bildirim kanalı ayarlandı", "✅ Log channel set"),
      s(`Sunucuya katılanlar <#${ch.id}> kanalında duyurulacak. Kapatmak için \`${p}girisrol kanal-sil\`.`,
        `New members will be announced in <#${ch.id}>. Turn it off with \`${p}girisrol kanal-sil\`.`), "Green"));
  }

  if (["kanal-sil", "kanalsil", "kanal-kapat", "channel-off"].includes(alt)) {
    ayarYaz(gid, "kanal", null);
    return message.channel.send(embed(s("🔇 Bildirim kapatıldı", "🔇 Logging off"),
      s("Rol verilmeye devam eder ama kanala mesaj atılmaz.", "Roles are still assigned, but nothing is posted."), "Orange"));
  }

  /* ── ANAHTAR AÇ / KAPAT ── */
  const anahtarAlt = {
    bot: "bot", botlar: "bot", bots: "bot",
    misafir: "misafir", guest: "misafir", yenihesap: "misafir",
    rol: "rolsil", rolsil: "rolsil", kayitsiz: "rolsil", strip: "rolsil",
  };
  if (anahtarAlt[alt]) {
    const alan = anahtarAlt[alt];
    const deger = args[1] ? String(args[1]).toLowerCase() : "";
    const ac = ["ac", "aç", "on", "1", "evet", "yes", "true", "acik", "açık"].includes(deger);
    const kapa = ["kapat", "kapalı", "kapali", "off", "0", "hayir", "hayır", "no", "false"].includes(deger);

    if (!ac && !kapa) {
      // değer yoksa mevcut durumu göster
      const mevcut = alan === "bot" ? ayar.botlara
        : alan === "misafir" ? ayar.yeniHesabiAtla
        : ayar.kayitsizRolunuSil;
      return message.channel.send(embed(
        s(`⚙️ ${alt} — şu an **${mevcut ? "açık" : "kapalı"}**`, `⚙️ ${alt} — currently **${mevcut ? "on" : "off"}**`),
        s(`Değiştirmek için: \`${p}girisrol ${alt} aç\` veya \`${p}girisrol ${alt} kapat\``,
          `Change it with: \`${p}girisrol ${alt} on\` or \`${p}girisrol ${alt} off\``), "Blue"));
    }

    ayarYaz(gid, alan, ac ? 1 : 0);

    const aciklama = {
      bot: ac
        ? s("Botlar da sunucuya eklendiğinde otomatik rol alacak.", "Bots will also receive the role when added.")
        : s("Botlara rol verilmeyecek (önerilen).", "Bots will not receive the role (recommended)."),
      misafir: ac
        ? s(`Hesabı **${MISAFIR_GUN} günden** yeni olanlar rol almayacak (spam hesap koruması).`, `Accounts younger than **${MISAFIR_GUN} days** will be skipped (anti-spam).`)
        : s("Hesap yaşına bakılmadan herkes rol alacak.", "Everyone gets the role regardless of account age."),
      rolsil: ac
        ? s("Rol verilmeden önce eski **kayıtsız/sorgulanan** rolü otomatik kaldırılır.", "The old **unverified** role is removed before the new one is added.")
        : s("Eski kayıtsız rolüne dokunulmaz — üyede iki rol birden kalabilir.", "The old unverified role is left in place — members may keep both."),
    }[alan];

    return message.channel.send(embed(
      s(`${ac ? "✅" : "⏹️"} Ayar güncellendi`, `${ac ? "✅" : "⏹️"} Setting updated`),
      aciklama, ac ? "Green" : "Orange"));
  }

  /* ── Bilinmeyen alt komut ── */
  return message.channel.send(embed(s("❓ Bilinmeyen alt komut", "❓ Unknown subcommand"),
    s(`\`${alt}\` diye bir alt komut yok. Yardım için \`${p}girisrol\``,
      `There is no subcommand named \`${alt}\`. See \`${p}girisrol\``), "Red"));
};

exports.ayarAl = ayarAl;
exports.ayarYaz = ayarYaz;
exports.rolVer = rolVer;
exports.yeniHesapMi = yeniHesapMi;
exports.MISAFIR_GUN = MISAFIR_GUN;

exports.conf = {
  enabled: true,
  guildOnly: true,
  permLevel: 0,
  aliases: ["girisrol", "girişrol", "giris-rol", "giriş-rol", "joinrole", "join-role", "giriş-rol-ayarla"],
};

exports.help = {
  name: "girisrol",
  description: "Sunucuya girenlere otomatik rol verir (çoklu rol, bildirim kanalı, yeni hesap koruması).",
  usage: "girisrol ekle @rol [@rol2]",
};
