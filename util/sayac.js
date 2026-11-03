/**
 * util/sayac.js — Canlı kanal sayacı (MEE6 "stats counters")
 *
 * DB: `sayac.<gid>` = {
 *   kanalId: string,
 *   tur: "uyeler" | "cevrimici" | "bot" | "insan" | "kayitli",
 *   sablon: "👥 Üye: {n}",
 *   sonDeger: number
 * }
 *
 * Discord kanal adını 10 dakikada 2 kez değiştirmeye izin verir;
 * bu yüzden sweep 10 dk'da bir + üye katılınca/ayrılınca hemen
 * (ama 5 dakikadan sık değil).
 */
const db = require("croxydb");

const MIN_ARALIK = 5 * 60 * 1000;
const sonGuncelleme = new Map();

function deger(guild, tur) {
  if (tur === "cevrimici") {
    // Presence intent yok; çevrimiçi sayısı yaklaşık (üye sayısı)
    return guild.memberCount;
  }
  if (tur === "bot") return guild.members.cache.filter(m => m.user.bot).size;
  if (tur === "insan") return guild.members.cache.filter(m => !m.user.bot).size;
  if (tur === "kayitli") {
    const kayitliRol = db.fetch(`kayitRol_${guild.id}`);
    if (!kayitliRol) return guild.memberCount;
    return guild.members.cache.filter(m => m.roles.cache.has(kayitliRol)).size;
  }
  return guild.memberCount;
}

function sablonUygula(sablon, n) {
  return String(sablon || "👥 Üye: {n}").replace(/\{n\}/g, Number(n).toLocaleString("tr-TR")).slice(0, 100);
}

async function guncelle(client, guildId, zorla = false) {
  const ayar = db.fetch(`sayac.${guildId}`);
  if (!ayar || !ayar.kanalId) return false;
  const son = sonGuncelleme.get(guildId) || 0;
  if (!zorla && Date.now() - son < MIN_ARALIK) return false;

  const guild = client.guilds.cache.get(guildId);
  if (!guild) return false;
  const kanal = guild.channels.cache.get(ayar.kanalId) ||
    await guild.channels.fetch(ayar.kanalId).catch(() => null);
  if (!kanal || !kanal.isVoiceBased()) return false;

  const n = deger(guild, ayar.tur || "uyeler");
  const isim = sablonUygula(ayar.sablon, n);
  if (kanal.name === isim) {
    sonGuncelleme.set(guildId, Date.now());
    return false;
  }

  try {
    await kanal.setName(isim, "Kanal sayacı");
    db.set(`sayac.${guildId}`, { ...ayar, sonDeger: n });
    sonGuncelleme.set(guildId, Date.now());
    return true;
  } catch {
    return false;
  }
}

function startSayacSweeper(client) {
  // Açılışta hepsini bir kez dene
  setTimeout(() => {
    for (const [gid] of client.guilds.cache) guncelle(client, gid, true).catch(() => {});
  }, 20_000);

  // 10 dakikada bir
  setInterval(() => {
    for (const [gid] of client.guilds.cache) guncelle(client, gid).catch(() => {});
  }, 10 * 60 * 1000);
}

module.exports = { guncelle, startSayacSweeper, deger, sablonUygula };
