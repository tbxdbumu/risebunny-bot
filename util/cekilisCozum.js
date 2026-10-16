/* ── Çekiliş argüman çözümleyici (kanal + süre + kazanan + ödül) ──
   Süre yazımları (TR/EN karışık desteklenir):
   2gün 6 saat · 2 gün · 2day 6hours · 2g 3s · 2d 3h · 30m · 1sa · 2hafta · 1ay · 1.5h
   "s" kısaltması: Türkçe birim geçiyorsa SAAT, İngilizce yazılmışsa SANIYE,
   tek başınaysa yazarın diline göre (tr → saat, en → saniye) çözülür. */

const BIRIM_MS = {
  ay: 30 * 86400000,
  hafta: 7 * 86400000,
  gun: 86400000,
  saat: 3600000,
  dakika: 60000,
  saniye: 1000,
};

const MIN_MS = 10 * BIRIM_MS.saniye;
const MAKS_MS = 90 * BIRIM_MS.gun;

const ETIKET = {
  tr: { ay: "ay", hafta: "hafta", gun: "gün", saat: "saat", dakika: "dakika", saniye: "saniye" },
  en: { ay: "month", hafta: "week", gun: "day", saat: "hour", dakika: "minute", saniye: "second" },
};

/* Sadece Türkçe yazımda kullanılan birim işaretleri ("s" dahil değil: belirsiz). */
const TR_BIRIMLERI = new Set(["g", "gg", "gun", "sa", "saat", "dk", "dakika", "sn", "saniye", "hf", "hafta", "ay", "ayl"]);
/* Sadece İngilizce yazımda kullanılan, uzun haller. */
const EN_BIRIMLERI = new Set(["day", "days", "hour", "hours", "minute", "minutes", "second", "seconds", "week", "weeks", "sec", "secs", "month", "months", "mo"]);

const TR_HARF = { ı: "i", ğ: "g", ş: "s", ç: "c", ü: "u", ö: "o", â: "a", î: "i", û: "u", ô: "o" };

function norm(s) {
  return String(s || "")
    .replace(/[ığşçüöâîû]/g, (c) => TR_HARF[c] || c)
    .replace(/i̇/g, "i")
    .toLowerCase()
    .trim();
}

function birimBul(token, trBaglam) {
  switch (token) {
    case "ay": case "ayl": case "month": case "months": case "mo": return "ay";
    case "hf": case "w": case "wk": case "wks": case "week": case "weeks": case "hafta": return "hafta";
    case "d": case "day": case "days": case "g": case "gg": case "gun": return "gun";
    case "h": case "hr": case "hrs": case "hour": case "hours": case "sa": case "saat": return "saat";
    case "m": case "mn": case "min": case "mins": case "minute": case "minutes": case "dk": case "dakika": return "dakika";
    case "sec": case "secs": case "second": case "seconds": case "sn": case "saniye": return "saniye";
    case "s": return trBaglam ? "saat" : "saniye";
    default: return null;
  }
}

/* "2 gün 6 s" gibi karışık yazımlarda "s"nin saat mi saniye mi olduğunu belirler. */
function trBaglamiMi(birimler, lang) {
  if (birimler.some((b) => TR_BIRIMLERI.has(b))) return true;
  if (birimler.some((b) => EN_BIRIMLERI.has(b))) return false;
  return lang === "tr";
}

function sureMetni(parcalar, lang) {
  const L = ETIKET[lang] || ETIKET.tr;
  return parcalar
    .map((p) => {
      const adet = Number.isInteger(p.adet) ? String(p.adet) : String(Number(p.adet.toFixed(1)));
      const ad = L[p.birim] + (lang === "en" && p.adet !== 1 ? "s" : "");
      return `${adet} ${ad}`;
    })
    .join(", ");
}

/* Tek bir metin parçasını ("2 gün 6 saat") milisaniyeye çevirir. */
function sureCoz(raw, lang = "tr") {
  const txt = norm(raw)
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/[,;|]+/g, " ")
    .replace(/-/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  if (!txt) return { ms: null, hata: "bos" };

  const oncekiler = [...txt.matchAll(/\d+(?:\.\d+)?\s*([a-z]+)/g)].map((m) => m[1]);
  const trBaglam = trBaglamiMi(oncekiler, lang);

  const re = /(\d+(?:\.\d+)?)\s*([a-z]*)/g;
  const parcalar = [];
  const dolgu = /^(ve|and|ile|with|\/|\+|tane|adet)$/;
  let son = 0, eslesme;
  while ((eslesme = re.exec(txt)) !== null) {
    const bosluk = txt.slice(son, eslesme.index).trim();
    if (bosluk && !dolgu.test(bosluk)) return { ms: null, hata: "bilinmeyen", detay: bosluk.split(/\s+/)[0] };
    const adet = parseFloat(eslesme[1]);
    const token = eslesme[2];
    if (!token) parcalar.push({ adet, birim: null });
    else {
      const birim = birimBul(token, trBaglam);
      if (!birim) return { ms: null, hata: "bilinmeyen", detay: token };
      parcalar.push({ adet, birim });
    }
    son = re.lastIndex;
  }
  const kuyruk = txt.slice(son).trim();
  if (kuyruk && !dolgu.test(kuyruk)) return { ms: null, hata: "bilinmeyen", detay: kuyruk };
  if (!parcalar.length) return { ms: null, hata: "bos" };

  const birimsiz = parcalar.filter((p) => !p.birim);
  if (birimsiz.length && parcalar.length > 1) return { ms: null, hata: "birimyok" };
  /* Tek ve birimsiz sayı yazılmışsa kolaylık olsun için DAKİKA kabul edilir. */
  if (birimsiz.length) parcalar[0].birim = "dakika";

  const toplam = parcalar.reduce((t, p) => t + p.adet * BIRIM_MS[p.birim], 0);
  if (!Number.isFinite(toplam) || toplam <= 0) return { ms: null, hata: "bos" };
  if (toplam < MIN_MS) return { ms: null, hata: "kisa" };
  if (toplam > MAKS_MS) return { ms: null, hata: "uzun" };

  return { ms: Math.round(toplam), parcalar, okunabilir: sureMetni(parcalar, lang) };
}

/* args içindeki kanal token'ını bulur: <#id>, id, #isim, isim (emoji/parantez toleranslı). */
async function kanalBul(message, args) {
  const guild = message.guild;
  const tumKanallar = [...guild.channels.cache.values()];
  const metinKanallari = tumKanallar.filter((c) => c.isTextBased());
  let erisimYok = null;

  for (let i = 0; i < Math.min(args.length, 4); i++) {
    const ham = args[i] || "";
    const etiket = ham.match(/^<#!?(\d{15,25})>$/);
    if (etiket || /^\d{15,25}$/.test(ham)) {
      const id = etiket ? etiket[1] : ham;
      const k = guild.channels.cache.get(id);
      if (k) return { kanal: k, index: i };
      /* Önbilikte yoksa Discord'dan çek (yeni açılmış kanal / önbellek boşluğu). */
      const cekilen = await guild.channels.fetch(id).catch(() => null);
      if (cekilen) return { kanal: cekilen, index: i };
      erisimYok = id;
      continue;
    }
    const ad = norm(ham.replace(/^#/, ""));
    if (!ad) continue;
    /* "1d", "30m", "2" gibi süre/birim token'ları kanal adı sanılmasın. */
    if (/^\d+(?:[.,]\d+)?[a-z]*$/.test(ad)) continue;
    const temiz = ad.replace(/[^a-z0-9]/g, "");
    if (!temiz) continue;
    const birebir = metinKanallari.find((c) => norm(c.name) === ad);
    if (birebir) return { kanal: birebir, index: i };
    const yaklasan = metinKanallari.find((c) => {
      const cn = norm(c.name).replace(/[^a-z0-9]/g, "");
      return cn && (cn === temiz || cn.startsWith(temiz));
    });
    if (yaklasan) return { kanal: yaklasan, index: i };
    /* Metin kanalı yoksa aynı adlı forum/ses kanalını bul: sebebi komut açıklasın. */
    const baskaTur = tumKanallar.find((c) => norm(c.name || "") === ad);
    if (baskaTur) return { kanal: baskaTur, index: i };
  }

  const etiketlenen = message.mentions.channels.first();
  if (etiketlenen) {
    const i = args.findIndex((a) => String(a).includes(`<#${etiketlenen.id}>`));
    return { kanal: etiketlenen, index: i < 0 ? 0 : i };
  }
  return { kanal: null, index: -1, erisimYok };
}

/* Kanal token'ını düşürüp süre / kazanan / ödül ayrıştırır. */
async function cekilisArgumanlari(message, args, lang = "tr") {
  const { kanal, index, erisimYok } = await kanalBul(message, args);
  if (!kanal) return { kanal: null, hata: erisimYok ? "kanal_erisim" : "kanal", kanalId: erisimYok };

  const kalan = [...args.slice(0, index), ...args.slice(index + 1)];
  let secim = null;
  for (let n = 4; n >= 1 && !secim; n--) {
    const parca = kalan.slice(0, n).join(" ");
    if (!parca) continue;
    const cozum = sureCoz(parca, lang);
    if (!cozum.ms) continue;
    const kazanan = parseInt(kalan[n], 10);
    if (!Number.isInteger(kazanan) || kazanan < 1) continue;
    secim = { ...cozum, kazanan, odul: kalan.slice(n + 1).join(" ").trim() };
  }
  if (!secim) {
    const deneme = sureCoz(kalan.slice(0, 4).join(" "), lang);
    const hata = deneme.ms ? "kazanan" : "sure";
    const sureDetay = hata === "kazanan" ? parseInt(kalan[0], 10) : deneme.detay || null;
    return { kanal, hata, sureDetay, sureNeden: hata === "sure" ? deneme.hata : null };
  }
  if (!secim.odul) return { kanal, hata: "odul" };
  return { kanal, ...secim };
}

/* Botun kanalda çekiliş başlatamamasının sebebini insan diliyle açıklar. */
function kanalKontrolü(message, kanal, lang) {
  const EN = lang === "en";
  if (!kanal.isTextBased()) {
    if (typeof kanal.isThreadOnly === "function" && kanal.isThreadOnly())
      return EN ? `\`#${kanal.name}\` is a forum channel (it opens posts) — choose a normal text channel`
        : `\`#${kanal.name}\` forum kanalı (başlık/post açılıyor) — normal bir metin kanalı seçin`;
    if (typeof kanal.isVoiceBased === "function" && kanal.isVoiceBased())
      return EN ? `\`#${kanal.name}\` is a voice channel — choose a text channel`
        : `\`#${kanal.name}\` ses kanalı — metin kanalı seçin`;
    return EN ? `\`#${kanal.name}\` cannot hold messages (channel type: ${kanal.type}) — choose a text channel`
      : `\`#${kanal.name}\` mesaj tutamıyor (kanal türü: ${kanal.type}) — metin kanalı seçin`;
  }

  const ben = message.guild?.members?.me || message.client?.user;
  const izin = ben ? kanal.permissionsFor(ben) : kanal.permissions;
  const eksikler = izin?.missing(["ViewChannel", "SendMessages", "AddReactions", "ReadMessageHistory", "EmbedLinks"]) || [];
  if (eksikler.length)
    return EN
      ? `the bot lacks this permission in \`#${kanal.name}\`: ${eksikler.join(", ")}`
      : `botun \`#${kanal.name}\` kanalında şu yetkisi yok: ${eksikler.join(", ")}`;

  /* discord.js 14.25+ için: TextChannel'da "sendable" alanı yok, isSendable() kullanılır. */
  const gonderebilir = typeof kanal.isSendable === "function" ? kanal.isSendable() : kanal.sendable !== false;
  if (!gonderebilir)
    return EN ? `the bot cannot send messages in \`#${kanal.name}\` (channel is closed/archived)`
      : `bot \`#${kanal.name}\` kanalına mesaj gönderemiyor (kanal kapalı/arşivlenmiş olabilir)`;
  if (kanal.archived)
    return EN ? `this thread is archived: \`#${kanal.name}\`` : `bu thread arşivlenmiş: \`#${kanal.name}\``;
  if (kanal.locked)
    return EN ? `this thread is locked: \`#${kanal.name}\`` : `bu thread kilitli: \`#${kanal.name}\``;
  return null;
}

/* Süre hatalarını kullanıcının anlayacağı cümleye çevirir. */
function sureHataMetni(neden, detay, lang) {
  const EN = lang === "en";
  switch (neden) {
    case "kisa":
      return EN ? "duration is too short (minimum 10 seconds)" : "süre çok kısa (en az 10 saniye olmalı)";
    case "uzun":
      return EN ? "duration is too long (maximum 90 days)" : "süre çok uzun (en fazla 90 gün olabilir)";
    case "birimyok":
      return EN
        ? "duration needs a unit, e.g. `2 hours` / `30m`"
        : "sürenin birimi yazılmalı, örn. `2 saat` / `30m`";
    case "bilinmeyen":
      return EN
        ? `unknown duration unit: \`${detay}\``
        : `süre birimi anlaşılamadı: \`${detay}\``;
    default:
      return EN ? "a duration (e.g. `2 hours`, `30m`)" : "bir süre (örn. `2 saat`, `30m`)";
  }
}

module.exports = { sureCoz, sureMetni, sureHataMetni, kanalBul, cekilisArgumanlari, kanalKontrolü, MIN_MS, MAKS_MS, norm, BIRIM_MS };
