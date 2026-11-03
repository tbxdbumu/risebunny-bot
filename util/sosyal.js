/**
 * util/sosyal.js — Sosyal medya bildirimleri (YouTube + RSS)
 *
 * MEE6'nın karşılığı: Twitch / YouTube / Twitter bildirimleri.
 * Twitter artık ücretsiz API vermediği için onun yerine genel RSS desteği
 * var (Nitter/RSSHub çıktıları dahil).
 *
 * DB
 * --  sosyal.<gid> = [ {
 *       id, tur: "youtube" | "rss",
 *       kaynak: "UCxxxx" | "https://.../feed.xml",
 *       kanalId, mesaj: "🎬 Yeni video: {baslik} {link}",
 *       sonId: string|null,          // son görülen video/guid
 *       acik: boolean
 *     } ]
 *
 * YOUTUBE
 *   API anahtarı (YOUTUBE_API_KEY) varsa Data API v3, yoksa
 *   `https://www.youtube.com/feeds/videos.xml?channel_id=...` RSS'i kullanılır.
 */
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

const ANAHTAR = (gid) => `sosyal.${gid}`;
const SURE_MS = 5 * 60 * 1000; // 5 dakika
const MAX_BILDIRIM = 3;        // tur başına en fazla

function listele(gid) {
  const l = db.fetch(ANAHTAR(gid));
  return Array.isArray(l) ? l : [];
}
function yaz(gid, l) { db.set(ANAHTAR(gid), l.slice(0, 20)); }

function ekle(gid, kayit) {
  const l = listele(gid);
  if (l.length >= 20) return null;
  const id = `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const yeni = { id, tur: "rss", sonId: null, acik: true, ...kayit };
  l.push(yeni);
  yaz(gid, l);
  return yeni;
}
function sil(gid, id) {
  yaz(gid, listele(gid).filter(x => x.id !== id));
}
function bul(gid, id) { return listele(gid).find(x => x.id === id) || null; }
function guncelle(gid, id, yama) {
  yaz(gid, listele(gid).map(x => (x.id === id ? { ...x, ...yama } : x)));
}

function degisken(metin, vars) {
  return String(metin || "").replace(/\{(\w+)\}/g, (m, k) => (vars[k] !== undefined ? String(vars[k]) : m));
}

/* ── RSS ayrıştırma (regex tabanlı, ek bağımlılık yok) ─────────────────── */

function xmlEtiket(xml, ad) {
  const m = new RegExp(`<${ad}[^>]*>([\\s\\S]*?)</${ad}>`, "i").exec(xml);
  if (!m) return "";
  return m[1]
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function linkBul(blok) {
  // <link>url</link> (RSS) veya <link href="url"/> (Atom)
  let m = /<link[^>]*href="([^"]+)"[^>]*\/?>/i.exec(blok);
  if (m) return m[1];
  m = /<link>\s*([\s\S]*?)\s*<\/link>/i.exec(blok);
  return m ? m[1].trim() : "";
}

/** Feed XML → [{ id, baslik, link, tarih }] (en yeni önce) */
function feedAyristir(xml) {
  const ogeler = [];
  const itemRe = /<item\b[\s\S]*?<\/item>/gi;
  const entryRe = /<entry\b[\s\S]*?<\/entry>/gi;

  let m;
  while ((m = itemRe.exec(xml))) {
    const blok = m[0];
    ogeler.push({
      id: xmlEtiket(blok, "guid") || xmlEtiket(blok, "link") || xmlEtiket(blok, "title"),
      baslik: xmlEtiket(blok, "title"),
      link: linkBul(blok) || xmlEtiket(blok, "guid"),
      tarih: xmlEtiket(blok, "pubDate")
    });
  }
  while ((m = entryRe.exec(xml))) {
    const blok = m[0];
    ogeler.push({
      id: xmlEtiket(blok, "id") || linkBul(blok),
      baslik: xmlEtiket(blok, "title"),
      link: linkBul(blok),
      tarih: xmlEtiket(blok, "updated") || xmlEtiket(blok, "published")
    });
  }
  return ogeler.filter(o => o.baslik || o.link);
}

async function getir(url) {
  const ctrl = new AbortController();
  const zaman = setTimeout(() => ctrl.abort(), 12_000);
  try {
    const r = await fetch(url, {
      headers: { "user-agent": "RiseBunny/1.0 (+sosyal-bildirim)" },
      signal: ctrl.signal
    });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  } finally {
    clearTimeout(zaman);
  }
}

/* ── Kaynak çözümleme ──────────────────────────────────────────────────── */

/** Kanal ID'si / @handle / video linki → kanal ID (UC...). */
async function youtubeKanalId(kaynak) {
  if (/^UC[\w-]{20,}$/.test(kaynak)) return kaynak;

  // Kanal/video URL'i
  const m = /youtube\.com\/(?:channel\/)?([\w-]+)/i.exec(kaynak);
  if (m && /^UC[\w-]{20,}$/.test(m[1])) return m[1];

  const handleM = /@([\w.-]+)/.exec(kaynak);
  if (handleM) {
    const html = await getir(`https://www.youtube.com/@${handleM[1]}`);
    if (html) {
      const cid = /"channelId":"(UC[\w-]+)"/.exec(html) ||
        /channel_id=(UC[\w-]+)/.exec(html) ||
        /(UC[\w-]{22})/.exec(html);
      if (cid) return cid[1];
    }
  }
  return null;
}

/** YouTube → en yeni videolar (API varsa API, yoksa RSS). */
async function youtubeVideolar(kanalId) {
  const apiKey = process.env.YOUTUBE_API_KEY;
  if (apiKey) {
    const url = `https://www.googleapis.com/youtube/v3/search?key=${apiKey}` +
      `&channelId=${encodeURIComponent(kanalId)}&part=snippet&order=date&maxResults=5&type=video`;
    const metin = await getir(url);
    if (metin) {
      try {
        const j = JSON.parse(metin);
        return (j.items || []).map(i => ({
          id: i.id?.videoId,
          baslik: i.snippet?.title,
          link: i.id?.videoId ? `https://www.youtube.com/watch?v=${i.id.videoId}` : "",
          tarih: i.snippet?.publishedAt
        })).filter(o => o.id);
      } catch { /* RSS'e düş */ }
    }
  }

  const xml = await getir(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(kanalId)}`);
  if (!xml) return [];
  // YouTube feed'inde <yt:videoId> var
  const liste = [];
  const re = /<entry\b[\s\S]*?<\/entry>/gi;
  let m;
  while ((m = re.exec(xml))) {
    const blok = m[0];
    const vid = /<yt:videoId>([\w-]+)<\/yt:videoId>/.exec(blok)?.[1];
    liste.push({
      id: vid || xmlEtiket(blok, "id"),
      baslik: xmlEtiket(blok, "title"),
      link: vid ? `https://www.youtube.com/watch?v=${vid}` : linkBul(blok),
      tarih: xmlEtiket(blok, "published")
    });
  }
  return liste.filter(o => o.id);
}

/** Bir kayıt için yeni öğeleri döner (ilk taramada boş). */
async function yeniOgren(kayit) {
  let ogeler = [];
  if (kayit.tur === "youtube") {
    ogeler = await youtubeVideolar(kayit.kaynak);
  } else {
    const xml = await getir(kayit.kaynak);
    if (xml) ogeler = feedAyristir(xml);
  }
  if (!ogeler.length) return [];

  // İlk tarama: sadece son ID'yi kaydet, geçmişi dökme
  if (!kayit.sonId) return [{ ...ogeler[0], ilk: true }];

  const idx = ogeler.findIndex(o => o.id === kayit.sonId);
  const yeni = idx === -1 ? ogeler.slice(0, 1) : ogeler.slice(0, idx);
  return yeni.reverse().slice(-MAX_BILDIRIM);
}

/** Tüm sunucuları tarar. */
async function tara(client) {
  let toplam = 0;
  for (const [gid, guild] of client.guilds.cache) {
    const liste = listele(gid).filter(x => x.acik !== false);
    if (!liste.length) continue;

    for (const kayit of liste) {
      const kanal = guild.channels.cache.get(kayit.kanalId) ||
        await guild.channels.fetch(kayit.kanalId).catch(() => null);
      if (!kanal) continue;

      let yeni;
      try { yeni = await yeniOgren(kayit); }
      catch (e) { console.warn("[sosyal]", e?.message || e); continue; }
      if (!yeni.length) continue;

      const lang = getLangSync(guild.ownerId);
      const sablon = kayit.mesaj || t(lang, "sosyal.varsayilanMesaj");

      for (const o of yeni) {
        if (o.ilk) continue; // ilk taramada duyuru yok
        const metin = degisken(sablon, {
          baslik: o.baslik || "",
          link: o.link || "",
          kanal: guild.name
        });
        await kanal.send({
          content: `${metin}\n${o.link || ""}`.trim().slice(0, 2000),
          allowedMentions: { parse: [] }
        }).catch(() => {});
        toplam++;
      }

      guncelle(gid, kayit.id, { sonId: yeni[yeni.length - 1].id });
    }
  }
  return toplam;
}

function startSosyalSweeper(client) {
  // Açılış: son ID'leri doldur (duyuru yağmuru olmasın)
  setTimeout(() => { tara(client).catch(() => {}); }, 90_000);
  setInterval(() => { tara(client).catch(() => {}); }, SURE_MS);
}

module.exports = {
  listele, ekle, sil, bul, guncelle, tara, startSosyalSweeper,
  feedAyristir, youtubeKanalId, youtubeVideolar, yeniOgren, degisken,
  SURE_MS, MAX_BILDIRIM
};
