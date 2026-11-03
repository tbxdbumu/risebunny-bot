/**
 * komutlar/doğumgünü.js — Doğum günü sistemi  (alias: r!birthday)
 *
 * ÜYE
 *   r!doğumgünü ayarla 12 temmuz      (veya 12/07, 1995-07-12)
 *   r!doğumgünü sil
 *   r!doğumgünü                      → kendi bilgin
 *   r!doğumgünü liste                → yaklaşan / bugünküler
 *
 * YETKİLİ
 *   r!doğumgünü kanal #kanal         → duyuru kanalı
 *   r!doğumgünü kanal kapat
 *   r!doğumgünü mesaj <metin>        → şablon ({kullanici}, {sunucu})
 *   r!doğumgünü kontrol              → elle tarama (test için)
 */
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const dogum = require("../util/dogum");

const AYLAR_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const AYLAR_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function tarihYaz(k, lang) {
  const aylar = lang === "en" ? AYLAR_EN : AYLAR_TR;
  return `${k.gun} ${aylar[k.ay - 1]}${k.yil ? ` ${k.yil}` : ""}`;
}

function kalanGun(k, bugun = new Date()) {
  let yil = bugun.getFullYear();
  let hedef = new Date(yil, k.ay - 1, k.gun);
  const bugunZero = new Date(yil, bugun.getMonth(), bugun.getDate());
  if (hedef < bugunZero) {
    yil++;
    hedef = new Date(yil, k.ay - 1, k.gun);
  }
  return Math.round((hedef - bugunZero) / 86400000);
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  const gid = message.guild.id;
  const alt = (args[0] || "").toLowerCase();
  const uid = message.author.id;

  /* ── ayarla ─────────────────────────────────────────────────────── */
  if (["ayarla", "set", "ekle"].includes(alt)) {
    const metin = args.slice(1).join(" ");
    const tarih = dogum.tarihCoz(metin);
    if (!tarih) return message.reply(t(lang, "dogum.tarifHata"));
    if (tarih.yil && (tarih.yil < 1900 || tarih.yil > new Date().getFullYear()))
      return message.reply(t(lang, "dogum.yilHata"));

    db.set(`dogumgünü.${uid}`, tarih);
    return message.reply(t(lang, "dogum.ayarlandi", {
      tarih: tarihYaz(tarih, lang),
      kalan: kalanGun(tarih)
    }));
  }

  /* ── sil ────────────────────────────────────────────────────────── */
  if (["sil", "kaldır", "kaldir", "remove"].includes(alt)) {
    db.delete(`dogumgünü.${uid}`);
    return message.reply(t(lang, "dogum.silindi"));
  }

  /* ── kanal ──────────────────────────────────────────────────────── */
  if (["kanal", "channel"].includes(alt)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply(t(lang, "dogum.yetki"));
    const kapat = ["kapat", "sıfırla", "sifirla", "off"].includes((args[1] || "").toLowerCase());
    if (kapat) {
      db.delete(`dogumgünü_kanal.${gid}`);
      return message.reply(t(lang, "dogum.kanalKapali"));
    }
    const kanal = message.mentions.channels.first();
    if (!kanal) return message.reply(t(lang, "dogum.kanalGerek"));
    db.set(`dogumgünü_kanal.${gid}`, kanal.id);
    return message.reply(t(lang, "dogum.kanalAyarlandi", { kanal: `<#${kanal.id}>` }));
  }

  /* ── mesaj şablonu ──────────────────────────────────────────────── */
  if (["mesaj", "message"].includes(alt)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply(t(lang, "dogum.yetki"));
    const metin = args.slice(1).join(" ").slice(0, 1200);
    if (!metin) return message.reply(t(lang, "dogum.mesajHata"));
    db.set(`dogumgünü_mesaj.${gid}`, metin);
    return message.reply(t(lang, "dogum.mesajAyarlandi"));
  }

  /* ── elle kontrol ───────────────────────────────────────────────── */
  if (["kontrol", "check", "tara"].includes(alt)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply(t(lang, "dogum.yetki"));
    await dogum.kontrolet(client).catch(() => {});
    return message.reply(t(lang, "dogum.kontrol"));
  }

  /* ── liste (yaklaşan) ───────────────────────────────────────────── */
  if (["liste", "list"].includes(alt)) {
    const all = db.all() || {};
    const liste = Object.entries(all)
      .filter(([k, v]) => k.startsWith("dogumgünü.") && v && v.gun && v.ay)
      .map(([k, v]) => ({ uid: k.slice("dogumgünü.".length), ...v, kalan: kalanGun(v) }))
      .sort((a, b) => a.kalan - b.kalan)
      .slice(0, 15);

    if (!liste.length) return message.reply(t(lang, "dogum.listeYok"));
    const satirlar = liste.map(k =>
      `${k.kalan === 0 ? "🎂" : `⏳ ${k.kalan}${EN ? "d" : "g"}`} — <@${k.uid}> • ${tarihYaz(k, lang)}`);

    return message.reply({
      embeds: [new EmbedBuilder().setColor("#ff2d95")
        .setTitle(t(lang, "dogum.listeBaslik"))
        .setDescription(satirlar.join("\n"))]
    });
  }

  /* ── varsayılan: kendi bilgin ───────────────────────────────────── */
  const kendi = db.fetch(`dogumgünü.${uid}`);
  if (!kendi) return message.reply(t(lang, "dogum.yok"));

  return message.reply({
    embeds: [new EmbedBuilder().setColor("#ff2d95")
      .setTitle(t(lang, "dogum.bilgiBaslik"))
      .setDescription(t(lang, "dogum.bilgi", {
        tarih: tarihYaz(kendi, lang),
        kalan: kalanGun(kendi)
      }))]
  });
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["doğumgünü", "birthday", "dogumgunu", "dg"], permLevel: 0, kategori: "dogum" };
exports.help = { name: "doğumgünü", description: "Doğum günü ayarlar ve duyuru yapar.", usage: "doğumgünü [ayarla <gün ay>|sil|liste|kanal #kanal|mesaj <metin>|kontrol]" };
