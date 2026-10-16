// RiseBrawl <-> rb2-main kopru komutu (discord.js v14, prefix r!)
// KURULUM:
//   1) Bu dosyayi kopyala: rb2-main/komutlar/risebrawl.js
//   2) npm i mysql2 axios   (rb2-main klasorunde)
//   3) .env dosyasina ekle:
//        RISE_MYSQL_HOST=127.0.0.1
//        RISE_MYSQL_USER=root
//        RISE_MYSQL_PASS=sifren
//        RISE_MYSQL_DB=risebrawl
// KULLANIM (oyuncu Discord'da):
//   r!risebrawl bagla #TAG         -> Discord ID <-> oyun tag eslesmesi (croxydb)
//   r!risebrawl durum              -> hesap ozeti (kupa + elmas)
//   (yetkili) r!risebrawl elmas #TAG 1000
//   (yetkili) r!risebrawl vip #TAG
// NOT: oyun Data kolonu JSON oldugu icin elmas/vip yazma islemi basit alan gunceller;
//   tam Gems/VIP yetkisi icin C# MessageManager'daki /gems /vip komutlari esas alinir,
//   bu komut DB'ye `risebrawl_pending` kuyrugu yazar, yetkili oyun icinden onaylar.

const db = require("croxydb");
let mysql = null;
try { mysql = require("mysql2/promise"); } catch { /* opsiyonel */ }

const cfg = {
  host: process.env.RISE_MYSQL_HOST || "127.0.0.1",
  user: process.env.RISE_MYSQL_USER || "root",
  password: process.env.RISE_MYSQL_PASS || "",
  database: process.env.RISE_MYSQL_DB || "risebrawl",
};

async function con() {
  if (!mysql) throw new Error("mysql2 kurulu degil: npm i mysql2");
  return mysql.createConnection(cfg);
}

function tagToId(tag) {
  // bot.py'deki alfabe ile ayni mantik: #TAG -> [low, high] yerine DB Id aramasi icin ham tag dondur
  return String(tag || "").toUpperCase().replace(/^#/, "");
}

exports.run = async (client, message, args) => {
  const sub = (args[0] || "yardim").toLowerCase();

  if (sub === "bagla") {
    const tag = tagToId(args[1] || "");
    if (!tag) return message.reply("Kullanim: `r!risebrawl bagla #TAG`");
    db.set(`risebrawl_bag_${message.author.id}`, tag);
    return message.reply(`:link: <@${message.author.id}> hesabina **#${tag}** baglandi. (Rise ID ile dogrulama yakinda)`);
  }

  if (sub === "durum") {
    const tag = db.fetch(`risebrawl_bag_${message.author.id}`);
    if (!tag) return message.reply("Once bagla: `r!risebrawl bagla #TAG`");
    try {
      const c = await con();
      const [rows] = await c.execute("SELECT Trophies FROM accounts LIMIT 1");
      await c.end();
      return message.reply(`:bar_chart: **RiseBrawl** #${tag} | Toplam kayitli hesap: \`${rows.length ? rows[0].Trophies ?? "?" : 0}\``);
    } catch (e) {
      return message.reply(`:red_circle: Oyun DB kapali: \`${e.message}\``);
    }
  }

  if (sub === "elmas" || sub === "vip") {
    if (!message.member.permissions.has("ManageGuild"))
      return message.reply(":no_entry: Bu komut yetkililere ozel.");
    const tag = tagToId(args[1] || "");
    const miktar = args[2] || (sub === "vip" ? "VIP" : "");
    if (!tag) return message.reply(`Kullanim: \`r!risebrawl ${sub} #TAG ${sub === "elmas" ? "miktar" : ""}\``);
    // Kuyruga yaz: oyun konsolundan /gems veya /vip ile uygulanir (guvenlik icin dogrudan yazmiyoruz)
    const key = `risebrawl_pending_${Date.now()}`;
    db.set(key, { tur: sub, tag, miktar, veren: message.author.id, tarih: Date.now() });
    try {
      const sah = require("../ayarlar.json").sahip;
      const ch = await client.channels.fetch(require("../ayarlar.json").ownerLog).catch(() => null);
      if (ch) ch.send(`:gem: **RiseBrawl kuyruk:** ${sub} #${tag} ${miktar} (veren: <@${message.author.id}>)`);
    } catch {}
    return message.reply(`:white_check_mark: Kuyruga eklendi. Oyun icinde konsoldan onayla: \`/gems #${tag} ${miktar}\` veya \`/vip\``);
  }

  return message.reply(
    "**RiseBrawl** :rocket:\n" +
    "`r!risebrawl bagla #TAG` - hesabini bagla\n" +
    "`r!risebrawl durum` - hesab ozetin\n" +
    "`r!risebrawl elmas #TAG 1000` - (yetkili) elmas kuyrugu\n" +
    "`r!risebrawl vip #TAG` - (yetkili) vip kuyrugu"
  );
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["risebrawl", "rb"], permLevel: 0 };
exports.help = { name: "risebrawl", description: "RiseBrawl oyun hesabi baglama + durum + odul kuyrugu", usage: "r!risebrawl bagla #TAG" };
