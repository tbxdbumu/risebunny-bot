/**
 * komutlar/starboard.js — Yıldızlı mesaj tahtası kurulumu
 *
 * KULLANIM
 *   r!starboard-ayarla #kanal [eşik]   → kur / eşiği değiştir
 *   r!starboard-emoji ⭐               → takip edilen emoji
 *   r!starboard-esik 3                 → eşik
 *   r!starboard-sıfırla                → kaldır
 *   r!starboard-durum                  → durum
 *   r!starboard                        → yardım
 */
const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getLangSync, t } = require("../dil");
const { isPremium } = require("../utils");
const sb = require("../util/starboard");

function emojiAl(args) {
  for (const a of args) {
    if (/^<a?:[a-zA-Z0-9_~]+:\d+>$/.test(a)) return a;
    if ([...a].length <= 3 && /\p{Extended_Pictographic}/u.test(a)) return a;
  }
  return null;
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  if (!isPremium(message.author.id)) return message.reply(t(lang, "ortak.premiumGerek"));
  const gid = message.guild.id;
  const sub = (args[0] || "").toLowerCase();

  if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
    return message.reply(t(lang, "starboard.yetki"));

  /* ── durum ─────────────────────────────────────────────────────────── */
  if (["durum", "status"].includes(sub)) {
    const a = sb.ayarGetir(gid);
    if (!a) return message.reply(t(lang, "starboard.ayarliDegil"));
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#f1c40f")
        .setTitle(t(lang, "starboard.durumBaslik"))
        .setDescription(t(lang, "starboard.durum", {
          kanal: `<#${a.kanalId}>`,
          emoji: a.emoji,
          esik: a.esik,
          sayi: sb.yigin(gid).length,
          botYoksay: a.botTepkisiYoksay ? t(lang, "starboard.evet") : t(lang, "starboard.hayir")
        }))]
    });
  }

  /* ── sıfırla ───────────────────────────────────────────────────────── */
  if (["sıfırla", "sifirla", "reset", "kapat"].includes(sub)) {
    const a = sb.ayarGetir(gid);
    if (!a) return message.reply(t(lang, "starboard.ayarliDegil"));
    sb.ayarSil(gid);
    return message.reply(t(lang, "starboard.sifirlandi"));
  }

  /* ── emoji değiştir ────────────────────────────────────────────────── */
  if (sub === "emoji") {
    const a = sb.ayarGetir(gid);
    if (!a) return message.reply(t(lang, "starboard.ayarliDegil"));
    const emoji = emojiAl(args.slice(1)) || "⭐";
    a.emoji = emoji;
    sb.ayarYaz(gid, a);
    const r = await sb.yiginYenile(client, message.guild, a).catch(() => ({ guncellenen: 0, silinen: 0 }));
    return message.reply(t(lang, "starboard.emojiDegisti", { emoji }) + "\n" +
      t(lang, "starboard.ayarGuncellendi", { guncellenen: r.guncellenen, silinen: r.silinen }));
  }

  /* ── eşik değiştir ─────────────────────────────────────────────────── */
  if (["eşik", "esik", "threshold"].includes(sub)) {
    const a = sb.ayarGetir(gid);
    if (!a) return message.reply(t(lang, "starboard.ayarliDegil"));
    const n = parseInt(args[1], 10);
    if (!n || n < 1 || n > 100) {
      return message.reply(t(lang, "starboard.esikDegisti", { esik: a.esik }) + "\n" +
        t(lang, "starboard.yardimIcerik"));
    }
    a.esik = n;
    sb.ayarYaz(gid, a);
    const r = await sb.yiginYenile(client, message.guild, a).catch(() => ({ guncellenen: 0, silinen: 0 }));
    return message.reply(t(lang, "starboard.esikDegisti", { esik: n }) + "\n" +
      t(lang, "starboard.ayarGuncellendi", { guncellenen: r.guncellenen, silinen: r.silinen }));
  }

  /* ── ayarla ────────────────────────────────────────────────────────── */
  const kanal = message.mentions.channels.first();

  if (!kanal) {
    if (sub === "" || ["ayarla", "set", "kur"].includes(sub))
      return message.reply(t(lang, "starboard.kanalGerek"));
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#f1c40f")
        .setTitle(t(lang, "starboard.yardimBaslik"))
        .setDescription(t(lang, "starboard.yardimIcerik"))]
    });
  }

  if (kanal.type !== ChannelType.GuildText && kanal.type !== ChannelType.GuildAnnouncement)
    return message.reply(t(lang, "starboard.yazilamaz"));

  const mevcut = sb.ayarGetir(gid);
  const esikArg = args.find(a => /^\d{1,3}$/.test(a));
  const esik = esikArg ? Math.max(1, parseInt(esikArg, 10)) : (mevcut?.esik || 3);
  const emoji = emojiAl(args) || mevcut?.emoji || "⭐";

  const yeni = {
    kanalId: kanal.id,
    emoji,
    esik,
    botTepkisiYoksay: true,
    yokSayKanal: mevcut?.yokSayKanal || [],
    yokSayRol: mevcut?.yokSayRol || []
  };

  // Yetki kontrolü: yazabiliyor muyum?
  const izin = kanal.permissionsFor(message.guild.members.me);
  if (!izin || !izin.has(PermissionFlagsBits.SendMessages))
    return message.reply(t(lang, "starboard.yazilamaz"));

  sb.ayarYaz(gid, yeni);
  return message.reply({
    embeds: [new EmbedBuilder().setColor("#f1c40f")
      .setTitle(t(lang, "starboard.yardimBaslik"))
      .setDescription(t(lang, "starboard.ayarlandi", { kanal: `<#${kanal.id}>`, emoji, esik }))]
  });
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["starboard", "sb"], permLevel: 0, kategori: "starboard" };
exports.help = { name: "starboard", description: "Yıldızlı mesaj tahtası kurar.", usage: "starboard-ayarla #kanal [eşik]" };
