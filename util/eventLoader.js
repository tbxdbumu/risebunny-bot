/**
 * Event yükleyici — tek merkez.
 *
 * KURAL: Bot'un dinlediği her gateway olayı burada kayıtlı olmalı.
 * Bot.js içinde doğrudan `client.on(...)` ile eklenen istisnalar:
 *   - messageDelete / messageUpdate → snipeCache, reklam + küfür kontrolü
 *   - channelCreate / channelDelete → kanal koruma
 *   - inviteCreate → davet önbelleği
 *   - guildMemberAdd/Remove → hoşgeldin kartı
 * (events/ altında bu olaylar için dosya yok; burada da tekrar bağlanmaz.)
 *
 * Discord.js v14 olay adları v13'ten farklı: mesaj olayı artık
 * `messageCreate` (eskiden `message`). Eski adı kullanmak client.on()'u
 * SESSİZCE hiç tetiklemeyen bir dinleyici kaydeder — bot açar, giriş
 * yapar, ama prefix komutları asla çalışmaz ve log'a tek satır düşmez.
 * Bu yüzden olay adı ile dosya adı BİRBİRİNDEN AYRIDIR: aşağıdaki tablo
 * hangi olayın hangi `events/<dosya>.js` tarafından karşılandığını söyler.
 *
 * Buradaki her handler hata yakalayarak çalışır: bir olayın patlaması
 * diğerlerini etkilemez.
 */
const path = require("path");
const fs = require("fs");

/** Dinlenecek olaylar → events/<handler>.js */
const OLAYLAR = [
  { ad: "messageCreate", dosya: "message" }, // prefix komut + AI + XP (v13: "message")
  { ad: "interactionCreate", dosya: "interactionCreate" }, // buton / select / modal / slash
  { ad: "guildMemberAdd", dosya: "guildMemberAdd" },
  { ad: "guildMemberRemove", dosya: "guildMemberRemove" },
  { ad: "messageReactionAdd", dosya: "messageReactionAdd" }, // ★ tepki rol + starboard
  { ad: "messageReactionRemove", dosya: "messageReactionRemove" },
  { ad: "voiceStateUpdate", dosya: "voiceStateUpdate" }, // ★ geçici ses kanalları
  { ad: "guildMemberUpdate", dosya: "guildMemberUpdate" }, // nikâh/isim log + rol alma otomasyonu
];

/** Bir kez çalışanlar */
const TEK_SEFERLIK = new Set(["ready"]);

function dosyaVar(ad) {
  const p = path.join(__dirname, "..", "events", `${ad}.js`);
  try { return fs.existsSync(p); } catch { return false; }
}

/* ── Olay adı doğrulaması ────────────────────────────────────────────────
   Yanlış (v13) bir olay adı yazılırsa bkz. dosya başındaki uyarı. Bir daha
   bu hatanın sessizce geri gelmemesi için açılışta gürültülü şekilde uyar. */
function olayAdiDenetle() {
  let Gecerli = null;
  try { Gecerli = Object.values(require("discord.js").Events); } catch { return; }
  if (!Gecerli?.length) return;
  const bozuk = OLAYLAR.filter(o => !Gecerli.includes(o.ad));
  if (!bozuk.length) return;
  const ipucu = { message: "messageCreate", ready: "clientReady" };
  for (const o of bozuk) {
    console.error(`[eventLoader] GEÇERSİZ OLAY ADI: '${o.ad}' — bu olay ASLA tetiklenmez.` +
      (ipucu[o.ad] ? ` → '${ipucu[o.ad]}' olmalı` : ""));
  }
}

module.exports = (client) => {
  olayAdiDenetle();

  // ── Tek seferlik: ready ────────────────────────────────────────────────
  client.once("clientReady", () => {
    try {
      require("../events/ready")(client);
    } catch (error) {
      console.error("Ready event hatası:", error);
    }
  });

  // ── Sürekli olaylar ────────────────────────────────────────────────────
  let bagli = 0;
  for (const { ad, dosya } of OLAYLAR) {
    if (TEK_SEFERLIK.has(ad)) continue;
    if (!dosyaVar(dosya)) continue; // dosya yoksa sessizce atla

    client.on(ad, (...args) => {
      try {
        const handler = require(`../events/${dosya}`);
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
    bagli++;
  }

  // Kritik olay bağlanmazsa bot "açık ama sağır" olur; sessiz kalmasın.
  if (client.listenerCount("messageCreate") === 0) {
    console.error("[eventLoader] KRİTİK: messageCreate bağlanamadı — prefix komutlar çalışmaz (events/message.js var mı?).");
  }
  console.log(`[eventLoader] ${bagli} olay bağlandı.`);
};
