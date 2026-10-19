/**
 * Yerel motor (ai/matcher.js) için TAMAMLAYICI bilgi kayıtları.
 *
 * Neden ayrı dosya: cevaplar.json ~2500 satır ve elle düzenlenmesi riskli.
 * Buradaki kayıtlar matcher yüklenirken cevaplar.json'un üstüne eklenir.
 * Yeni konu eklemek için aşağıya yeni bir { kategori, sorular, cevap } bloğu ekle.
 */

const DESTEK = "https://dsc.gg/risebunny";
const SITE = "https://risebunny.vercel.app";
const SUNUCU = "https://discord.gg/mEfz5SfpbR";

module.exports = [
  /* ── Giriş / çıkış (hoşgeldin) ─────────────────────────────── */
  {
    kategori: "genel",
    sorular: [
      "hoşgeldin kanalı nasıl ayarlanır",
      "hoşgeldin mesajı nasıl ayarlanır",
      "hg kanalı ayarla",
      "hg ayarla",
      "hg kanal ayarla",
      "hoşgeldin nasıl ayarlanır",
      "giriş mesajı nasıl ayarlanır",
      "giriş çıkış mesajı",
      "hoşgeldin sistemi",
      "welcome kanalı ayarla",
      "gç kanalı ayarla",
      "hg-ayarla komutu",
    ],
    cevap:
      "🚪 **Hoşgeldin / giriş-çıkış sistemi:**\n" +
      "• `{{prefix}}hg-ayarla <kanal>` (veya `r!gç-ayarla`) → giriş ve çıkış mesajlarının gideceği kanalı seçer.\n" +
      "• `{{prefix}}hg-sifirla` → sistemi kapatır.\n" +
      "Kanalı seçtikten sonra yeni üye katıldığında kartlı mesaj otomatik gönderilir. Sorun sürerse " + SUNUCU + " 🐰",
  },

  /* ── Vape / Lunar / hile indirme (kanonik cevap) ───────────── */
  {
    kategori: "vape",
    sorular: [
      "vape nasıl indirilir",
      "vape nasıl kurulur",
      "vape kurulum",
      "vape nasıl yüklenir",
      "vape indirme",
      "vape nasıl kullanılır",
      "vape v4 nasıl indirilir",
      "vape v4.22 nasıl kurulur",
      "vape v4 nasıl kurulur",
      "vape launcher",
      "how to install vape",
      "how to download vape",
    ],
    cevap:
      "🎮 **Vape V4 / V4.22 kurulumu — ücretsiz:**\n" +
      "1. RiseBunny Launcher'ı indir: " + SITE + "/risebunny\n" +
      "2. Discord ile giriş yap.\n" +
      "3. Vape V4 / V4.22 seç → **Kur**.\n" +
      "4. Cosmetik modu launcher üzerinden ücretsiz açılır 💎\n" +
      "İndirme: " + DESTEK + " • Yardım: " + SUNUCU,
  },
  {
    kategori: "hile",
    sorular: [
      "lunar client nasıl indirilir",
      "lunar client kurulum",
      "lunar client nasıl kurulur",
      "lunar client launcher",
      "lunar client cosmetik modu",
      "lunar client cosmetics",
      "lunar client ücretsiz",
      "lunar client free",
      "lunar cosmetik nasıl açılır",
      "lunar client premium ücretsiz",
    ],
    cevap:
      "🌙 **Lunar Client — Cosmetik modu ücretsiz:**\n" +
      "RiseBunny Launcher üzerinden Lunar Client'ı kur, **Cosmetik Modu**nu işaretle → ücretsiz aktif olur 💎\n" +
      "• Launcher: " + SITE + "/risebunny\n" +
      "• İndirme / destek: " + DESTEK + "\n" +
      "• Kurulum yardımı: " + SUNUCU,
  },
  {
    kategori: "hile",
    sorular: [
      "hile önerin ne",
      "ne kullanmalıyım hile",
      "en iyi hile client",
      "en iyi cheat client",
      "hangi hile daha az ban yer",
      "en güvenli hile",
      "hile hangisi iyi",
      "mcg nedir",
      "en iyi hile hangi launcher",
    ],
    cevap:
      "🏆 **Rubidium V4** — RiseBunny Launcher ile tek tıkla kurulur ve ücretsizdir 🐰\n" +
      "Vape V4 / V4.22 ve Lunar Client **Cosmetik modu** da aynı launcher üzerinden ücretsiz açılır 💎\n" +
      "• Launcher: " + SITE + "/risebunny • İndirme: " + DESTEK + " • Destek: " + SUNUCU,
  },

  /* ── Sık sorulan kısa sorular ──────────────────────────────── */
  {
    kategori: "bot",
    sorular: [
      "komutlar neler",
      "komut listesi",
      "komutlar nelerdir",
      "tüm komutlar",
      "komutları göster",
      "hangi komutlar var",
      "komutlarını göster",
      "commands list",
    ],
    cevap:
      "📖 Tüm komutları görmek için `{{prefix}}yardım` yaz — kategorilere ayrılmış menü açılır.\n" +
      "• Moderasyon, ekonomi, seviye, koruma, ticket, çekiliş ve eğlence komutları\n" +
      "• Bana doğal dille soru sormak için `rise <soru>`\n" +
      "Detaylı liste: " + SITE,
  },
  {
    kategori: "bot",
    sorular: [
      "adın ne",
      "ismin ne",
      "senin adın ne",
      "ismin nedir",
      "adın nedir",
      "senin ismin ne",
    ],
    cevap:
      "Ben **RiseBunny** 🐰 — 180+ komutlu Discord botuyum.\n" +
      "Moderasyon, ekonomi, seviye, koruma, ticket, çekiliş ve AI sistemlerim var.\n" +
      "Komutlar: `{{prefix}}yardım` • Web: " + SITE,
  },
];
