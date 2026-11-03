/**
 * util/dogum.js — Doğum günü sistemi
 *
 * DB
 * --  doğumgünü.<uid> = { gun: 1-31, ay: 1-12, yil?: number }
 *     doğumgünü_kanal.<gid> = kanalId
 *     doğumgünü_mesaj.<gid> = "🎂 Bugün {kullanici} doğum günü! Nice senelere!"
 *     dogum_gonderilen.<gid>.<yil-ay-gun> = [uid, ...]  (aynı gün tekrar gönderme)
 *
 * SWEEPER: 10 dakikada bir; bugünün gün/ay'ına uyan üyeleri bulur.
 * Cached üyelerden çalışır (tam fetch maliyetli olurdu).
 */
const db = require("croxydb");
const { EmbedBuilder } = require("discord.js");
const { getLangSync, t } = require("../dil");

const anahtar = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

/* Tarihi secilen dilde yazar: "12 Temmuz" / "12 July" (+ yil varsa). */
const AYLAR_TR = ["Ocak", "Şubat", "Mart", "Nisan", "Mayıs", "Haziran",
  "Temmuz", "Ağustos", "Eylül", "Ekim", "Kasım", "Aralık"];
const AYLAR_EN = ["January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"];

function tarihYaz(k, lang) {
  if (!k) return "—";
  const aylar = lang === "en" ? AYLAR_EN : AYLAR_TR;
  const ayAdi = aylar[(k.ay || 1) - 1] || "—";
  return k.yil ? `${k.gun} ${ayAdi} ${k.yil}` : `${k.gun} ${ayAdi}`;
}

/** "12 temmuz" / "12 7" / "12/07" / "1995-07-12" → { gun, ay, yil } */
function tarihCoz(metin) {
  if (!metin) return null;
  const s = String(metin).toLowerCase().trim();

  // ISO: 1995-07-12
  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const yil = +m[1], ay = +m[2], gun = +m[3];
    return gecerliMi(gun, ay) ? { gun, ay, yil } : null;
  }

  // 12/07 veya 12.07
  m = /^(\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) {
    const gun = +m[1], ay = +m[2];
    return gecerliMi(gun, ay) ? { gun, ay } : null;
  }

  // 12 temmuz 1995 | 12 temmuz
  /* Ay adı → numara eşlemesi. ÖNEMLİ: bu bir LİSTE DEĞİL, eşleme olmalı.
     Liste kullanıldığında aynı ayın yazımları (şubat/subat, mayıs/mayis,
     ağustos/agustos, eylül/eylul, kasım/kasim, aralık/aralik) indeksleri
     kaydırıyor ve "12 temmuz" Eylül olarak kaydediliyordu. */
  const AY_ESLEME = {
    ocak: 1,
    "şubat": 2, subat: 2,
    mart: 3,
    nisan: 4,
    "mayıs": 5, mayis: 5,
    haziran: 6,
    temmuz: 7,
    "ağustos": 8, agustos: 8,
    "eylül": 9, eylul: 9,
    ekim: 10,
    "kasım": 11, kasim: 11,
    "aralık": 12, aralik: 12,
  };
  const parcalar = s.split(/\s+/);
  const gun = parseInt(parcalar[0], 10);
  const ayAdi = (parcalar[1] || "").replace(/[.,]/g, "");
  if (!gun || !ayAdi) return null;
  const ay = AY_ESLEME[ayAdi];
  if (!ay) return null;
  const yil = parcalar[2] ? parseInt(parcalar[2], 10) : undefined;
  if (!gecerliMi(gun, ay)) return null;
  return { gun, ay, ...(yil ? { yil } : {}) };
}

function gecerliMi(gun, ay) {
  if (gun < 1 || gun > 31 || ay < 1 || ay > 12) return false;
  // Şubat 30/31 gibi geçersiz günler
  const maxGun = new Date(2024, ay, 0).getDate();
  return gun <= maxGun;
}

function gunuGeldi(uyeKayit, bugun = new Date()) {
  return uyeKayit.gun === bugun.getDate() && uyeKayit.ay === bugun.getMonth() + 1;
}

async function kontrolet(client) {
  const bugun = new Date();
  const bugunAnahtar = anahtar(bugun);
  const all = db.all() || {};

  const kayitli = Object.entries(all)
    .filter(([k, v]) => k.startsWith("dogumgünü.") && v && v.gun && v.ay)
    .map(([k, v]) => ({ uid: k.slice("dogumgünü.".length), ...v }));

  const bugünküler = kayitli.filter(k => gunuGeldi(k, bugun));
  if (!bugünküler.length) return;

  for (const [gid, guild] of client.guilds.cache) {
    const kanalId = db.fetch(`dogumgünü_kanal.${gid}`);
    if (!kanalId) continue;
    const kanal = guild.channels.cache.get(kanalId) ||
      await guild.channels.fetch(kanalId).catch(() => null);
    if (!kanal) continue;

    const gonderilen = db.fetch(`dogum_gonderilen.${gid}.${bugunAnahtar}`) || [];
    const yeni = bugünküler.filter(k => guild.members.cache.has(k.uid) && !gonderilen.includes(k.uid));
    if (!yeni.length) continue;

    const lang = getLangSync(guild.ownerId);
    const sablon = db.fetch(`dogumgünü_mesaj.${gid}`) || t(lang, "dogum.mesaj");

    for (const k of yeni) {
      /* Metinde tarih de yazilsin: {tarih} / {tarihEn} desteklenir. */
      const metin = String(sablon)
        .replace(/\{kullanici\}/g, `<@${k.uid}>`)
        .replace(/\{sunucu\}/g, guild.name)
        .replace(/\{tarih\}/g, tarihYaz(k, lang))
        .replace(/\{tarihEn\}/g, tarihYaz(k, "en"));
      await kanal.send({
        content: `<@${k.uid}>`,
        allowedMentions: { users: [k.uid] },
        embeds: [new EmbedBuilder()
          .setColor("#ff2d95")
          .setTitle(t(lang, "dogum.baslik"))
          .setDescription(metin)
          .setFooter({ text: tarihYaz(k, lang) })
          .setThumbnail(guild.members.cache.get(k.uid)?.user.displayAvatarURL({ size: 256 }) || null)]
      }).catch(() => {});
    }

    db.set(`dogum_gonderilen.${gid}.${bugunAnahtar}`, [...gonderilen, ...yeni.map(x => x.uid)]);
  }
}

function startDogumSweeper(client) {
  setTimeout(() => kontrolet(client).catch(() => {}), 60_000);          // açılıştan 1 dk sonra
  setInterval(() => kontrolet(client).catch(() => {}), 10 * 60 * 1000); // 10 dk'da bir
}

module.exports = { tarihCoz, tarihYaz, gunuGeldi, kontrolet, startDogumSweeper };
