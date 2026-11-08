/**
 * HİLE / CLIENT BİLGİSİ — TEK DOĞRULUK KAYNAĞI
 *
 * NEDEN AYRI DOSYA:
 * Hile bilgisi 4 ayrı yerde duruyordu ve hepsi birbirinden habersizdi:
 *   1. cevaplar.json içinde 5 kayıt (#154–#159 + vape/rubidium kategorileri)
 *   2. ai/groq.js buildSystemPrompt içinde ezber cevap ("✅ Doğrudan şu cevabı ver")
 *   3. ai/matcher.js eşanlamlı listesi
 *   4. ai/web.js IC_KONULAR (araştırmayı kapatıyordu)
 *
 * Sonuç: aynı kullanıcı 15 saniye arayla iki zıt cevap alıyordu:
 *   "is vape free"        → "Vape V4 / V4.22 ücretsiz!"          (#34)
 *   "is vape v4 free"     → "Vape için ücretsiz erişim sağlamıyorum" (#33)
 *
 * Artık gerçek burada. Yerel kayıtlar, prompt ve web araştırması buradan
 * beslenir; değiştirmek gerekirse SADECE bu dosya değişir.
 *
 * KULLANICI ONAYLI GERÇEKLER (2026-10):
 *   - Rubidium V4 → PC + mobil (PojavLauncher / Java emülatörü üzerinden)
 *   - Vape V4 / V4.22 → SADECE PC (mobilde çalışmaz)
 *   - Lunar Client Cosmetics → SADECE PC
 *   - Premium → PARAYLA SATILMAZ; bot komutlarıyla kazanılır
 *   - "En iyi hile" → AI + internet araştırması karar verir (bu dosya iddia etmez)
 */

const LINKLER = {
  launcher: "https://risebunny.vercel.app/risebunny",
  site: "https://risebunny.vercel.app",
  indirme: "https://dsc.gg/risebunny",
  destek: "https://discord.gg/mEfz5SfpbR",
};

/**
 * Ürünler — platform bilgisi ZORUNLU alan.
 * platform.mobil:
 *   true       → doğrudan mobilde çalışır
 *   "pojav"    → mobilde PojavLauncher gibi bir Java emülatörü ile çalıştırılabilir
 *   false      → mobilde çalışmaz
 */
const URUNLER = [
  {
    id: "rubidium",
    ad: "Rubidium V4",
    trKisa: "hafif, stabil Minecraft client'ı",
    enKisa: "lightweight, stable Minecraft client",
    platform: { pc: true, mobil: "pojav" },
    mobilNotuTr: "Mobilde **PojavLauncher** (Java emülatörü) üzerinden çalıştırılabilir.",
    mobilNotuEn: "On mobile it can run through **PojavLauncher** (a Java emulator).",
    erisimTr: "RiseBunny Launcher ile ücretsiz kurulur.",
    erisimEn: "Installs free through the RiseBunny Launcher.",
  },
  {
    id: "vape",
    ad: "Vape V4 / V4.22",
    trKisa: "geniş modül ve config havuzu olan client",
    enKisa: "client with a large module and config pool",
    platform: { pc: true, mobil: false },
    mobilNotuTr: "**Mobilde çalışmaz**, sadece PC (Windows).",
    mobilNotuEn: "**Does not work on mobile**, PC (Windows) only.",
    erisimTr: "Erişim **RiseBunny Premium** ile açılır; premium parayla satılmaz, bot komutlarıyla kazanılır.",
    erisimEn: "Access unlocks with **RiseBunny Premium**; premium is not sold for money, you earn it with bot commands.",
  },
  {
    id: "lunar",
    ad: "Lunar Client Cosmetics",
    trKisa: "kozmetik görünüm modu",
    enKisa: "cosmetics-only visual mode",
    platform: { pc: true, mobil: false },
    mobilNotuTr: "**Mobilde çalışmaz**, sadece PC.",
    mobilNotuEn: "**Does not work on mobile**, PC only.",
    erisimTr: "RiseBunny Launcher ile ücretsiz açılır.",
    erisimEn: "Unlocks free through the RiseBunny Launcher.",
  },
];

/* ────────────────────── Platform yardımcıları ────────────────────── */

/** Soruda mobil/masaüstü geçiyor mu? */
function platformSor(soru) {
  const s = String(soru || "").toLowerCase();
  const mobil = /(\bmobil\b|\bmobile\b|telefon|\bandroid\b|\bios\b|\biphone\b|\bipad\b|pojav|\bjava mobile\b|cyberphone)/.test(s);
  const pc = /(\bpc\b|bilgisayar|windows|\bmasaustu\b|\bdesktop\b|\bcomputer\b)/.test(s);
  if (mobil && !pc) return "mobil";
  if (pc && !mobil) return "pc";
  return null; // belirsiz
}

/** Ürün bir platformda çalışır mı? */
function platformdaCalisir(urun, platform) {
  if (!platform) return true;
  if (platform === "pc") return urun.platform.pc === true;
  if (platform === "mobil") return urun.platform.mobil !== false;
  return true;
}

/** Mobil sorulduğunda ürünün doğru mobil cevabı (TR/EN). */
function mobilCevabi(urun, dil = "tr") {
  const isTr = dil !== "en";
  if (urun.platform.mobil === true) {
    return isTr ? `${urun.ad} mobilde doğrudan çalışır.` : `${urun.ad} runs directly on mobile.`;
  }
  if (urun.platform.mobil === "pojav") {
    return isTr ? urun.mobilNotuTr : urun.mobilNotuEn;
  }
  return isTr ? urun.mobilNotuTr : urun.mobilNotuEn;
}

/* ────────────────────── Metin üreticileri ────────────────────── */

/** Premium gerçeği: parayla satılmaz, komutla kazanılır. */
function erisimMetni(dil = "tr", prefix = "r!") {
  const isTr = dil !== "en";
  return isTr
    ? `Premium **parayla satılmaz**; bot komutlarıyla kazanılır (\`${prefix}günlük\`, \`${prefix}çalış\`, etkinlikler).`
    : `Premium is **not sold for money**; you earn it with bot commands (\`${prefix}daily\`, \`${prefix}work\`, events).`;
}

/** Ürün listesi — ÖVGÜSÜZ. Prompt'a ve "başka client" cevabına girer.
 *  `platform` verilirse her ürünün o platformdaki durumu tek cümleyle yazılır;
 *  ayrıca "(bu platformda çalışmaz)" gibi TEKRAR etiketi eklenmez — mobil
 *  cümlesinin kendisi zaten "çalışmaz" diyor. */
function urunListesi(dil = "tr", platform = null) {
  const isTr = dil !== "en";
  return URUNLER.map((u) => {
    const tanim = isTr ? u.trKisa : u.enKisa;
    let satir = `• **${u.ad}** — ${tanim}`;
    if (platform === "mobil") {
      satir += ` — ${mobilCevabi(u, dil)}`;
    } else if (platform === "pc") {
      satir += ` — ${isTr ? u.erisimTr : u.erisimEn}`;
    }
    return satir;
  }).join("\n");
}

/**
 * Prompt için hile BİLGİ bloğu.
 * DİKKAT: "en iyi X" iddiası YOK. Hangi client'ın "en iyi" olduğuna AI
 * (gerekiyorsa web araştırmasıyla) karar verir. Burada sadece gerçekler var.
 */
function promptBlogu(dil = "tr", platform = null) {
  const isTr = dil !== "en";
  const baslik = isTr ? "HİLE / CLIENT GERÇEKLERİ" : "CHEAT / CLIENT FACTS";
  const platformKurali = isTr
    ? "Kullanıcı mobil soruyorsa yalnızca mobilde ÇALIŞAN client'ı öner. Mobilde çalışmayanı önerme, ama 'mobilde çalışmaz' diye belirt."
    : "If the user asks about mobile, only recommend a client that WORKS on mobile. Do not recommend a PC-only client for mobile, but say that it doesn't work there.";
  const enIyiKurali = isTr
    ? "Soru 'en iyi / hangi client' ise: birini 'en iyi' diye ezberden ilan ETME; kullanıcının platformuna ve ihtiyacına göre karşılaştır."
    : "If asked 'best / which client': do NOT declare one as 'the best' from memory; compare based on the user's platform and needs.";
  return [
    `=== ${baslik} ===`,
    urunListesi(dil, platform),
    "",
    erisimMetni(dil),
    "",
    platformKurali,
    enIyiKurali,
    isTr
      ? `Linkler: Launcher ${LINKLER.launcher} • İndirme ${LINKLER.indirme} • Destek ${LINKLER.destek}`
      : `Links: Launcher ${LINKLER.launcher} • Download ${LINKLER.indirme} • Support ${LINKLER.destek}`,
  ].join("\n");
}

/** Ürün adından ürün kaydı bul (kayıt metinlerinde kullanılır). */
function urunBul(metin) {
  const s = String(metin || "").toLowerCase();
  if (/rubidium/.test(s)) return URUNLER.find((u) => u.id === "rubidium");
  if (/vape/.test(s)) return URUNLER.find((u) => u.id === "vape");
  if (/lunar/.test(s)) return URUNLER.find((u) => u.id === "lunar");
  return null;
}

module.exports = {
  LINKLER,
  URUNLER,
  platformSor,
  platformdaCalisir,
  mobilCevabi,
  erisimMetni,
  urunListesi,
  promptBlogu,
  urunBul,
};
