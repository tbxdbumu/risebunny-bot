/**
 * Yerel (API'siz) eşleştirici — "local AI" motoru
 *
 * Eski sürüm: Levenshtein + Jaccard. Türkçe ekler yüzünden kelimeler kaçıyor,
 * eşik düşük olduğu için alakasız cevaplar dönüyordu.
 *
 * Yeni motor (hepsi yerel, internet/API gerekmez):
 *  1. Türkçe + İngilizce normalizasyon (ı/ş/ğ/ü/ö/ç, aksan, emoji, noktalama)
 *  2. Kök bulma (ek sıyırma) + kök önbelleği
 *  3. BM25 (IDF ağırlıklı) kelime skoru — nadir kelime daha çok puan getirir
 *  4. Karakter üçlüsü (trigram) Dice skoru — yazım hatalarını yakalar
 *  5. Eşanlamlı/niyet genişletme sözlüğü (premium=elit=pro, vape=closet, hg=hoşgeldin ...)
 *  6. İçerme bonusu — kısa soru uzun varyantın içindeyse
 *  7. Eşik + "ikinci en iyi" marjı: skor yüksek olsa bile iki aday çok yakınsa sormaz (yanlış cevap riski düşer)
 *  8. Kategori ön eki — "hiç bilinmeyen" soruda yanlış cevap uydurmaz
 */

const { normalize } = require("./tokenizer");

/* ───────────────────────────── Kök bulucu ───────────────────────────── */
const EKLER = [
  "larınızdan", "lerinizden", "larimizdan", "lerimizden", "diklerimizden", "diklerimizde",
  "larindan", "lerinden", "larimiz", "lerimiz", "lariniz", "leriniz",
  "diklerini", "dikleri", "dikler", "dikten", "diğinden", "diginden",
  "larini", "lerini", "larin", "lerin",
  "lardan", "lerden", "lardaki", "lerdeki",
  "malar", "meler", "masi", "mesi", "makta", "mekte",
  "madan", "meden", "arak", "erek",
  "ecek", "acak", "yecek", "yacak", "misin", "mısın", "musun", "müsün",
  "yorum", "yorsun", "yoruz", "yorlar", "iyor", "ıyor", "uyor", "üyor",
  "abilir", "ebilir", "abil", "ebil",
  "malı", "meli", "mam", "mem",
  "lari", "leri", "lar", "ler",
  "nin", "nun", "nın", "nün",
  "dan", "den", "tan", "ten", "da", "de", "ta", "te",
  "ya", "ye", "yı", "yi", "yu", "yü",
  "ın", "in", "un", "ün",
  "imiz", "ımız", "umuz", "ümüz",
  "im", "ım", "um", "üm",
  "siz", "sız", "suz", "süz",
  "sini", "sını", "sunu", "sünü",
  "dır", "dir", "dur", "dür", "tır", "tir", "tur", "tür",
  "mak", "mek", "miş", "mış", "muş", "müş", "di", "dı", "du", "dü",
  "li", "lı", "lu", "lü", "ca", "ce", "ça", "çe",
  "sı", "si", "su", "sü",
];
// Uzun ekler önce denenir
EKLER.sort((a, b) => b.length - a.length);

/**
 * Kelimeyi köke indirger.
 *
 * Türkçe'de ek sıyırmanın sorunu: "açık" kelimesindeki "-ık" ek değildir ama
 * "açıklama"daki "-lama" ektir. Kesin ayrım yapılamadığı için HEM tam hali
 * HEM sıyrılmış hali indekse eklenir (bkz. kokler()). Böylece "açık" ↔ "açılır"
 * eşleşmesi kök kaybından dolayı kaçmaz.
 */
const KORUNAN = new Set([
  "para", "premium", "bot", "spam", "sayi", "kayit", "vape", "ticket", "config",
  "ban", "kick", "mute", "level", "rank", "help", "site", "web",
]);

function kok(kelime) {
  if (!kelime) return "";
  const n = normalize(kelime);
  if (n.length <= 4 || KORUNAN.has(n)) return n;

  let kok = n;
  let degisti = true;
  while (degisti) {
    degisti = false;
    for (const ek of EKLER) {
      if (kok.length - ek.length < 3) continue;
      if (kok.endsWith(ek)) {
        kok = kok.slice(0, -ek.length);
        degisti = true;
        break;
      }
    }
  }
  return kok;
}

/**
 * Bir kelimenin indeksten aranacak tüm biçimleri: tam hali + sıyrılmış hali.
 * Kısa/uzun her ikisi de tutulur, böylece "kazanılır" sorgusu hem
 * "kazanılır" hem "kazan" dokümanına, "kazanma" dokümanı da her ikisine uyar.
 */
function kelimeBicimleri(kelime) {
  const n = normalize(kelime);
  if (!n) return [];
  const k = kok(n);
  return k === n ? [n] : [n, k];
}

/**
 * Cevap metnini kelime torbasına çevirir (Türkçe kök + tam hal).
 * "Bu iki cevap aynı konuyu mu anlatıyor?" sorusunu yanıtlamak için kullanılır.
 */
function bench(metin) {
  const set = new Set();
  const temiz = String(metin || "")
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\{\{prefix\}\}/g, " ")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ");
  for (const w of temiz.split(/\s+/)) {
    if (w.length < 3) continue;
    for (const b of kelimeBicimleri(w)) set.add(b);
  }
  return set;
}

/** İki kelime torbası arasında Jaccard benzerliği (0..1). */
function jaccard(a, b) {
  if (!a || !b || !a.size || !b.size) return 0;
  let kesisim = 0;
  for (const x of a) if (b.has(x)) kesisim++;
  const birlesim = a.size + b.size - kesisim;
  return birlesim ? kesisim / birlesim : 0;
}

/**
 * Konu (topic) grupları: aynı konuyu anlatan kategoriler birlikte değerlendirilir.
 * Örn. "en iyi hile nedir" (hile) ile "vape nasıl indirilir" (vape) aynı kümeye düşer,
 * böylece kelimeler iki konuya dağılıp eşiğin altında kalıp BİLGİ KAYBI olmaz.
 */
const KONU = {
  premium: "magaza",
  vape: "hile",
  hile: "hile",
  rubidium: "hile",
  launcher: "hile",
  config: "hile",
  genel: "sohbet",
  yardim: "sohbet",
  komutlar: "sohbet",
  ai: "sohbet",
  bot: "sohbet",
  destek: "sohbet",
  gizlilik: "sohbet",
  sorun_giderme: "sohbet",
  moderasyon: "yonetim",
  koruma: "yonetim",
  kayit: "yonetim",
  ticket: "yonetim",
};
const konu = kategori => KONU[kategori] || kategori;


/* ───────────────────────── Eşanlamlı / niyet sözlüğü ───────────────── */
// Sol taraf: kullanıcının yazabilecekleri. Sağ taraf: kanonik kökler.
const ESANLAM = {
  // Genel
  naber: ["nasil", "gidisat", "hal"],
  nasilsin: ["nasil"],
  selam: ["merhaba", "hey"],
  slm: ["merhaba"],
  mrb: ["merhaba"],
  tşk: ["tesekkur", "sagol"],
  tsk: ["tesekkur", "sagol"],
  eyw: ["tesekkur", "sagol"],
  krds: ["kardes"],
  knk: ["arkadas"],
  abi: ["arkadas"],
  bro: ["arkadas"],
  // Premium / satın alma
  elit: ["premium"],
  pro: ["premium"],
  vip: ["premium"],
  ucretsiz: ["free", "bedava"],
  bedava: ["free", "ucretsiz"],
  "ne kadar": ["fiyat", "ucret"],
  fiyat: ["ucret", "kac", "para"],
  ucret: ["fiyat"],
  kacpara: ["fiyat", "ucret"],
  satin: ["satin", "al"],
  almak: ["al", "satin"],
  // Vape / client
  vapev: ["vape"],
  vape422: ["vape"],
  vape4: ["vape"],
  closet: ["vape"],
  ghost: ["vape"],
  rubidium: ["rubidium", "client"],
  client: ["client", "launcher"],
  launcher: ["launcher", "client"],
  indir: ["indir", "download"],
  download: ["indir"],
  yukle: ["indir", "yukle"],
  // Giriş/çıkış
  hg: ["hosgeldin", "giris", "welcome"],
  bb: ["gulegule", "cikis", "baybay"],
  hosgeldin: ["hosgeldin", "welcome"],
  "giris cikis": ["giris", "cikis", "hosgeldin", "gulegule"],
  welcome: ["hosgeldin", "giris"],
  gulegule: ["cikis", "ayrildi", "goodbye"],
  ayrildi: ["cikis", "gulegule"],
  // Kayıt
  kayit: ["kayit", "register"],
  register: ["kayit"],
  isim: ["isim", "nick"],
  yas: ["yas", "age"],
  // Koruma
  koruma: ["koruma", "guard", "protect"],
  protection: ["koruma"],
  antiraid: ["raid", "koruma"],
  raidkoruma: ["raid", "koruma"],
  antispam: ["spam", "koruma"],
  kufur: ["kufur", "swear"],
  reklam: ["reklam", "ad", "link"],
  // Ekonomi
  para: ["para", "money", "cash"],
  money: ["para"],
  cash: ["para"],
  bakiye: ["para", "bakiye", "balance"],
  balance: ["para", "bakiye"],
  gunluk: ["gunluk", "daily"],
  daily: ["gunluk"],
  seviye: ["seviye", "level", "xp"],
  level: ["seviye", "xp"],
  rank: ["seviye"],
  // Komut yardımı
  komut: ["komut", "command"],
  command: ["komut"],
  help: ["yardim", "help"],
  yardim: ["yardim", "help"],
  nasil: ["nasil"],
  where: ["nerede", "nasil"],
  nerede: ["nerede", "nasil"],
  // Bot kimliği
  ismin: ["isim", "adin"],
  adin: ["isim", "adin"],
  senkimsin: ["kim", "bot"],
  kimsin: ["kim", "bot"],
  botsun: ["bot"],
  whoareyou: ["kim", "bot"],
  // Moderasyon
  banla: ["ban", "yasakla"],
  yasakla: ["ban"],
  at: ["kick", "at"],
  kickle: ["kick"],
  sustur: ["mute", "sustur"],
  mutele: ["mute"],
  uyar: ["uyari", "warn"],
  uyari: ["uyari", "warn"],
  sil: ["sil", "temizle"],
  temizle: ["sil", "clear"],
  clear: ["sil"],
  // Davet
  davet: ["davet", "invite"],
  invite: ["davet"],
  link: ["link", "davet"],
};

/** Token listesini eşanlamlılarla genişlet (kök bazlı, tekilleştirilmiş). */
function genislet(tokens) {
  const set = new Set(tokens);
  for (const t of tokens) {
    const ek = ESANLAM[t];
    if (ek) for (const e of ek) for (const b of kelimeBicimleri(e)) set.add(b);
  }
  // çok kelimeli kalıplar (n-gram) — normalize edilmiş token dizisi üzerinde
  const duz = tokens.filter(t => !t.includes(" "));
  for (let i = 0; i < duz.length; i++) {
    for (const n of [3, 2]) {
      if (i + n > duz.length) continue;
      const kalip = duz.slice(i, i + n).join(" ");
      const ek = ESANLAM[kalip];
      if (ek) for (const e of ek) for (const b of kelimeBicimleri(e)) set.add(b);
    }
  }
  return [...set];
}

/* ─────────────────────────────── Metin işleme ─────────────────────────────── */
/**
 * İşlevsiz (bilgi taşımayan) kelimeler — YALNIZCA kapsam/IDF hesabından çıkarılır.
 * Sorgunun tamamı bunlardan oluşuyorsa (örn. "nasılsın") tekrar kullanılır,
 * böylece "nasılsın" gibi tamamen selamlama sorguları cevapsız kalmaz.
 */
const DURAK = new Set([
  "bir", "ve", "ile", "mi", "mu", "mı", "mü", "ne", "bu", "su", "da", "de", "ki", "ya", "ama",
  "cok", "az", "icin", "gibi", "kadar", "daha", "var", "yok", "ise", "olarak", "olan", "olur",
  "nasil", "neden", "nicin", "neler", "nelerdir", "nedir", "nerede", "nereden", "nasilsin",
  "the", "a", "an", "is", "are", "to", "of", "in", "on", "for", "and", "or", "do", "does",
  "i", "you", "it", "what", "how", "why", "where", "can", "my",
  /* ── v2: soru kalıpları ──
     Bunlar bilgi taşımaz, sadece cümleyi soruya çevirir. Listede olmadıkları
     için "mrbeast kimdir" → "kim" kökü yakalanıp "sahibin kim" ile
     eşleşiyordu (skor 0.90). "kimdir" kök bulucuda "kim"e iniyor, bu yüzden
     kök hali de ("kim") listede. */
  "kim", "kimdir", "kime", "kimi", "kimin", "kimler",
  "kac", "kacar", "kacinci", "hangi", "hangisi", "hangileri",
  "misin", "mısın", "musun", "müsün",
  "nedir", "neydi", "napiyor", "naparsin", "napabilir", "napabilirim",
  /* ── v2: İngilizce soru kalıpları ──
     "what ur model" → "ur" kökü kalıyordu; "you" listesi "ur/u"yu kapsamıyordu. */
  "ur", "your", "you", "u", "me", "we", "us", "they", "them", "he", "she",
  "whats", "which", "who", "whom", "whose", "when", "tell", "about", "there",
  "is", "was", "were", "be", "am", "this", "that", "these", "those",
  "please", "pls", "plz", "hey", "hi", "hello",
]);

function tokenizeFull(text) {
  return normalize(text)
    .split(/\s+/)
    .filter(t => t.length > 0);
}

/**
 * Bilgi taşıyan kökler.
 * Her kelime için hem tam hali hem sıyrılmış hali döner (kelimeBicimleri).
 * Tamamı durak kelime ise (örn. "nasılsın") durak olmayan kökler kullanılır.
 */
function kokler(text, genisletMi = true) {
  const tumu = tokenizeFull(text);
  const bilgi = tumu.filter(w => !DURAK.has(w) && !DURAK.has(kok(w)));
  const secilen = bilgi.length ? bilgi : tumu.filter(w => !DURAK.has(w));
  const kaynak = secilen.length ? secilen : tumu;
  const set = new Set();
  for (const w of kaynak) for (const b of kelimeBicimleri(w)) set.add(b);
  const out = [...set];
  return genisletMi ? genislet(out) : out;
}

/**
 * v2: KELİME BAZLI kapsam — "kaç kelime gerçekten tutuyor?"
 *
 * Neden ayrı fonksiyon: `kokler()` kelime→kök eşlemesini kaybediyor.
 * "bugun" kelimesi kök listesine "bugun" VE "bug" olarak iki giriş yapar.
 * Kök listesi üzerinden sayım yapılırsa tek kelime 2 eşleşme sanılır ve
 * kapsam 1.00 çıkar ("bugun hava nasil" → "saat kaç" hatası).
 *
 * Burada her kelime BİR kez değerlendirilir: tam hali VEYA sıyrılmış hali
 * dokümanda geçiyorsa o kelime "tuttu" sayılır.
 *
 * @returns {{tutulan:number, toplam:number, oran:number}}
 */
function kelimeKapsami(text, dokKokleri) {
  const tumu = tokenizeFull(text);
  const bilgi = tumu.filter(w => !DURAK.has(w) && !DURAK.has(kok(w)));
  const kaynak = bilgi.length ? bilgi : tumu.filter(w => !DURAK.has(w));
  const kelimeler = kaynak.length ? kaynak : tumu;
  if (!kelimeler.length) return { tutulan: 0, toplam: 0, oran: 0 };

  let tutulan = 0;
  for (const w of kelimeler) {
    if (kelimeBicimleri(w).some(b => dokKokleri.has(b))) tutulan++;
  }
  return { tutulan, toplam: kelimeler.length, oran: tutulan / kelimeler.length };
}

function trigrams(s) {
  const n = normalize(s).replace(/\s+/g, " ");
  const set = new Set();
  if (n.length < 3) { if (n) set.add(n); return set; }
  for (let i = 0; i <= n.length - 3; i++) set.add(n.slice(i, i + 3));
  return set;
}

function dice(a, b) {
  const A = trigrams(a), B = trigrams(b);
  if (!A.size || !B.size) return 0;
  let ortak = 0;
  for (const x of A) if (B.has(x)) ortak++;
  return (2 * ortak) / (A.size + B.size);
}

function soguUzunluk(s) { return String(s || "").trim().length; }

/* ─────────────────────────────── Matcher sınıfı ─────────────────────────────── */
class SoruEslestirici {
  constructor(db, ayar = {}) {
    this.db = db;
    /** Bu skorun altındaki adaylar kullanılmaz. */
    this.esik = ayar.esik ?? Number(process.env.AI_ESIK || 0.42);
    /** En iyi ve ikinci en iyi aday bu kadar yakınsa cevap verilmez (belirsizlik kapısı). */
    this.marj = ayar.marj ?? Number(process.env.AI_MARJ || 0.02);
    this.cache = null;
    this.cacheTime = 0;
    this.cacheTTL = ayar.cacheTTL ?? 60000;
    this.indeks = null;
    this.istatistik = { sorgu: 0, isabet: 0, yerelSaglayici: "bm25+dice" };
  }

  /* ── Veri yükleme ─────────────────────────────────────────── */
  tumVerileriGetir() {
    const now = Date.now();
    if (this.cache && now - this.cacheTime < this.cacheTTL) return this.cache;

    const veriler = [];
    try {
      const all = this.db.all() || {};
      for (const [key, value] of Object.entries(all)) {
        if (!key.startsWith("ai_qa_") || !value || !value.soru || !value.cevap) continue;
        // Öğrenilenler tek tek (varyant olarak değil, ayrı kayıt)
        veriler.push({
          id: key.replace("ai_qa_", ""),
          soru: value.soru,
          sorular: [value.soru, ...(Array.isArray(value.varyant) ? value.varyant : [])],
          cevap: value.cevap,
          cevap_en: value.cevap_en || value.cevap,
          kategori: value.kategori || "genel",
          kaynak: value.kaynak || "manual",
          kullanim: value.kullanim || 0,
          faydali: value.faydali || 0,
          oncelik: 0.08, // öğrenilen cevaplar biraz öne çıksın
        });
      }
    } catch (e) {
      console.warn("[AI Yerel] DB okunamadı:", e.message);
    }

    try {
      const fs = require("fs");
      const path = require("path");
      const data = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "cevaplar.json"), "utf8"));
      for (const item of data.cevaplar || []) {
        const sorular = Array.isArray(item.sorular) ? item.sorular : [];
        if (!sorular.length) continue;
        veriler.push({
          id: `builtin_${item.kategori || "genel"}_${sorular[0]}`,
          soru: sorular[0],
          sorular,
          cevap: item.cevap,
          cevap_en: item.cevap_en || item.cevap,
          kategori: item.kategori || "genel",
          kaynak: "builtin",
          kullanim: 0,
          faydali: 0,
          oncelik: 0,
        });
      }
    } catch (e) {
      console.warn("[AI Yerel] cevaplar.json okunamadı:", e.message);
    }

    // Kategori önceliği: kullanıcı bir KONU adı yazdığında (premium, vape, rubidium, hile...)
    // o kategori hafifçe öne çıksın. Genel sohbet kategorileri (genel/yardim/...) bonus almaz.
    const AGIR_KATEGORILER = new Set([
      "premium", "vape", "rubidium", "hile", "config", "launcher", "moderasyon", "ekonomi",
      "koruma", "kayit", "seviye", "ticket", "cekil", "ai",
    ]);
    for (const v of veriler) {
      if (!v.oncelik && v.kaynak === "builtin" && AGIR_KATEGORILER.has(v.kategori)) v.oncelik = 0.03;
    }

    // YENİ KONU KAYITLARI (tamamlayıcı): eksik kalan niyetler için yerel motoru besler.
    // Sunucu sahibi bunları AI panelinden silebilir/güncelleyebilir.
    const EK_KAYITLAR = require("./bilgi-ek");
    for (const e of EK_KAYITLAR) {
      veriler.push({
        id: `ek_${e.kategori}_${e.sorular[0]}`,
        soru: e.sorular[0],
        sorular: e.sorular,
        cevap: e.cevap,
        cevap_en: e.cevap,
        kategori: e.kategori,
        kaynak: "ek",
        kullanim: 0,
        faydali: 0,
        oncelik: 0.01,
      });
    }

    this.cache = veriler;
    this.cacheTime = now;
    this.indeks = this.indeksOlustur(veriler);
    return veriler;
  }

  /* ── Ters indeks + IDF (BM25) ─────────────────────────────── */
  indeksOlustur(veriler) {
    const df = new Map();        // kök → kaç dokümanda geçiyor
    const dokumanlar = [];
    let toplamUzunluk = 0;

    for (const v of veriler) {
      const kokSet = new Set();
      const normSorular = [];
      for (const s of v.sorular) {
        normSorular.push(normalize(s));
        for (const k of kokler(s)) kokSet.add(k);
      }
      const toks = [...kokSet];
      toplamUzunluk += toks.length;
      dokumanlar.push({ kayit: v, kokler: kokSet, normSorular, uzunluk: toks.length });
      for (const k of toks) df.set(k, (df.get(k) || 0) + 1);
    }

    const N = dokumanlar.length || 1;
    const idf = new Map();
    for (const [k, d] of df) idf.set(k, Math.log(1 + (N - d + 0.5) / (d + 0.5)));

    return {
      dokumanlar,
      idf,
      N,
      ortUzunluk: toplamUzunluk / N || 1,
      maxIdf: Math.log(1 + (N + 0.5) / 0.5),
    };
  }

/**
 * Tek doküman için skor.
 *
 * Kritik nokta: kök listesinde aynı kelimenin "tam + sıyrılmış" hali birlikte
 * bulunduğu için kapsam KELİME SAYISI üzerinden hesaplanır (kök sayısı üzerinden
 * değil) — yoksa "yardım" tek kelime olmasına rağmen 2 kök sayılıp kapsam bozulur.
 *
 * Ağırlıklar:
 *  - ozKapsam  (kullanıcının yazdığı kelimelerin eşleşme oranı) : 0.40
 *  - genisKapsam (eşanlamlı genişletilmiş köklerin eşleşmesi)   : 0.10
 *  - idfOran   (nadir kök eşleşmesi)                           : 0.26
 *  - dice      (yazım hatası toleransı)                        : 0.24
 */
dokumanSkoru(normSorgu, sorguKokleri, dok, idfIdx, ozKokler = null, ozKelimeSayisi = 0) {
  const oz = ozKokler || sorguKokleri;

  /* ── v2 KAPSAM: kelime bazlı (bkz. kelimeKapsami) ──
     Eski hesap kök listesi üzerinden yapılıyordu ve "bugun" gibi tek bir
     kelimenin 2 biçimi ("bugun" + "bug") 2 eşleşme sayılıyordu.
     "bugun hava nasil" → kapsam 1.00 → "saat kaç" cevabı.
     Artık her kelime en fazla 1 kez sayılır. */
  const kk = kelimeKapsami(normSorgu, dok.kokler);
  const ozKapsam = ozKelimeSayisi > 0 ? kk.oran : (oz.length
    ? [...oz].filter(k => dok.kokler.has(k)).length / oz.length
    : 0);

  let genisEslesen = 0;
  for (const k of sorguKokleri) if (dok.kokler.has(k)) genisEslesen++;
  const genisKapsam = sorguKokleri.length ? genisEslesen / sorguKokleri.length : 0;

  if (genisEslesen === 0) return null;

  /* ── v2 GÜVENLİK KAPISI: bilgi taşıyan kelime eşleşmesi YOKSA skor üretme ──
     Eski hata: "risebunny nedir" ↔ "launcher nasıl kurulur" 0.92 alıyordu.
     Tek ortak kelime "nedir" idi (DURAK), yani hiçbir bilgi örtüşmesi yoktu;
     skor tamamen trigram Dice'tan geliyordu. Artık kullanıcının yazdığı
     ANLAMLI kelimelerden en az BİRİ dokümanda geçmiyorsa aday değil.
     (Saf yazım hatası toleransı `bul()` içindeki ayrı Dice dalında korunur.) */
  if (ozKapsam === 0) return null;

  // IDF ağırlıklı eşleşme (nadir kök daha değerli)
  let idfAldi = 0, idfToplam = 0;
  for (const k of oz) {
    const idf = idfIdx.idf.get(k) ?? 0;
    idfToplam += idf;
    if (dok.kokler.has(k)) idfAldi += idf;
  }
  const idfHam = idfToplam > 0 ? idfAldi / idfToplam : genisKapsam;
  /* v2: IDF oranını kelime kapsamıyla çarp.
     Eski hata: sorgunun TEK nadir kelimesi tutunca oran 1.0 oluyordu.
     "mrbeast kimdir" → sadece "kim" (kök) tutuyordu, ama "kim" nadir sayılıp
     idfOran=1.0 veriyordu → skor 0.90. Artık 4 kelimeden 1'i tutuyorsa
     oran da 0.25'e iner; tam eşleşme tam puan alır. */
  const idfOran = idfHam * ozKapsam;

  // Trigram Dice — yazım hatası toleransı (en iyi varyant)
  let diceSkor = 0;
  for (const n of dok.normSorular) {
    const d = dice(normSorgu, n);
    if (d > diceSkor) diceSkor = d;
  }
  /* v2: aynı gerekçeyle Dice da kapsamla ölçeklenir.
     Aksi halde sadece harf benzerliği olan (anlamı alakasız) dokümanlar
     0.24 ağırlıktan tam puan alıyordu. Kapsam 0 ise yukarıdaki kapı zaten
     döndürdü; burada en az 1 anlamlı kelime örtüşmesi var. */
  const diceKatki = diceSkor * (0.35 + 0.65 * ozKapsam);

  // Uzunluk dengesi: çok kısa sorgu ↔ çok uzun doküman uyumsuzluğuna hafif ceza
  const sU = Math.max(1, normSorgu.length);
  const dU = Math.max(1, dok.normSorular.length ? Math.min(...dok.normSorular.map(x => x.length)) : 1);
  const uzunlukCarpani = 0.94 + 0.06 * (Math.min(sU, dU) / Math.max(sU, dU));

  /* ── v2 KAPSAM CEZASI ──
     Eski hata: "risebunny nedir" 2 anlamlı kelimeden 1'ini tutuyor (kapsam
     0.5) ama yine de 1.00 skor alıyordu; sonuç "bot çevrimdışı görünüyor".
     Sebep: tek kelime tutunca kalan ağırlıklar (geniş kapsam + dice) doluyordu.

     Kullanıcı 3 anlamlı kelime yazıp sadece 1'i tutuyorsa bu bir eşleşme
     DEĞİL, tesadüftür. Kapsam düşükse skoru orantılı düşür:
       kapsam 1.00 → ×1.00 (tam eşleşme, ceza yok)
       kapsam 0.75 → ×0.81
       kapsam 0.50 → ×0.50
       kapsam 0.33 → ×0.19
     Doğrusal değil karesel: kısmi örtüşmeyi hızla cezalandırır. */
  const kapsamCeza = 0.35 + 0.65 * (ozKapsam * ozKapsam);

  /* ── v2 TEK KELİME KAPISI ──
     Sorguda yalnızca BİR anlamlı kelime varsa ("risebunny nedir" → sadece
     "risebunny"), o kelime dokümanın ANA sorusunda mı yoksa sadece bir
     VARYANTINDA mı geçiyor, buna bakılır.

       "risebunny ne zamandan beri geliştiriliyor" → ana soruda geçiyor  ×1.00
       "bot çevrimdışı görünüyor" ("risebunny offline" varyantı) → ×0.70

     Aksi halde marka adı geçen her varyant aynı skoru alıyor ve yanlış
     cevap dönüyordu. */
  let tekKelimeCarpani = 1;
  if (kk.toplam === 1) {
    const sorguKelime = tokenizeFull(normSorgu).find(w => !DURAK.has(w) && !DURAK.has(kok(w)))
      || tokenizeFull(normSorgu).find(w => !DURAK.has(w));
    if (sorguKelime) {
      const bicimler = kelimeBicimleri(sorguKelime);
      const anaSoruda = bicimler.some(b => dok.koklerSoru?.has(b));
      tekKelimeCarpani = anaSoruda === false ? 0.70 : 1;
    }
  }

  const skor = ((ozKapsam * 0.40) + (genisKapsam * 0.10) + (idfOran * 0.26) + (diceKatki * 0.24))
    * uzunlukCarpani * kapsamCeza * tekKelimeCarpani
    + (dok.kayit.oncelik || 0);
  return { skor: Math.min(1, skor), kapsam: ozKapsam, idfOran, diceSkor };
}

  /* ── Cache ────────────────────────────────────────────────── */
  cacheTemizle() {
    this.cache = null;
    this.cacheTime = 0;
    this.indeks = null;
  }

  /* ── Ana arama ────────────────────────────────────────────── */
  async bul(soru, ayar = {}) {
    const veriler = this.tumVerileriGetir();
    if (!veriler.length) return null;
    if (!this.indeks) this.indeks = this.indeksOlustur(veriler);

    const esik = ayar.esik ?? this.esik;
    const marj = ayar.marj ?? this.marj;
    const normSorgu = normalize(soru);
    const ozKokler = kokler(soru, false);
    const sorguKokleri = genislet(ozKokler);
    if (!ozKokler.length || !normSorgu) return null;

    const idfIdx = this.indeks;
    const adaylar = [];

    // Sorgudaki BİLGİ TAŞIYAN kelime sayısı (kapsam bundan hesaplanır; köklerden değil,
    // yoksa "yardım"→"yardim|yard" 2 kök sayılıp kapsam bozulur)
    const ozKelimeler = tokenizeFull(soru).filter(w => !DURAK.has(w));
    const ozKelimeSayisi = Math.max(1, (ozKelimeler.length ? ozKelimeler : tokenizeFull(soru)).length);

    for (const dok of idfIdx.dokumanlar) {
      const s = this.dokumanSkoru(normSorgu, sorguKokleri, dok, idfIdx, ozKokler, ozKelimeSayisi);
      // Hiç anlamlı kök eşleşmesi yok: SADECE yazım çok yakınsa aday olsun.
      // v2: eşik 0.62 → 0.78. Eski değer "risebunny nedir" ↔ "launcher nasıl
      // kurulur" gibi anlamca alakasız ama harfçe benzeyen çiftleri geçiriyordu.
      // 0.78 yalnızca gerçek yazım hatalarını ("premıum" ↔ "premium") yakalar.
      if (!s) {
        let d = 0;
        for (const n of dok.normSorular) d = Math.max(d, dice(normSorgu, n));
        if (d < 0.78) continue;
        adaylar.push({ dok, skor: d * 0.85, kapsam: 0, diceSkor: d });
        continue;
      }
      adaylar.push({ dok, skor: s.skor, kapsam: s.kapsam, diceSkor: s.diceSkor });
    }

    if (!adaylar.length) return null;
    adaylar.sort((a, b) => b.skor - a.skor);

    // TOPLAMA (fusion): aynı KONUYA ait, birbirine yakın adaylar TEK küme sayılır.
    // "vape ücretsiz mi" → vape(0.912) + vape(0.886) aynı kümeye düşer;
    // "en iyi hile nedir" → hile + vape + rubidium aynı "hile" konusuna düşer.
    // Küme skoru = en iyi tekil skor + ek üyeler için azalan katkı (en fazla +0.12).
    // Eşiğin %60'ının altındaki gürültü kümelenmeye katılmaz.
    const kumeler = [];
    for (const a of adaylar) {
      if (a.skor < esik * 0.6) break; // adaylar skora göre sıralı; gerisi gürültü
      const kn = konu(a.dok.kayit.kategori);
      const kume = kumeler.find(k => k.konu === kn);
      if (kume) {
        kume.uye.push(a);
        kume.toplam += a.skor;
      } else {
        kumeler.push({ konu: kn, enIyiSkor: a.skor, enIyi: a, uye: [a], toplam: a.skor });
      }
    }
    // Kume skoru: en iyi tekil skor + (ek üyeler için azalan katkı, en fazla +0.12)
    for (const k of kumeler) {
      let ek = 0;
      for (let i = 1; i < k.uye.length; i++) ek += 0.05 * Math.pow(0.6, i - 1);
      k.skor = Math.min(1, k.enIyi.skor + Math.min(0.12, ek));
      k.uye.sort((a, b) => b.skor - a.skor);
    }
    kumeler.sort((a, b) => b.skor - a.skor);

    const enIyiKume = kumeler[0];
    const ikinciKume = kumeler[1];
    if (!enIyiKume) return null;

    if (enIyiKume.skor < esik) return null;

    // Belirsizlik kapısı — bilgi kaybını azaltan üç katman:
    //  1) Cevap metni aynı → aynı bilgi, güvenle dön.
    //  2) Cevapların kelime torbaları benzer (Jaccard ≥ 0.30) → aynı konu, güvenle dön.
    //  3) Skor farkı marjdan küçükse ve yukarıdakiler tutmuyorsa → cevap VERME.
    if (ikinciKume && ikinciKume.skor >= esik) {
      const a = enIyiKume.enIyi.dok.kayit, b = ikinciKume.enIyi.dok.kayit;
      const yakin = (enIyiKume.skor - ikinciKume.skor) < marj;
      const ayniCevap = a.cevap === b.cevap;
      const ayniKonu = !ayniCevap && jaccard(bench(a.cevap), bench(b.cevap)) >= 0.30;
      if (yakin && !ayniCevap && !ayniKonu) return null;
    }

    // Küme içinde: faydalı oy → kullanım → benzerlik (tekil skor) → dice
    enIyiKume.uye.sort((a, b) =>
      (b.dok.kayit.faydali || 0) - (a.dok.kayit.faydali || 0) ||
      (b.dok.kayit.kullanim || 0) - (a.dok.kayit.kullanim || 0) ||
      b.skor - a.skor ||
      (b.diceSkor || 0) - (a.diceSkor || 0));

    const secilen = enIyiKume.uye[0];
    const k = secilen.dok.kayit;
    const kumeSkor = enIyiKume.skor;
    return {
      id: k.id,
      soru: k.soru,
      cevap: k.cevap,
      cevap_en: k.cevap_en,
      kategori: k.kategori,
      kaynak: k.kaynak,
      skor: Number(kumeSkor.toFixed(3)),
      benzerlik: Math.round(kumeSkor * 100),
      guven: kumeSkor >= 0.72 ? "yuksek" : kumeSkor >= 0.55 ? "orta" : "dusuk",
      eslesen: secilen.kapsam,
      eslesmeSayisi: enIyiKume.uye.length,
    };
  }

  /** Birden çok sonuç (kullanıcıya "şunlardan hangisi?" diye sormak için). */
  async cokluBul(soru, limit = 3, esik = null) {
    const veriler = this.tumVerileriGetir();
    if (!veriler.length) return [];
    if (!this.indeks) this.indeks = this.indeksOlustur(veriler);

    const normSorgu = normalize(soru);
    const ozKokler = kokler(soru, false);
    const sorguKokleri = genislet(ozKokler);
    if (!sorguKokleri.length) return [];
    const sinir = esik ?? this.esik * 0.8;

    /* v2: `bul()` ile AYNI kapsam hesabı kullanılmalı.
       Eski hata: ozKelimeSayisi verilmiyordu → kapsam kök sayısından
       hesaplanıp şişiyordu, "risebunny nedir" → "launcher nasıl kurulur"
       0.92 alıyordu. */
    const ozKelimeler = tokenizeFull(soru).filter(w => !DURAK.has(w));
    const ozKelimeSayisi = Math.max(1, (ozKelimeler.length ? ozKelimeler : tokenizeFull(soru)).length);

    const out = [];
    for (const dok of this.indeks.dokumanlar) {
      const s = this.dokumanSkoru(normSorgu, sorguKokleri, dok, this.indeks, ozKokler, ozKelimeSayisi);
      if (!s) continue;
      if (s.skor >= sinir) out.push({ ...dok.kayit, skor: Number(s.skor.toFixed(3)) });
    }
    out.sort((a, b) => b.skor - a.skor);
    return out.slice(0, limit);
  }

  setEsik(deger) {
    this.esik = Math.max(0, Math.min(1, deger));
  }

  /** Yerel motor istatistiği (r!ai-durum için). */
  bilgi() {
    const v = this.tumVerileriGetir();
    return {
      kayit: v.length,
      varyant: v.reduce((s, x) => s + (x.sorular?.length || 1), 0),
      esik: this.esik,
      marj: this.marj,
      motor: "BM25 + trigram Dice + Türkçe kök + eşanlamlı",
    };
  }

  /** Cevaptaki değişkenleri doldur. */
  degiskenleriDoldur(cevap, message, client) {
    if (!cevap) return cevap;
    const { getLangSync } = require("../dil");
    const lang = getLangSync(message.author.id);
    const prefix = process.env.PREFIX || "r!";
    return String(cevap)
      .replace(/\{\{time\}\}/g, new Date().toLocaleTimeString(lang === "en" ? "en-US" : "tr-TR"))
      .replace(/\{\{date\}\}/g, new Date().toLocaleDateString(lang === "en" ? "en-US" : "tr-TR"))
      .replace(/\{\{user\}\}/g, message.author?.username || "Kullanıcı")
      .replace(/\{\{mention\}\}/g, message.author ? `<@${message.author.id}>` : "@Kullanıcı")
      .replace(/\{\{guild\}\}/g, message.guild?.name || "DM")
      .replace(/\{\{prefix\}\}/g, prefix)
      .replace(/\{\{bot\}\}/g, client?.user?.username || "RiseBunny")
      .replace(/\{\{ping\}\}/g, client?.ws?.ping ?? 0)
      .replace(/\{\{uyeSayisi\}\}/g, message.guild?.memberCount ?? "?");
  }
}

function similarity(text1, text2) {
  if (!text1 || !text2) return 0;
  const a = kokler(text1), b = kokler(text2);
  if (!a.length || !b.length) return dice(text1, text2);
  const sa = new Set(a), sb = new Set(b);
  let ortak = 0;
  for (const x of sa) if (sb.has(x)) ortak++;
  const kapsam = ortak / Math.min(sa.size, sb.size);
  return Math.min(1, kapsam * 0.7 + dice(text1, text2) * 0.3);
}

SoruEslestirici.similarity = similarity;
module.exports = SoruEslestirici;
module.exports.SoruEslestirici = SoruEslestirici;
module.exports.similarity = similarity;
module.exports.kok = kok;
module.exports.kokler = kokler;
module.exports.kelimeBicimleri = kelimeBicimleri;
module.exports.dice = dice;
