/**
 * Event yükleyici — tek merkez.
 *
 * KURAL: Bot'un dinlediği her gateway olayı burada kayıtlı olmalı.
 * Bot.js içinde doğrudan `client.on(...)` ile eklenen istisnalar:
 *   - messageDelete → snipeCache (bot.js, 187)
 *   - guildMemberAdd/Remove → hoşgeldin kartı (bot.js)
 *
 * Buradaki her handler `events/<ad>.js` dosyasına delege edilir ve hata
 * yakalanır: bir olayın patlaması diğerlerini etkilemez.
 */
const path = require("path");
const fs = require("fs");

/** Dinlenecek olaylar → events/<ad>.js */
const OLAYLAR = [
  "message",              // prefix komut + AI + XP
  "interactionCreate",    // buton / select / modal / slash
  "guildMemberAdd",
  "guildMemberRemove",
  "messageReactionAdd",   // ★ tepki rol + starboard
  "messageReactionRemove",
  "voiceStateUpdate",     // ★ geçici ses kanalları
  "guildMemberUpdate",    // nikâh/isim log + rol alma otomasyonu
  "channelCreate",
  "channelDelete",
  "inviteCreate",         // davet takibi (r!davetlerim)
  "messageDelete",        // otomasyon tetiği + starboard temizliği
  "messageUpdate"
];

/** Bir kez çalışanlar */
const TEK_SEFERLIK = new Set(["ready"]);

function dosyaVar(ad) {
  const p = path.join(__dirname, "..", "events", `${ad}.js`);
  try { return fs.existsSync(p); } catch { return false; }
}

module.exports = (client) => {
  // ── Tek seferlik: ready ────────────────────────────────────────────────
  client.once("clientReady", () => {
    try {
      require("../events/ready")(client);
    } catch (error) {
      console.error("Ready event hatası:", error);
    }
  });

  // ── Sürekli olaylar ────────────────────────────────────────────────────
  for (const ad of OLAYLAR) {
    if (TEK_SEFERLIK.has(ad)) continue;
    if (!dosyaVar(ad)) continue; // dosya yoksa sessizce atla

    client.on(ad, (...args) => {
      try {
        const handler = require(`../events/${ad}`);
        if (typeof handler !== "function") return;
        Promise.resolve(handler(...args)).catch((error) => {
          console.error(`[EVENT:${ad}] ${error?.name || "Error"}: ${error?.message || error}`);
          const kare = String(error?.stack || "").split("\n").slice(0, 4).join("\n");
          if (kare) console.error(kare);
        });
      } catch (error) {
        console.error(`[EVENT:${ad}] yüklenemedi: ${error?.message || error}`);
      }
    });
  }
};
