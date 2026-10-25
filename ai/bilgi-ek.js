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

  /* ── Vape kurulumu — PLATFORM VE ERİŞİM GERÇEĞİYLE ──────────
     v5 DÜZELTME: Burada "Vape kurulumu — ücretsiz" ve "Cosmetik modu
     ücretsiz açılır" yazıyordu. Vape ücretsiz DEĞİL; erişim premium ile
     açılır ve premium parayla satılmaz, bot komutlarıyla kazanılır.
     Ayrıca Vape SADECE PC'de çalışır. Bilgi kaynağı: ai/hile.js          */
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
      "🎮 **Vape V4 / V4.22 kurulumu** (sadece PC / Windows):\n" +
      "1. RiseBunny Launcher'ı indir: " + SITE + "/risebunny\n" +
      "2. Discord ile giriş yap.\n" +
      "3. Vape V4 / V4.22 seç → **Kur**.\n" +
      "Erişim **RiseBunny Premium** ile açılır; premium parayla satılmaz, bot komutlarıyla kazanılır.\n" +
      "**Mobilde çalışmaz.** İndirme: " + DESTEK + " • Yardım: " + SUNUCU,
    cevap_en:
      "🎮 **Vape V4 / V4.22 installation** (PC / Windows only):\n" +
      "1. Download the RiseBunny Launcher: " + SITE + "/risebunny\n" +
      "2. Sign in with Discord.\n" +
      "3. Pick Vape V4 / V4.22 → **Install**.\n" +
      "Access unlocks with **RiseBunny Premium**; premium is not sold for money, you earn it with bot commands.\n" +
      "**Does not work on mobile.** Download: " + DESTEK + " • Help: " + SUNUCU,
  },
  {
    kategori: "lunar",
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
      "🌙 **Lunar Client — Cosmetik modu** (sadece PC):\n" +
      "RiseBunny Launcher üzerinden Lunar Client'ı kur, **Cosmetik Modu**nu işaretle → aktif olur.\n" +
      "**Mobilde çalışmaz.**\n" +
      "• Launcher: " + SITE + "/risebunny\n" +
      "• İndirme / destek: " + DESTEK + "\n" +
      "• Kurulum yardımı: " + SUNUCU,
    cevap_en:
      "🌙 **Lunar Client — Cosmetics mode** (PC only):\n" +
      "Install Lunar Client through the RiseBunny Launcher, tick **Cosmetics Mode** → it activates.\n" +
      "**Does not work on mobile.**\n" +
      "• Launcher: " + SITE + "/risebunny\n" +
      "• Download / support: " + DESTEK + "\n" +
      "• Install help: " + SUNUCU,
  },

  /* ── "Hangi client" — ÖVGÜSÜZ, PLATFORM DUYARLI ────────────────
     v5 DÜZELTME: Burada "🏆 Rubidium V4" diye marka ilan ediliyordu ve
     "Vape ... ücretsiz" yazıyordu. Artık üç seçenek eşit sunuluyor ve
     platform gerçeği yazılı. "En iyi" kararını AI verir (web araştırması
     ile), bu kayıt sadece gerçekleri taşır.                               */
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
      "en iyi hile nedir",
      "en iyi hile",
      "en iyi hile hangisi",
    ],
    cevap:
      "🎯 **RiseBunny Launcher'daki seçenekler:**\n" +
      "• **Rubidium V4** — hafif ve stabil · **PC + mobil** (mobilde PojavLauncher / Java emülatörü ile)\n" +
      "• **Vape V4 / V4.22** — geniş modül havuzu · **sadece PC** · erişim Premium ile açılır\n" +
      "• **Lunar Client Cosmetics** — kozmetik modu · **sadece PC**\n" +
      "Hangisinin uygun olduğu platformuna ve aradığın modüllere bağlı.\n" +
      "• Launcher: " + SITE + "/risebunny • İndirme: " + DESTEK + " • Destek: " + SUNUCU,
    cevap_en:
      "🎯 **Options in the RiseBunny Launcher:**\n" +
      "• **Rubidium V4** — light and stable · **PC + mobile** (via PojavLauncher / Java emulator on mobile)\n" +
      "• **Vape V4 / V4.22** — large module pool · **PC only** · access unlocks with Premium\n" +
      "• **Lunar Client Cosmetics** — cosmetics mode · **PC only**\n" +
      "Which one fits depends on your platform and the modules you want.\n" +
      "• Launcher: " + SITE + "/risebunny • Download: " + DESTEK + " • Support: " + SUNUCU,
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
