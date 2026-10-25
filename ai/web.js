/**
 * Web araştırma — yerel bilgi tabanı yetmediğinde gerçek kaynaklardan bilgi toplar.
 *
 * NEDEN: "mrbeast kimdir", "bugun hava nasil", "python ogrenmek istiyorum"
 * gibi sorular bilgi tabanında yok; eskiden ya yanlış yerel cevap dönüyordu
 * ya da modelin ezberine kalıyordu. Artık gerçek arama sonuçları modele
 * "bağlam" olarak veriliyor.
 *
 * TASARIM KARARLARI:
 *  1. **Anahtar gerekmez.** Ücretli arama API'si (Brave/Serper/Tavily) yerine
 *     Wikipedia araması kullanılıyor (TR + EN). Env'de BRAVE_API_KEY varsa
 *     o da havuza katılır — daha temiz sonuç verir.
 *  2. **Anahtar kelime çıkarma.** Kullanıcının sorusu olduğu gibi aranmaz;
 *     "mrbeast kimdir" → "mrbeast" — yoksa "kimdir" gürültüsü sonucu bozar.
 *     Uzun sorularda daha kısa sorgulara inilir (`aramaSorgulari`).
 *  3. **AI hem kaynağı seçer hem cevabı yazar.** Kelime/başlık eşleşmesi
 *     yanıltıcı: "türkiyenin başkenti" → madde "Sefer Turan" (gazeteci).
 *     Bu yüzden toplanan kaynaklar `degerlendir()` ile modele okutulur,
 *     model hangi kaynağın soruyu gerçekten karşıladığına karar verir
 *     (hiçbiri karşılamıyorsa `yeterli:false`) ve cevabı da o yazar.
 *  4. **Zaman bütçesi.** Web yavaşsa cevap gecikmesin; bağlam olmadan
 *     devam edilir (araştırma "bonus", engel değil).
 *  5. **Önbellek.** Aynı soru 10 dk içinde tekrar sorulursa ağa çıkılmaz.
 *  6. **Ne zaman araştırılmalı?** `arastirmaliMi()` karar verir: botun
 *     kendi konuları (rubidium, premium, launcher...) İÇİN ARAŞTIRMA YAPILMAZ
 *     — orada kesin cevap bilgi tabanında. Dış dünya soruları için araştırılır.
 */

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

const ONBELLEK_MS = 10 * 60 * 1000;
/* Zaman bütçesi: toplam araştırma DISCORD'un 3 sn "yazıyor" süresini
   aşmamalı. Tek istek 4 sn, toplam süre 8 sn ile sınırlı — aşarsa elde
   olanla devam edilir (araştırma bonus, engel değil). */
const ZAMAN_ASIMI = Number(process.env.WEB_TIMEOUT_MS || 4000);
const TOPLAM_BUTCE = Number(process.env.WEB_TOTAL_MS || 8000);
const MAKS_SONUC = 5;
const onbellek = new Map(); // anahtar -> { t, veri }

/* ────────────────────── Ne zaman araştırılır? ────────────────────── */

/**
 * Botun KENDİ SİSTEMLERİ — burada web'e çıkmak zararlı (yanlış bilgi riski).
 *
 * v4 (2026-10) DEĞİŞİKLİĞİ — `vape|lunar|hile|cheat|rubidium` ÇIKARILDI:
 * Önceki liste bu kelimeleri içerdiği için "en iyi mobil hile" gibi sorular
 * internete HİÇ çıkmıyordu; model ezbere konuşuyordu. Kullanıcı "internetteki
 * minecraft hilelerini araştırsın" dedi.
 *
 * Artık ayrım şu:
 *   - Botun kendi mekaniği (ban, ekonomi, ticket, komut...) → ARAŞTIRMA YOK
 *   - Hile/client/piyasa bilgisi → ARAŞTIR (gerçekleri hile.js verir, web ek bilgi)
 *
 * `risebunny` hâlâ içeride: markanın kendi launcher/premium akışı internette
 * yanlış anlatılıyor, orada bilgi tabanı doğru kaynak.
 */
const IC_KONULAR = /\b(bot|komut\w*|prefix|laf|token|seviye\w*|level|ekonomi|pet|kupon|ticket|destek-talebi|otomasyon|ban|kick|mute|jail|guard|modlog|siterol|girisrol|otorol|risebunny|premium|launcher)\b/i;

/**
 * Dış dünya hakkında soru mu? (araştırılabilir)
 *
 * v4: TR/EN PARİTESİ. Önceki listede TR taraf eksikti; "saat kaç" araştırmıyor
 * ama "what time is it" araştırıyordu (aynı soru, farklı davranış). Artık her
 * kavramın TR ve EN karşılığı birlikte duruyor.
 */
const DIS_KONU_IPUCU = new RegExp([
  /* soru kelimeleri — TR */
  "kim|kimdir|kimler|nedir|ne\\s+zaman|nerede|nereden|hangi|kaç|nasıl|neden|niçin|ne\\s+işe",
  /* soru kelimeleri — EN */
  "who|what|when|where|which|how|why|whose|whom",
  /* alanlar — TR */
  "tarih|ülke|başkent|film|dizi|oyun|şarkı|albüm|takım|futbol|basketbol|seçim|haber|güncel|hile|cheat|client|mobil|mobile|sürüm|fiyat",
  /* alanlar — EN */
  "history|capital|movie|series|game|song|album|team|football|soccer|basketball|election|news|latest|current|cheat|hack|client|mobile|version|price|best",
].join("|"), "i");

/**
 * Bu soru için web araştırması yapılmalı mı?
 * @param {string} soru
 * @param {{yerelBulundu?:boolean}} ek
 */
function arastirmaliMi(soru, ek = {}) {
  const s = String(soru || "").trim();
  if (s.length < 3) return false;
  if (IC_KONULAR.test(s)) return false; // kendi konumuz → bilgi tabanı doğru kaynak
  // Bilgi tabanında zaten cevap bulunduysa ağa çıkma
  if (ek.yerelBulundu) return false;
  // Çok kısa/sohbet mesajları ("selam", "naber") araştırma gerektirmez
  if (s.split(/\s+/).length === 1 && !DIS_KONU_IPUCU.test(s) && !/^[A-Z0-9]{2,}$/.test(s)) {
    return false;
  }
  // Soru işareti varsa ya da soru kelimesi geçiyorsa araştır
  if (s.includes("?") || DIS_KONU_IPUCU.test(s)) return true;
  // Aksi halde en az 2 kelime ve 12 karakter ise bir konu adı olabilir (ör. "albert einstein")
  const kelime = s.split(/\s+/).filter(w => w.length > 2);
  return kelime.length >= 2 && s.length >= 12;
}

/* ────────────────────── Sorgu hazırlama ────────────────────── */

/** Türkçe/İngilizce soru kelimelerini at, geriye konu kalsın. */
const SORU_KELIMELERI = new Set([
  "kim", "kimdir", "kimler", "nedir", "ne", "neden", "niçin", "nicin", "nasıl", "nasil",
  "nerede", "nereden", "nereye", "neresi", "neresinde", "neresidir", "ne zaman", "hangi", "hangisi", "kaç", "kac",
  "mi", "mı", "mu", "mü", "midir", "mıdır", "bana", "bize", "söyle", "soyle",
  "anlat", "bilgi", "ver", "hakkında", "hakkinda", "ile", "ve", "bir", "bu", "şu",
  "who", "what", "when", "where", "which", "why", "how", "is", "are", "the",
  "a", "an", "of", "tell", "me", "about", "does", "do", "did", "was", "were",
]);

function anahtarKelime(soru) {
  const temiz = String(soru || "")
    .replace(/[?!.,;:()[\]{}"'`]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const kelimeler = temiz.split(" ").filter(w => w && !SORU_KELIMELERI.has(w.toLowerCase()));
  const sonuc = (kelimeler.length ? kelimeler : temiz.split(" ")).join(" ").trim();
  return sonuc.slice(0, 120) || temiz.slice(0, 120);
}

/**
 * Arama motoru için sadeleştirilmiş sorgu.
 *
 * NEDEN AYRI: `anahtarKelime()` "türkiyenin başkenti neresi" → "türkiyenin
 * başkenti" veriyor. Wikipedia bunu arattığında alakasız madde dönüyordu
 * ("Sefer Turan" — bir gazeteci). Sebep: "başkenti" gibi tamlama ekleri ve
 * uzun sorgular arama motorunu şaşırtıyor.
 *
 * Burada sırayla daha kısa sorgular denenir (en uzundan en kısaya):
 *   "türkiyenin başkenti" → "türkiye" → "türkiyenin"
 * Ayrıca Türkçe iyelik/hâl ekleri kırpılır (türkiyenin → türkiye).
 */
function aramaSorgulari(soru) {
  const ana = anahtarKelime(soru);
  const adaylar = [];

  const ekKirp = (w) => String(w)
    .replace(/(nın|nin|nun|nün|ın|in|un|ün)$/i, "")
    .replace(/(n|y)?(ı|i|u|ü|a|e|da|de|ta|te)$/i, "")
    .trim();

  const kelimeler = ana.split(/\s+/).filter(Boolean);
  if (!kelimeler.length) return [ana];

  adaylar.push(ana);
  // Son kelimeyi at (genelde "başkenti", "özellikleri" gibi tamlama)
  if (kelimeler.length >= 3) adaylar.push(kelimeler.slice(0, -1).join(" "));
  if (kelimeler.length >= 2) adaylar.push(kelimeler.slice(0, -1).join(" "));
  // Ekleri kırpılmış hâli
  if (kelimeler.length >= 2) {
    const kirp = kelimeler.slice(0, -1).map(ekKirp).filter(Boolean);
    if (kirp.length) adaylar.push(kirp.join(" "));
  }
  // İlk kelime tek başına (genelde asıl özel isim)
  adaylar.push(kelimeler[0]);
  if (kelimeler.length >= 2) {
    const ilkKirp = ekKirp(kelimeler[0]);
    if (ilkKirp) adaylar.push(ilkKirp);
  }

  // Tekilleştir, boşları at, sırayı koru
  const out = [];
  for (const a of adaylar) {
    const t = String(a || "").trim();
    if (t && !out.includes(t)) out.push(t);
  }
  return out;
}

/* ────────────────────── HTML temizleme ────────────────────── */

function htmlCoz(s) {
  return String(s || "")
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#(\d+);/g, (_, n) => {
      const k = Number(n);
      return k >= 32 && k < 0x10000 ? String.fromCharCode(k) : " ";
    })
    .replace(/\s+/g, " ")
    .trim();
}

/* ────────────────────── Kaynaklar ────────────────────── */

/** HTTP isteği — 429/5xx'te bekleyip yeniden dener.
 *  Wikipedia eşzamanlı isteklerde 429 dönüyor (testte görüldü). Tek deneme
 *  yeterli değil: tekrar başarılı olur ve araştırma sessizce ölmez. */
async function _get(url, basliklar = {}, deneme = 1) {
  let son;
  for (let i = 0; i <= deneme; i++) {
    try {
      const r = await fetch(url, {
        headers: { "User-Agent": UA, "Accept-Language": "tr,en;q=0.8", ...basliklar },
        signal: AbortSignal.timeout(ZAMAN_ASIMI),
        redirect: "follow",
      });
      if (r.ok) return r.text();
      son = new Error("HTTP " + r.status);
      // 429 / 503 → bekleyip tekrar dene; 4xx'in geri kalanı kalıcı hata
      if (r.status === 429 || r.status >= 500) {
        await new Promise(t => setTimeout(t, 400 * (i + 1)));
        continue;
      }
      throw son;
    } catch (e) {
      son = e;
      if (i === deneme) throw e;
      await new Promise(t => setTimeout(t, 300 * (i + 1)));
    }
  }
  throw son || new Error("istek basarisiz");
}

/** Wikipedia arama — birden çok madde başlığı (en güvenilir kaynak).
 *  DDG/SearX engellendiği için (202 arayüz, 403 bot koruması) asıl arama
 *  motoru bu. `list=search` + `extracts` birleşik: başlık + özet. */
async function wikipediaCoklu(konu, dil = "tr", limit = 3) {
  try {
    const url = `https://${dil}.wikipedia.org/w/api.php?action=query&format=json&prop=extracts`
      + `&exintro=1&explaintext=1&redirects=1&exlimit=max&generator=search`
      + `&gsrlimit=${limit}&gsrsearch=${encodeURIComponent(konu)}`;
    const ham = await _get(url);
    const j = JSON.parse(ham);
    const sayfalar = j?.query?.pages;
    if (!sayfalar) return [];
    return Object.values(sayfalar)
      .map(p => ({
        baslik: p.title,
        ozet: String(p.extract || "").replace(/\s+/g, " ").trim().slice(0, 700),
        url: `https://${dil}.wikipedia.org/wiki/${encodeURIComponent(String(p.title).replace(/ /g, "_"))}`,
        kaynak: dil === "tr" ? "Wikipedia (TR)" : "Wikipedia (EN)",
        sira: p.index || 0,
      }))
      .filter(x => x.ozet.length > 40)
      .sort((a, b) => a.sira - b.sira);
  } catch { return []; }
}

/** Başlıktan doğrudan özet (arama sonucu boşsa son çare). */
async function wikipediaBaslik(baslik, dil = "tr") {
  try {
    const url = `https://${dil}.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(String(baslik).replace(/ /g, "_"))}`;
    const ham = await _get(url);
    const j = JSON.parse(ham);
    const ozet = String(j?.extract || "").replace(/\s+/g, " ").trim();
    if (ozet.length < 40) return null;
    return {
      baslik: j.title || baslik,
      ozet: ozet.slice(0, 700),
      url: j?.content_urls?.desktop?.page || "",
      kaynak: "Wikipedia",
    };
  } catch { return null; }
}

/* ── DuckDuckGo KALDIRILDI (2026-10) ──
   Test sonucu: html.duckduckgo.com ve lite.duckduckgo.com ikisi de HTTP 202 +
   boş sayfa dönüyor (bot koruması), api.duckduckgo.com ise AbstractText boş.
   Yani parse kodu çalışsa bile veri gelmiyordu — "web araması yapıyor" gibi
   görünen ama hep boş dönen ölü kod. Silindi; yerine Wikipedia araması
   (wikipediaCoklu) ve opsiyonel Brave API kaldı.
   SearXNG genel örnekleri de 403 veriyor, denenmedi. */

/** Brave Search API — BRAVE_API_KEY varsa (en temiz sonuç). */
async function braveAra(konu) {
  const key = process.env.BRAVE_API_KEY;
  if (!key) return [];
  try {
    const ham = await _get(
      "https://api.search.brave.com/res/v1/web/search?count=" + MAKS_SONUC + "&q=" + encodeURIComponent(konu),
      { "X-Subscription-Token": key, Accept: "application/json" }
    );
    const j = JSON.parse(ham);
    return (j?.web?.results || []).slice(0, MAKS_SONUC).map(r => ({
      baslik: htmlCoz(r.title),
      ozet: htmlCoz(r.description || "").slice(0, 400),
      url: r.url,
      kaynak: "Brave",
    }));
  } catch { return []; }
}

/* ────────────────────── AI değerlendirmesi ────────────────────── */

/**
 * Toplanan kaynakları modele okutur: hangisinin soruyu gerçekten karşıladığına
 * karar verir ve cevabı yazar.
 *
 * NEDEN GEREKLİ: Kelime eşleşmesi alaka ölçmez.
 *   "türkiyenin başkenti neresi" → Wikipedia "Sefer Turan" (gazeteci) döndü.
 *   Başlıkta "türkiye" yok ama skor yüksek çıktı; bot yanlış kişiyi anlattı.
 * Bu fonksiyon kaynakları modele veriyor, model "bu kaynak soruyu karşılıyor mu"
 * diye okuyup seçiyor. Hiçbiri karşılamıyorsa `yeterli:false` dönüyor —
 * o zaman bot kaynaksız (kendi bilgisiyle) cevap verir, uydurma kaynak göstermez.
 *
 * @param {string} soru
 * @param {Array<{baslik:string, ozet:string, url:string, kaynak:string}>} sonuclar
 * @param {"tr"|"en"} dil
 * @returns {Promise<{yeterli:boolean, cevap:string, kullanilan:number[], guven:number}>}
 */
async function degerlendir(soru, sonuclar, dil = "tr") {
  const bos = { yeterli: false, cevap: "", kullanilan: [], guven: 0 };
  if (!Array.isArray(sonuclar) || !sonuclar.length) return bos;

  let chainAsk;
  try { ({ chainAsk } = require("./providers")); } catch { return bos; }

  const kaynakMetni = sonuclar.map((r, i) =>
    `[${i + 1}] ${r.baslik} (${r.kaynak})\n${String(r.ozet || "").slice(0, 600)}\n${r.url || ""}`
  ).join("\n\n").slice(0, 4500);

  const isTr = dil !== "en";
  const sistem = isTr
    ? "Sen RiseBunny Discord botunun bilgi asistanısın. Sana bir kullanıcı sorusu ve web'den toplanmış kaynaklar verildi.\n" +
      "GÖREV:\n" +
      "1. Kaynakları soruyla karşılaştır. Kaynak soruyu GERÇEKTEN karşılıyor mu? Başlık/özet sadece kelime benzerliği taşıyorsa (ör. soru 'Türkiye'nin başkenti', kaynak bir gazeteci biyografisi) o kaynak YETERSİZDİR.\n" +
      "2. Yeterli en az bir kaynak varsa, SADECE o kaynaklardaki bilgiyle kullanıcının sorusuna doğal, akıcı Türkçe cevap yaz. Kaynakta olmayan bilgi ekleme. Kısa ve net ol (en fazla 6 satır).\n" +
      "3. Hiçbir kaynak soruyu karşılamıyorsa cevap UYDURMA: yeterli=false dön.\n" +
      "Yanıtı SADECE şu JSON ile ver:\n" +
      '{"yeterli": true|false, "kullanilan": [kullandığın kaynak numaraları], "guven": 0.0-1.0, "cevap": "kullanıcıya gösterilecek metin"}\n' +
      "guven: kaynağın soruyu ne kadar iyi karşıladığı (0-1)."
    : "You are the knowledge assistant of the RiseBunny Discord bot. You get a user question and web sources collected for it.\n" +
      "TASK:\n" +
      "1. Compare the sources to the question. Does a source REALLY answer it? If the match is only word-level (e.g. question 'capital of Turkey', source a journalist's biography) that source is NOT enough.\n" +
      "2. If at least one source is enough, answer the user's question using ONLY facts from those sources. Natural, fluent English, at most 6 lines. Do not add outside facts.\n" +
      "3. If no source really answers it, do NOT make one up: return yeterli=false.\n" +
      "Reply ONLY with this JSON:\n" +
      '{"yeterli": true|false, "kullanilan": [source numbers used], "guven": 0.0-1.0, "cevap": "text shown to the user"}';

  const kullaniciMesaji = (isTr ? "SORU: " : "QUESTION: ") + soru + "\n\n"
    + (isTr ? "KAYNAKLAR:\n" : "SOURCES:\n") + kaynakMetni;

  try {
    const r = await chainAsk(sistem, kullaniciMesaji, dil, {
      jsonMode: true,
      temperature: Number(process.env.WEB_AI_SICAKLIK || 0.2),
      maxTokens: Number(process.env.WEB_AI_MAX_TOKEN || 700),
      timeout: 20000,
    });
    if (!r?.success) return bos;

    const j = _jsonCoz(r.cevap);
    if (!j) return bos;

    const cevap = String(j.cevap || "").trim();
    const yeterli = j.yeterli === true && cevap.length > 0;
    const kullanilan = Array.isArray(j.kullanilan)
      ? j.kullanilan.map(Number).filter(n => n >= 1 && n <= sonuclar.length)
      : [];

    return {
      yeterli,
      cevap: yeterli ? cevap : "",
      kullanilan,
      guven: typeof j.guven === "number" ? Math.max(0, Math.min(1, j.guven)) : (yeterli ? 0.6 : 0),
    };
  } catch (e) {
    console.warn("[AI Web] degerlendirme hatasi:", e?.message || e);
    return bos;
  }
}

/** Modelin cevabından JSON çıkarır — ```json çiti, önsöz metni, sonda virgül. */
function _jsonCoz(metin) {
  let s = String(metin || "").trim();
  if (!s) return null;
  // ```json ... ``` çitini temizle
  const cit = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (cit) s = cit[1].trim();
  // Metin içinden ilk { ... } bloğunu al
  if (!s.startsWith("{")) {
    const m = s.match(/\{[\s\S]*\}/);
    if (m) s = m[0];
  }
  try {
    return JSON.parse(s);
  } catch {
    // Sondaki fazla virgüller yüzünden patlayabilir
    try { return JSON.parse(s.replace(/,\s*([}\]])/g, "$1")); } catch { return null; }
  }
}

/* ────────────────────── Ana giriş ────────────────────── */

/**
 * Soru hakkında web'den bilgi toplar, sonucu AI'a değerlendirtir.
 *
 * İki aşama:
 *   a) Toplama: Wikipedia (TR→EN) + varsa Brave. Ucuz, anahtar gerekmez.
 *   b) Değerlendirme: `degerlendir()` kaynakları modele okutur; model
 *      hangisinin soruyu karşıladığına karar verir VE cevabı yazar.
 *      (`ai:false` verilirse atlanır — sadece bağlam döner.)
 *
 * @param {string} soru
 * @param {{maksSonuc?:number, ai?:boolean, dil?:string}} ayar
 * @returns {Promise<{ok:boolean, konu:string, sonuclar:object[], baglam:string,
 *   kaynaklar:string[], yeterli?:boolean, cevap?:string, kullanilan?:number[], guven?:number}>}
 */
async function arastir(soru, ayar = {}) {
  const konu = anahtarKelime(soru);
  const bos = { ok: false, konu, wiki: null, sonuclar: [], baglam: "", kaynaklar: [], yeterli: false, cevap: "" };
  if (!konu) return bos;

  const anahtar = konu.toLowerCase() + "|" + (ayar.ai === false ? "0" : "1") + "|" + (ayar.dil || "tr");
  const onb = onbellek.get(anahtar);
  if (onb && Date.now() - onb.t < ONBELLEK_MS) return onb.veri;

  const maks = Math.max(1, Math.min(6, ayar.maksSonuc || MAKS_SONUC));

  /* Toplam zaman bütçesi: bu süre dolunca elde olanla dönülür.
     Üretimde "minecraft nedir" 12.5 sn sürdü (retry'lar üst üste bindi);
     Discord'da bu kabul edilemez. */
  const baslangic = Date.now();
  const butceDoldu = () => (Date.now() - baslangic) > TOPLAM_BUTCE;

  /* Sıra: (1) TR Wikipedia çoklu sonuç → (2) yeterli değilse EN Wikipedia →
     (3) hâlâ boşsa başlık üzerinden REST özet → (4) Brave varsa hepsi bir arada.

     NEDEN SIRALI (Promise.all değil): Wikipedia API eşzamanlı isteklerde
     HTTP 429 dönüyor (testte görüldü). Anahtar yoksa tek güvenilir kaynak
     Wikipedia olduğu için istekleri sıraya koyuyoruz. Brave anahtarı varsa
     o da aynı havuza katılır (paralel, API limiti ayrı). */
  let sonuclar = [];

  const brave = process.env.BRAVE_API_KEY ? await braveAra(konu) : [];
  if (brave.length) sonuclar.push(...brave);

  /* Sorgu sadeleştirme zinciri: "türkiyenin başkenti" → "türkiye" gibi
     kısalmalarla gerçek maddeyi bulmaya çalış. İlk İYİ sonuçta duruyoruz
     (yeterli özet geldiyse daha kısa sorguya inmeye gerek yok). */
  const sorgular = aramaSorgulari(soru);
  let wikiTR = [];

  /* DİKKAT — "sonuç sayısı" kalite değildir:
     "türkiyenin başkenti" araması 3 sonuç döndürüyor ama hepsi alakasız
     (Sefer Turan, Ermeni Soykırımı'nı Anma Günü...). Eski döngü "3 sonuç
     geldi → yeter" diyip duruyordu, sonuç yanlış madde. Artık sorgunun
     kelimelerinin madde başlığında geçmesine bakıyoruz: başlık sorguyu
     karşılamıyorsa o sonuç kümesi zayıf sayılır ve kısa sorguya inilir. */
  const sorguKelimeleri = (s) => String(s).toLowerCase().split(/\s+/).filter(w => w.length > 2);
  const baslikUyumu = (sonuclar, sorgu) => {
    const kel = sorguKelimeleri(sorgu);
    if (!kel.length || !sonuclar.length) return 0;
    const ilkBaslik = String(sonuclar[0]?.baslik || "").toLowerCase();
    const eslesen = kel.filter(w => ilkBaslik.includes(w)).length;
    return eslesen / kel.length;
  };

  for (const sorgu of sorgular) {
    if (butceDoldu()) break;
    const denendi = await wikipediaCoklu(sorgu, "tr", Math.min(3, maks));
    const uyum = baslikUyumu(denendi, sorgu);
    if (denendi.length) {
      // Önceki denemeden iyiyse (ya da ilk denemeyse) sakla
      if (!wikiTR.length || uyum > 0.5) wikiTR = denendi;
      // Başlık sorgunun kelimelerini karşılıyorsa iyi sonuç → dur
      if (uyum >= 0.5) break;
    }
    await new Promise(t => setTimeout(t, 150)); // 429'a karşı nefes payı
  }

  // Türkçe kaynak zayıfsa İngilizce dene (bilim/teknoloji konularında daha iyi)
  if (wikiTR.length < 2 && !butceDoldu()) {
    for (const sorgu of sorgular.slice(0, 2)) {
      if (butceDoldu()) break;
      const wikiEN = await wikipediaCoklu(sorgu, "en", Math.min(3, maks));
      if (wikiEN.length) { wikiTR = [...wikiTR, ...wikiEN]; break; }
    }
  }

  // Hâlâ boşsa: başlık olarak doğrudan madde çek
  if (!wikiTR.length && !butceDoldu()) {
    for (const sorgu of sorgular) {
      if (butceDoldu()) break;
      for (const dil of ["tr", "en"]) {
        const tek = await wikipediaBaslik(sorgu, dil);
        if (tek) { wikiTR.push(tek); break; }
      }
      if (wikiTR.length) break;
    }
  }

  // Wikipedia sonuçları öne (en güvenilir), sonra web araması
  sonuclar = [...wikiTR, ...sonuclar];

  // Tekilleştir (aynı başlık iki kez gelmesin)
  const gorulen = new Set();
  sonuclar = sonuclar.filter(r => {
    const k = String(r.baslik || "").toLowerCase();
    if (!k || gorulen.has(k)) return false;
    gorulen.add(k);
    return true;
  }).slice(0, maks);

  const wiki = sonuclar[0] || null;

  if (!sonuclar.length) {
    const cikti = { ...bos, konu };
    onbellek.set(anahtar, { t: Date.now(), veri: cikti });
    return cikti;
  }

  // Modelin okuyacağı bağlam metni
  const satirlar = [];
  sonuclar.forEach((r, i) => {
    satirlar.push(`[${i + 1}] (${r.kaynak}) ${r.baslik}`);
    if (r.ozet) satirlar.push(`    ${r.ozet}`);
    if (r.url) satirlar.push(`    ${r.url}`);
  });
  const baglam = satirlar.join("\n").slice(0, 4000);

  const cikti = {
    ok: true,
    konu,
    wiki: sonuclar[0] || null,
    sonuclar,
    baglam,
    kaynaklar: sonuclar.map(r => r.url).filter(Boolean),
    yeterli: false,
    cevap: "",
    kullanilan: [],
    guven: 0,
  };

  /* ── AI değerlendirmesi: hangi kaynak gerçekten cevap veriyor + son cevap ──
     Kelime/başlık eşleşmesi yanıltıcı olduğu için kararı modele bırakıyoruz.
     Model "bu kaynaklar soruyu karşılamıyor" derse `yeterli:false` kalır ve
     bot kaynaksız cevap verir — uydurma kaynak gösterilmez. */
  if (ayar.ai !== false) {
    const d = await degerlendir(soru, sonuclar, ayar.dil || "tr");
    cikti.yeterli = d.yeterli;
    cikti.cevap = d.cevap;
    cikti.kullanilan = d.kullanilan;
    cikti.guven = d.guven;
    console.log(`🤖 [AI Web] "${soru}" → yeterli=${d.yeterli} guven=${d.guven.toFixed(2)} kullanilan=[${d.kullanilan.join(",")}]`);
  }

  onbellek.set(anahtar, { t: Date.now(), veri: cikti });
  if (onbellek.size > 500) {
    for (const [k, v] of onbellek) if (Date.now() - v.t > ONBELLEK_MS) onbellek.delete(k);
  }
  return cikti;
}

/** Bağlamı sistem promptuna eklenebilir hâle getirir.
 *  AI `kullanilan` numaralarını verdiyse SADECE o kaynaklar modele gider —
 *  alakasız maddeler (ör. "Sefer Turan") prompt'u kirletmesin. */
function baglamMetni(sonuc, dil = "tr") {
  if (!sonuc?.ok) return "";
  const isTr = dil !== "en";

  const secili = Array.isArray(sonuc.kullanilan) && sonuc.kullanilan.length
    ? sonuc.kullanilan.map(n => sonuc.sonuclar[n - 1]).filter(Boolean)
    : sonuc.sonuclar;

  if (!secili.length) return "";

  const satirlar = secili.map((r, i) => {
    const parca = [`[${i + 1}] (${r.kaynak}) ${r.baslik}`];
    if (r.ozet) parca.push(`    ${String(r.ozet).slice(0, 700)}`);
    if (r.url) parca.push(`    ${r.url}`);
    return parca.join("\n");
  });

  const baslik = isTr
    ? "WEB ARAŞTIRMASI (sadece buradaki bilgiyi kullan; dışında bilgi uydurma):"
    : "WEB RESEARCH (use only these facts; do not invent beyond them):";

  return `\n\n${baslik}\n${satirlar.join("\n\n").slice(0, 4000)}`;
}

function onbellekTemizle() { onbellek.clear(); }

module.exports = {
  arastir,
  arastirmaliMi,
  anahtarKelime,
  aramaSorgulari,
  degerlendir,
  baglamMetni,
  onbellekTemizle,
};
