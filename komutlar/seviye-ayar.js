/**
 * r!seviye-ayar — Seviye atlama mesajlarının nereye düşeceğini yönetir.
 *
 * Neden ayrı komut: seviye mesajı bot.js:2136'daki `msg.channel.send` ile
 * doğrudan mesajın atıldığı kanala gidiyordu. Yoğun sunucularda bu spam gibi
 * görünüyor; modlar mesajı tamamen kapatmak veya tek bir kanala toplamak
 * istiyor. Ayar yoksa davranış ESKİSİ GİBİ kalır (mesajın atıldığı kanal).
 *
 * Alt komutlar:
 *   (boş) / durum      → mevcut ayarı göster
 *   aç                 → mesajları aç (varsayılan davranış)
 *   kapat              → seviye mesajlarını HİÇ gönderme (XP/ödül işlemeye devam eder)
 *   kanal #kanal       → mesajları tek bir kanala topla
 *   kanal sıfırla      → kanalı temizle, mesajın atıldığı kanala dön
 *   sessiz             → kapat ile aynı (kısayol)
 *
 * Veri: db `seviye_ayar_<guildId>` = { mesaj: "acik"|"kapali", kanal: "id"|null }
 * Not: XP, para ödülü ve rol verme ayardan BAĞIMSIZ çalışır — sadece görsel
 *      bildirim etkilenir.
 */
const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const db = require("croxydb");
const { getLangSync } = require("../dil");

const ANAHTAR = gid => `seviye_ayar_${gid}`;

/** Varsayılan ayar: mesaj açık, mesajın atıldığı kanala gider. */
function ayarAl(guildId) {
  try {
    const kayit = db.fetch(ANAHTAR(guildId));
    if (!kayit || typeof kayit !== "object") return { mesaj: "acik", kanal: null };
    return {
      mesaj: kayit.mesaj === "kapali" ? "kapali" : "acik",
      kanal: kayit.kanal ? String(kayit.kanal) : null
    };
  } catch {
    return { mesaj: "acik", kanal: null };
  }
}

function ayarYaz(guildId, ayar) {
  try {
    db.set(ANAHTAR(guildId), {
      mesaj: ayar.mesaj === "kapali" ? "kapali" : "acik",
      kanal: ayar.kanal || null
    });
    return true;
  } catch {
    return false;
  }
}

function ayarSil(guildId) {
  try { db.delete(ANAHTAR(guildId)); } catch {}
}

/**
 * Seviye mesajı nereye gönderilecek? bot.js ve komutlar seviye bildirimi
 * göndermeden önce bunu çağırır.
 *
 * @param {Guild} guild
 * @param {TextChannel} kaynakKanal mesajın atıldığı kanal
 * @returns {{gonder: boolean, kanal: TextChannel|null, sebep: string}}
 *   gonder=false → hiçbir mesaj gönderilmez (kapalı veya kanal yok)
 */
function seviyeHedefi(guild, kaynakKanal) {
  const ayar = ayarAl(guild?.id);
  if (ayar.mesaj === "kapali") return { gonder: false, kanal: null, sebep: "kapali" };
  if (ayar.kanal) {
    const hedef = guild?.channels?.cache?.get(ayar.kanal);
    // Kanal silinmiş veya yazma izni yoksa sessizce hiç gönderme yerine
    // kaynağa düşmek daha iyi davranış DEĞİL — ayar sahibin iradesidir.
    if (!hedef || !hedef.isTextBased?.()) return { gonder: false, kanal: null, sebep: "kanal-yok" };
    return { gonder: true, kanal: hedef, sebep: "ayarli" };
  }
  if (!kaynakKanal?.isTextBased?.()) return { gonder: false, kanal: null, sebep: "kaynak-yok" };
  return { gonder: true, kanal: kaynakKanal, sebep: "varsayilan" };
}

exports.ayarAl = ayarAl;
exports.ayarYaz = ayarYaz;
exports.ayarSil = ayarSil;
exports.seviyeHedefi = seviyeHedefi;

/* ── Metinler (TR/EN) ── */
const M = {
  tr: {
    yoneticiGerek: "Bu komut için **Sunucuyu Yönet** yetkisi gerekiyor.",
    baslik: "Seviye Mesaj Ayarları",
    durumAcik: "Açık",
    durumKapali: "Kapalı",
    kanalAyarli: "Ayarlandı: {kanal}",
    kanalVarsayilan: "Varsayılan (mesajın atıldığı kanal)",
    kanalYok: "Kanal silinmiş veya erişilemiyor: `{id}`",
    acildi: "Seviye mesajları **açıldı**. Mesajlar {hedef} düşecek.",
    kapatildi: "Seviye mesajları **kapatıldı**. XP, para ödülü ve rol verme çalışmaya devam eder — sadece bildirim gösterilmez.",
    kanalAylandi: "Seviye mesajları artık {kanal} kanalına düşecek.",
    kanalSifirlandi: "Kanal ayarı silindi. Mesajlar tekrar mesajın atıldığı kanala düşecek.",
    kanalGerekli: "Bir kanal etiketlemelisin: `r!seviye-ayar kanal #kanal`",
    kanalMetinDegil: "Bu kanal metin kanalı değil. Bir metin kanalı etiketle.",
    kanalYetkiYok: "{kanal} kanalına **Mesaj Gönder** iznim yok. Önce izni ver.",
    kvEkle: "Alt komutlar",
    kvDurum: "`r!seviye-ayar` — mevcut ayarı göster",
    kvAc: "`r!seviye-ayar aç` — mesajları aç",
    kvKapat: "`r!seviye-ayar kapat` — mesajları tamamen kapat",
    kvKanal: "`r!seviye-ayar kanal #kanal` — tek kanala topla",
    kvSifirla: "`r!seviye-ayar kanal sıfırla` — kanalı temizle",
    not: "Seviye mesajları kapatılsa bile XP kazanma, para ödülü ve seviye rolü verilmesi etkilenmez.",
    hata: "Ayar kaydedilemedi. Tekrar dene.",
    bilinmeyen: "Bilinmeyen alt komut: `{alt}`"
  },
  en: {
    yoneticiGerek: "This command requires **Manage Server** permission.",
    baslik: "Level Message Settings",
    durumAcik: "Enabled",
    durumKapali: "Disabled",
    kanalAyarli: "Set: {kanal}",
    kanalVarsayilan: "Default (the channel where the message was sent)",
    kanalYok: "Channel deleted or inaccessible: `{id}`",
    acildi: "Level messages **enabled**. They will be posted to {hedef}.",
    kapatildi: "Level messages **disabled**. XP, cash rewards and role grants keep working — only the notification is hidden.",
    kanalAylandi: "Level messages will now be posted to {kanal}.",
    kanalSifirlandi: "Channel setting cleared. Messages will go back to the channel where the message was sent.",
    kanalGerekli: "You must mention a channel: `r!level-settings channel #channel`",
    kanalMetinDegil: "That is not a text channel. Mention a text channel.",
    kanalYetkiYok: "I lack **Send Messages** permission in {kanal}. Grant it first.",
    kvEkle: "Subcommands",
    kvDurum: "`r!level-settings` — show current settings",
    kvAc: "`r!level-settings on` — enable messages",
    kvKapat: "`r!level-settings off` — disable messages entirely",
    kvKanal: "`r!level-settings channel #channel` — collect into one channel",
    kvSifirla: "`r!level-settings channel reset` — clear the channel",
    not: "Disabling level messages does not affect earning XP, cash rewards or level role grants.",
    hata: "Could not save the setting. Try again.",
    bilinmeyen: "Unknown subcommand: `{alt}`"
  }
};

function m(lang, key, vars = {}) {
  const d = M[lang] === "en" || lang === "en" ? M.en : M.tr;
  const s = d[key] !== undefined ? d[key] : M.tr[key];
  if (typeof s !== "string") return key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

const EVET = ["aç", "ac", "açık", "acik", "on", "enable", "aktif"];
const HAYIR = ["kapat", "off", "disable", "kapat2", "sessiz", "silent", "gizle", "hide"];
const SIFIRLA = ["sıfırla", "sifirla", "reset", "temizle", "clear", "sil", "kaldır", "kaldir"];

function durumEmbed(lang, guild, ayar) {
  let kanalMetni;
  if (!ayar.kanal) {
    kanalMetni = m(lang, "kanalVarsayilan");
  } else {
    const c = guild.channels.cache.get(ayar.kanal);
    kanalMetni = c
      ? m(lang, "kanalAyarli", { kanal: `${c}` })
      : m(lang, "kanalYok", { id: ayar.kanal });
  }
  return new EmbedBuilder()
    .setColor(ayar.mesaj === "acik" ? "Green" : "Red")
    .setTitle(m(lang, "baslik"))
    .addFields(
      { name: lang === "en" ? "Messages" : "Mesajlar", value: ayar.mesaj === "acik" ? m(lang, "durumAcik") : m(lang, "durumKapali"), inline: true },
      { name: lang === "en" ? "Channel" : "Kanal", value: kanalMetni, inline: true }
    )
    .addFields({ name: m(lang, "kvEkle"), value: [m(lang, "kvDurum"), m(lang, "kvAc"), m(lang, "kvKapat"), m(lang, "kvKanal"), m(lang, "kvSifirla")].join("\n") })
    .setFooter({ text: m(lang, "not") });
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id) === "en" ? "en" : "tr";
  if (!message.guild) return;

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
    return message.reply(m(lang, "yoneticiGerek")).catch(() => {});
  }

  const alt = (args[0] || "").toLowerCase();
  const gid = message.guild.id;

  // ── Durum (alt komut yok) ──
  if (!alt || ["durum", "status", "ayar", "settings"].includes(alt)) {
    return message.reply({ embeds: [durumEmbed(lang, message.guild, ayarAl(gid))] }).catch(() => {});
  }

  // ── Aç ──
  if (EVET.includes(alt)) {
    const ayar = ayarAl(gid);
    ayar.mesaj = "acik";
    if (!ayarYaz(gid, ayar)) return message.reply(m(lang, "hata")).catch(() => {});
    const hedef = ayar.kanal
      ? (message.guild.channels.cache.get(ayar.kanal) ? `${message.guild.channels.cache.get(ayar.kanal)}` : m(lang, "kanalVarsayilan"))
      : m(lang, "kanalVarsayilan");
    return message.reply(m(lang, "acildi", { hedef })).catch(() => {});
  }

  // ── Kapat ──
  if (HAYIR.includes(alt)) {
    const ayar = ayarAl(gid);
    ayar.mesaj = "kapali";
    if (!ayarYaz(gid, ayar)) return message.reply(m(lang, "hata")).catch(() => {});
    return message.reply(m(lang, "kapatildi")).catch(() => {});
  }

  // ── Kanal ──
  if (["kanal", "channel"].includes(alt)) {
    const hedefArg = (args[1] || "").toLowerCase();

    // kanal sıfırla
    if (!hedefArg || SIFIRLA.includes(hedefArg)) {
      const ayar = ayarAl(gid);
      ayar.kanal = null;
      if (!ayarYaz(gid, ayar)) return message.reply(m(lang, "hata")).catch(() => {});
      return message.reply(m(lang, "kanalSifirlandi")).catch(() => {});
    }

    // kanal #x  veya  kanal <id>
    let kanal = message.mentions.channels.find(c => c.type === ChannelType.GuildText || c.type === ChannelType.GuildAnnouncement);
    if (!kanal) {
      const idAday = String(args.slice(1).join("")).replace(/\D/g, "");
      if (idAday) kanal = message.guild.channels.cache.get(idAday) || null;
    }
    if (!kanal) return message.reply(m(lang, "kanalGerekli")).catch(() => {});
    if (!kanal.isTextBased?.()) return message.reply(m(lang, "kanalMetinDegil")).catch(() => {});

    // Bot o kanala yazabiliyor mu? Yazamıyorsa ayar sessizce ölür → baştan söyle.
    const ben = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    const yetki = ben ? kanal.permissionsFor(ben) : null;
    if (!yetki?.has(PermissionFlagsBits.SendMessages)) {
      return message.reply(m(lang, "kanalYetkiYok", { kanal: `${kanal}` })).catch(() => {});
    }

    const ayar = ayarAl(gid);
    ayar.kanal = kanal.id;
    // Kanal ayarlanınca kullanıcı mesaj görmek istiyor demektir; kapalıysa aç.
    if (ayar.mesaj === "kapali") ayar.mesaj = "acik";
    if (!ayarYaz(gid, ayar)) return message.reply(m(lang, "hata")).catch(() => {});
    return message.reply(m(lang, "kanalAylandi", { kanal: `${kanal}` })).catch(() => {});
  }

  return message.reply(m(lang, "bilinmeyen", { alt })).catch(() => {});
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["seviye-ayar", "seviyeayar", "level-settings", "levelsettings", "seviyemesaj"],
  permLevel: 0, // gerçek yetki run içinde ManageGuild olarak denetlenir
  kategori: "seviye"
};

exports.help = {
  name: "seviye-ayar",
  description: "Seviye atlama mesajlarını açar/kapatır veya tek bir kanala toplar.",
  usage: "seviye-ayar [durum | aç | kapat | kanal #kanal | kanal sıfırla]"
};
