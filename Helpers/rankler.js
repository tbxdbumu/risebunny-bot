/**
 * Rank depolama — Owner / Admin / Moderator / Youtuber / User
 *
 * NEDEN AYRI MODUL
 * ----------------
 * Rank hem komutlardan (`r!rank`) hem HTTP ucundan (site/launcher) yazilip
 * okunuyor. Tek bir yerde tutulmazsa iki kaynak birbirinden kopar; bu
 * projede daha once "kaynakta var, pakette yok" turu hatalar tam olarak
 * bu yuzden cikti.
 *
 * GUVENLIK
 * --------
 *  - Yazma fonksiyonlari (`rankVer`, `rankSil`) YETKI KONTROLU YAPMAZ;
 *    cagiran katman (komut veya HTTP) kontrol eder. Boylece yetki tek
 *    yerde degil, her giris noktasinda acikca yazilir.
 *  - Okuma (`rankAl`) her zaman gecerli bir rank doner; bilinmeyen/bos
 *    deger "user" olur (yetki yukseltmez).
 *  - Depo: croxydb `ranklar` anahtari -> { "<discordId>": "owner" | ... }
 *
 * YETKI SEVIYELERI (goruntu amacli; yetki karari ayri verilir)
 *   owner 5 / admin 4 / moderator 3 / youtuber 2 / user 1
 */

const db = require("croxydb");

const ANAHTAR = "ranklar";

/** Gecerli rank kumesi (kucuk harf). */
const GECERLI = ["owner", "admin", "moderator", "youtuber", "user"];

/** Yazarken kullanicinin yazdigi kisaltmalari normalize et. */
function normalize(v) {
  const s = String(v == null ? "" : v).trim().toLowerCase();
  if (s === "mod") return "moderator";
  if (s === "yt") return "youtuber";
  if (s === "sahip") return "owner";
  if (s === "yetkili") return "admin";
  return GECERLI.includes(s) ? s : "";
}

/** Ekranda gorunen etiket (User icin bos). */
function etiket(rank) {
  switch (rank) {
    case "owner":
      return "OWNER";
    case "admin":
      return "ADMIN";
    case "moderator":
      return "MOD";
    case "youtuber":
      return "YOUTUBER";
    default:
      return "";
  }
}

function hepsi() {
  try {
    const l = db.get(ANAHTAR);
    return l && typeof l === "object" && !Array.isArray(l) ? l : {};
  } catch {
    return {};
  }
}

/** Bir kisinin ranki; kayit yoksa "user". */
function rankAl(discordId) {
  const id = String(discordId == null ? "" : discordId).replace(/\D/g, "");
  if (!/^\d{15,25}$/.test(id)) return "user";
  const r = normalize(hepsi()[id]);
  return r || "user";
}

/** Rank ver. Gecersiz rank -> false. */
function rankVer(discordId, rank) {
  const id = String(discordId == null ? "" : discordId).replace(/\D/g, "");
  if (!/^\d{15,25}$/.test(id)) return false;
  const r = normalize(rank);
  if (!r) return false;
  const l = hepsi();
  if (r === "user") delete l[id];
  else l[id] = r;
  try {
    db.set(ANAHTAR, l);
    return true;
  } catch {
    return false;
  }
}

/** Ranki sil (user'a dondur). */
function rankSil(discordId) {
  return rankVer(discordId, "user");
}

/** Kisi listesi: [{ id, rank }] — sadece user OLMAYANLAR. */
function rankListesi() {
  const l = hepsi();
  return Object.keys(l)
    .map(id => ({ id, rank: normalize(l[id]) }))
    .filter(x => x.rank && x.rank !== "user")
    .sort((a, b) => AGIRLIK[b.rank] - AGIRLIK[a.rank] || a.id.localeCompare(b.id));
}

const AGIRLIK = { owner: 5, admin: 4, moderator: 3, youtuber: 2, user: 1 };

/** Kullanici adi + avatar (bot cevrimici ise). */
async function profilBilgisi(client, discordId) {
  const id = String(discordId == null ? "" : discordId).replace(/\D/g, "");
  const bos = { kullaniciAdi: "", avatar: "" };
  if (!client || !/^\d{15,25}$/.test(id)) return bos;
  try {
    const u = await client.users.fetch(id);
    if (!u) return bos;
    return {
      kullaniciAdi: String(u.username || u.tag || "").slice(0, 64),
      avatar: u.displayAvatarURL ? u.displayAvatarURL({ size: 128, extension: "png" }) : ""
    };
  } catch {
    return bos;
  }
}

/** Gorsel (embed) rengi. */
function rengi(rank) {
  switch (rank) {
    case "owner":
      return 0xff4d4d;
    case "admin":
      return 0xff5c5c;
    case "moderator":
      return 0x4da3ff;
    case "youtuber":
      return 0xb47cff;
    default:
      return 0x7c8798;
  }
}

module.exports = {
  ANAHTAR,
  GECERLI,
  AGIRLIK,
  normalize,
  etiket,
  rengi,
  rankAl,
  rankVer,
  rankSil,
  rankListesi,
  profilBilgisi
};
