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
  const aylar = ["ocak", "şubat", "subat", "mart", "nisan", "mayıs", "mayis", "haziran",
    "temmuz", "ağustos", "agustos", "eylül", "eylul", "ekim", "kasım", "kasim", "aralık", "aralik"];
  const parcalar = s.split(/\s+/);
  const gun = parseInt(parcalar[0], 10);
  const ayAdi = parcalar[1];
  if (!gun || !ayAdi) return null;
  const ayIdx = aylar.indexOf(ayAdi.replace(/[.,]/g, ""));
  if (ayIdx === -1) return null;
  const ay = ayIdx + 1;
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
      const metin = String(sablon).replace(/\{kullanici\}/g, `<@${k.uid}>`).replace(/\{sunucu\}/g, guild.name);
      await kanal.send({
        embeds: [new EmbedBuilder()
          .setColor("#ff2d95")
          .setTitle(t(lang, "dogum.baslik"))
          .setDescription(metin)
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

module.exports = { tarihCoz, gunuGeldi, kontrolet, startDogumSweeper };
