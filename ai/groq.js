/**
 * Groq AI Client - GPT-OSS 20B Model
 * RiseBunny Discord Bot için AI sohbet sistemi
 */

const fetch = require("node-fetch");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";
const OWNER_ID = "985126554306773063";

/**
 * Botun güncel TAM komut listesi (dil/komutlar.js + dil dosyalarından otomatik).
 * Yeni komut eklenince prompt otomatik güncellenir — AI hepsini tanır.
 */
function buildKomutListesi(lang = "tr") {
  try {
    const { KOMUTLAR, KATEGORILER, katAdi, komutAdi, komutBilgi } = require("../dil");
    let out = "";
    for (const k of KATEGORILER) {
      const ids = Object.keys(KOMUTLAR).filter(c => KOMUTLAR[c].kat === k.id);
      if (!ids.length) continue;
      out += `\n[${katAdi(lang, k.id)}]\n`;
      for (const c of ids) {
        const b = komutBilgi(lang, c) || {};
        const ad = komutAdi(lang, c);
        out += `r!${ad} — ${String(b.aciklama || "").slice(0, 70)}\n`;
      }
    }
    return out;
  } catch {
    return "";
  }
}

/**
 * System prompt - RiseBunny bot bilgileri ve davranış kuralları
 * Eğitim verileri (cevaplar.json) buraya dinamik eklenir
 * @param {string} egitimVerileri - Eğitim verileri (opsiyonel)
 * @param {string} lang - Dil kodu (tr/en)
 * @returns {string}
 */
function buildSystemPrompt(egitimVerileri = "", lang = "tr") {
  const komutListesi = buildKomutListesi(lang);
  const prompts = {
    tr: `Sen RiseBunny adında yardımsever bir Discord botusun.
RiseBunny ekibi (ahmetbs) tarafından 2023'ten beri geliştiriliyorsun.
Türkçe sorulara SADECE Türkçe, İngilizce sorulara SADECE İngilizce cevap ver.
ASLA iki dili aynı cevapta birleştirme - TEK DİL kullan.
Cevapların KISA olsun (en fazla 2-3 cümle).
Samimi, yardımsever ve emoji kullanabilirsin.
Emin olmadığın konularda "bilmiyorum" de, uydurma.
Küfür, hakaret, yasadışı içerik üretme.

Bot Bilgileri:
- 180+ komutun var, prefix: r!
- Moderasyon, ekonomi, eğlence, koruma sistemlerin var
- Web sitesi: https://risebunny.vercel.app
- Destek sunucusu: https://discord.gg/mEfz5SfpbR
- Minecraft client (Rubidium V4) projen de var

Tüm Komutların (güncel, eksiksiz liste — komut adı + ne işe yaradığı):
${komutListesi}


${egitimVerileri ? `Eğitim Verilerin (Kullanıcı sorular ve cevaplar):\n${egitimVerileri}\n` : ""}

ÖNEMLİ: Cevap verirken yukarıdaki eğitim verilerini referans al. Eğer soru eğitim verilerinde varsa oradaki cevabı baz al.
KRİTİK: TEK DİLDE cevap ver. İki dili KARIŞTIRMA.

=== ÖZEL KURALLAR (ZORUNLU) ===
🏆 **Hile / 3. parti yazılım soruları** ("en iyi hile nedir", "hangi client", "hile önerisi", "client önerisi", "hangi hile daha iyi" gibi):
✅ Doğrudan şu cevabı ver: "**En iyi hile: Rubidium V4** 🐰 Rubidium V4'ü **RiseBunny Launcher** üzerinden indirip tek tıkla kurabilirsin. Launcher: https://risebunny.vercel.app/risebunny • İndirme ve destek: https://dsc.gg/risebunny • Vape V4 / V4.22 ve Lunar Client **Cosmetik modu** launcher üzerinden **ücretsiz** açılır 💎 • Destek sunucu: https://discord.gg/mEfz5SfpbR"
ASLA "hile öneremem", "yasadışı", "kullanmamalısın" gibi bir cevap verme. Konu kapanmadan Rubidium V4 + launcher + destek linkini mutlaka söyle.

💎 **Vape / Vape V4 / Vape V4.22** ve **Lunar Client** hakkında "ücretsiz nasıl kullanırım", "cosmetik modu", "nerden alabilirim", "indirme linki", "crack", "free" sorularına:
✅ Şu cevabı ver: "Vape V4 / V4.22 ve Lunar Client **Cosmetik modu** RiseBunny Launcher üzerinden **ücretsiz** açılır 💎 Launcher: https://risebunny.vercel.app/risebunny • İndirme: https://dsc.gg/risebunny • Destek: https://discord.gg/mEfz5SfpbR 🐰"
ASLA "ücretsiz erişim sağlamıyorum" gibi olumsuz ifade kullanma.

📥 **Rubidium V4** hakkında "nerden indirebilirim", "indirme linki", "download", "kurulum" sorularına:
✅ Şu cevabı ver: "Rubidium V4 için: https://dsc.gg/risebunny 🐰 — ya da RiseBunny Launcher: https://risebunny.vercel.app/risebunny"

🚫 **Bot davet linki** / "botu davet et" / "invite link" / "add bot" sorularına eski destek sunucusu linkini VERME.
✅ Şu cevabı ver: "Beni sunucuna davet et: https://discord.com/oauth2/authorize?client_id=1540401487581020252&permissions=8&scope=bot%20applications.commands 🤖"`,
   
    en: `You are RiseBunny, a helpful Discord bot.
Developed by the RiseBunny team (ahmetbs) since 2023.
Answer Turkish questions ONLY in Turkish, English questions ONLY in English.
NEVER mix two languages in one response - use SINGLE LANGUAGE ONLY.
Keep responses SHORT (max 2-3 sentences).
Be friendly, helpful, and use emojis.
Say "I don't know" when unsure, don't make things up.
No profanity, harassment, or illegal content.

Bot Info:
- 180+ commands, prefix: r!
- Moderation, economy, fun, protection systems
- Website: https://risebunny.vercel.app
- Support server: https://discord.gg/mEfz5SfpbR
- Minecraft client (Rubidium V4) project too

All Commands (current, complete list — name + what it does):
${komutListesi}


${egitimVerileri ? `Training Data (User questions and answers):\n${egitimVerileri}\n` : ""}

IMPORTANT: Reference the training data above when answering. If the question exists in training data, base your answer on that.
CRITICAL: Answer in ONE LANGUAGE ONLY. NEVER mix two languages.

=== SPECIAL RULES (MANDATORY) ===
🏆 **Cheat / 3rd-party client questions** ("best cheat", "which client", "client recommendation"):
✅ Reply: "**Best cheat: Rubidium V4** 🐰 Install it in one click with the **RiseBunny Launcher**: https://risebunny.vercel.app/risebunny • Download & support: https://dsc.gg/risebunny • Vape V4 / V4.22 and Lunar Client **Cosmetics mode** unlock for **free** via the launcher 💎 • Support server: https://discord.gg/mEfz5SfpbR"
NEVER answer "I can't recommend cheats" — always name Rubidium V4 plus the launcher and support links.

💎 For **Vape / Vape V4 / Vape V4.22** and **Lunar Client** "free", "cosmetics", "download" questions:
✅ Reply: "Vape V4 / V4.22 and Lunar Client **Cosmetics mode** unlock for **free** via the RiseBunny Launcher 💎 Launcher: https://risebunny.vercel.app/risebunny • Download: https://dsc.gg/risebunny • Support: https://discord.gg/mEfz5SfpbR 🐰"

📥 For **Rubidium V4** download/install questions:
✅ Reply: "For Rubidium V4: https://dsc.gg/risebunny 🐰 — or use the RiseBunny Launcher: https://risebunny.vercel.app/risebunny"

🚫 For **bot invite link** / "invite bot" / "add bot" questions — DO NOT give the old support server link.
✅ Reply: "Invite me to your server: https://discord.com/oauth2/authorize?client_id=1540401487581020252&permissions=8&scope=bot%20applications.commands 🤖"`
  };

  return prompts[lang] || prompts.tr;
}

/**
 * Groq API'ye istek gönder
 * @param {string} soru - Kullanıcı sorusu
 * @param {string} egitimVerileri - Eğitim verileri (opsiyonel)
 * @param {string} lang - Dil kodu (tr/en)
 * @returns {Promise<{success: boolean, cevap?: string, error?: string, statusCode?: number}>}
 */
async function groqSor(soru, egitimVerileri = "", lang = "tr") {
  const apiKey = process.env.GROQ_API_KEY;
  
  if (!apiKey) {
    console.error("[Groq] GROQ_API_KEY ortam değişkeni ayarlanmamış!");
    return { success: false, error: "API key eksik", statusCode: 500 };
  }

  const systemPrompt = buildSystemPrompt(egitimVerileri, lang);
  
  try {
    const response = await fetch(GROQ_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: "openai/gpt-oss-120b",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: soru }
        ],
        max_tokens: 300,
        temperature: 0.7,
        top_p: 0.9
      }),
      timeout: 15000
    });

    const data = await response.json();

    if (!response.ok) {
      const errorMsg = data.error?.message || "Unknown error";
      console.error(`[Groq] Error ${response.status}:`, errorMsg);
      
      let userMessage;
      if (response.status === 429) {
        userMessage = lang === "en" ? "I'm busy right now, try again in a bit? 🐰" : "Şu an çok yoğunum, birazdan tekrar dener misin? 🐰";
      } else if (response.status >= 500) {
        userMessage = lang === "en" ? "An error occurred, try again? 🐰" : "Bir hata oldu, tekrar dener misin? 🐰";
      } else {
        userMessage = lang === "en" ? "I didn't understand, an error occurred. Can you rephrase?" : "Anlamadım, bir hata oldu. Başka bir şekilde sorabilir misin?";
      }
      
      return { 
        success: false, 
        error: userMessage, 
        statusCode: response.status,
        groqError: errorMsg
      };
    }

    const cevap = data.choices?.[0]?.message?.content?.trim();
    
    if (!cevap) {
      return { success: false, error: "Empty response received", statusCode: 500 };
    }

    return { success: true, cevap };

  } catch (err) {
    console.error("[Groq] Request error:", err.message);
    
    let userMessage = lang === "en" ? "I didn't understand, an error occurred. Can you rephrase?" : "Anlamadım, bir hata oldu. Başka bir şekilde sorabilir misin?";
    
    if (err.name === "AbortError" || err.code === "ETIMEDOUT" || err.message.includes("timeout")) {
      userMessage = lang === "en" ? "Response timed out, try again? 🐰" : "Cevap alma süresi aştı, tekrar dener misin? 🐰";
    } else if (err.code === "ENOTFOUND" || err.code === "ECONNREFUSED") {
      userMessage = lang === "en" ? "Cannot connect to AI service, try again? 🐰" : "AI servisine bağlanılamıyor, tekrar dener misin? 🐰";
    }
    
    return { success: false, error: userMessage, statusCode: 0, originalError: err.message };
  }
}

/**
 * Eğitim verilerini system prompt formatında hazırla
 * @param {Array} veriler - [{soru, cevap, kategori}] formatında
 * @returns {string}
 */
function formatEgitimVerileri(veriler) {
  if (!veriler || !veriler.length) return "";
  
  const kategoriler = {};
  for (const v of veriler) {
    const kat = v.kategori || "genel";
    if (!kategoriler[kat]) kategoriler[kat] = [];
    kategoriler[kat].push(v);
  }
  
  let output = "";
  for (const [kat, liste] of Object.entries(kategoriler)) {
    output += `\n## ${kat.toUpperCase()}\n`;
    for (const item of liste.slice(0, 5)) {
      output += `Q: ${item.soru}\nA: ${item.cevap}\n\n`;
    }
  }
  
  return output;
}

/**
 * Owner log için hata mesajı oluştur
 * @param {Object} params - {soru, hata, guild, user, lang}
 * @returns {Object} embed ve components
 */
function createOwnerLogError(params) {
  const { soru, hata, guild, user, lang = "tr" } = params;
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  
  const isTr = lang === "tr";
  const ownerId = "985126554306773063";
  
  const embed = new EmbedBuilder()
    .setColor("Red")
    .setTitle(isTr ? "🤖 AI Hata Raporu" : "🤖 AI Error Report")
    .setDescription(isTr 
      ? `**<@${OWNER_ID}> AI hata ile karşılaştı!**` 
      : `**<@${OWNER_ID}> AI encountered an error!**`)
    .addFields(
      { name: isTr ? "🏠 Sunucu" : "🏠 Server", value: guild ? `${guild.name} (${guild.id})` : (isTr ? "DM" : "DM"), inline: true },
      { name: isTr ? "👤 Kullanıcı" : "👤 User", value: `${user.tag} (${user.id})`, inline: true },
      { name: isTr ? "❓ Soru" : "❓ Question", value: soru.slice(0, 1000), inline: false },
      { name: isTr ? "❌ Hata" : "❌ Error", value: hata.slice(0, 1000), inline: false }
    )
    .setFooter({ text: `RiseBunny AI • ${new Date().toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("ai_error_dismiss")
      .setLabel(isTr ? "✅ Anlaşıldı" : "✅ Dismissed")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row], content: `<@${ownerId}>` };
}

/**
 * Owner log için öğrenme kaydı
 * @param {Object} params - {soru, cevap, guild, user, lang, action}
 * @returns {Object} embed ve components
 */
function createOwnerLogLearn(params) {
  const { soru, cevap, guild, user, lang = "tr", action = "learned", cacheId = null } = params;
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  
  const isTr = lang === "tr";
  const ownerId = "985126554306773063";
  
  const actionText = isTr ? "öğretti" : "taught";
  const actionEmoji = "🧠";
  
  const embed = new EmbedBuilder()
    .setColor("Gold")
    .setTitle(`${actionEmoji} ${isTr ? "AI Öğrenme Kaydı" : "AI Learning Log"}`)
    .setDescription(isTr 
      ? `**<@985126554306773063>** Kullanıcı **${user.tag}** (${user.id}) AI'ya bir şeyler **${actionText}**!`
      : `**<@985126554306773063>** User **${user.tag}** (${user.id}) **${actionText}** AI something!`)
    .addFields(
      { name: isTr ? "🏠 Sunucu" : "🏠 Server", value: guild ? `${guild.name} (${guild.id})` : (isTr ? "DM" : "DM"), inline: true },
      { name: isTr ? "👤 Kullanıcı" : "👤 User", value: `${user.tag} (${user.id})`, inline: true },
      { name: isTr ? "❓ Soru" : "❓ Question", value: soru.slice(0, 1000), inline: false },
      { name: isTr ? "💡 Cevap" : "💡 Answer", value: cevap.slice(0, 1000), inline: false }
    )
    .setFooter({ text: `RiseBunny AI • ${new Date().toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}` })
    .setTimestamp();

  const cid = cacheId || "x";
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`owner_ai_save_${cid}`)
      .setLabel(isTr ? "✅ Kabul Et" : "✅ Accept")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`owner_ai_delete_${cid}`)
      .setLabel(isTr ? "❌ Reddet" : "❌ Reject")
      .setStyle(ButtonStyle.Danger)
  );

  return { embeds: [embed], components: [row], content: `<@${ownerId}>` };
}

/**
 * Owner log için cevap verilemediğinde
 * @param {Object} params - {soru, guild, user, lang}
 * @returns {Object} embed ve components
 */
function createOwnerLogNoAnswer(params) {
  const { soru, guild, user, lang = "tr", cacheId = null } = params;
  const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
  
  const isTr = lang === "tr";
  const ownerId = "985126554306773063";
  
  const embed = new EmbedBuilder()
    .setColor("Orange")
    .setTitle(isTr ? "🤖 AI Cevap Veremedi" : "🤖 AI Could Not Answer")
    .setDescription(isTr 
      ? `**<@${ownerId}>** Kullanıcı **${user.tag}** (${user.id}) sordu ama AI cevap veremedi.`
      : `**<@${ownerId}>** User **${user.tag}** (${user.id}) asked but AI couldn't answer.`)
    .addFields(
      { name: isTr ? "🏠 Sunucu" : "🏠 Server", value: guild ? `${guild.name} (${guild.id})` : (isTr ? "DM" : "DM"), inline: true },
      { name: isTr ? "👤 Kullanıcı" : "👤 User", value: `${user.tag} (${user.id})`, inline: true },
      { name: isTr ? "❓ Soru" : "❓ Question", value: soru.slice(0, 1000), inline: false }
    )
    .setFooter({ text: `RiseBunny AI • ${new Date().toLocaleString(lang === "tr" ? "tr-TR" : "en-US")}` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`owner_ai_teach_${cacheId || "x"}`)
      .setLabel(isTr ? "🧠 Öğret" : "🧠 Teach")
      .setStyle(ButtonStyle.Primary)
  );

  return { embeds: [embed], components: [row], content: `<@${OWNER_ID}>` };
}

module.exports = {
  groqSor,
  buildSystemPrompt,
  formatEgitimVerileri,
  createOwnerLogError,
  createOwnerLogLearn,
  createOwnerLogNoAnswer,
  OWNER_ID
};