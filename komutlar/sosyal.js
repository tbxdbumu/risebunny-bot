/**
 * komutlar/sosyal.js — YouTube / RSS bildirimleri (MEE6 Social Alerts)
 *
 * KULLANIM
 *   r!sosyal liste
 *   r!sosyal youtube <kanal-id | @handle | kanal-url> #kanal [mesaj]
 *   r!sosyal rss <feed-url> #kanal [mesaj]
 *   r!sosyal mesaj <id> <yeni metin>
 *   r!sosyal kanal <id> #kanal
 *   r!sosyal aç|kapat <id>
 *   r!sosyal sil <id>
 *   r!sosyal kontrol                 → elle tarama
 *
 * DEĞİŞKENLER: {baslik} {link} {kanal}
 */
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getLangSync, t } = require("../dil");
const { isPremium } = require("../utils");
const sosyal = require("../util/sosyal");

const VARSAYILAN_TR = "🔔 Yeni paylaşım: **{baslik}** {link}";
const VARSAYILAN_EN = "🔔 New post: **{baslik}** {link}";

function metinTopla(args) {
  // İlk #kanal ve URL dışındaki kısım mesaj
  return args
    .filter(a => !a.startsWith("<#") && !/^https?:\/\//i.test(a))
    .join(" ")
    .trim();
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  if (!isPremium(message.author.id)) return message.reply(t(lang, "ortak.premiumGerek"));
  const gid = message.guild.id;
  const alt = (args[0] || "").toLowerCase();

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
    return message.reply(t(lang, "sosyal.yetki"));

  const liste = sosyal.listele(gid);

  /* ── liste ──────────────────────────────────────────────────────────── */
  if (!alt || ["liste", "list"].includes(alt)) {
    if (!liste.length) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor("#ff0000")
          .setTitle(t(lang, "sosyal.baslik"))
          .setDescription(t(lang, "sosyal.bos"))
          .addFields({ name: t(lang, "sosyal.kullanimBaslik"), value: t(lang, "sosyal.kullanim") })]
      });
    }
    const satirlar = liste.map(k =>
      `${k.acik === false ? "⏸️" : "▶️"} \`${k.id}\` **${k.tur === "youtube" ? "▶️ YouTube" : "📡 RSS"}** → <#${k.kanalId}>\n   \`${String(k.kaynak).slice(0, 60)}\``
    );
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#ff0000")
        .setTitle(t(lang, "sosyal.baslik"))
        .setDescription(satirlar.join("\n").slice(0, 3900))]
    });
  }

  /* ── elle kontrol ──────────────────────────────────────────────────── */
  if (["kontrol", "check", "tara", "test"].includes(alt)) {
    await message.channel.sendTyping().catch(() => {});
    const n = await sosyal.tara(client).catch(() => 0);
    return message.reply(t(lang, "sosyal.kontrol", { n }));
  }

  /* ── youtube ────────────────────────────────────────────────────────── */
  if (alt === "youtube") {
    const kaynakHam = args[1];
    const kanal = message.mentions.channels.first();
    if (!kaynakHam) return message.reply(t(lang, "sosyal.kaynakGerek"));
    if (!kanal) return message.reply(t(lang, "sosyal.kanalGerek"));
    if (!kanal.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.SendMessages))
      return message.reply(t(lang, "sosyal.kanalIzin"));

    await message.channel.sendTyping().catch(() => {});
    const cid = await sosyal.youtubeKanalId(kaynakHam).catch(() => null);
    if (!cid) return message.reply(t(lang, "sosyal.youtubeBulunamadi"));

    if (liste.some(k => k.tur === "youtube" && k.kaynak === cid && k.kanalId === kanal.id))
      return message.reply(t(lang, "sosyal.zatenVar"));

    const mesaj = metinTopla(args.slice(2)) ||
      (lang === "en" ? VARSAYILAN_EN : VARSAYILAN_TR);

    const kayit = sosyal.ekle(gid, { tur: "youtube", kaynak: cid, kanalId: kanal.id, mesaj });
    if (!kayit) return message.reply(t(lang, "sosyal.limit", { n: 20 }));

    // İlk taramayı hemen yap (mevcut videoları duyurmadan son ID'yi kaydet)
    sosyal.yeniOgren(kayit).then(y => {
      if (y.length) sosyal.guncelle(gid, kayit.id, { sonId: y[y.length - 1].id });
    }).catch(() => {});

    return message.reply(t(lang, "sosyal.eklendi", {
      id: kayit.id, kanal: `<#${kanal.id}>`, kaynak: cid
    }));
  }

  /* ── rss ────────────────────────────────────────────────────────────── */
  if (alt === "rss") {
    const url = args.find(a => /^https?:\/\//i.test(a));
    const kanal = message.mentions.channels.first();
    if (!url) return message.reply(t(lang, "sosyal.rssGerek"));
    if (!kanal) return message.reply(t(lang, "sosyal.kanalGerek"));
    if (!kanal.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.SendMessages))
      return message.reply(t(lang, "sosyal.kanalIzin"));

    await message.channel.sendTyping().catch(() => {});
    // Geçerlilik: feed ayrıştırılabiliyor mu?
    const metin = await fetch(url, { headers: { "user-agent": "RiseBunny/1.0" } })
      .then(r => (r.ok ? r.text() : null)).catch(() => null);
    const test = metin ? sosyal.feedAyristir(metin).length : 0;
    if (!test) return message.reply(t(lang, "sosyal.rssGecersiz"));

    if (liste.some(k => k.tur === "rss" && k.kaynak === url && k.kanalId === kanal.id))
      return message.reply(t(lang, "sosyal.zatenVar"));

    const mesaj = metinTopla(args.slice(2)) ||
      (lang === "en" ? VARSAYILAN_EN : VARSAYILAN_TR);

    const kayit = sosyal.ekle(gid, { tur: "rss", kaynak: url, kanalId: kanal.id, mesaj });
    if (!kayit) return message.reply(t(lang, "sosyal.limit", { n: 20 }));

    sosyal.yeniOgren(kayit).then(y => {
      if (y.length) sosyal.guncelle(gid, kayit.id, { sonId: y[y.length - 1].id });
    }).catch(() => {});

    return message.reply(t(lang, "sosyal.eklendi", {
      id: kayit.id, kanal: `<#${kanal.id}>`, kaynak: url.slice(0, 80)
    }));
  }

  /* ── id ile işlemler ───────────────────────────────────────────────── */
  const id = (args[1] || "").trim();
  const kayit = id ? sosyal.bul(gid, id) : null;

  if (["sil", "kaldır", "kaldir", "remove", "delete"].includes(alt)) {
    if (!kayit) return message.reply(t(lang, "sosyal.bulunamadi"));
    sosyal.sil(gid, id);
    return message.reply(t(lang, "sosyal.silindi"));
  }

  if (["aç", "ac", "on", "kapat", "off", "kapa"].includes(alt)) {
    if (!kayit) return message.reply(t(lang, "sosyal.bulunamadi"));
    const acik = ["aç", "ac", "on"].includes(alt);
    sosyal.guncelle(gid, id, { acik });
    return message.reply(acik ? t(lang, "sosyal.acik") : t(lang, "sosyal.kapali"));
  }

  if (["kanal", "channel"].includes(alt)) {
    if (!kayit) return message.reply(t(lang, "sosyal.bulunamadi"));
    const kanal = message.mentions.channels.first();
    if (!kanal) return message.reply(t(lang, "sosyal.kanalGerek"));
    sosyal.guncelle(gid, id, { kanalId: kanal.id });
    return message.reply(t(lang, "sosyal.kanalGuncellendi", { kanal: `<#${kanal.id}>` }));
  }

  if (["mesaj", "message", "metin"].includes(alt)) {
    if (!kayit) return message.reply(t(lang, "sosyal.bulunamadi"));
    const metin = args.slice(2).join(" ").replace(/\\n/g, "\n").trim();
    if (!metin) return message.reply(t(lang, "sosyal.mesajGerek"));
    sosyal.guncelle(gid, id, { mesaj: metin.slice(0, 1500) });
    return message.reply(t(lang, "sosyal.mesajOk"));
  }

  return message.reply({
    embeds: [new EmbedBuilder().setColor("#ff0000")
      .setTitle(t(lang, "sosyal.baslik"))
      .setDescription(t(lang, "sosyal.kullanim"))]
  });
};

exports.conf = {
  enabled: true, guildOnly: true,
  aliases: ["sosyal", "social", "bildirim", "youtube-bildirim"],
  permLevel: 0, kategori: "sosyal"
};
exports.help = {
  name: "sosyal",
  description: "YouTube kanalı ve RSS akışları için bildirim kurar.",
  usage: "sosyal youtube <kanal> #kanal | rss <url> #kanal | liste | sil <id>"
};
