/**
 * Dil algılama (yerel, API'siz)
 *
 * Amaç: kullanıcı hangi dilde yazıyorsa o dilde cevap vermek.
 *  • Dil seçmemiş kullanıcı → mesajın diline göre cevap (seçim yapmamışsa varsayılan EN)
 *  • Desteklenmeyen/çözülemeyen dil → "dilini anlamıyorum" (yalan/uydurma cevap yok)
 *
 * Yöntem: karakteristik harf/kelime profili üzerinden puanlama.
 * Türkçe için ı/ş/ğ/ç/ö/ü, ekler (-mek/-mak/-lık/-sı), sık kelimeler.
 * İngilizce için latin dışı harf yokluğu + çok sık kelimeler.
 */

/** Desteklenen diller: kod → görünen ad. */
const DESTEKLENEN = {
  tr: { ad: "Türkçe", adEn: "Turkish" },
  en: { ad: "İngilizce", adEn: "English" },
};

/** Latin alfabesi dışındaki alfabeler → dil (desteklenmiyor, ama ne olduğunu biliyoruz). */
const ALFABELER = [
  { kod: "ru", ad: "Rusça / Russian", re: /[\u0400-\u04FF]/g },
  { kod: "ar", ad: "Arapça / Arabic", re: /[\u0600-\u06FF]/g },
  { kod: "fa", ad: "Farsça / Persian", re: /[\u0600-\u06FF]/g },
  { kod: "el", ad: "Yunanca / Greek", re: /[\u0370-\u03FF]/g },
  { kod: "he", ad: "İbranice / Hebrew", re: /[\u0590-\u05FF]/g },
  { kod: "zh", ad: "Çince / Chinese", re: /[\u4E00-\u9FFF]/g },
  { kod: "ja", ad: "Japonca / Japanese", re: /[\u3040-\u30FF]/g },
  { kod: "ko", ad: "Korece / Korean", re: /[\uAC00-\uD7AF]/g },
  { kod: "hi", ad: "Hintçe / Hindi", re: /[\u0900-\u097F]/g },
  { kod: "th", ad: "Tayca / Thai", re: /[\u0E00-\u0E7F]/g },
  { kod: "ka", ad: "Gürcüce / Georgian", re: /[\u10A0-\u10FF]/g },
  { kod: "hy", ad: "Ermenice / Armenian", re: /[\u0530-\u058F]/g },
];

/** Türkçe'ye özgü harfler — tek başına çok güçlü sinyal. */
const TR_HARF = /[ıİşŞğĞ]/;

/** Sık Türkçe kelimeler (uzun, ayırt edici olanlar). */
const TR_KELIME = new Set([
  "ve", "bir", "bu", "şu", "için", "ile", "ama", "fakat", "çok", "daha", "az", "en", "mi", "mı", "mu", "mü",
  "nasıl", "neden", "niçin", "nerede", "nereden", "nereye", "kim", "ne", "neler", "hangi", "kaç",
  "var", "yok", "olan", "olarak", "olur", "oldu", "olacak", "gibi", "kadar", "sonra", "önce", "şimdi",
  "ben", "sen", "biz", "siz", "onlar", "beni", "seni", "benim", "senin", "bana", "sana",
  "yap", "yapar", "yapıyorum", "yapabilir", "nasılsın", "merhaba", "selam", "teşekkür", "teşekkürler",
  "lütfen", "istiyorum", "istiyor", "istek", "gerek", "gerekiyor", "gerekli", "kullan", "kullanım",
  "komut", "komutlar", "sunucu", "kanal", "üye", "mesaj", "rol", "yetki", "ayar", "ayarla",
  "hile", "premium", "ücretsiz", "bedava", "fiyat", "para", "satın", "alınır", "indirilir",
  "değil", "değilim", "yapamam", "bilmiyorum", "anlamadım", "anlamıyorum", "anlıyorum",
]);

/** Sık İngilizce kelimeler. */
const EN_KELIME = new Set([
  "the", "a", "an", "is", "are", "am", "was", "were", "be", "been", "being",
  "and", "or", "but", "if", "then", "so", "because", "while", "with", "without",
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "this", "that", "these", "those",
  "what", "which", "who", "whom", "whose", "when", "where", "why", "how",
  "do", "does", "did", "done", "can", "could", "will", "would", "should", "shall", "may", "might",
  "have", "has", "had", "get", "got", "make", "made", "go", "went", "want", "need",
  "please", "thanks", "thank", "hello", "hi", "hey", "sorry", "yes", "no",
  "how", "much", "many", "price", "buy", "free", "download", "cheat", "best", "command", "commands",
  "server", "channel", "role", "member", "message", "permission", "setting", "settings",
  "not", "dont", "don't", "cant", "can't", "wont", "won't", "im", "i'm", "its", "it's",
  "there", "here", "about", "from", "for", "to", "of", "in", "on", "at", "by", "as", "than",
]);

const TR_EK = /(?:mek|mak|dır|dir|dur|dür|lar|ler|dan|den|tan|ten|daki|deki|yorum|yorsun|acak|ecek|abilir|ebilir|nın|nin|nun|nün|sı|si|su|sü|ın|in|un|ün)$/i;

/** Türkçe'de çok geçen ama İngilizce'de kelime olmayan biçimler (kısa metinler için). */
const TR_KISA = new Set([
  "nedir", "nasıl", "nasil", "neden", "nerede", "midir", "mıdır", "misin", "mısın",
  "ayarla", "ayarlanır", "indirilir", "alınır", "olarak", "için", "gibi", "kadar",
  "değil", "yoksa", "varsa", "olur", "olurmu", "olurmı",
]);

/**
 * Metnin dilini tahmin eder.
 * @param {string} metin
 * @returns {{ dil: string|null, kod: string|null, guven: number, destekli: boolean, alfabe?: string }}
 *  dil: "tr" | "en" | null (bilinmiyor)
 *  destekli: false → bu dilde cevap veremeyiz, kullanıcıya açıkça söylenmeli.
 */
function dilAlgila(metin) {
  const ham = String(metin || "");
  if (!ham.trim()) return { dil: null, kod: null, guven: 0, destekli: false };

  // 1) Latin dışı alfabe var mı? (Türkçe/İngilizce değil)
  for (const a of ALFABELER) {
    const esles = ham.match(a.re);
    if (esles && esles.length >= 2) {
      return { dil: null, kod: a.kod, alfabe: a.ad, guven: 0.95, destekli: false };
    }
  }

  const kucuk = ham.toLocaleLowerCase("tr-TR");
  const kelimeler = kucuk
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/<[@#!&:0-9]+>|\{\{[a-z_]+\}\}/gi, " ")
    .replace(/[^a-zçğıöşüâîû\s']/gi, " ")
    .split(/\s+/)
    .filter(w => w.length > 1);
  if (!kelimeler.length) return { dil: null, kod: null, guven: 0, destekli: false };

  let trPuan = 0, enPuan = 0;

  // 2) Türkçe'ye özgü harfler (ı, ş, ğ) — güçlü sinyal
  const trHarfSayisi = (ham.match(TR_HARF) || []).length;
  trPuan += trHarfSayisi * 2.2;
  // ç/ö/ü de Türkçe'de çok yaygın (İngilizce'de neredeyse yok)
  trPuan += (ham.match(/[çöüÇÖÜ]/g) || []).length * 0.9;

  // 3) Kelime profili
  for (const w of kelimeler) {
    if (TR_KELIME.has(w)) trPuan += 1.6;
    if (EN_KELIME.has(w)) enPuan += 1.6;
    if (TR_KISA.has(w)) trPuan += 1.4;
    if (TR_EK.test(w) && w.length > 5) trPuan += 0.9;
    // İngilizce'de olmayan Türkçe harf içeren kelime
    if (TR_HARF.test(w)) trPuan += 0.4;
    // Türkçe'de "hiçbir İngilizce kelime" olmayan uzun kelimeler hafif TR sinyali
    if (w.length > 6 && !EN_KELIME.has(w) && !/[qwx]/.test(w)) trPuan += 0.15;
  }

  // 4) Türkçe'de "ğ/ı" yok ama q/w/x yok → hafif TR; İngilizce'de apostroflu kısaltmalar
  if (/\b(?:don't|can't|won't|i'm|it's|isn't|aren't|didn't)\b/i.test(ham)) enPuan += 2;
  if (/[qwxQ WX]/.test(ham.replace(/https?:\/\/\S+/g, " "))) enPuan += 0.6;

  const toplam = trPuan + enPuan;
  if (toplam === 0) {
    // Hiçbir sinyal yok: kısa/emoji/sayı → bilinmiyor (uydurma yok)
    return { dil: null, kod: null, guven: 0, destekli: false };
  }

  const trOran = trPuan / toplam;
  const kazanan = trOran >= 0.5 ? "tr" : "en";
  const guven = Number((kazanan === "tr" ? trOran : 1 - trOran).toFixed(2));

  // Çok düşük güven → dil belirsiz; yalan söylememek için "anlamadım" de
  if (guven < 0.58 && kelimeler.length < 3) {
    return { dil: null, kod: null, guven, destekli: false };
  }
  return { dil: kazanan, kod: kazanan, guven, destekli: true };
}

/** Kullanıcının cevap alacağı dil: seçtiği dil → yoksa mesaj dili → yoksa EN. */
function cevapDili(seciliDil, metin) {
  const alg = dilAlgila(metin);
  if (seciliDil === "tr" || seciliDil === "en") return { dil: seciliDil, kaynak: "secim", alg };
  if (alg.dil) return { dil: alg.dil, kaynak: "algilandi", alg };
  if (alg.destekli === false && alg.kod) return { dil: "en", kaynak: "desteklenmiyor", alg };
  return { dil: "en", kaynak: "varsayilan", alg };
}

/** "Dilini anlamıyorum" mesajı (kullanıcının kendi dilinde + İngilizce). */
function anlamiyorumMesaji(alg) {
  const ad = alg?.alfabe ? ` (${alg.alfabe})` : "";
  return [
    `Sorry — I don't understand your language${ad}. I can reply in **English** or **Türkçe**.`,
    `Üzgünüm — dilini anlayamıyorum${ad}. **Türkçe** veya **English** olarak yazarsan cevap verebilirim.`,
  ].join("\n");
}

module.exports = { dilAlgila, cevapDili, anlamiyorumMesaji, DESTEKLENEN, TR_KELIME, EN_KELIME };
