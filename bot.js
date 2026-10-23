require("dotenv").config();
console.log("[Boot] RiseBunny v2.1.1 (kupon-fix) yükleniyor...");
const path = require("path");

/* ayarlar.json kasıtlı olarak repoda yok (sahip ID + premium üye ID'leri + log
   kanal ID'leri sızmasın diye .gitignore'da). Oysa 29 komut ve events/ready.js
   onu require ediyor → GitHub'dan deploy'da bot "Cannot find module ayarlar.json"
   ile hiç açılmaz. Eksikse şablondan üret; gerçek ID'leri ayarlar.json'a yazmak
   yerine env'den vermek istersen SAHIP_ID / OWNER_LOG_CHANNEL_ID kullan. */
try {
  const fs = require("fs");
  const ayarYol = path.join(__dirname, "ayarlar.json");
  const ornekYol = path.join(__dirname, "ayarlar.example.json");
  if (!fs.existsSync(ayarYol) && fs.existsSync(ornekYol)) {
    const ayar = JSON.parse(fs.readFileSync(ornekYol, "utf8"));
    if (process.env.SAHIP_ID) ayar.sahip = process.env.SAHIP_ID;
    if (process.env.OWNER_LOG_CHANNEL_ID) ayar.ownerLog = process.env.OWNER_LOG_CHANNEL_ID;
    if (process.env.PREFIX) ayar.prefix = process.env.PREFIX;
    fs.writeFileSync(ayarYol, JSON.stringify(ayar, null, 2));
    console.log("[Boot] ayarlar.json üretildi (şablondan) — sahip/kanal ID'lerini r!komutlarla veya SAHIP_ID env ile gir.");
  }
} catch (e) {
  console.warn("[Boot] ayarlar.json üretilemedi:", e.message);
}

/* Firestore drop-in veritabanı: croxydb/quick.db'yi require.cache üzerinden
   Firestore destekli shim ile değiştirir. Kimlik yoksa yerel JSON moduna düşer. */
require("./firestore-db").install();

const croxydb = require("croxydb");
if (!croxydb.fetch) croxydb.fetch = croxydb.get;
if (!croxydb.get) croxydb.get = croxydb.fetch;
if (!croxydb.subtract && croxydb.sub) croxydb.subtract = croxydb.sub;
const db = croxydb;

try {
  const p = require.resolve("quick.db");
  require.cache[p] = { id: p, filename: p, loaded: true, exports: croxydb };
} catch {}

try {
  const napi = require("@napi-rs/canvas");
  const cp = require.resolve("canvas");
  require.cache[cp] = { id: cp, filename: cp, loaded: true, exports: napi };
} catch {}

const Discord = require("discord.js");
const { t, getLangSync, getGuildLang } = require("./dil");
const U = require("./utils");

let AI = null;
try {
  AI = require("./ai/handler");
  console.log("[AI] Handler yüklendi ✓");
} catch (e) {
  console.warn("[AI] Handler yüklenemedi:", e.message);
}

if (!Discord.EmbedBuilder.prototype.addField) {
  Discord.EmbedBuilder.prototype.addFieldsSafe = Discord.EmbedBuilder.prototype.addFields;
  Discord.EmbedBuilder.prototype.addField = function (name, value, inline) {
    return this.addFields({ name: String(name), value: String(value), inline: Boolean(inline) });
  };
}
{
  const origFooter = Discord.EmbedBuilder.prototype.setFooter;
  Discord.EmbedBuilder.prototype.setFooter = function (text, iconURL) {
    if (typeof text === "string") return origFooter.call(this, { text, iconURL });
    return origFooter.call(this, text);
  };
  const origAuthor = Discord.EmbedBuilder.prototype.setAuthor;
  Discord.EmbedBuilder.prototype.setAuthor = function (name, iconURL, url) {
    if (typeof name === "string") return origAuthor.call(this, { name, iconURL, url });
    return origAuthor.call(this, name);
  };
  const origColor = Discord.EmbedBuilder.prototype.setColor;
  const RENK = { BLACK: "DarkButNotBlack", WHITE: "White", GREY: "Grey", GRAY: "Grey", AQUA: "Aqua", PINK: "LuminousVividPink", BROWN: "DarkOrange", DARK: "DarkButNotBlack" };
  Discord.EmbedBuilder.prototype.setColor = function (color) {
    if (typeof color === "string") {
      const up = color.toUpperCase();
      if (up === "RANDOM") color = "Random";
      else if (RENK[up]) color = RENK[up];
      else if (["RED", "BLUE", "GREEN", "YELLOW", "PURPLE", "ORANGE"].includes(up))
        color = up.charAt(0) + up.slice(1).toLowerCase();
      else if (color.startsWith("0x")) color = "#" + color.slice(2);
    }
    try { return origColor.call(this, color); } catch { return origColor.call(this, "Default"); }
  };
  for (const Cls of [Discord.TextChannel, Discord.DMChannel, Discord.ThreadChannel].filter(Boolean)) {
    if (!Cls || !Cls.prototype.send || Cls.prototype.send.__rb) continue;
    const orig = Cls.prototype.send;
    Cls.prototype.send = function (payload, ...rest) {
      if (payload instanceof Discord.EmbedBuilder) payload = { embeds: [payload] };
      else if (payload instanceof Discord.AttachmentBuilder) payload = { files: [payload] };
      else if (Array.isArray(payload) && payload[0] instanceof Discord.EmbedBuilder) payload = { embeds: payload };
      return orig.call(this, payload, ...rest);
    };
    Cls.prototype.send.__rb = true;
  }
  try {
    const EPH = Discord.MessageFlags && Discord.MessageFlags.Ephemeral;
    if (EPH !== undefined) {
      const siniflar = [Discord.ButtonInteraction, Discord.StringSelectMenuInteraction, Discord.CommandInteraction, Discord.ChatInputCommandInteraction, Discord.ModalSubmitInteraction].filter(Boolean);
      for (const Cls of siniflar) {
        for (const m of ["reply", "deferReply", "update", "followUp"]) {
          const orig = Cls.prototype[m];
          if (typeof orig !== "function" || orig.__rbEp) continue;
          Cls.prototype[m] = function (opts, ...rest) {
            if (opts && typeof opts === "object" && opts.ephemeral !== undefined) {
              const { ephemeral, ...geri } = opts;
              if (ephemeral) geri.flags = (geri.flags ?? 0) | Number(EPH);
              opts = geri;
            }
            return orig.call(this, opts, ...rest);
          };
          Cls.prototype[m].__rbEp = true;
        }
      }
    }
  } catch {}
  const map = { CREATE_INSTANT_INVITE: "CreateInstantInvite", KICK_MEMBERS: "KickMembers", BAN_MEMBERS: "BanMembers", ADMINISTRATOR: "Administrator", MANAGE_CHANNELS: "ManageChannels", MANAGE_GUILD: "ManageGuild", MANAGE_MESSAGES: "ManageMessages", MANAGE_ROLES: "ManageRoles" };
  const origHas = Discord.PermissionsBitField.prototype.has;
  Discord.PermissionsBitField.prototype.has = function (perm, ...rest) {
    if (typeof perm === "string" && map[perm]) perm = Discord.PermissionFlagsBits[map[perm]];
    else if (typeof perm === "string" && Discord.PermissionFlagsBits[perm] === undefined && Discord.PermissionFlagsBits[map[perm] || ""] !== undefined) perm = Discord.PermissionFlagsBits[map[perm]];
    return origHas.call(this, perm, ...rest);
  };
}

const client = new Discord.Client({
  intents: [
    Discord.GatewayIntentBits.Guilds,
    Discord.GatewayIntentBits.GuildMembers,
    Discord.GatewayIntentBits.GuildMessages,
    Discord.GatewayIntentBits.MessageContent,
    Discord.GatewayIntentBits.GuildVoiceStates,
    Discord.GatewayIntentBits.GuildMessageReactions,
    Discord.GatewayIntentBits.GuildModeration,
    Discord.GatewayIntentBits.DirectMessages
  ],
  partials: [Discord.Partials.Channel, Discord.Partials.Message, Discord.Partials.Reaction, Discord.Partials.GuildMember, Discord.Partials.User],
  allowedMentions: { parse: ["users", "roles"], repliedUser: true }
});
for (const _m of ["once", "on"]) {
  try {
    const _orig = client[_m].bind(client);
    client[_m] = function (_ev, ..._rest) {
      if (_ev === "ready") _ev = "clientReady";
      return _orig(_ev, ..._rest);
    };
  } catch {}
}

client.snipeCache = new Map();
client.on("messageDelete", (deleted) => {
  try {
    if (!deleted?.guild || deleted.author?.bot) return;
    client.snipeCache.set(deleted.channel.id, { content: deleted.content, author: deleted.author.tag, at: Date.now() });
  } catch {}
});

require("./util/eventLoader.js")(client);
U.startPremiumSweeper(client);
if (typeof U.startKuponSweeper === "function") U.startKuponSweeper(client);
try { U.migrateKuponFlags(); } catch {}
if (typeof U.startHatirlatSweeper === "function") U.startHatirlatSweeper(client);

const express = require("express");
const crypto = require("crypto");
const app = express();

app.get("/", (req, res) => { console.log("RiseBunny pinglendi."); res.sendStatus(200); });

const cors = require("cors");
app.use("/api/leaderboard", cors({
  origin: ["https://risebunny.vercel.app", "http://localhost:3000"],
  methods: ["GET"]
}));

const _lbCache = new Map();
const _LB_TTL = 5 * 60 * 1000;
async function _lbGetTop(kind) {
  const hit = _lbCache.get(kind);
  if (hit && Date.now() - hit.at < _LB_TTL) return hit.data;

  const prefixMap = { rich: "para_", level: "xp_" };
  const prefix = prefixMap[kind];
  if (!prefix) return [];

  let allData = {};
  try {
    allData = db.all() || {};
  } catch (e) {
    console.warn("[LB] db.all() hatası:", e.message);
    return [];
  }

  const mapped = Object.keys(allData)
    .filter(key => key.startsWith(prefix) && !key.includes("cd") && !key.includes("_cd"))
    .map(key => {
      const uid = key.replace(prefix, "");
      const rawVal = Number(allData[key]) || 0;
      if (kind === "level") {
        const level = U.xpSeviye(rawVal);
        return { id: uid, value: level, rawXP: rawVal };
      }
      return { id: uid, value: rawVal };
    })
    .filter(item => item.value > 0)
    .sort((a, b) => b.value - a.value || (b.rawXP || 0) - (a.rawXP || 0))
    .slice(0, 50);

  const withNames = await Promise.all(mapped.map(async r => {
    let name = client.users.cache.get(r.id)?.username;
    if (!name) {
      try { const u = await client.users.fetch(r.id).catch(() => null); name = u?.username; } catch {}
    }
    return { id: r.id, name: name || "Unknown", value: r.value };
  }));
  _lbCache.set(kind, { data: withNames, at: Date.now() });
  return withNames;
}

app.get("/api/leaderboard/:kind", async (req, res) => {
  const kind = req.params.kind === "rich" ? "rich"
             : req.params.kind === "level" ? "level" : null;
  if (!kind) return res.status(400).json({ error: "kind=rich|level" });
  try {
    const data = await _lbGetTop(kind);
    res.json({ kind, updated: new Date().toISOString(), data });
  } catch (e) {
    res.status(500).json({ error: "leaderboard hatası" });
  }
});
console.log("[LB] :/api/leaderboard/:kind hazır (rich|level, 5 dk önbellek)");

const BOT_API_SECRET = process.env.BOT_API_SECRET || "";
function _botAuth(req, res, next) {
  if (!BOT_API_SECRET) return res.status(404).json({ error: "kapalı" });
  if (req.get("x-bot-secret") !== BOT_API_SECRET) return res.status(401).json({ error: "unauthorized" });
  next();
}

/* ── Launcher bilet doğrulaması (istemci yazma uçları için) ─────────────
   Site (api/launcher.js) `discordId.expEpochMs.HMAC-SHA256-hex` imzalar;
   istemci `Authorization: Bearer …` ile gönderir, site proxy'si yalnızca
   /api/public/* için iletir. Bot AYNI sırla doğrular (TICKET_SECRET veya
   SESSION_SECRET — Vercel'dekiyle birebir aynı değeri buraya da girin).
   Sır tanımlı DEĞİLSE istek REDDEDİLİR (fail-closed).
   Eskiden `true` dönüyordu: TICKET_SECRET/SESSION_SECRET boşsa 22 yazma ucu
   sadece discordId yazarak açılıyordu. Artık sır yoksa 503, bilet yoksa 401. */
const TICKET_SECRET = process.env.TICKET_SECRET || process.env.SESSION_SECRET || "";
let _ticketUyariVerildi = false;
function _ticketIzinli(req, res, discordId) {
  if (!TICKET_SECRET) {
    if (!_ticketUyariVerildi) {
      _ticketUyariVerildi = true;
      console.error("[TICKET] TICKET_SECRET/SESSION_SECRET tanimli degil — launcher bilet uclari KAPALI (fail-closed).");
    }
    res.status(503).json({ error: "launcher dogrulamasi yapilandirilmamis" });
    return false;
  }
  const reddet = (kod, hata) => { res.status(kod).json({ error: hata }); return false; };
  const baslik = String(req.get("authorization") || "");
  const bilet = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : "";
  const p = bilet.split(".");
  if (p.length !== 3) return reddet(401, "launcher bileti gerekli");
  if (!/^\d{15,20}$/.test(p[0]) || p[0] !== String(discordId)) return reddet(403, "bilet bu hesaba ait degil");
  const exp = Number(p[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) return reddet(401, "bilet suresi dolmus, launcher'dan yeniden giris yapin");
  if (!/^[0-9a-f]{64}$/i.test(p[2])) return reddet(401, "bilet gecersiz");
  const beklenen = crypto.createHmac("sha256", TICKET_SECRET).update(`${p[0]}.${p[1]}`).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(beklenen, "hex"), Buffer.from(p[2], "hex"))) {
    return reddet(401, "bilet gecersiz");
  }
  return true;
}

/* ── Admin/site yetkisi (kimlik gerektiren okuma uçları için) ───────────────
   `x-bot-secret` (BOT_API_SECRET) VEYA kullanıcının kendi launcher bileti.
   Bilet varsa yalnızca kendi discordId'si için geçerli; site sırrı varsa hepsi.
   _botAuth'tan farkı: sır yoksa 404 değil 401 döner. */
function _idIzinli(req, res, discordId) {
  const botS = String(BOT_API_SECRET || "");
  if (botS) {
    const gelen = String(req.get("x-bot-secret") || "");
    if (gelen.length === botS.length &&
        crypto.timingSafeEqual(Buffer.from(gelen), Buffer.from(botS))) return true;
  }
  if (!TICKET_SECRET) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  const baslik = String(req.get("authorization") || "");
  const bilet = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : "";
  const p = bilet.split(".");
  if (p.length !== 3) {
    res.status(401).json({ error: "unauthorized" });
    return false;
  }
  if (p[0] !== String(discordId)) { res.status(403).json({ error: "bilet bu hesaba ait degil" }); return false; }
  const exp = Number(p[1]);
  if (!Number.isFinite(exp) || exp < Date.now()) { res.status(401).json({ error: "bilet suresi dolmus" }); return false; }
  if (!/^[0-9a-f]{64}$/i.test(p[2])) { res.status(401).json({ error: "bilet gecersiz" }); return false; }
  const beklenen = crypto.createHmac("sha256", TICKET_SECRET).update(`${p[0]}.${p[1]}`).digest("hex");
  if (!crypto.timingSafeEqual(Buffer.from(beklenen, "hex"), Buffer.from(p[2], "hex"))) {
    res.status(401).json({ error: "bilet gecersiz" });
    return false;
  }
  return true;
}

app.get("/api/user/:id", _botAuth, async (req, res) => {
  try {
    const id = String(req.params.id || "").replace(/\D/g, "").slice(0, 20);
    if (!id) return res.status(400).json({ error: "geçersiz id" });
    const wallet = Number(db.fetch(`para_${id}`) || 0);
    const bank = Number(db.fetch(`bankapara_${id}`) || 0);
    const xp = Number(db.fetch(`xp_${id}`) || 0);
    const prem = Number(db.fetch(`premium_${id}`) || 0);
    const pets = db.fetch(`pets_${id}`) || [];
    /* RiseBunny: karaliste site + launcher girişinde kontrol edilir. */
    const karali = db.fetch(`karalist_${id}`) === "aktif" || db.fetch(`karalist_${id}`) === true;
    const karaliSebep = karali ? String(db.fetch(`sebep_${id}`) || "") : "";
    let username = client.users.cache.get(id)?.username || null;
    if (!username) {
      try { username = (await client.users.fetch(id).catch(() => null))?.username || null; } catch {}
    }
    res.json({
      id, username,
      wallet, bank, total: wallet + bank,
      xp, level: U.xpSeviye(xp),
      premium: { active: U.isPremium(id), daysLeft: prem > Date.now() ? Math.ceil((prem - Date.now()) / 86400000) : 0 },
      pets: Array.isArray(pets) ? pets.map(p => ({ name: p.name, emoji: p.emoji })) : [],
      capes: db.fetch(`launcher_capes_${id}`) || [],
      karaliste: karali, sebep: karaliSebep
    });
  } catch (e) { res.status(500).json({ error: "hata" }); }
});

const SHOP_CATALOG = {
  premium_30:  { tip: "premium", gun: 30, fiyat: 250000, ad: "💎 Premium 30 Gün" },
  pet_tavsan:  { tip: "pet", pet: { name: "Tavşan", emoji: "🐰", rarity: "common" }, fiyat: 72000, ad: "🐰 Tavşan" },
  pet_kopek:   { tip: "pet", pet: { name: "Köpek", emoji: "🐶", rarity: "common" }, fiyat: 90000, ad: "🐶 Köpek" },
  pet_kedi:    { tip: "pet", pet: { name: "Kedi", emoji: "🐱", rarity: "rare" }, fiyat: 135000, ad: "🐱 Kedi" },
  pet_balik:   { tip: "pet", pet: { name: "Balık", emoji: "🐠", rarity: "rare" }, fiyat: 162000, ad: "🐠 Balık" },
  pet_aslan:   { tip: "pet", pet: { name: "Aslan", emoji: "🦁", rarity: "premium" }, fiyat: 315000, ad: "🦁 Aslan", premiumGerek: true },
  pet_kaplan:  { tip: "pet", pet: { name: "Kaplan", emoji: "🐅", rarity: "premium" }, fiyat: 342000, ad: "🐅 Kaplan", premiumGerek: true },
  paket_rastgele: { tip: "paket", fiyat: 150000, ad: "🎁 Rastgele Paket" },
  minecon2011:   { tip: "cape", fiyat: 100000, ad: "🏛️ Minecon 2011 Pelerini" },
  "bunny-neon":  { tip: "cape", fiyat: 200000, ad: "⚡ Bunny Neon Pelerini" },
  anniversary15: { tip: "cape", fiyat: 300000, ad: "💚 15. Yıl Creeper Pelerini" },
  "ender-heart": { tip: "cape", fiyat: 400000, ad: "💜 Ender Heart Pelerini" },
  "bunny-gold":  { tip: "cape", fiyat: 500000, ad: "🐰 Bunny Gold Pelerini" },
  "dragon-wings": { tip: "cape", fiyat: 250000, ad: "🐲 Dragon Wings" },
  migrator:      { tip: "cape", fiyat: 600000, ad: "🧭 Migrator Pelerini", premiumGerek: true },
  "trosa-crown": { tip: "cape", fiyat: 700000, ad: "👑 Trosa Crown Pelerini", premiumGerek: true },
  "bandana-red":  { tip: "bandana", fiyat: 50000, ad: "🎀 Kırmızı Bandana" },
  "bandana-blue": { tip: "bandana", fiyat: 100000, ad: "💙 Mavi Bandana" },
  "bandana-gold": { tip: "bandana", fiyat: 150000, ad: "👑 Altın Bandana" },
  "ember-cape":   { tip: "cape", fiyat: 0, ad: "🔥 Ember Pelerini" },
  "ocean-cape":   { tip: "cape", fiyat: 0, ad: "🌊 Ocean Pelerini" },
  "mint-cape":    { tip: "cape", fiyat: 0, ad: "🌿 Mint Pelerini" },
  "blossom-cape": { tip: "cape", fiyat: 0, ad: "🌸 Blossom Pelerini" },
  "royal-cape":   { tip: "cape", fiyat: 250000, ad: "👑 Royal Pelerini" },
  "bloodmoon-cape": { tip: "cape", fiyat: 350000, ad: "🌙 Blood Moon Pelerini" },
  "frost-cape":   { tip: "cape", fiyat: 450000, ad: "❄️ Frost Pelerini" },
  "shadow-cape":  { tip: "cape", fiyat: 600000, ad: "🌑 Shadow Pelerini" }
};
function _magaza(id) {
  const base = SHOP_CATALOG[id];
  if (!base) return null;
  const oz = db.fetch(`magaza_${id}`) || {};
  return { ...base, id, fiyat: oz.fiyat ?? base.fiyat, gorunur: oz.gorunur !== false };
}
const PET_FIYAT = { "Tavşan": 80000, "Köpek": 100000, "Kedi": 150000, "Balık": 180000, "Aslan": 350000, "Kaplan": 380000 };
function _petVer(id, pet) {
  const pets = db.fetch(`pets_${id}`) || [];
  pets.push({ name: pet.name, emoji: pet.emoji, rarity: pet.rarity, price: Number(pet.price) || PET_FIYAT[pet.name] || 50000 });
  db.set(`pets_${id}`, pets);
}
const PAKET_PETLERI = [
  { name: "Tavşan", emoji: "🐰", rarity: "common", price: 80000 },
  { name: "Köpek", emoji: "🐶", rarity: "common", price: 100000 },
  { name: "Kedi", emoji: "🐱", rarity: "rare", price: 150000 },
  { name: "Balık", emoji: "🐠", rarity: "rare", price: 180000 },
  { name: "Aslan", emoji: "🦁", rarity: "premium", price: 350000 },
  { name: "Kaplan", emoji: "🐅", rarity: "premium", price: 380000 }
];
function _paketAc() {
  const sub = Math.random() * 100;
  const adet = sub < 40 ? 1 : sub < 80 ? 2 : 3;
  const havuz = [...PAKET_PETLERI].sort(() => Math.random() - 0.5).slice(0, adet);
  if (adet === 1) return { tip: "pet", pet: havuz[0], ad: `${havuz[0].emoji} ${havuz[0].name}` };
  return { tip: "coklu", petler: havuz, ad: havuz.map(p => `${p.emoji} ${p.name}`).join(" + ") };
}
async function _dmBildir(id, baslik, metin) {
  try {
    const u = await client.users.fetch(id).catch(() => null);
    if (!u) return false;
    const e = new Discord.EmbedBuilder().setColor("Gold").setTitle(String(baslik).slice(0, 256))
      .setDescription(String(metin).slice(0, 4000)).setTimestamp().setFooter({ text: "RiseBunny" });
    await u.send({ embeds: [e] }).catch(() => {});
    return true;
  } catch { return false; }
}
app.get("/api/shop", _botAuth, (req, res) => {
  const items = Object.keys(SHOP_CATALOG).map(_magaza).filter(it => it.gorunur)
    .map(it => ({ id: it.id, ad: it.ad, fiyat: it.fiyat, tip: it.tip, premiumGerek: !!it.premiumGerek }));
  res.json({ items });
});
app.post("/api/shop/buy", _botAuth, express.json(), async (req, res) => {
  try {
    const id = String(req.body?.userId || "").replace(/\D/g, "").slice(0, 20);
    const item = _magaza(req.body?.item);
    const kaynak = String(req.body?.source || "").toLowerCase() === "launcher" ? "launcher" : "site";
    if (!id || !item) return res.status(400).json({ error: "geçersiz istek" });
    if (!item.gorunur) return res.status(403).json({ error: "Bu ürün şu an satışta değil." });
    if (item.tip === "cape" || item.tip === "bandana" || item.tip === "wing") {
      const owned = db.fetch(`launcher_capes_${id}`) || [];
      if (Array.isArray(owned) && owned.includes(req.body.item)) {
        return res.status(409).json({ error: item.tip === "bandana" ? "Bu bandanaya zaten sahipsin." : item.tip === "wing" ? "Bu kanada zaten sahipsin." : "Bu pelerine zaten sahipsin." });
      }
    }
    if (item.premiumGerek && !U.isPremium(id)) return res.status(403).json({ error: "Bu pet için premium gerekli." });
    if (item.tip === "premium" && U.isPremium(id)) return res.status(403).json({ error: "Zaten premiumsun — süren bitince yenileyebilirsin." });
    let wallet = Number(db.fetch(`para_${id}`) || 0);
    let bank = Number(db.fetch(`bankapara_${id}`) || 0);
    if (wallet + bank < item.fiyat) return res.status(402).json({ error: "Yetersiz bakiye.", wallet, bank });
    const fromWallet = Math.min(wallet, item.fiyat);
    if (fromWallet > 0 && typeof db.subtract === "function") db.subtract(`para_${id}`, fromWallet);
    const rest = item.fiyat - fromWallet;
    if (rest > 0 && typeof db.subtract === "function") db.subtract(`bankapara_${id}`, rest);

    let kazandi = null, dmBaslik = "", dmMetin = "";
    if (item.tip === "paket") {
      kazandi = _paketAc();
      dmBaslik = "🎁 Tebrikler! Paket Açılımı";
      if (kazandi.tip === "premium") {
        U.addPremium(id, kazandi.gun * 24 * 60 * 60 * 1000);
        dmMetin = `Rastgele Paket'ten **${kazandi.ad}** kazandınız! Premiumunuz **${kazandi.gun} gün** aktif. İyi eğlenceler! 🐰`;
      } else {
        (kazandi.tip === "coklu" ? kazandi.petler : [kazandi.pet]).forEach(p => _petVer(id, p));
        dmMetin = `Rastgele Paket'ten **${kazandi.ad}** kazandınız! Petlerinizde görebilirsiniz. 🐾`;
      }
    } else if (item.tip === "premium") {
      U.addPremium(id, item.gun * 24 * 60 * 60 * 1000);
      dmBaslik = "🎉 Tebrikler! Premium Aktif";
      dmMetin = `**${item.ad}** aldınız, premiumunuz **${item.gun} gün** aktif! İyi eğlenceler! 💎`;
    } else if (item.tip === "cape" || item.tip === "bandana" || item.tip === "wing") {
      const owned = db.fetch(`launcher_capes_${id}`) || [];
      if (!owned.includes(req.body.item)) {
        owned.push(req.body.item);
        db.set(`launcher_capes_${id}`, owned);
      }
      const bandana = item.tip === "bandana";
      const wing = item.tip === "wing";
      dmBaslik = bandana ? "🎉 Tebrikler! Bandana Aldın" : wing ? "🎉 Tebrikler! Kanat Aldın" : "🎉 Tebrikler! Pelerin Aldın";
      dmMetin = bandana
        ? `**${item.ad}** aldınız! Launcher'da **B** tuşuyla açılan menüden kuşanabilirsiniz. 🎀`
        : wing
          ? `**${item.ad}** aldınız! Launcher'da **B** tuşuyla açılan menüden kuşanabilirsiniz. 🪽`
          : `**${item.ad}** aldınız! Launcher'da **B** tuşuyla açılan menüden kuşanabilirsiniz. 🧥`;
    } else {
      _petVer(id, item.pet);
      dmBaslik = "🎉 Tebrikler! Pet Sahiplendin";
      dmMetin = `**${item.ad}** aldınız! 🐾`;
    }
    wallet = Number(db.fetch(`para_${id}`) || 0);
    bank = Number(db.fetch(`bankapara_${id}`) || 0);
    dmMetin += `\n💸 Kalan paranız: **${(wallet + bank).toLocaleString()}** (Cüzdan: ${wallet.toLocaleString()} + Banka: ${bank.toLocaleString()})`;
    dmMetin += `\n🧾 Satın alma yeri: **${kaynak === "launcher" ? "RiseBunny Launcher" : "risebunny.vercel.app"}**`;
    await _dmBildir(id, dmBaslik, dmMetin);
    console.log(`[Mağaza:${kaynak}] ${id} satın aldı: ${item.ad} (${item.fiyat})${kazandi ? ` → kazandı: ${kazandi.ad}` : ""}`);
    U.ownerLog(client, new Discord.EmbedBuilder()
      .setColor(kaynak === "launcher" ? "Green" : "Gold")
      .setTitle(kaynak === "launcher" ? "🖥️ Launcher'den Satın Alım" : "🛒 Site Mağaza Satışı")
      .addFields(
        { name: "Kullanıcı", value: `<@${id}> (\`${id}\`)`, inline: false },
        { name: "Ürün", value: item.ad, inline: true },
        { name: "Fiyat", value: `${item.fiyat.toLocaleString()} 💸`, inline: true },
        { name: "Kalan", value: `${(wallet + bank).toLocaleString()} 💸`, inline: true }
      )
      .setDescription(kazandi ? `🎁 Paketten kazandı: **${kazandi.ad}**` : null)
      .setTimestamp()).catch(() => {});
    res.json({ ok: true, item: req.body.item, ad: item.ad, fiyat: item.fiyat, kazandi, wallet, bank, total: wallet + bank, source: kaynak });
  } catch (e) { res.status(500).json({ error: "hata" }); }
});
app.post("/api/coupon/redeem", _botAuth, express.json(), async (req, res) => {
  try {
    const id = String(req.body?.userId || "").replace(/\D/g, "").slice(0, 20);
    const kod = String(req.body?.kod || "").toUpperCase().trim();
    if (!id || !kod) return res.status(400).json({ error: "eksik alan" });
    let kupon = U.getKupon(kod);
    if (!kupon) return res.status(404).json({ error: "Geçersiz kupon kodu." });
    if (kupon.yer === "bot") return res.status(403).json({ error: "Bu kupon sadece botta kullanılabilir." });
    if (kupon.bitis && Date.now() > kupon.bitis) return res.status(410).json({ error: "Bu kuponun süresi dolmuş." });
    if (kupon.limit && (kupon.calismalar || 0) >= kupon.limit) return res.status(410).json({ error: "Bu kupon kullanım limitine ulaşmış." });
    if (db.fetch(`kupon_kullandi_${kod}_${id}`)) return res.status(409).json({ error: "Bu kuponu zaten kullandın (hesap başına tek)." });

    let mesaj = "";
    if (kupon.tip === "premium") {
      const gun = Number(kupon.premiumGun) || 30;
      U.addPremium(id, gun * 24 * 60 * 60 * 1000);
      mesaj = `💎 ${gun} gün premium aktif!`;
    } else if (kupon.tip === "pet") {
      const pets = db.fetch(`pets_${id}`) || [];
      pets.push({ name: kupon.petAd || "Tavşan", emoji: kupon.petEmoji || "🐰", rarity: "coupon", price: Number(kupon.petFiyat) || 50000 });
      db.set(`pets_${id}`, pets);
      mesaj = `${kupon.petEmoji || "🐰"} ${kupon.petAd || "Tavşan"} hesabına eklendi!`;
    } else {
      const miktar = Number(kupon.miktar) || 0;
      if (miktar <= 0) return res.status(500).json({ error: "Geçersiz ödül." });
      db.add(`para_${id}`, miktar);
      mesaj = `💸 ${miktar.toLocaleString()} RiseBunny Cash hesabına yüklendi!`;
    }
    db.set(`kupon_kullandi_${kod}_${id}`, Date.now());
    db.set(`kupon_${kod}`, { ...kupon, calismalar: (kupon.calismalar || 0) + 1 });
    U.ownerLog(client, new Discord.EmbedBuilder().setColor("Gold").setTitle("🎟️ Site Kuponu Kullanıldı")
      .setDescription(`**Kullanıcı:** <@${id}> (\`${id}\`)\n**Kod:** \`${kod}\`\n**Sonuç:** ${mesaj}`).setTimestamp()).catch(() => {});
    res.json({ ok: true, mesaj });
  } catch { res.status(500).json({ error: "hata" }); }
});

console.log("[Mağaza] :/api/user/:id + /api/shop hazır" + (BOT_API_SECRET ? "" : " (BOT_API_SECRET yok → kapalı)"));

/* ── Vape Config paylaşımı: onaylı config listesi + indirme ────────────────
   Vape istemcisi bu uçlardan onaylanmış configleri çeker/indirir. */
app.get("/api/configs", _botAuth, (req, res) => {
  try {
    const liste = db.get("configler") || [];
    const onayli = (Array.isArray(liste) ? liste : []).filter(c => c && c.durum === "kabul");
    res.json({
      count: onayli.length,
      configs: onayli.map(c => ({
        id: c.id, ad: c.ad, boyut: c.boyut, at: c.at,
        paylasan: c.username || "?", discordId: c.discordId
      }))
    });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* Vape istemcisi (RisebunnyApi.java) uyumlu uç: kullanıcının onaylı configleri.
   GET /api/config/<discordId>?durum=approved  → { configs:[{id,name,description,status,data}] }
   Durum belirtilmezse <id> bir config kimliği olarak yorumlanır (dosya indirme). */
app.get("/api/config/:id", async (req, res) => {
  try {
    const hedef = String(req.params.id || "");
    const liste = Array.isArray(db.get("configler")) ? db.get("configler") : [];
    if (String(req.query.durum || "").toLowerCase() === "approved") {
      const kullanici = hedef.replace(/\D/g, "");
      // Bir kullanıcının TÜM config içeriklerini listeler → kimlik zorunlu.
      if (!_idIzinli(req, res, kullanici)) return;
      const configs = liste
        .filter(c => c && c.durum === "kabul" && String(c.discordId) === kullanici)
        .map(c => ({
          /* RisebunnyConfigEntry: id (long), name, description, status("approved"), data(base64).
             id'yi sayısal string olarak gönderiyoruz; Gson getAsLong() tam parsesin. */
          id: String(c.id),
          name: c.ad,
          description: c.not || "",
          status: "approved",
          data: c.icerik
        }));
      return res.json({ ok: true, discordId: kullanici, count: configs.length, configs });
    }
    // Tam kimlik eşleşmesi: kısmi/endsWith eşleşme başka kullanıcının config'ini
    // sızdırabilirdi. İstemcinin gerçek akışları zaten tam id kullanıyor.
    const cfg = liste.find(c => c && String(c.id) === hedef);
    if (!cfg) return res.status(404).json({ error: "bulunamadı" });
    if (cfg.durum !== "kabul") return res.status(403).json({ error: "onaylanmamış" });
    // Kimlik: config sahibinin bileti ya da site sırrı.
    if (!_idIzinli(req, res, String(cfg.discordId || ""))) return;
    const sadeceGoruntule = ["1", "true", "evet", "yes"].includes(String(req.query.goruntule || "").toLowerCase());
    if (!sadeceGoruntule) {
      cfg.indirme = (cfg.indirme || 0) + 1;
      try { db.set("configler", liste); } catch {}
    }
    res.json({ ok: true, id: cfg.id, ad: cfg.ad, icerik: cfg.icerik, boyut: cfg.boyut });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* ── Vape istemcisi uyumlu uçlar (RisebunnyApi.java) ──────────────────────
   Vape istemcisi x-bot-secret gönderemez; bu uçlar salt-okunur veri döner. */

/* Public config kataloğu + oy verme (Vape istemcisi "Public" sekmesi).
   Bu uçlar auth'suzdur çünkü istemci x-bot-secret gönderemez; yalnızca
   ONAYLANMIŞ (durum="kabul") configlerin metadata'sını döner — içerik (base64)
   YALNIZCA indirme ucunda (/api/config/:id) verilir. */
function _cfgOylar(c) { return Array.isArray(c.oylar) ? c.oylar.map(String) : []; }
function _cfgAvatar(c) { return String(c.avatar || ""); }
function _publicConfigJson(c, oylayanId) {
  const oylar = _cfgOylar(c);
  return {
    id: String(c.id),
    name: c.ad || "config",
    description: c.not || "",
    sharerId: String(c.discordId || ""),
    sharerName: c.username || "?",
    sharerAvatar: _cfgAvatar(c),
    downloads: Number(c.indirme) || 0,
    votes: oylar.length,
    voted: oylayanId ? oylar.includes(oylayanId) : false,
    createdAt: Number(c.at) || 0
  };
}
function _onayliConfigler() {
  const liste = db.get("configler");
  return (Array.isArray(liste) ? liste : []).filter(c => c && c.durum === "kabul");
}

/* GET /api/public/configs?kategori=top|downloads|newest&oylayan=<discordId>
   → { ok, count, configs:[{id,name,description,sharerId,sharerName,sharerAvatar,downloads,votes,voted,createdAt}] } */
app.get("/api/public/configs", async (req, res) => {
  try {
    const oylayan = String(req.query.oylayan || "").replace(/\D/g, "").slice(0, 20);
    const kategori = String(req.query.kategori || req.query.sort || "top").toLowerCase();
    const ham = _onayliConfigler();
    await _avatarGeriDoldur(ham);
    let configs = ham.map(c => _publicConfigJson(c, oylayan));
    if (kategori === "downloads" || kategori === "indirme") {
      configs.sort((a, b) => b.downloads - a.downloads || b.votes - a.votes || b.createdAt - a.createdAt);
    } else if (kategori === "newest" || kategori === "yeni") {
      configs.sort((a, b) => b.createdAt - a.createdAt);
    } else {
      configs.sort((a, b) => b.votes - a.votes || b.downloads - a.downloads || b.createdAt - a.createdAt);
    }
    res.json({ ok: true, count: configs.length, kategori, configs });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* Eski kayıtlarda avatar yoksa Discord'dan tembel tembel doldur (istek başına en fazla 15 kullanıcı). */
async function _avatarGeriDoldur(liste) {
  try {
    const eksikler = [...new Set(liste.filter(c => c && !_cfgAvatar(c) && c.discordId).map(c => String(c.discordId)))].slice(0, 15);
    if (!eksikler.length) return;
    let degisti = false;
    await Promise.all(eksikler.map(async uid => {
      try {
        const u = await client.users.fetch(uid).catch(() => null);
        if (!u) return;
        const av = u.displayAvatarURL({ extension: "png" });
        liste.filter(c => c && String(c.discordId) === uid).forEach(c => { c.avatar = av; if (!c.username) c.username = u.username; });
        degisti = true;
      } catch {}
    }));
    if (degisti) { try { db.set("configler", liste); } catch {} }
  } catch {}
}

/* POST /api/public/vote  { configId, discordId, vote? }
   Oy hesap başına tektir. `vote` verilirse oy o duruma AYARLANIR (true=ver,
   false=geri al); verilmezse toggle yapılır. → { ok, votes, voted } */
app.post("/api/public/vote", express.json(), (req, res) => {
  try {
    const configId = String(req.body?.configId || req.body?.id || "").slice(0, 40);
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!configId || !discordId) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, discordId)) return;
    const liste = Array.isArray(db.get("configler")) ? db.get("configler") : [];
    const cfg = liste.find(c => c && String(c.id) === configId);
    if (!cfg) return res.status(404).json({ error: "bulunamadı" });
    if (cfg.durum !== "kabul") return res.status(403).json({ error: "onaylanmamış" });
    if (String(cfg.discordId || "") === discordId) {
      // Kendi config'ine oy verilemez.
      return res.json({ ok: true, id: configId, votes: _cfgOylar(cfg).length, voted: false, self: true });
    }
    if (!Array.isArray(cfg.oylar)) cfg.oylar = [];
    cfg.oylar = cfg.oylar.map(String);
    const idx = cfg.oylar.indexOf(discordId);
    const hamVote = req.body?.vote;
    let voted;
    if (hamVote === true || hamVote === "true" || hamVote === 1) {
      if (idx < 0) cfg.oylar.push(discordId);
      voted = true;
    } else if (hamVote === false || hamVote === "false" || hamVote === 0) {
      if (idx >= 0) cfg.oylar.splice(idx, 1);
      voted = false;
    } else if (idx >= 0) {
      cfg.oylar.splice(idx, 1); voted = false;
    } else {
      cfg.oylar.push(discordId); voted = true;
    }
    try { db.set("configler", liste); } catch {}
    res.json({ ok: true, id: configId, votes: cfg.oylar.length, voted });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* ── Public config indirme yetkisi ────────────────────────────────────────
   Site sırrı (x-bot-secret) VEYA geçerli bir launcher bileti. İçerik public
   profile olduğu için bilet sahibi olmak yeterli (başkasının config'ini indiren
   kullanıcı normaldir). Kimliksiz istek → 401.
   Ek olarak IP başına dakikada 30 indirme sınırı (sayaç şişmesi/kazıma). */
const _INDIRME_PENCERE = 60 * 1000;
const _INDIRME_MAX = 30;
const _indirmeLimit = new Map();
function _indirmeIzinli(req, res) {
  // Site sırrı
  const botS = String(BOT_API_SECRET || "");
  if (botS) {
    const gelen = String(req.get("x-bot-secret") || "");
    if (gelen.length === botS.length &&
        crypto.timingSafeEqual(Buffer.from(gelen), Buffer.from(botS))) {
      return _indirmeSay(req, res);
    }
  }
  // Launcher bileti (herhangi bir imzalı kullanıcı)
  if (TICKET_SECRET) {
    const baslik = String(req.get("authorization") || "");
    const bilet = baslik.startsWith("Bearer ") ? baslik.slice(7).trim() : "";
    const p = bilet.split(".");
    if (p.length === 3 && /^\d{15,20}$/.test(p[0]) &&
        Number(p[1]) > Date.now() && /^[0-9a-f]{64}$/i.test(p[2])) {
      const beklenen = crypto.createHmac("sha256", TICKET_SECRET).update(`${p[0]}.${p[1]}`).digest("hex");
      if (crypto.timingSafeEqual(Buffer.from(beklenen, "hex"), Buffer.from(p[2], "hex"))) {
        return _indirmeSay(req, res);
      }
    }
  }
  res.status(401).json({ error: "launcher girişi gerekli" });
  return false;
}
function _indirmeSay(req, res) {
  try {
    const ip = String(req.ip || req.get("x-forwarded-for") || "?").split(",")[0].trim();
    const simdi = Date.now();
    const kuyruk = (_indirmeLimit.get(ip) || []).filter(t => simdi - t < _INDIRME_PENCERE);
    if (kuyruk.length >= _INDIRME_MAX) {
      res.status(429).json({ error: "çok fazla indirme, biraz bekle" });
      return false;
    }
    kuyruk.push(simdi);
    _indirmeLimit.set(ip, kuyruk);
    if (_indirmeLimit.size > 3000) {
      for (const [k, v] of _indirmeLimit) if (!v.some(t => simdi - t < _INDIRME_PENCERE)) _indirmeLimit.delete(k);
    }
    return true;
  } catch { return true; }
}

/* Public config indirme: /api/public/config/:id → içerik (base64) + indirme sayacı.
   İstemci bu ucu "Public" sekmesinden indirmek için kullanır.
   NOT: public profile'lar tasarım gereği paylaşılabilir; ancak indirme sayacını
   şişirmemek ve kimliksiz toplu kazımayı yavaşlatmak için bilet veya site sırrı
   istenir. Panel (liste + detay) zaten /api/public/configs'ten geliyor. */
app.get("/api/public/config/:id", (req, res) => {
  try {
    const hedef = String(req.params.id || "");
    const liste = Array.isArray(db.get("configler")) ? db.get("configler") : [];
    const cfg = liste.find(c => c && String(c.id) === hedef);
    if (!cfg) return res.status(404).json({ error: "bulunamadı" });
    if (cfg.durum !== "kabul") return res.status(403).json({ error: "onaylanmamış" });
    if (!_indirmeIzinli(req, res)) return;
    // "goruntule" (view-only) modunda indirme sayacını ARTIRMA: detay panelini açmak
    // indirme değildir; aksi halde "Most Downloaded" sıralaması şişer.
    const sadeceGoruntule = ["1", "true", "evet", "yes"].includes(String(req.query.goruntule || "").toLowerCase());
    if (!sadeceGoruntule) {
      cfg.indirme = (Number(cfg.indirme) || 0) + 1;
      try { db.set("configler", liste); } catch {}
    }
    res.json({
      ok: true, id: String(cfg.id), name: cfg.ad, description: cfg.not || "",
      sharerId: String(cfg.discordId || ""), sharerName: cfg.username || "?",
      sharerAvatar: _cfgAvatar(cfg),
      downloads: Number(cfg.indirme) || 0, votes: _cfgOylar(cfg).length,
      data: cfg.icerik, boyut: Number(cfg.boyut) || 0
    });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* ── Vape istemcisinden config yönetimi (Public Profiles editörü) ─────────
   Bu uçlar launcher bileti (Authorization: Bearer) ile kimlik doğrular:
   bilet, site tarafından kullanıcının discordId'si için imzalanır; başkasının
   discordId'siyle yazma/silme/düzenleme/oy artık mümkün değil.
   Bilet sırrı tanımlı değilse geçici olarak eski davranış sürer (_ticketIzinli). */
const _CFG_MAX_BOYUT = 512 * 1024;

function _cfgKisa(c, dahilIcerik) {
  const j = {
    id: String(c.id), name: c.ad || "config", description: c.not || "",
    status: c.durum || "bekliyor", reason: c.sebep || "",
    downloads: Number(c.indirme) || 0, votes: _cfgOylar(c).length,
    createdAt: Number(c.at) || 0, sharerAvatar: _cfgAvatar(c)
  };
  if (dahilIcerik) j.data = c.icerik;
  return j;
}


/* POST /api/public/upload  { discordId, name, description, data(base64) }
   r!config yükle ile AYNI onay akışını kullanır: durum="bekliyor" + sahip log
   butonları. Kabul edilince /api/public/configs listesinde görünür. */
app.post("/api/public/upload", express.json({ limit: "1mb" }), async (req, res) => {
  try {
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const ad = String(req.body?.name || "").trim().slice(0, 48);
    const not = String(req.body?.description || "").trim().slice(0, 256);
    const icerik = String(req.body?.data || "");
    if (!discordId || discordId.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, discordId)) return;
    if (ad.length < 3) return res.status(400).json({ error: "config adı en az 3 karakter" });
    if (!icerik) return res.status(400).json({ error: "içerik boş" });
    const bayt = Math.floor(icerik.length * 3 / 4);
    if (bayt > _CFG_MAX_BOYUT) return res.status(413).json({ error: "config çok büyük (maks 512 KB)" });
    const { cfgOnayaGonder, yeniId, tumConfigler, kaydetListe } = require("./komutlar/config.js")._helpers;
    let username = client.users.cache.get(discordId)?.username || "?";
    let avatar = "";
    try {
      const u = await client.users.fetch(discordId).catch(() => null);
      if (u) { username = u.username; avatar = u.displayAvatarURL({ extension: "png" }); }
    } catch {}
    const cfg = {
      id: yeniId(), discordId, username, avatar, ad, not,
      boyut: bayt, icerik, durum: "bekliyor", sebep: "", at: Date.now(),
      onaylayan: "", oylar: [], indirme: 0, logChannelId: "", logMessageId: ""
    };
    const liste = tumConfigler();
    liste.push(cfg);
    kaydetListe(liste);
    /* Önce kaydet + yanıtla; Discord onay mesajı sonra gönderilir.
       (Discord gidişi yavaşsa istemci 8-10 sn'de timeout'a düşüyor ve
       yükleme aslında başarılı olsa da "Failed to publish" görünüyordu.) */
    res.json({ ok: true, id: cfg.id, durum: cfg.durum, message: "Yüklemeniz onay bekliyor." });
    cfgOnayaGonder(client, cfg).then(gonderilen => {
      if (!gonderilen) return;
      const l2 = tumConfigler();
      const i = l2.findIndex(c => c && String(c.id) === String(cfg.id));
      if (i >= 0) {
        l2[i].logChannelId = gonderilen.channel.id;
        l2[i].logMessageId = gonderilen.id;
        kaydetListe(l2);
      }
    }).catch(() => {});
  } catch { res.status(500).json({ error: "hata" }); }
});

/* GET /api/public/mine?discordId= → kullanıcının TÜM configleri (durum dahil). */
app.get("/api/public/mine", (req, res) => {
  try {
    const id = String(req.query.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!id) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, id)) return;
    const liste = Array.isArray(db.get("configler")) ? db.get("configler") : [];
    const configs = liste.filter(c => c && String(c.discordId) === id)
      .sort((a, b) => (Number(b.at) || 0) - (Number(a.at) || 0))
      .map(c => _cfgKisa(c, false));
    res.json({ ok: true, count: configs.length, configs });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* POST /api/public/delete  { configId, discordId } → yalnızca sahip/yetkili. */
app.post("/api/public/delete", express.json({ limit: "64kb" }), (req, res) => {
  try {
    const configId = String(req.body?.configId || req.body?.id || "").slice(0, 40);
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!configId || !discordId) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, discordId)) return;
    const { tumConfigler, kaydetListe } = require("./komutlar/config.js")._helpers;
    const liste = tumConfigler();
    const cfg = liste.find(c => c && String(c.id) === configId);
    if (!cfg) return res.status(404).json({ error: "bulunamadı" });
    if (String(cfg.discordId) !== discordId && String(discordId) !== String(U.SAHIP_ID)) {
      return res.status(403).json({ error: "yalnızca sahip silebilir" });
    }
    kaydetListe(liste.filter(c => c !== cfg));
    U.ownerLog(client, new Discord.EmbedBuilder().setColor("Red").setTitle("🗑️ Config silindi (istemci)")
      .setDescription(`**Config:** \`${cfg.ad}\` (\`${cfg.id}\`)\n**Sahip:** <@${cfg.discordId}>\n**İsteyen:** \`${discordId}\``).setTimestamp()).catch(() => {});
    res.json({ ok: true, id: configId });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* POST /api/public/edit  { configId, discordId, name?, description? } → sahip/yetkili. */
app.post("/api/public/edit", express.json({ limit: "64kb" }), (req, res) => {
  try {
    const configId = String(req.body?.configId || req.body?.id || "").slice(0, 40);
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!configId || !discordId) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, discordId)) return;
    const { tumConfigler, kaydetListe } = require("./komutlar/config.js")._helpers;
    const liste = tumConfigler();
    const cfg = liste.find(c => c && String(c.id) === configId);
    if (!cfg) return res.status(404).json({ error: "bulunamadı" });
    if (String(cfg.discordId) !== discordId && String(discordId) !== String(U.SAHIP_ID)) {
      return res.status(403).json({ error: "yalnızca sahip düzenleyebilir" });
    }
    const ad = String(req.body?.name || "").trim().slice(0, 48);
    const not = String(req.body?.description || "").trim().slice(0, 256);
    if (ad.length >= 3) cfg.ad = ad;
    if (req.body?.description !== undefined) cfg.not = not;
    kaydetListe(liste);
    res.json({ ok: true, id: configId, name: cfg.ad, description: cfg.not || "" });
  } catch { res.status(500).json({ error: "hata" }); }
});

function _premiumJson(id) {
  const prem = Number(db.fetch(`premium_${id}`) || 0);
  const aktif = U.isPremium(id);
  return { premium: !!aktif, daysLeft: aktif && prem > Date.now() ? Math.ceil((prem - Date.now()) / 86400000) : 0 };
}

/* ── RiseBunny kimlik etiketi (`Ad#1234`) ─────────────────────────────
   Her Discord kullanıcısına ilk görüldüğünde 4 rastgele rakamlı, kişiye
   özel ve DEĞİŞTİRİLEMEZ bir etiket atanır (`rbetiket_<id>`). Tam etiket
   (`Ad#1234`) benzersizdir; aynı etiket başkasına asla atanmaz. */
function _etiketTemizle(ad) {
  const a = String(ad || "").replace(/[#@:\s]/g, "").trim().slice(0, 24);
  return a || "RiseBunny";
}
function _etiketAta(id) {
  try {
    id = String(id || "").replace(/\D/g, "").slice(0, 20);
    if (!id) return null;
    const mevcut = db.get(`rbetiket_${id}`);
    if (mevcut && mevcut.tag) {
      /* Etiketin AD kismi Discord adi degistikce guncellenir; numara ayni kalir.
         Ölçülen hata: etiket bir kez atanip donduruluyordu. Kullanici Discord
         adini degistirdiginde Vape Online yeni adi gosterirken friends listesi
         ESKI etikette kaliyordu -> "vape online'daki isim friendsteki ile ayni
         olmali" sikayeti. Numara (kisisel ve degistirilemez) korunur, sadece
         ad kismi yeniden yazilir; boylece numara degismez, eski etiketle
         kayitli arkadaslarin baglanti koptugunu sanmayiz. */
      let canliAd = null;
      try { canliAd = client.users.cache.get(id)?.username || null; } catch {}
      const temizCanli = _etiketTemizle(canliAd);
      const eskiAd = String(mevcut.ad || "");
      if (canliAd && temizCanli !== "RiseBunny" && temizCanli !== eskiAd) {
        const yeniTag = `${temizCanli}#${String(mevcut.no || String(mevcut.tag).split("#").pop())}`;
        if (yeniTag !== mevcut.tag) {
          const duzeltilmis = { ...mevcut, ad: temizCanli, tag: yeniTag, adGuncel: Date.now() };
          try { db.set(`rbetiket_${id}`, duzeltilmis); } catch {}
          return duzeltilmis;
        }
      }
      return mevcut;
    }
    let discordAd = null;
    try { discordAd = client.users.cache.get(id)?.username || null; } catch {}
    const ad = _etiketTemizle(discordAd);
    /* Benzersizlik artik NUMARA bazli: _etiketBul numarayla cozuyor, bu yuzden
       ayni numara iki kisiye verilirse etiketler cakisir ve isim eslesmesi
       yanlis kisiyi isaret eder. Hem numara hem tam etiket tutulur. */
    const kullanilanNo = new Set();
    const kullanilan = new Set();
    try {
      const tum = db.all() || {};
      for (const k of Object.keys(tum)) {
        if (!k.startsWith("rbetiket_")) continue;
        const v = tum[k];
        if (v && v.tag) {
          kullanilan.add(String(v.tag));
          const vn = String(v.no || String(v.tag).split("#").pop() || "");
          if (vn) kullanilanNo.add(vn);
        }
      }
    } catch {}
    let no = null, tag = null;
    for (let deneme = 0; deneme < 500 && !tag; deneme++) {
      const adayNo = String(Math.floor(1000 + Math.random() * 9000));
      const aday = `${ad}#${adayNo}`;
      if (!kullanilan.has(aday) && !kullanilanNo.has(adayNo)) { no = adayNo; tag = aday; }
    }
    if (!tag) {
      /* 9000 kombinasyon tukendi: deterministik benzersiz numara ara. */
      for (let n = 1000; n <= 9999; n++) {
        const s = String(n);
        if (kullanilanNo.has(s)) continue;
        no = s; tag = `${ad}#${s}`; break;
      }
      if (!tag) { no = String(Date.now() % 9000 + 1000); tag = `${ad}#${no}`; }
    }
    const kayit = { tag, ad, no, at: Date.now() };
    try { db.set(`rbetiket_${id}`, kayit); } catch {}
    return kayit;
  } catch { return null; }
}
function _etiketBul(ham) {
  try {
    const s = String(ham || "").trim();
    if (!s) return null;
    if (/^\d{15,20}$/.test(s)) {
      const k = db.get(`rbetiket_${s}`);
      return k && k.tag ? { id: s, ...k } : null;
    }
    const m = s.match(/^(.+)#(\d{4})$/);
    if (!m) return null;
    const numara = m[2];
    const tum = db.all() || {};
    /* 1) Etiket numarasi KISMI yetki: isim kismi degisse de (Discord adi
          degistiyse) numara degismedigi icin eski kayit cozulur. Numara
          kisisel ve degistirilemez; isim degisimi numarayi degistirmez. */
    for (const k of Object.keys(tum)) {
      if (!k.startsWith("rbetiket_")) continue;
      const v = tum[k];
      if (!v) continue;
      const vTag = String(v.tag || "");
      const vNo = String(v.no || vTag.split("#").pop() || "");
      if (vNo === numara || vTag.toLowerCase() === s.toLowerCase()) {
        return { id: k.slice("rbetiket_".length), ...v };
      }
    }
    return null;
  } catch { return null; }
}

/* ── Vape arkadaşlık sistemi (bot destekli) ────────────────────────────
   - POST /api/friends/request {from, to} → istek (to: etiket ya da ID)
   - GET  /api/friends/state?discordId= → {friends, incoming, outgoing}
   - POST /api/friends/respond {discordId, from, accept} → kabul/ret
   - POST /api/friends/remove {discordId, id} → karşılıklı silme
   Yazma uçları launcher bileti ister; okuma (state) de bilet ister (gizlilik).
   Arkadaşlık karşılıklıdır; çevrimiçi bilgisi presence_ ile birleşir. */
function _arkadasListe(id) {
  try {
    const l = db.get(`arkadas_${id}`);
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}
function _arkadasKaydet(id, liste) {
  try { db.set(`arkadas_${id}`, liste); } catch {}
}
function _istekListe(id) {
  try {
    const l = db.get(`arkadas_istek_${id}`);
    return Array.isArray(l) ? l : [];
  } catch { return []; }
}
function _istekKaydet(id, liste) {
  try { db.set(`arkadas_istek_${id}`, liste); } catch {}
}
function _cevrimiciMi(id) {
  try {
    const p = db.get(`presence_${id}`);
    return !!(p && p.at && Date.now() - Number(p.at) < 10 * 60 * 1000);
  } catch { return false; }
}
app.post("/api/friends/request", express.json({ limit: "16kb" }), async (req, res) => {
  try {
    const from = String(req.body?.from || req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const hedef = _etiketBul(req.body?.to);
    if (!from || from.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, from)) return;
    if (!hedef) return res.status(404).json({ error: "kullanıcı bulunamadı" });
    if (hedef.id === from) return res.status(400).json({ error: "kendine istek atamazsın" });
    if (_arkadasListe(from).some(a => String(a.id) === hedef.id)) {
      return res.status(400).json({ error: "zaten arkadaşsın" });
    }
    const bekleyen = _istekListe(hedef.id);
    if (bekleyen.some(b => String(b.from) === from)) {
      return res.status(400).json({ error: "istek zaten gönderilmiş" });
    }
    const gonderen = _etiketAta(from) || { tag: from };
    bekleyen.push({ from, tag: String(gonderen.tag || from), ad: String(gonderen.ad || ""), at: Date.now() });
    _istekKaydet(hedef.id, bekleyen);
    _dmBildir(hedef.id, "👥 Yeni arkadaşlık isteği",
      `**${gonderen.tag || from}** seni arkadaş olarak eklemek istiyor! Oyundaki Friend requests panelinden kabul edebilirsin. 🐰`).catch(() => {});
    res.json({ ok: true, to: hedef.tag });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.get("/api/friends/state", async (req, res) => {
  try {
    const id = String(req.query.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!id || id.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, id)) return;
    const ben = _etiketAta(id) || { tag: id };
    const friends = _arkadasListe(id).map(a => ({
      id: String(a.id), tag: String(a.tag || a.id), ad: String(a.ad || ""),
      online: _cevrimiciMi(String(a.id))
    }));
    const incoming = _istekListe(id).map(b => ({
      from: String(b.from), tag: String(b.tag || b.from), ad: String(b.ad || ""), at: Number(b.at) || 0,
      online: _cevrimiciMi(String(b.from))
    }));
    res.json({ ok: true, tag: String(ben.tag || id), friends, incoming, count: { friends: friends.length, incoming: incoming.length } });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/friends/respond", express.json({ limit: "16kb" }), async (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const from = String(req.body?.from || "").replace(/\D/g, "").slice(0, 20);
    const kabul = req.body?.accept === true || req.body?.accept === "true" || req.body?.accept === 1;
    if (!id || id.length < 15 || !from) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, id)) return;
    /* ÖLÇÜLEN HATA (2026-10-23): burada bekleyen istek KONTROL EDİLMİYORDU.
       İstemci `friends/respond` çağrısını herhangi bir `from` ile yapabildiği
       için, hiç istek gönderilmemiş bir hesap "kabul" diyerek karşı tarafı
       zorla arkadaş yapabiliyordu (canlı testte HTTP 200 döndü, iki taraf da
       arkadaş oldu). Arkadaşlık karşılıklı yazıldığı için bu, istek akışını
       tamamen atlatıyordu.
       Artık kabul yalnızca GERÇEKTEN bekleyen bir istek varsa geçerli. */
    const gelen = _istekListe(id);
    const eslesen = gelen.find(b => String(b.from) === from);
    if (kabul && !eslesen) {
      return res.status(404).json({ error: "bekleyen istek yok" });
    }
    const bekleyen = gelen.filter(b => String(b.from) !== from);
    _istekKaydet(id, bekleyen);
    if (kabul) {
      const ben = _etiketAta(id) || { tag: id, ad: "" };
      const o = _etiketAta(from) || { tag: from, ad: "" };
      const benim = _arkadasListe(id);
      if (!benim.some(a => String(a.id) === from)) {
        benim.push({ id: from, tag: String(o.tag), ad: String(o.ad || ""), at: Date.now() });
        _arkadasKaydet(id, benim);
      }
      const onun = _arkadasListe(from);
      if (!onun.some(a => String(a.id) === id)) {
        onun.push({ id, tag: String(ben.tag), ad: String(ben.ad || ""), at: Date.now() });
        _arkadasKaydet(from, onun);
      }
      _dmBildir(from, "✅ Arkadaşlık kabul edildi",
        `**${ben.tag}** isteğini kabul etti! Artık Vape arkadaşısınız. 🐰`).catch(() => {});
    }
    res.json({ ok: true, accept: kabul });
  } catch { res.status(500).json({ error: "hata" }); }
});
/* Giden isteği geri çekme: gönderen kendi biletini kullanır. */
app.post("/api/friends/cancel", express.json({ limit: "16kb" }), async (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const hedef = _etiketBul(req.body?.to);
    if (!id || id.length < 15) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, id)) return;
    if (hedef) {
      _istekKaydet(hedef.id, _istekListe(hedef.id).filter(b => String(b.from) !== id));
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/friends/remove", express.json({ limit: "16kb" }), async (req, res) => {  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const hedef = String(req.body?.id || "").replace(/\D/g, "").slice(0, 20);
    if (!id || id.length < 15 || !hedef) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, id)) return;
    _arkadasKaydet(id, _arkadasListe(id).filter(a => String(a.id) !== hedef));
    _arkadasKaydet(hedef, _arkadasListe(hedef).filter(a => String(a.id) !== id));
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* ── Vape party sistemi (bot destekli, Zeus yerine) ───────────────────
   Parti lider anahtariyla tutulur: parti_<liderId> = { leader, members,
   invites, chat, createdAt }. Uye -> lider ters indeksi: partiye_<uyeId>.
   Tek bekleyen davet: partidavet_<hedefId> = { from, tag, at }.
   Uclar (hepsi launcher bileti ister):
   - POST /api/party/create   {discordId}              → parti kur
   - POST /api/party/invite   {discordId, to}          → lider davet gonderir
   - POST /api/party/respond  {discordId, from, accept}
   - POST /api/party/leave    {discordId}              → ayril / lider ise dagit
   - POST /api/party/kick     {discordId, target}      → lider atar
   - POST /api/party/uninvite {discordId, target}      → lider daveti geri alir
   - POST /api/party/chat     {discordId, message}
   - GET  /api/party/state?discordId=                  → {party, invite}      */
const PARTI_KAPASITE = 8;
const PARTI_SOHBET_SINIRI = 50;
function _partiGetir(liderId) {
  try {
    const p = db.get(`parti_${liderId}`);
    return p && Array.isArray(p.members) ? p : null;
  } catch { return null; }
}
function _partiKaydet(p) {
  try { db.set(`parti_${p.leader}`, p); } catch {}
}
function _partimNerede(id) {
  try {
    const lider = db.get(`partiye_${id}`);
    return lider ? _partiGetir(String(lider)) : null;
  } catch { return null; }
}
function _partidenCikar(p, uyeId) {
  p.members = p.members.filter(m => String(m) !== String(uyeId));
  try { db.delete(`partiye_${uyeId}`); } catch {}
  p.invites = (p.invites || []).filter(i => String(i.to) !== String(uyeId));
  try { db.delete(`partidavet_${uyeId}`); } catch {}
}
function _partiOzet(p) {
  return {
    id: String(p.leader),
    leader: String(p.leader),
    leaderTag: String((db.get(`rbetiket_${p.leader}`) || {}).tag || p.leader),
    members: (p.members || []).map(m => ({
      id: String(m),
      tag: String((db.get(`rbetiket_${m}`) || {}).tag || m),
      online: _cevrimiciMi(String(m))
    })),
    invites: (p.invites || []).map(i => ({
      to: String(i.to), tag: String(i.tag || i.to), at: Number(i.at) || 0
    })),
    chat: (p.chat || []).slice(-PARTI_SOHBET_SINIRI),
    createdAt: Number(p.createdAt) || 0
  };
}
app.post("/api/party/create", express.json({ limit: "16kb" }), (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!id || id.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, id)) return;
    if (_partimNerede(id)) return res.status(400).json({ error: "zaten bir partidesin" });
    const p = { leader: id, members: [id], invites: [], chat: [], createdAt: Date.now() };
    _partiKaydet(p);
    try { db.set(`partiye_${id}`, id); } catch {}
    res.json({ ok: true, party: _partiOzet(p) });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/party/invite", express.json({ limit: "16kb" }), (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const hedef = _etiketBul(req.body?.to);
    if (!id || id.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, id)) return;
    const p = _partimNerede(id);
    if (!p) return res.status(400).json({ error: "parti yok" });
    if (String(p.leader) !== id) return res.status(403).json({ error: "sadece lider davet eder" });
    if (!hedef) return res.status(404).json({ error: "kullanıcı bulunamadı" });
    if (String(hedef.id) === id) return res.status(400).json({ error: "kendini davet edemezsin" });
    if (p.members.some(m => String(m) === String(hedef.id))) return res.status(400).json({ error: "zaten partide" });
    if (p.members.length >= PARTI_KAPASITE) return res.status(400).json({ error: "parti dolu" });
    if (_partimNerede(String(hedef.id))) return res.status(400).json({ error: "kullanıcı başka bir partide" });
    p.invites = (p.invites || []).filter(i => String(i.to) !== String(hedef.id));
    p.invites.push({ to: String(hedef.id), tag: String(hedef.tag || hedef.id), at: Date.now() });
    _partiKaydet(p);
    try { db.set(`partidavet_${hedef.id}`, { from: id, tag: String((db.get(`rbetiket_${id}`) || {}).tag || id), at: Date.now() }); } catch {}
    _dmBildir(String(hedef.id), "🎮 Party daveti",
      `**${(db.get(`rbetiket_${id}`) || {}).tag || id}** seni Vape party'sine davet etti! Oyundaki party panelinden kabul edebilirsin. 🐰`).catch(() => {});
    res.json({ ok: true, to: hedef.tag });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/party/respond", express.json({ limit: "16kb" }), (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const from = String(req.body?.from || "").replace(/\D/g, "").slice(0, 20);
    const kabul = req.body?.accept === true || req.body?.accept === "true" || req.body?.accept === 1;
    if (!id || id.length < 15 || !from) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, id)) return;
    const davet = (() => { try { return db.get(`partidavet_${id}`); } catch { return null; } })();
    if (!davet || String(davet.from) !== from) return res.status(404).json({ error: "davet bulunamadı" });
    try { db.delete(`partidavet_${id}`); } catch {}
    const p = _partiGetir(from);
    if (p) {
      p.invites = (p.invites || []).filter(i => String(i.to) !== id);
      if (kabul) {
        if (p.members.length < PARTI_KAPASITE && !_partimNerede(id)) {
          p.members.push(id);
          try { db.set(`partiye_${id}`, from); } catch {}
        }
      }
      _partiKaydet(p);
    }
    if (kabul) {
      _dmBildir(from, "✅ Party", `**${(db.get(`rbetiket_${id}`) || {}).tag || id}** party davetini kabul etti! 🐰`).catch(() => {});
    }
    res.json({ ok: true, accept: kabul });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/party/leave", express.json({ limit: "16kb" }), (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!id || id.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, id)) return;
    const p = _partimNerede(id);
    if (!p) return res.status(400).json({ error: "parti yok" });
    _partidenCikar(p, id);
    if (String(p.leader) === id) {
      const kalan = (p.members || []).filter(m => String(m) !== id);
      if (kalan.length === 0) {
        try { db.delete(`parti_${id}`); } catch {}
      } else {
        const yeniLider = String(kalan[0]);
        try { db.delete(`parti_${id}`); } catch {}
        p.leader = yeniLider;
        p.members = kalan;
        for (const m of kalan) { try { db.set(`partiye_${String(m)}`, yeniLider); } catch {} }
        _partiKaydet(p);
        _dmBildir(yeniLider, "👑 Parti lideri oldun", `Eski lider ayrıldı, party artık sende. 🐰`).catch(() => {});
      }
    } else {
      _partiKaydet(p);
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/party/kick", express.json({ limit: "16kb" }), (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const hedef = String(req.body?.target || "").replace(/\D/g, "").slice(0, 20);
    if (!id || id.length < 15 || !hedef) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, id)) return;
    const p = _partimNerede(id);
    if (!p) return res.status(400).json({ error: "parti yok" });
    if (String(p.leader) !== id) return res.status(403).json({ error: "sadece lider atabilir" });
    if (String(hedef) === id) return res.status(400).json({ error: "kendini atamazsın, ayrıl" });
    if (!p.members.some(m => String(m) === hedef)) return res.status(404).json({ error: "partide değil" });
    _partidenCikar(p, hedef);
    _partiKaydet(p);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/party/uninvite", express.json({ limit: "16kb" }), (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const hedef = String(req.body?.target || "").replace(/\D/g, "").slice(0, 20);
    if (!id || id.length < 15 || !hedef) return res.status(400).json({ error: "eksik alan" });
    if (!_ticketIzinli(req, res, id)) return;
    const p = _partimNerede(id);
    if (!p) return res.status(400).json({ error: "parti yok" });
    if (String(p.leader) !== id) return res.status(403).json({ error: "sadece lider daveti geri alabilir" });
    if (p.members.some(m => String(m) === hedef)) return res.status(400).json({ error: "kullanıcı zaten partide" });
    const davet = (() => { try { return db.get(`partidavet_${hedef}`); } catch { return null; } })();
    if (!davet || String(davet.from) !== id) return res.status(404).json({ error: "bekleyen davet yok" });
    try { db.delete(`partidavet_${hedef}`); } catch {}
    p.invites = (p.invites || []).filter(i => String(i.to) !== hedef);
    _partiKaydet(p);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/party/chat", express.json({ limit: "16kb" }), (req, res) => {
  try {
    const id = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    const mesaj = String(req.body?.message || "").slice(0, 240).trim();
    if (!id || id.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!mesaj) return res.status(400).json({ error: "boş mesaj" });
    if (!_ticketIzinli(req, res, id)) return;
    const p = _partimNerede(id);
    if (!p) return res.status(400).json({ error: "parti yok" });
    if (!p.members.some(m => String(m) === id)) return res.status(403).json({ error: "partide değilsin" });
    p.chat = (p.chat || []).slice(-PARTI_SOHBET_SINIRI);
    p.chat.push({ from: id, tag: String((db.get(`rbetiket_${id}`) || {}).tag || id), msg: mesaj, at: Date.now() });
    p.chat = p.chat.slice(-PARTI_SOHBET_SINIRI);
    _partiKaydet(p);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.get("/api/party/state", (req, res) => {
  try {
    const id = String(req.query.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!id || id.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, id)) return;
    const p = _partimNerede(id);
    const davet = (() => { try { return db.get(`partidavet_${id}`); } catch { return null; } })();
    res.json({
      ok: true,
      party: p ? _partiOzet(p) : null,
      invite: davet ? { from: String(davet.from), tag: String(davet.tag || davet.from), at: Number(davet.at) || 0 } : null
    });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* ── Vape içi canlılık (presence) ─────────────────────────────────────
   İstemci oyundayken 5 dakikada bir `POST /api/presence { discordId }`
   gönderir (launcher bileti gerekir). Çıkışta `POST /api/presence/leave`
   dener; ulaşamazsa 10 dakikalık tazelik penceresi sayacı düşürür.
   r!launcher komutu buradan okur. Yazım başına 2 küçük anahtar
   (presence_ + launcher_kayit_) — croxydb ~0.5 MB dosyayı yeniden yazar,
   5 dk aralıkla yük yok denecek kadar azdır (hesap aşağıda). */
/* Bayat presence budayıcı: 15 dakikada bir, 30 dk'dan eski `presence_*`
   anahtarlarını siler (tek seferde en fazla 200). Aktiflik verisi dışında
   hiçbir şeye dokunmaz; `launcher_kayit_*` toplam sayaç korunur. */
let _presenceSweeperAcik = false;
function _presenceBudayiciBaslat() {
  if (_presenceSweeperAcik) return;
  _presenceSweeperAcik = true;
  setInterval(() => {
    try {
      const tum = db.all() || {};
      const simdi = Date.now();
      let silinen = 0;
      for (const k of Object.keys(tum)) {
        if (silinen >= 200) break;
        if (!k.startsWith("presence_")) continue;
        const at = Number((tum[k] || {}).at) || 0;
        if (!at || simdi - at > 30 * 60 * 1000) {
          try { db.delete(k); silinen++; } catch {}
        }
      }
      if (silinen) console.log(`[presence] ${silinen} bayat kayıt budandı.`);
    } catch (e) { console.warn("[presence] budayıcı hata:", e.message); }
  }, 15 * 60 * 1000).unref?.();
}
_presenceBudayiciBaslat();
function _kayitYaz(id, username) {
  try {
    const k = `launcher_kayit_${id}`;
    const eski = db.get(k) || {};
    const ad = String(username || (eski && eski.ad) || "").slice(0, 60);
    db.set(k, { ilk: Number((eski && eski.ilk) || Date.now()), son: Date.now(), ad });
  } catch {}
}
app.post("/api/presence", express.json({ limit: "16kb" }), async (req, res) => {
  try {
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!discordId || discordId.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, discordId)) return;
    const username = String(req.body?.username || "").slice(0, 60);
    db.set(`presence_${discordId}`, { at: Date.now(), username });
    _presenceOnbellekTazele();
    _kayitYaz(discordId, username);
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/presence/leave", express.json({ limit: "16kb" }), async (req, res) => {
  try {
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!discordId || discordId.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, discordId)) return;
    try { db.delete(`presence_${discordId}`); } catch {}
    _presenceOnbellekTazele();
    try {
      const k = `launcher_kayit_${discordId}`;
      const eski = db.get(k) || {};
      db.set(k, { ilk: Number(eski.ilk) || Date.now(), son: Date.now(), ad: String(eski.ad || "").slice(0, 60) });
    } catch {}
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});
/* ── Aynı sunucu tespiti (nametag logosu) ─────────────────────────────
   İstemci 60 sn'de bir sunucu adresini yazar; bot aynı sunucuyu bildiren
   (son 5 dk'da görünen) kullanıcı adlarını döner. Plugin kanalları
   oyuncular arasında iletilmediğinden eşleştirme bot üzerinden yapılır. */
app.post("/api/presence/same", express.json({ limit: "16kb" }), async (req, res) => {
  try {
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 20);
    if (!discordId || discordId.length < 15) return res.status(400).json({ error: "geçersiz discordId" });
    if (!_ticketIzinli(req, res, discordId)) return;
    const username = String(req.body?.username || "").slice(0, 60);
    const server = String(req.body?.server || "").trim().toLowerCase().slice(0, 120);
    db.set(`presence_${discordId}`, server
      ? { at: Date.now(), username, server }
      : { at: Date.now(), username });
    _presenceOnbellekTazele();
    _kayitYaz(discordId, username);
    if (!server) return res.json({ ok: true, users: [] });
    /* Performans + sızıntı sertleştirmesi:
       - Her istekte TÜM veritabanını taramak yerine yalnızca `presence_*`
         anahtarları 15 sn boyunca önbelleklenir.
       - Listede kendi kaydı dışında kimseye Discord ID'si verilmez; yalnızca
         takma ad (username) döner. İstemci kimliği zaten kendi gönderdiği
         bilete göre biliyor. */
    const tum = _presenceAnlikGoruntu();
    const simdi = Date.now();
    const users = [];
    for (const [k, kayit] of tum) {
      if (k === `presence_${discordId}`) continue;
      if (!kayit.server || kayit.server !== server) continue;
      if (!kayit.at || simdi - kayit.at > 5 * 60 * 1000) continue;
      users.push({ username: String(kayit.username || "").slice(0, 60) });
      if (users.length >= 100) break;
    }
    res.json({ ok: true, users });
  } catch { res.status(500).json({ error: "hata" }); }
});

/* presence_* anahtarlarının 15 sn'lik anlık görüntüsü (db.all() her istekte çağrılmasın). */
const _presenceCache = { at: 0, veri: new Map() };
function _presenceOnbellekTazele() { _presenceCache.at = 0; }
function _presenceAnlikGoruntu() {
  const simdi = Date.now();
  if (simdi - _presenceCache.at < 15000 && _presenceCache.veri.size) return _presenceCache.veri;
  const harita = new Map();
  try {
    const hepsi = db.all() || {};
    for (const k of Object.keys(hepsi)) {
      if (k.startsWith("presence_")) harita.set(k, hepsi[k] || {});
    }
  } catch {}
  _presenceCache.at = simdi;
  _presenceCache.veri = harita;
  return harita;
}
/* Bu uçlar aynı veriyi /api/user/:id ile döndürüyor. Korumasız bırakılırsa
   Discord ID'sini bilen herkes bakiye + envanter + premium + tag okuyabiliyordu.
   Artık site sırrı (x-bot-secret) veya kullanıcının kendi launcher bileti gerekir. */
app.get("/api/dogrula/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").replace(/\D/g, "").slice(0, 20);
    if (!id) return res.status(400).json({ error: "geçersiz id" });
    if (!_idIzinli(req, res, id)) return;
    let username = client.users.cache.get(id)?.username || null;
    let avatar = client.users.cache.get(id)?.displayAvatarURL?.({ extension: "png" }) || null;
    if (!username) {
      const u = await client.users.fetch(id).catch(() => null);
      username = u?.username || null;
      avatar = u?.displayAvatarURL?.({ extension: "png" }) || null;
    }
    res.json({
      discordId: id, username, avatar,
      role: db.fetch(`siterol_${id}`) || "member",
      tag: (_etiketAta(id) || {}).tag || null,
      ...(_premiumJson(id)),
      verifiedAt: Date.now()
    });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.get("/api/kullanici/:id", async (req, res) => {
  try {
    const id = String(req.params.id || "").replace(/\D/g, "").slice(0, 20);
    if (!id) return res.status(400).json({ error: "geçersiz id" });
    if (!_idIzinli(req, res, id)) return;
    const wallet = Number(db.fetch(`para_${id}`) || 0);
    const bank = Number(db.fetch(`bankapara_${id}`) || 0);
    const xp = Number(db.fetch(`xp_${id}`) || 0);
    let username = client.users.cache.get(id)?.username || null;
    if (!username) username = (await client.users.fetch(id).catch(() => null))?.username || null;
    res.json({
      id, username, wallet, bank, total: wallet + bank, xp, level: U.xpSeviye(xp),
      premium: _premiumJson(id).premium, daysLeft: _premiumJson(id).daysLeft,
      /* Etiket burada da donuyor: client.js bu ucu /user/<id> olarak proxy'liyor
         ve istemci tarafi "vape online"daki isimle friends'takini karsilastiriyor.
         Ikisi ayni kaynaktan gelmeli, yoksa isim eslesmesi koptugu icin arkadas
         listesi hep bos kaldi. */
      tag: (_etiketAta(id) || {}).tag || null,
      avatar: client.users.cache.get(id)?.displayAvatarURL?.({ extension: "png" }) || null,
      pets: db.fetch(`pets_${id}`) || [], capes: db.fetch(`launcher_capes_${id}`) || []
    });
  } catch { res.status(500).json({ error: "hata" }); }
});
/* Eski açık uç (auth'suz) kapatıldı: site artık imzalı /api/contact kullanıyor.
   Geriye dönük uyumluluk için yol tutuldu ama _botAuth ZORUNLU. */
/* /api/iletisim hız sınırı: discordId başına saatte 5 mesaj (bellek içi). */
const _ILETISIM_PENCERE_MS = 3600000;
const _ILETISIM_MAX = 5;
const _iletisimLimit = new Map();
function _iletisimYavaslat(req, res, next) {
  try {
    const simdi = Date.now();
    const id = String(req.body?.discordId || "").replace(/\D/g, "") || "anon";
    const kuyruk = (_iletisimLimit.get(id) || []).filter(t => simdi - t < _ILETISIM_PENCERE_MS);
    if (kuyruk.length >= _ILETISIM_MAX) {
      const kalan = Math.ceil((_ILETISIM_PENCERE_MS - (simdi - kuyruk[0])) / 1000);
      res.setHeader("Retry-After", String(kalan));
      return res.status(429).json({ error: "cok fazla mesaj, birazdan tekrar deneyin", tekrarSn: Math.ceil(kalan / 60) + 1 });
    }
    kuyruk.push(simdi);
    _iletisimLimit.set(id, kuyruk);
    if (_iletisimLimit.size > 5000) {
      for (const [k, v] of _iletisimLimit) if (!v.some(t => simdi - t < _ILETISIM_PENCERE_MS)) _iletisimLimit.delete(k);
    }
    next();
  } catch { next(); }
}

app.post("/api/iletisim", _botAuth, express.json(), _iletisimYavaslat, async (req, res) => {
  try {
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 25);
    const username = String(req.body?.username || "").slice(0, 60);
    const message = String(req.body?.message || "").slice(0, 2000);
    const subject = String(req.body?.subject || "Vape istemcisi destek").slice(0, 120);
    if (!message || message.length < 3) return res.status(400).json({ error: "eksik alan" });
    const iletisim = require("./util/iletisim");
    const rec = iletisim.iletisimKaydet({ discordId, username, subject, message, lang: "tr" });
    let kanal = client.channels.cache.get(U.OWNER_LOG);
    if (!kanal) kanal = await client.channels.fetch(U.OWNER_LOG).catch(() => null);
    if (kanal) {
      const gonderilen = await kanal.send({ embeds: [iletisim.iletisimEmbed(rec)], components: [iletisim.iletisimButon(rec, "tr")] }).catch(() => null);
      if (gonderilen) { rec.logChannelId = kanal.id; rec.logMessageId = gonderilen.id; iletisim.iletisimGuncelle(rec); }
    }
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});

app.post("/api/contact", _botAuth, express.json(), async (req, res) => {
  try {
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 25);
    const username = String(req.body?.username || req.body?.name || "").slice(0, 60);
    const email = String(req.body?.email || "").slice(0, 120);
    const subject = String(req.body?.subject || "").slice(0, 120);
    const message = String(req.body?.message || "").slice(0, 2000);
    const lang = req.body?.lang === "en" ? "en" : "tr";
    if (!message || message.length < 3) return res.status(400).json({ error: "eksik alan" });
    if (!discordId && (!username || !email)) return res.status(400).json({ error: "eksik alan" });
    // Admin/mod paneli + Firestore gelen kutusu için kaydet (Discord kimlikli)
    let mesajId = null;
    if (discordId) {
      try { mesajId = await U.siteMesajKaydet({ discordId, username, subject, message, lang }); } catch {}
    }
    // Sahip loguna cevaplanabilir mesaj olarak düş (Cevapla butonu → modal → DM)
    let logSonuc = { ok: false, neden: "" };
    try {
      const iletisim = require("./util/iletisim");
      const rec = iletisim.iletisimKaydet({ discordId, username, subject, message, lang });
      let kanal = client.channels.cache.get(U.OWNER_LOG);
      if (!kanal) kanal = await client.channels.fetch(U.OWNER_LOG).catch(() => null);
      if (kanal) {
        const gonderilen = await kanal.send({
          embeds: [iletisim.iletisimEmbed(rec)],
          components: [iletisim.iletisimButon(rec, lang)]
        }).catch(() => null);
        if (gonderilen) { rec.logChannelId = kanal.id; rec.logMessageId = gonderilen.id; iletisim.iletisimGuncelle(rec); logSonuc.ok = true; }
      }
      if (!kanal) logSonuc.neden = "kanal-yok";
      else if (!logSonuc.ok) logSonuc.neden = "gonderim-basarisiz";
    } catch (e) { logSonuc.neden = "hata: " + (e && e.message); console.log("[İletişim] log hatası:", e && e.message); }
    if (!logSonuc.ok) console.warn(`[İletişim] UYARI: mesaj sahip loguna düşemedi (${logSonuc.neden || "bilinmeyen"}) — OWNER_LOG kanalını ve bot izinlerini kontrol et.`);
    res.json({ ok: true, id: mesajId || undefined, log: logSonuc.ok ? "sent" : ("failed: " + (logSonuc.neden || "bilinmeyen")) });
  } catch { res.status(500).json({ error: "hata" }); }
});
app.post("/api/notify", _botAuth, express.json(), async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.userIds) ? req.body.userIds.map(String).slice(0, 20) : [];
    const title = String(req.body?.title || "🔔 Bildirim").slice(0, 100);
    const text = String(req.body?.text || "").slice(0, 500);
    const url = String(req.body?.url || "").slice(0, 200);
    if (!ids.length || !text) return res.status(400).json({ error: "eksik alan" });
    const link = url.startsWith("http") ? url : "https://risebunny.vercel.app/" + url.replace(/^\//, "");
    let ok = 0;
    for (const id of ids) {
      try {
        const u = await client.users.fetch(id.replace(/\D/g, "").slice(0, 25)).catch(() => null);
        if (!u) continue;
        const row = new Discord.ActionRowBuilder().addComponents(
          new Discord.ButtonBuilder().setLabel("Foruma Git").setStyle(Discord.ButtonStyle.Link).setURL(link)
        );
        await u.send({ embeds: [new Discord.EmbedBuilder().setColor("#5865F2").setTitle(title)
          .setDescription(text).setTimestamp()], components: [row] }).catch(() => {});
        ok++;
      } catch {}
    }
    res.json({ ok: true, gonderilen: ok });
  } catch { res.status(500).json({ error: "hata" }); }
});

app.post("/api/log", _botAuth, express.json(), async (req, res) => {
  try {
    const baslik = String(req.body?.baslik || "🌐 Site Olayı").slice(0, 100);
    const metin = String(req.body?.metin || "").slice(0, 1500);
    const kim = String(req.body?.kim || "").slice(0, 60);
    if (!metin) return res.status(400).json({ error: "eksik alan" });
    U.ownerLog(client, new Discord.EmbedBuilder().setColor("#5865F2").setTitle(baslik)
      .setDescription((kim ? `**Kullanıcı:** ${kim}\n` : "") + metin)
      .setTimestamp()).catch(() => {});
    res.json({ ok: true });
  } catch { res.status(500).json({ error: "hata" }); }
});

const SILME_YETKI = [(process.env.SAHIP_ID || U.SAHIP_ID), "1310366324731547798"];
const SILME_COOLDOWN_MS = 60 * 60 * 1000;
function silmeCooldownKalan(discordId) {
  try {
    const son = Number(db.fetch(`silme_cooldown_${discordId}`) || 0);
    const kalan = SILME_COOLDOWN_MS - (Date.now() - son);
    return kalan > 0 ? kalan : 0;
  } catch { return 0; }
}
function silmeOzet(id) {
  const satir = [];
  try {
    const cüzdan = Number(db.fetch(`para_${id}`) || 0), banka = Number(db.fetch(`bankapara_${id}`) || 0);
    if (cüzdan || banka) satir.push(`💸 Para: ${cüzdan.toLocaleString()} + 🏦 ${banka.toLocaleString()}`);
    const xp = Number(db.fetch(`xp_${id}`) || 0);
    if (xp) satir.push(`🏆 XP: ${xp.toLocaleString()} (Sv.${U.xpSeviye(xp)})`);
    const pets = db.fetch(`pets_${id}`) || [];
    if (Array.isArray(pets) && pets.length) satir.push(`🐾 Pet: ${pets.length} adet`);
    if (U.isPremium(id)) satir.push(`💎 Premium: aktif`);
    const mail = db.fetch(`dmail_${id}`);
    if (mail && mail.email) satir.push(`✉️ Kayıtlı e-posta: ${mail.email}`);
  } catch {}
  return satir.length ? satir.join("\n") : "(bot tarafında kayıtlı veri yok)";
}
app.post("/api/deletion/request", _botAuth, express.json(), async (req, res) => {
  try {
    const docId = String(req.body?.docId || "").slice(0, 60);
    const discordId = String(req.body?.discordId || "").replace(/\D/g, "").slice(0, 25);
    const username = String(req.body?.username || "").slice(0, 60);
    const kapsam = ["bot", "site", "ikisi"].includes(req.body?.kapsam) ? req.body.kapsam : "ikisi";
    if (!docId || !discordId) return res.status(400).json({ error: "eksik alan" });
    const bekle = silmeCooldownKalan(discordId);
    if (bekle > 0) {
      const dk = Math.ceil(bekle / 60000);
      return res.status(429).json({ error: `Çok sık talep gönderiyorsun. ${dk} dakika sonra tekrar dene.`, kalanDakika: dk });
    }
    db.set(`silme_cooldown_${discordId}`, Date.now());
    const hamVeri = req.body?.veri && typeof req.body.veri === "object" ? req.body.veri : {};
    const liste = (v) => (Array.isArray(v) ? v.map(x => String(x).slice(0, 140)).slice(0, 25) : []);
    const veri = { site: liste(hamVeri.site), bot: liste(hamVeri.bot) };
    const row = new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder().setCustomId(`sil_onay_${docId}`).setLabel("Kabul Et").setStyle(Discord.ButtonStyle.Success).setEmoji("✅"),
      new Discord.ButtonBuilder().setCustomId(`sil_red_${docId}`).setLabel("Reddet").setStyle(Discord.ButtonStyle.Danger).setEmoji("✖️")
    );
    const botListe = veri.bot.length
      ? veri.bot.map(s => `• ${s}`).join("\n")
      : silmeOzet(discordId);
    const siteListe = veri.site.length
      ? veri.site.map(s => `• ${s}`).join("\n")
      : "(site tarafında bildirilen veri yok)";
    const talepEmbed = new Discord.EmbedBuilder().setColor("Red").setTitle("🗑️ Veri Silme Talebi")
      .setDescription(
        `**Kullanıcı:** ${username || "?"} (<@${discordId}>, \`${discordId}\`)\n` +
        `**Kapsam:** ${kapsam === "ikisi" ? "Bot + Site" : kapsam === "bot" ? "Sadece Bot" : "Sadece Site"}\n` +
        `**Talep:** \`${docId}\`\n\n` +
        `**🤖 Bot platformundaki veriler**\n${botListe}\n\n` +
        `**🌐 Site platformundaki veriler**\n${siteListe}\n\n` +
        "Kabul edersen bu veriler silinir ve kullanıcıya DM ile bildirilir."
      ).setTimestamp();
    let logChannelId = "", logMessageId = "";
    try {
      let kanal = client.channels.cache.get(U.OWNER_LOG);
      if (!kanal) kanal = await client.channels.fetch(U.OWNER_LOG).catch(() => null);
      if (!kanal) console.warn(`[Silme] UYARI: OWNER_LOG kanalı bulunamadı (${U.OWNER_LOG}).`);
      else {
        const gonderilen = await kanal.send({ embeds: [talepEmbed], components: [row] }).catch(() => null);
        if (gonderilen) { logChannelId = kanal.id; logMessageId = gonderilen.id; }
        else console.warn("[Silme] UYARI: silme talebi sahip loguna gönderilemedi (izinleri kontrol et).");
      }
    } catch (e) { console.warn("[Silme] log hatası:", e && e.message); }
    db.set(`silme_${docId}`, {
      durum: "bekliyor", sebep: "", discordId, username, kapsam, veri,
      at: Date.now(), logChannelId, logMessageId
    });
    await _dmBildir(discordId, "🗑️ Veri Silme Talebin Alındı",
      `**${username || "Kullanıcı"}**, veri silme talebin sahibe iletildi.\n\n**Kapsam:** ${kapsam === "ikisi" ? "Bot + Site" : kapsam === "bot" ? "Sadece Bot" : "Sadece Site"}\nSahip onayladığında (veya reddedip sebep yazdığında) burada DM ile bilgilendirileceksin. 🐰`).catch(() => {});
    res.json({ ok: true, kayit: docId });
  } catch (e) { res.status(500).json({ error: "hata" }); }
});
app.get("/api/deletion/status", _botAuth, async (req, res) => {
  try {
    const rec = db.fetch(`silme_${String(req.query.doc || "").slice(0, 60)}`) || { durum: "bekliyor" };
    res.json({ durum: rec.durum || "bekliyor", sebep: rec.sebep || "", discordId: rec.discordId || "" });
  } catch { res.json({ durum: "bekliyor" }); }
});

app.get("/api/stats", (req, res) => {
  try {
    let users = 0;
    client.guilds.cache.forEach(g => { users += g.memberCount || 0; });
    // Gerçek komut & kategori sayısı (botun yüklediği komutlardan türetilir)
    let commands = 0, categories = 0;
    try {
      commands = client.commands ? client.commands.size : 0;
      const cats = new Set();
      if (client.commands) {
        for (const c of client.commands.values()) {
          const k = c && c.help && c.help.category;
          if (k) cats.add(String(k));
        }
      }
      categories = cats.size;
    } catch {}
    res.json({
      servers: client.guilds.cache.size,
      users,
      commands,
      categories,
      uptime: Math.floor(client.uptime || 0),
      at: new Date().toISOString()
    });
  } catch { res.json({ servers: 0, users: 0, commands: 0, categories: 0 }); }
});

const _rbStatusCache = { at: 0, pending: 0 };
app.get("/api/risebrawl-status", (req, res) => {
  /* Sadece genel durum bilgisi döner. db.all() hatasının METNİ dışarı verilmez
     (dosya yolu / iç yapı sızdırabilir). Ağır tarama 60 sn önbellekli. */
  try {
    const simdi = Date.now();
    if (!_rbStatusCache.at || simdi - _rbStatusCache.at > 60000) {
      const all = Object.values(db.all() || {});
      _rbStatusCache.pending = all.filter(k => k && k.tur && k.tag).length;
      _rbStatusCache.at = simdi;
    }
    res.json({ brand: "RiseBrawl", version: "28 RISE", live: true, pending: _rbStatusCache.pending });
  } catch { res.json({ brand: "RiseBrawl", version: "28 RISE", live: false }); }
});
app.get("/api/site-status", (req, res) => {
  const site = db.fetch("site_bakim") || null;
  res.json({ bakim: !!(site && site.acik), sebep: (site && site.sebep) || "", botBakim: !!db.fetch("8182bakımaç81") });
});

const GIRIS_BILDIRIM_ARALIK = 5 * 60 * 1000;
async function girisiBildir({ id, username, source, email }) {
  const uid = String(id || "").replace(/\D/g, "").slice(0, 20);
  if (!uid) return false;
  const nereden = source === "launcher" ? "launcher" : "site";
  const anahtar = `giris_bildirim_${uid}`;
  const son = Number(db.fetch(anahtar) || 0);
  if (Date.now() - son < GIRIS_BILDIRIM_ARALIK) return false;
  db.set(anahtar, Date.now());

  const adSoyad = String(username || "").slice(0, 60) || `Kullanıcı_${uid.slice(-4)}`;
  await _dmBildir(
    uid,
    "🔐 Discord Girişi Başarılı",
    `Merhaba **${adSoyad}**! RiseBunny hesabına **${nereden === "launcher" ? "RiseBunny Launcher" : "risebunny.vercel.app"}** üzerinden Discord ile giriş yaptın.\n\n` +
      "Bu girişi sen yapmadıysan Discord şifreni değiştir ve destek sunucumuza yaz. 🐰"
  ).catch(() => {});
  U.ownerLog(client, new Discord.EmbedBuilder()
    .setColor(nereden === "launcher" ? "Green" : "Blurple")
    .setTitle(nereden === "launcher" ? "🖥️ Launcher Girişi" : "🌐 Site Girişi")
    .addFields(
      { name: "Kullanıcı", value: `<@${uid}> (\`${uid}\`)`, inline: false },
      { name: "Kullanıcı adı", value: adSoyad, inline: true },
      { name: "Kaynak", value: nereden === "launcher" ? "RiseBunny Launcher" : "Web sitesi (OAuth)", inline: true }
    )
    .setTimestamp()).catch(() => {});
  return true;
}

app.post("/api/discord/link", _botAuth, express.json(), async (req, res) => {
  try {
    const id = String(req.body?.userId || "").replace(/\D/g, "").slice(0, 20);
    if (!id) return res.status(400).json({ error: "geçersiz id" });
    const username = String(req.body?.username || "").slice(0, 60);
    const email = String(req.body?.email || "").slice(0, 120);
    db.set(`dmail_${id}`, { email, username, at: Date.now() });
    await girisiBildir({ id, username, email, source: req.body?.source });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ error: "hata" }); }
});
app.post("/api/login", _botAuth, express.json(), async (req, res) => {
  try {
    const id = String(req.body?.userId || "").replace(/\D/g, "").slice(0, 20);
    if (!id) return res.status(400).json({ error: "geçersiz id" });
    const ok = await girisiBildir({
      id,
      username: req.body?.username,
      source: req.body?.source,
      email: req.body?.email
    });
    /* Launcher kaydı: oyuna girsin girmesin toplam sayaç burada tutulur. */
    if (req.body?.source === "launcher") {
      try { _kayitYaz(id, req.body?.username); } catch {}
    }
    res.json({ ok: true, bildirildi: ok });
  } catch { res.status(500).json({ error: "hata" }); }
});

const TOPGG_BOT_ID = process.env.TOPGG_BOT_ID || "1540401487581020252";
const TOPGG_SECRET = process.env.TOPGG_WEBHOOK_SECRET || "";
const votePath = process.env.TOPGG_WEBHOOK_URL ? new URL(process.env.TOPGG_WEBHOOK_URL).pathname : "/api/topgg/vote";

function _timingSafeEqual(a, b) {
  const ba = Buffer.from(String(a || ""), "utf8");
  const bb = Buffer.from(String(b || ""), "utf8");
  return ba.length === bb.length && ba.length > 0 && crypto.timingSafeEqual(ba, bb);
}

async function _readRaw(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (c) => {
      chunks.push(c);
      if (Buffer.concat(chunks).length > 2 * 1024 * 1024) { req.destroy(); reject(new Error("body too large")); }
    });
    req.on("end", () => resolve(Buffer.concat(chunks)));
    req.on("error", reject);
  });
}

app.post(votePath, async (req, res) => {
  try {
    if (!TOPGG_SECRET) { console.warn("[TopGG] TOPGG_WEBHOOK_SECRET yok — webhook reddedildi."); return res.sendStatus(500); }
    const raw = await _readRaw(req);
    const sigHeader = req.headers["x-topgg-signature"];

    if (sigHeader) {
      const sig = Array.isArray(sigHeader) ? sigHeader[0] : sigHeader;
      const parts = Object.fromEntries(String(sig).split(",").map((p) => p.split("=")));
      if (!parts.t || !parts.v1) return res.status(422).json({ error: "invalid signature format" });
      if (Math.abs(Date.now() - parseInt(parts.t, 10) * 1000) > 30000) return res.status(403).json({ error: "timestamp outside window" });
      const expected = crypto.createHmac("sha256", TOPGG_SECRET).update(`${parts.t}.${raw}`).digest("hex");
      if (!_timingSafeEqual(expected, parts.v1)) return res.status(403).json({ error: "invalid signature" });
      let body;
      try { body = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "malformed json" }); }
      if (body.type === "webhook.test") { console.log("[TopGG] TEST oyu alındı (v1) — ödül verilmedi."); return res.sendStatus(204); }
      if (body.type !== "vote.create") { console.log(`[TopGG] Bilinmeyen v1 tipi: ${body.type}`); return res.sendStatus(204); }
      const userId = body?.data?.user?.id || body?.data?.user?.platform_id;
      if (!userId) return res.status(422).json({ error: "missing user" });
      const weekend = Number(body?.data?.weight || 1) > 1;
      await _voteReward(String(userId), weekend ? 2 : 1);
      return res.sendStatus(204);
    }

    const auth = req.headers["authorization"] || "";
    if (!_timingSafeEqual(auth, TOPGG_SECRET)) return res.status(401).json({ error: "unauthorized" });
    let vote;
    try { vote = JSON.parse(raw.toString("utf8")); } catch { return res.status(400).json({ error: "malformed json" }); }
    if (vote.type === "test") { console.log("[TopGG] TEST oyu alındı (v0) — ödül verilmedi."); return res.sendStatus(204); }
    if (!vote.user) return res.status(422).json({ error: "missing user" });
    await _voteReward(String(vote.user), vote.isWeekend ? 2 : 1);
    return res.sendStatus(204);
  } catch (e) {
    console.error("[TopGG] Webhook hatası:", e.message);
    return res.sendStatus(500);
  }
});

async function _voteReward(userId, multiplier) {
  const key = `vote_${userId}`;
  const last = Number(db.fetch(key) || 0);
  const now = Date.now();
  if (now - last < 12 * 3600 * 1000) {
    console.log(`[Vote] cooldown — ${userId} ödül yok`);
    return false;
  }

  const money = (Number(process.env.TOPGG_REWARD_MONEY) || 1000) * multiplier;
  const xp   = (Number(process.env.TOPGG_REWARD_XP) || 150) * multiplier;

  if (typeof db.add === "function") {
    db.add(`para_${userId}`, money);
    db.add(`xp_${userId}`, xp);
  }
  db.set(key, now);

  const roleId = process.env.TOPGG_REWARD_ROLE_ID;
  if (roleId && process.env.MAIN_GUILD_ID) {
    const guild = client.guilds.cache.get(process.env.MAIN_GUILD_ID);
    if (guild) {
      const member = await guild.members.fetch(userId).catch(() => null);
      if (member) await member.roles.add(roleId).catch(() => {});
    }
  }

  const user = await client.users.fetch(userId).catch(() => null);
  user?.send(
    `🥕 Oyun için teşekkürler! +${money.toLocaleString()} para ve +${xp} XP kazandın (12 saat sonra tekrar).`
  ).catch(() => {});

  console.log(`[Vote] Ödül verildi: ${userId} ×${multiplier}`);
}

let topggApi = null;
const FB_PROJECT = "gen-lang-client-0590499912";
const FB_KEY = process.env.FIREBASE_API_KEY || "AIzaSyAq5Nafl9aI2TabzGsj5J9ij6lNwyfTguM";
let _fbTok = null, _fbExp = 0;
async function _fbToken() {
  if (_fbTok && Date.now() < _fbExp - 60000) return _fbTok;
  const email = process.env.FIREBASE_BOT_EMAIL || "", pw = process.env.FIREBASE_BOT_SIFRE || "";
  if (!email || !pw) return null;
  try {
    const r = await fetch("https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=" + FB_KEY, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password: pw, returnSecureToken: true })
    });
    if (!r.ok) { console.warn("[FB] Bot girişi başarısız:", r.status); return null; }
    const j = await r.json();
    _fbTok = j.idToken; _fbExp = Date.now() + (Number(j.expiresIn) || 3600) * 1000;
    try {
      const payload = JSON.parse(Buffer.from(String(_fbTok).split(".")[1], "base64").toString("utf8"));
      console.log(`[FB] giriş OK → token e-postası: ${payload.email || "(yok)"}`);
    } catch {}
    return _fbTok;
  } catch { return null; }
}
function _fbVal(u) {
  return { mapValue: { fields: {
    name: { stringValue: String(u.name || "Unknown").slice(0, 32) },
    value: Number.isInteger(u.value) ? { integerValue: String(u.value) } : { doubleValue: Number(u.value) || 0 }
  } } };
}
async function _lbSync() {
  if (!client.user) return;
  const tok = await _fbToken();
  if (!tok) return;
  for (const kind of ["rich", "level"]) {
    try {
      const data = await _lbGetTop(kind);
      const body = { fields: {
        data: { arrayValue: { values: data.map(_fbVal) } },
        updatedAt: { stringValue: new Date().toISOString() }
      } };
      const r = await fetch(`https://firestore.googleapis.com/v1/projects/${FB_PROJECT}/databases/(default)/documents/leaderboard/${kind}?key=${FB_KEY}`, {
        method: "PATCH", headers: { "Content-Type": "application/json", "Authorization": "Bearer " + tok },
        body: JSON.stringify(body)
      });
      if (!r.ok) {
        if (r.status === 403) console.warn(`[FB] leaderboard/${kind} 403 → rules publish edilmemiş OLABİLİR ya da bot e-postası 'bot@discord.risebunny.local' değil (üstteki token e-postasını kontrol et).`);
        else console.warn(`[FB] leaderboard/${kind} yazılamadı:`, r.status);
      }
      else console.log(`[FB] leaderboard/${kind} senkron ✓ (${data.length})`);
    } catch (e) { console.warn("[FB] senkron hatası:", e.message); }
  }
}
if (process.env.TOPGG_TOKEN && !process.env.TOPGG_TOKEN.includes("panelden")) {
  try {
    const { Api } = require("@top-gg/sdk");
    topggApi = new Api(process.env.TOPGG_TOKEN);
  } catch (e) { console.warn("[TopGG] SDK yüklenemedi:", e.message); }
} else {
  console.log("[TopGG] TOPGG_TOKEN yok — stats gönderimi kapalı (token eklenince otomatik açılır).");
}

async function postStats(reason) {
  if (!topggApi) return;
  try {
    const guildCount = client.guilds.cache.size;
    await topggApi.postMetrics({ serverCount: guildCount });
    console.log(`[TopGG] Stats gönderildi ✓ (${guildCount} sunucu${reason ? `, tetikleyici: ${reason}` : ""})`);
  } catch (e) {
    console.error("[TopGG] Stats hatası:", e?.response?.data || e.message);
  }
}
client.once("clientReady", () => {
  console.log(`[Bot] ${client.user.tag} hazır.`);
  postStats("ready");
  setInterval(() => postStats("30dk"), 30 * 60 * 1000);
  if (!process.env.FIREBASE_BOT_EMAIL || !process.env.FIREBASE_BOT_SIFRE) {
    console.log("[FB] FIREBASE_BOT_EMAIL/SIFRE yok — liderlik senkronu kapalı (site simülasyonda kalır).");
  } else {
    _lbSync();
    setInterval(_lbSync, 10 * 60 * 1000);
  }
});
let _statsDeb = null;
function queueStats(reason) {
  clearTimeout(_statsDeb);
  _statsDeb = setTimeout(() => postStats(reason), 60 * 1000);
}

const PORT = process.env.PORT || 8000;
app.listen(PORT, () => {
  console.log(`Web sunucusu ${PORT} portunda aktif.`);
  console.log(`  • /api/leaderboard/:kind → leaderboard (5 dk cache)`);
  console.log(`  • ${votePath} → Top.gg vote webhook (imza kontrolü)`);
  console.log(`  • postMetrics → 30 dk'da bir stats (${TOPGG_BOT_ID})`);
});

if (process.env.TOPGG_SIMULATE_VOTES === "1") {
  console.log("[SIM] Oy simülasyonu açık — her 45 sn'de 1 sahte oy LOGU (ödül YOK).");
  setInterval(() => {
    console.log(`[SIM] Sahte oy alındı (bot=${TOPGG_BOT_ID}, type=test) — ödül verilmedi.`);
  }, 45000);
}

const fs = require("fs");
const prefix = U.PREFIX;
client.commands = new Discord.Collection();
client.aliases = new Discord.Collection();
const yuklenemeyen = [];
for (const file of fs.readdirSync("./komutlar/").filter(f => f.endsWith(".js") && !f.startsWith("_"))) {
  try {
    const command = require(`./komutlar/${file}`);
    if (!command?.help?.name || typeof command.run !== "function") { console.warn(`Atlandı: ${file} (exports.run veya exports.help.name yok)`); continue; }
    command.__dosya = file;
    console.log(`Yüklenen komut: ${command.help.name}.`);
    client.commands.set(command.help.name.toLowerCase(), command);
    for (const a of command.conf?.aliases || []) client.aliases.set(String(a).toLowerCase(), command.help.name.toLowerCase());
  } catch (e) {
    yuklenemeyen.push(file);
    console.error(`Komut yüklenemedi (${file}): ${e.message}`);
    console.error(String(e.stack || "").split("\n").slice(1, 4).join("\n"));
  }
}
if (yuklenemeyen.length) console.error(`⚠️ ${yuklenemeyen.length} komut YÜKLENEMEDİ: ${yuklenemeyen.join(", ")}`);

client.reload = command => new Promise((resolve, reject) => {
  try {
    delete require.cache[require.resolve(`./komutlar/${command}`)];
    const cmd = require(`./komutlar/${command}`);
    client.commands.delete(command);
    client.aliases.forEach((c, a) => { if (c === command) client.aliases.delete(a); });
    client.commands.set(command, cmd);
    (cmd.conf.aliases || []).forEach(a => client.aliases.set(a, cmd.help.name));
    resolve();
  } catch (e) { reject(e); }
});
client.load = client.reload;
client.unload = command => new Promise((resolve, reject) => {
  try {
    delete require.cache[require.resolve(`./komutlar/${command}`)];
    client.commands.delete(command);
    client.aliases.forEach((c, a) => { if (c === command) client.aliases.delete(a); });
    resolve();
  } catch (e) { reject(e); }
});

client.elevation = (message) => {
  if (!message.guild) return 0;
  let lvl = 0;
  try {
    if (message.member.permissions.has(Discord.PermissionFlagsBits.ManageMessages)) lvl = 1;
    if (message.member.permissions.has(Discord.PermissionFlagsBits.KickMembers)) lvl = 2;
    if (message.member.permissions.has(Discord.PermissionFlagsBits.BanMembers)) lvl = 3;
    if (message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) lvl = 4;
    if (message.author.id === U.SAHIP_ID) lvl = 5;
  } catch {}
  return lvl;
};

client.on("guildCreate", async (guild) => {
  try {
    const ownerId = guild.ownerId;
    if (ownerId) {
      if (typeof db.add === "function") db.add(`para_${ownerId}`, 100000);
      console.log(`Bot eklendi: ${guild.name} (${guild.id}) sahibi ${ownerId} +100000`);
      U.ownerLog(client, `➕ Yeni sunucu: **${guild.name}** (${guild.id}) | Sahip: ${ownerId}`).catch(() => {});
      queueStats("guildCreate");
    }
  } catch {}
});
client.on("guildDelete", async (guild) => {
  try {
    const ownerId = guild.ownerId;
    if (ownerId && typeof db.subtract === "function") db.subtract(`para_${ownerId}`, 200000);
    U.ownerLog(client, `➖ Sunucudan atıldı: **${guild?.name}** (${guild?.id})`).catch(() => {});
    queueStats("guildDelete");
  } catch {}
});

if (AI) {
  client.on("messageCreate", async (message) => {
    try {
      if (message.author.bot) return;
      if (!message.guild) return;
      if (typeof AI.adminEtiketKontrol === "function") {
        const etiketIslendi = await AI.adminEtiketKontrol(message, client);
        if (etiketIslendi) return;
      }
    } catch (e) {
      console.error("[AI messageCreate] Hata:", e.message);
    }
  });
} else {
  console.warn("[AI] Handler yüklenemedi — AI devre dışı");
}

client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || msg.author.bot) return;
    if (db.fetch(`saas_${msg.guild.id}`) === "açık" && msg.content.toLowerCase() === "sa")
      await msg.reply(getGuildLang(msg.guild.id) === "en" ? "**Hello, welcome!**" : "**Aleyküm Selam Hoşgeldin.**").catch(() => {});
  } catch {}
});

client.on("messageCreate", async (msg) => {
  try {
    if (!msg.guild || msg.author.bot || !msg.member) return;
    const uid = msg.author.id;
    const son = Number(db.fetch(`xp_cd_${uid}`) || 0);
    if (Date.now() - son < 30000) return;
    db.set(`xp_cd_${uid}`, Date.now());
    const kazanilan = Math.floor(Math.random() * 20) + 5;
    db.add(`xp_${uid}`, kazanilan);
    const xp = Number(db.fetch(`xp_${uid}`) || 0);
    const seviye = U.xpSeviye(xp);
    const onceki = Number(db.fetch(`seviye_${uid}`) || 0);
    if (seviye !== onceki) db.set(`seviye_${uid}`, seviye);
    if (seviye > onceki) {
      db.set(`seviyeatlama_${uid}`, Date.now());
      const odul = U.seviyeOdulu(seviye);
      const lang = getGuildLang(msg.guild.id);
      const rolKayitlari = db.get(`seviyeRoller_${msg.guild.id}`) || {};
      const rolId = rolKayitlari[seviye];
      if (rolId && msg.guild.roles.cache.get(rolId)) {
        await msg.member.roles.add(rolId).catch(() => {});
      }
      if (odul > 0) db.add(`para_${uid}`, odul);

      /* Seviye bildirimi: r!seviye-ayar ile kapatılabilir veya tek kanala
         toplanabilir. Ayar XP/ödül/rol vermeyi ETKİLEMEZ — sadece bildirim. */
      const ekstra = rolId ? (lang === "en" ? ` You got the <@&${rolId}> role!` : ` <@&${rolId}> rolünü aldın!`) : "";
      const ekstraOdul = odul > 0 ? (lang === "en" ? ` and earned **${odul.toLocaleString()} 💸**` : ` ve **${odul.toLocaleString()} 💸** kazandın`) : "";
      const seviyeHedef = U.seviyeHedefi ? U.seviyeHedefi(msg.guild, msg.channel) : { gonder: true, kanal: msg.channel };
      if (seviyeHedef.gonder && seviyeHedef.kanal) {
        await seviyeHedef.kanal.send({
          embeds: [new Discord.EmbedBuilder()
            .setColor("Gold")
            .setTitle(lang === "en" ? "🎉 Level Up!" : "🎉 Seviye Atladın!")
            .setDescription(lang === "en"
              ? `${msg.author}, you reached **Level ${seviye}**${ekstraOdul}!${ekstra}`
              : `${msg.author}, **Seviye ${seviye}** oldun${ekstraOdul}!${ekstra}`)]
        }).catch(() => {});
      }
    }
  } catch {}
});

client.on("guildMemberAdd", async (member) => {
  try {
    const guild = member.guild, user = member.user;
    if (!db.fetch(`kayıt-kayıtsız.${guild.id}`)) return;
    const kayitsizId = db.fetch(`kayıt-kayıtsız.${guild.id}`);
    if (!guild.roles.cache.get(kayitsizId) || member.roles.cache.has(kayitsizId)) return;
    const kadin = guild.roles.cache.get(db.fetch(`kayıt-kadın.${guild.id}`));
    const erkek = guild.roles.cache.get(db.fetch(`kayıt-erkek.${guild.id}`));
    if (!kadin || !erkek) return;
    await member.roles.add(kayitsizId).catch(() => {});
    await member.setNickname("İsiminizi Yazın").catch(() => {});
    const kanal = guild.channels.cache.get(db.fetch(`kayıt-kanal.${guild.id}`));
    if (!kanal?.isTextBased()) return;

    const onceki = db.fetch(`k.${guild.id}.${user.id}`);
    if (onceki) {
      await member.roles.remove(kayitsizId).catch(() => {});
      await member.roles.add(onceki.sex === "K" ? kadin.id : erkek.id).catch(() => {});
      const tag = db.fetch(`kayıt-tag.${guild.id}`);
      await member.setNickname(`${tag ? `${tag} ` : ""}${onceki.name} | ${onceki.yaş}`).catch(() => {});
      const lang0 = getGuildLang(guild.id);
      return kanal.send((lang0 === "en" ? `Registered **automatically**. Have fun **${onceki.name}**!` : `Kayıt başarıyla tamamlandı. **Otomatik** olarak kayıt edildin. İyi eğlenceler **${onceki.name}**`)).catch(() => {});
    }

    const lang = getGuildLang(guild.id);
    const embed = new Discord.EmbedBuilder().setColor("Random")
      .setImage("https://images-ext-1.discordapp.net/external/u4K5o1w8mfZ4ejvgLgIgd928hGr3vjQOi4hcbEtM1cc/https/media.discordapp.net/attachments/724722014283104306/727861420162809876/cortexKaytOlmak.gif");
    await kanal.send(`<@${user.id}> ${t(lang, "kayit.isimYaz")}`).catch(() => {});
    await kanal.send({ embeds: [embed] }).catch(() => {});

    const isimler = require("./isimler.json");
    const collector = kanal.createMessageCollector({ filter: (m) => m.author.id === user.id, time: 120000 });
    let asama = 0, secili = null;
    collector.on("collect", async (cm) => {
      try {
        if (asama === 0) {
          if (/\d/.test(cm.content)) { await cm.reply(t(lang, "kayit.sadeceIsim")).catch(() => {}); return; }
          const data = isimler.find(x => x.name.toLowerCase() === cm.content.toLowerCase());
          if (!data) { await cm.reply(t(lang, "kayit.isimGerek")).catch(() => {}); return; }
          secili = data;
          asama = 1;
          const e2 = new Discord.EmbedBuilder().setColor("Random")
            .setFooter({ text: (lang === "en" ? "Info: mistyped your name? Ask staff" : "Bilgi: İsmini yanlış yazdıysan: r!yksıfırla") })
            .setDescription(t(lang, "kayit.yasYaz", { isim: data.name }));
          await kanal.send({ embeds: [e2] }).catch(() => {});
        } else {
          if (isNaN(cm.content)) { await cm.reply(t(lang, "kayit.yasSayi")).catch(() => {}); return; }
          if (Number(cm.content) === 31) { await cm.reply((lang === "en" ? "31? Really?!" : "31 ne alaka!")).catch(() => {}); return; }
          if (Number(cm.content) > 32) { await cm.reply((lang === "en" ? "Please contact a staff member." : "Yetkili birisine yazın.")).catch(() => {}); return; }
          collector.stop("tamam");
          await member.roles.remove(kayitsizId).catch(() => {});
          await member.roles.add(secili.sex === "K" ? kadin.id : erkek.id).catch(() => {});
          const isim = secili.name.charAt(0).toUpperCase() + secili.name.slice(1);
          db.set(`k.${guild.id}.${user.id}`, { name: isim, sex: secili.sex, yaş: Number(cm.content) });
          const tag = db.fetch(`kayıt-tag.${guild.id}`);
          await member.setNickname(`${tag ? `${tag} ` : ""}${isim} | ${cm.content}`).catch(() => {});
          await kanal.send(t(lang, "kayit.kayitOk", { isim })).catch(() => {});
        }
      } catch {}
    });
  } catch {}
});

/**
 * Hoşgeldin / güle güle kartı.
 *
 * Sağlamlık notları:
 *  • `db.fetch` ve dil fonksiyonları try/catch içinde → tek hata tüm sistemi düşürmez.
 *  • Üye önbellekte yoksa (partial / ayrılma) istek üzerinden tamamlanır.
 *  • Kanal önce önbellekten, yoksa API'den alınır (silinmiş/erişimi kapanmış kanal güvenli atlanır).
 *  • Avatar indirme: node-superfetch varsa o, yoksa global fetch (Node 18+) kullanılır.
 */
async function hosgeldinKart(member, ayrildiMi) {
  try {
    if (!member || !member.guild) return;

    // Ayrılan üyeler için kullanıcı bilgisi eksik gelebilir → tamamla
    let user = member.user;
    if (!user) {
      user = await member.client.users.fetch(member.id).catch(() => null);
      if (!user) return;
    }

    const guild = member.guild;
    let kanalId = null;
    try { kanalId = db.fetch(`gçkanal_${guild.id}`); } catch {}
    if (!kanalId) return;

    let kanal = guild.channels.cache.get(kanalId) || null;
    if (!kanal) kanal = await guild.channels.fetch(kanalId).catch(() => null);
    if (!kanal?.isTextBased?.()) return;
    // Botun kanala yazma izni yoksa boşuna canvas üretmeyelim
    const izinler = kanal.permissionsFor?.(guild.members.me);
    if (izinler && !izinler.has("SendMessages")) return;

    const dil = (id) => { try { return getGuildLang(id); } catch { return "tr"; } };
    const EN = dil(guild.id) === "en";

    // Avatar adresi her durumda erişilebilir bir PNG olsun (gif/webp değil)
    const avatarURL = user.displayAvatarURL({ extension: "png", size: 1024, forceStatic: true });

    // Canvas yoksa sadece metin mesajı gönder (sistem tamamen susmasın)
    const metinGonder = async () => {
      let msj = null;
      try { msj = db.fetch(`cikisM_${guild.id}`); } catch {}
      if (!msj) {
        msj = ayrildiMi
          ? (EN ? "{uye} left the server." : "{uye} sunucudan ayrıldı.")
          : (EN ? "{uye} joined the server." : "{uye} sunucuya katıldı.");
      }
      await kanal.send(String(msj).replace(/\{uye\}/g, `<@${user.id}>`).replace(/\{sunucu\}/g, guild.name)).catch(() => {});
    };

    let Canvas;
    try { Canvas = require("@napi-rs/canvas"); } catch { return metinGonder(); }

    const canvas = Canvas.createCanvas(640, 360);
    const ctx = canvas.getContext("2d");

    // Arka plan: önce uzak görsel, olmazsa yerel gradient (görsel linkleri ölmüş olabilir)
    const bgUrl = ayrildiMi
      ? "https://media.discordapp.net/attachments/1118567518454423593/1159876865931083797/Picsart_23-10-06_18-36-17-972.jpg"
      : "https://media.discordapp.net/attachments/1118567518454423593/1159876866199523348/Picsart_23-10-06_18-34-40-006.jpg";
    const bg = await Canvas.loadImage(bgUrl).catch(() => null);
    if (bg) {
      ctx.drawImage(bg, 0, 0, canvas.width, canvas.height);
    } else {
      const g = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
      if (ayrildiMi) {
        g.addColorStop(0, "#2b0b12"); g.addColorStop(1, "#5c1020");
      } else {
        g.addColorStop(0, "#0b1e2b"); g.addColorStop(1, "#123a4d");
      }
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      // yumuşak halkalar
      for (let i = 1; i <= 4; i++) {
        ctx.beginPath();
        ctx.strokeStyle = ayrildiMi ? `rgba(255,90,120,${0.05 * i})` : `rgba(120,220,255,${0.05 * i})`;
        ctx.lineWidth = 2;
        ctx.arc(canvas.width - 60, 40, 40 * i, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.strokeStyle = ayrildiMi ? "#b0354f" : "#74037b";
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
    ctx.textAlign = "center";
    ctx.fillStyle = "#FFFFFF";
    try { ctx.font = "bold 34px sans-serif"; } catch {}
    ctx.fillText(String(user.username).slice(0, 20), 320, 285);
    ctx.fillStyle = "rgba(255,255,255,0.72)";
    try { ctx.font = "18px sans-serif"; } catch {}
    ctx.fillText(ayrildiMi ? (EN ? "left the server" : "sunucudan ayrıldı") : (EN ? "welcome!" : "hoş geldin!"), 320, 315);

    const avatar = await Canvas.loadImage(avatarURL).catch(() => null);
    if (!avatar) return metinGonder(); // avatar alınamazsa metinle devam

    // yuvarlak avatar çerçevesi
    ctx.save();
    ctx.beginPath();
    ctx.arc(320, 150, 72, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.fill();
    ctx.lineWidth = 6;
    ctx.strokeStyle = ayrildiMi ? "#ff5a78" : "#7ce7ff";
    ctx.stroke();
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(320, 150, 65, 0, Math.PI * 2, false);
    ctx.closePath();
    ctx.clip();
    ctx.drawImage(avatar, 255, 85, 130, 130);
    ctx.restore();

    const dosya = new Discord.AttachmentBuilder(canvas.toBuffer("image/png"), {
      name: ayrildiMi ? "RiseBunny-bb.png" : "RiseBunny-hg.png",
    });
    const gonderildi = await kanal.send({ files: [dosya] }).catch(() => null);
    if (!gonderildi) return; // kanala yazamıyorsak metin de gitmez

    let msj = null;
    try { msj = db.fetch(`cikisM_${guild.id}`); } catch {}
    if (!msj) {
      msj = ayrildiMi
        ? (EN ? "{uye} left the server." : "{uye} sunucudan ayrıldı.")
        : (EN ? "{uye} joined the server." : "{uye} sunucuya katıldı.");
    }
    await kanal.send(String(msj).replace(/\{uye\}/g, `<@${user.id}>`).replace(/\{sunucu\}/g, guild.name)).catch(() => {});
    if (user.bot) {
      await kanal.send(EN ? `🤖 This is a bot, ${user.tag}` : `🤖 Bu bir bot, ${user.tag}`).catch(() => {});
    }
  } catch (e) {
    console.error("[Hoşgeldin] kart hatası:", e?.message || e);
  }
}

client.on("guildMemberRemove", (m) => { hosgeldinKart(m, true); });
client.on("guildMemberAdd", (m) => { hosgeldinKart(m, false); });

const REKLAM = [".com", ".net", ".xyz", ".tk", ".pw", ".io", ".me", ".gg", "www.", "https", "http", ".gl", ".org", ".com.tr", ".biz", ".rf", ".gd", ".az", ".party", ".gf"];
async function reklamKontrol(msg, duzenlemeMi) {
  try {
    if (!msg.guild || msg.author.bot) return;
    const durum = db.fetch(`reklam.${msg.guild.id}.durum`);
    if (!durum) return;
    if (!REKLAM.some(w => msg.content.toLowerCase().includes(w))) return;
    const uye = msg.member;
    if (uye?.permissions.has(Discord.PermissionFlagsBits.ManageGuild)) return;
    await msg.delete().catch(() => {});
    const rlang = getGuildLang(msg.guild.id);
    const uyari = new Discord.EmbedBuilder().setColor(0x36393F).setDescription(rlang === "en" ? `<@${msg.author.id}>, **Advertising is not allowed on this server!**` : `<@${msg.author.id}>, **Bu sunucuda reklam yapmak yasak!**`);
    const logId = db.fetch(`reklam.${msg.guild.id}.kanal`);
    const log = new Discord.EmbedBuilder().setColor(0x36393F).setDescription(rlang === "en" ? `${msg.author}, **tried to advertise!**` : `${msg.author}, **Reklam yapmaya çalıştı!**`).addFields({ name: (rlang === "en" ? "Message:" : "Mesaj:"), value: String(msg.content).slice(0, 1000) || "-" });
    const m = await msg.channel.send({ embeds: [uyari] }).catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => {}), 5000);
    if (logId) { const kc = msg.guild.channels.cache.get(logId); if (kc?.isTextBased()) kc.send({ embeds: [log] }).catch(() => {}); }
  } catch {}
}
client.on("messageCreate", (m) => reklamKontrol(m, false));
client.on("messageUpdate", (o, n) => { if (o?.content !== n?.content) reklamKontrol(n, true); });

const KUFUR = ["siktir", "fuck", "puşt", "pust", "piç", "sikerim", "sik", "yarra", "yarrak", "amcık", "orospu", "orosbu", "oç", "ibne", "yavşak", "bitch", "dalyarak", "amk", "taşak", "daşşak"];
async function kufurKontrol(msg) {
  try {
    if (!msg.guild || msg.author.bot) return;
    if (!db.fetch(`küfür.${msg.guild.id}.durum`)) return;
    if (!KUFUR.some(w => msg.content.toLowerCase().includes(w))) return;
    if (msg.member?.permissions.has(Discord.PermissionFlagsBits.ManageGuild)) return;
    await msg.delete().catch(() => {});
    const klang = getGuildLang(msg.guild.id);
    const uyari = new Discord.EmbedBuilder().setColor(0x36393F).setDescription(klang === "en" ? `<@${msg.author.id}>, **Swearing is not allowed on this server!**` : `<@${msg.author.id}>, **Bu sunucuda küfür yasak!**`);
    const m = await msg.channel.send({ embeds: [uyari] }).catch(() => null);
    if (m) setTimeout(() => m.delete().catch(() => {}), 5000);
    const logId = db.fetch(`küfür.${msg.guild.id}.kanal`);
    if (logId) {
      const kc = msg.guild.channels.cache.get(logId);
      if (kc?.isTextBased()) kc.send({ embeds: [new Discord.EmbedBuilder().setColor(0x36393F).setDescription(klang === "en" ? `${msg.author}, **tried to swear!**` : `${msg.author}, **Küfür etmeye çalıştı!**`).addFields({ name: (klang === "en" ? "Message:" : "Mesaj:"), value: String(msg.content).slice(0, 1000) || "-" })] }).catch(() => {});
    }
  } catch {}
}
client.on("messageCreate", kufurKontrol);
client.on("messageUpdate", (o, n) => { if (o?.content !== n?.content) kufurKontrol(n); });

client.on("messageCreate", async (message) => {
  try {
    if (!message.guild || message.author.bot) return;
    if (!db.fetch(`spam.${message.guild.id}`)) return;
    if (message.member?.permissions.has(Discord.PermissionFlagsBits.BanMembers)) return;
    const anahtar = `spam_${message.guild.id}_${message.author.id}`;
    const simdi = Date.now();
    const kayit = db.fetch(anahtar) || { sayi: 0, zaman: simdi };
    if (simdi - kayit.zaman < 3000) {
      kayit.sayi += 1;
      if (kayit.sayi >= 4) {
        await message.delete().catch(() => {});
        const slang = getGuildLang(message.guild.id);
        const e = new Discord.EmbedBuilder().setColor(0x36393F).setDescription(slang === "en" ? `<@${message.author.id}>, **Spamming is not allowed on this server!**` : `<@${message.author.id}>, **Bu sunucuda spam yapmak yasak!**`);
        const m = await message.channel.send({ embeds: [e] }).catch(() => null);
        if (m) setTimeout(() => m.delete().catch(() => {}), 1500);
        return;
      }
    } else { kayit.sayi = 1; kayit.zaman = simdi; }
    db.set(anahtar, kayit);
    setTimeout(() => { try { db.delete(anahtar); } catch {} }, 5000);
  } catch {}
});

client.on("guildBanAdd", async (guild, user) => {
  try {
    const kanalId = db.fetch(`bank_${guild.id}`);
    if (!kanalId) return;
    const entry = await guild.fetchAuditLogs({ type: Discord.AuditLogEvent.MemberBanAdd }).then(a => a.entries.first()).catch(() => null);
    if (!entry || entry.executor.id === client.user.id || entry.executor.id === guild.ownerId) return;
    await guild.members.unban(user.id).catch(() => {});
    await guild.members.kick(entry.executor.id).catch(() => {});
    const kc = guild.channels.cache.get(kanalId);
    const blang = getGuildLang(guild.id);
    if (kc?.isTextBased()) kc.send({ embeds: [new Discord.EmbedBuilder().setTitle(blang === "en" ? "Someone Got Banned!" : "Biri Yasaklandı!").setColor(0x36393F).addFields({ name: (blang === "en" ? "Banner:" : "Yasaklayan:"), value: `${entry.executor.tag}` }, { name: (blang === "en" ? "Banned:" : "Yasaklanan:"), value: `${user.tag}` }, { name: (blang === "en" ? "Result:" : "Sonuç:"), value: (blang === "en" ? "Banner was kicked, ban lifted!" : "Yasaklayan atıldı, yasak kaldırıldı!") })] }).catch(() => {});
  } catch {}
});
client.on("roleDelete", async (role) => {
  try {
    const kanalId = db.fetch(`rolk_${role.guild.id}`);
    const entry = await role.guild.fetchAuditLogs({ type: Discord.AuditLogEvent.RoleDelete }).then(a => a.entries.first()).catch(() => null);
    if (entry && entry.executor.id !== client.user.id && entry.executor.id !== role.guild.ownerId) {
      await role.guild.roles.create({ name: role.name, color: role.color, permissions: role.permissions.bitfield }).then(r => r.setPosition(role.position).catch(() => {})).catch(() => {});
    }
    if (!kanalId) return;
    const kc = role.guild.channels.cache.get(kanalId);
    const rlang = getGuildLang(role.guild.id);
    if (kc?.isTextBased() && entry) kc.send({ embeds: [new Discord.EmbedBuilder().setTitle(rlang === "en" ? "A Role Was Deleted!" : "Bir Rol Silindi!").setColor(0x36393F).addFields({ name: (rlang === "en" ? "Deleter:" : "Silen:"), value: `${entry.executor.tag}` }, { name: (rlang === "en" ? "Deleted Role:" : "Silinen Rol:"), value: `${role.name}` }, { name: (rlang === "en" ? "Result:" : "Sonuç:"), value: (rlang === "en" ? "Role has been restored!" : "Rol geri açıldı!") })] }).catch(() => {});
  } catch {}
});

async function modlogGonder(hedef, embed) {
  try {
    if (!hedef) return;
    const kanal = typeof hedef.send === "function" ? hedef : null;
    if (kanal) await kanal.send({ embeds: [embed] }).catch(() => {});
  } catch {}
}
client.on("messageDelete", async (message) => {
  try {
    if (!message?.guild || message.author?.bot || message.channel.isDMBased?.()) return;
    const log = message.guild.channels.cache.get(db.fetch(`log_${message.guild.id}`));
    if (!log?.isTextBased()) return;
    const mlang = getGuildLang(message.guild.id);
    await modlogGonder(log, new Discord.EmbedBuilder().setTitle(`${message.author.username} | ${mlang === "en" ? "Message Deleted" : "Mesaj Silindi"}`).addFields({ name: (mlang === "en" ? "User:" : "Kullanıcı:"), value: `${message.author}` }, { name: (mlang === "en" ? "Channel:" : "Kanal:"), value: `${message.channel}` }, { name: (mlang === "en" ? "Message:" : "Mesaj:"), value: `${message.content || "-"}`.slice(0, 1000) }));
  } catch {}
});
client.on("messageUpdate", async (oldM, newM) => {
  try {
    if (!oldM?.guild || oldM.author?.bot || oldM.content === newM.content) return;
    const log = oldM.guild.channels.cache.get(db.fetch(`log_${oldM.guild.id}`));
    if (!log?.isTextBased()) return;
    const ulang = getGuildLang(oldM.guild.id);
    await modlogGonder(log, new Discord.EmbedBuilder().setAuthor({ name: oldM.author.username, iconURL: oldM.author.displayAvatarURL() }).addFields({ name: (ulang === "en" ? "**Action:**" : "**Eylem:**"), value: (ulang === "en" ? "Message Edit" : "Mesaj Düzenleme") }, { name: (ulang === "en" ? "**Owner:**" : "**Sahibi:**"), value: `<@${oldM.author.id}>` }, { name: (ulang === "en" ? "**Old:**" : "**Eski:**"), value: `${oldM.content || "-"}`.slice(0, 1000) }, { name: (ulang === "en" ? "**New:**" : "**Yeni:**"), value: `${newM.content || "-"}`.slice(0, 1000) }).setTimestamp().setColor(0x36393F).setFooter({ text: ulang === "en" ? `Server: ${oldM.guild.name}` : `Sunucu: ${oldM.guild.name}`, iconURL: oldM.guild.iconURL() }));
  } catch {}
});
for (const [olay, tip, baslikTR, baslikEN] of [["channelCreate", Discord.AuditLogEvent.ChannelCreate, "Kanal Oluşturma", "Channel Create"], ["channelDelete", Discord.AuditLogEvent.ChannelDelete, "Kanal Silme", "Channel Delete"], ["roleCreate", Discord.AuditLogEvent.RoleCreate, "Rol Oluşturma", "Role Create"], ["roleDelete", Discord.AuditLogEvent.RoleDelete, "Rol Silme", "Role Delete"]]) {
  client.on(olay, async (obj) => {
    try {
      const guild = obj.guild;
      const log = guild.channels.cache.get(db.fetch(`log_${guild.id}`));
      if (!log?.isTextBased()) return;
      const entry = await guild.fetchAuditLogs({ type: tip }).then(a => a.entries.first()).catch(() => null);
      const elang = getGuildLang(guild.id);
      const baslik = elang === "en" ? baslikEN : baslikTR;
      await modlogGonder(log, new Discord.EmbedBuilder().setAuthor({ name: entry?.executor?.username || (elang === "en" ? "Unknown" : "Bilinmiyor"), iconURL: entry?.executor?.displayAvatarURL?.() }).addFields({ name: (elang === "en" ? "**Action:**" : "**Eylem:**"), value: baslik }, { name: (elang === "en" ? "**Name:**" : "**İsim:**"), value: `\`${obj.name}\`` }).setTimestamp().setColor(0x36393F));
    } catch {}
  });
}
client.on("guildBanAdd", async (guild, user) => {
  try {
    const log = guild.channels.cache.get(db.fetch(`log_${guild.id}`));
    if (!log?.isTextBased()) return;
    const entry = await guild.fetchAuditLogs({ type: Discord.AuditLogEvent.MemberBanAdd }).then(a => a.entries.first()).catch(() => null);
    const galang = getGuildLang(guild.id);
    await modlogGonder(log, new Discord.EmbedBuilder().setAuthor({ name: entry?.executor?.username || "?", iconURL: entry?.executor?.displayAvatarURL?.() }).addFields({ name: (galang === "en" ? "**Action:**" : "**Eylem:**"), value: (galang === "en" ? "Ban" : "Yasaklama") }, { name: (galang === "en" ? "**Banned:**" : "**Yasaklanan:**"), value: `**${user.tag}** - ${user.id}` }, { name: (galang === "en" ? "**Reason:**" : "**Sebep:**"), value: `${entry?.reason || "-"}` }).setTimestamp().setColor(0x36393F));
  } catch {}
});
client.on("guildBanRemove", async (guild, user) => {
  try {
    const log = guild.channels.cache.get(db.fetch(`log_${guild.id}`));
    if (!log?.isTextBased()) return;
    const entry = await guild.fetchAuditLogs({ type: Discord.AuditLogEvent.MemberBanRemove }).then(a => a.entries.first()).catch(() => null);
    const grlang = getGuildLang(guild.id);
    await modlogGonder(log, new Discord.EmbedBuilder().setAuthor({ name: entry?.executor?.username || "?", iconURL: entry?.executor?.displayAvatarURL?.() }).addFields({ name: (grlang === "en" ? "**Action:**" : "**Eylem:**"), value: (grlang === "en" ? "Unban" : "Yasak kaldırma") }, { name: (grlang === "en" ? "**User:**" : "**Kullanıcı:**"), value: `**${user.tag}** - ${user.id}` }).setTimestamp().setColor(0x36393F));
  } catch {}
});

const { GiveawaysManager } = require("discord-giveaways");
client.giveawaysManager = new GiveawaysManager(client, {
  storage: "./giveaways.json",
  // v6'da "updateCountdownEvery" yerine "forceUpdateEvery" kullanılır.
  forceUpdateEvery: 10 * 60 * 1000,
  default: {
    botsCanWin: false,
    exemptPermissions: ["ManageMessages", "Administrator"],
    embedColor: "#FF0000",
    embedColorEnd: "#000000",
    reaction: "🎉",
    lastChance: { enabled: true, content: "⚠️ **SON ŞANS! ÇEKİLİŞE 30 SN KALDI** ⚠️", threshold: 30_000, embedColor: "#FF0000" }
  }
});
client.giveawaysManager.on("error", (e) => console.error("Çekiliş hatası:", e));

client.giveawaysManager.on("giveawayEnded", async (giveaway, winners) => {
  try {
    const sart = giveaway.extraData || db.fetch(`cekilis_sart_${giveaway.messageId}`);
    if (!sart) return;
    const guild = client.guilds.cache.get(giveaway.guildId || sart.guild);
    if (!guild) return;
    const uygunlar = [];
    for (const w of winners) {
      const member = await guild.members.fetch(w.id).catch(() => null);
      if (!member) continue;
      let uygun = true;
      if (sart.rol && !member.roles.cache.has(sart.rol)) uygun = false;
      if (sart.davet > 0) {
        const veri = db.fetch(`invites.${w.id}`) || {};
        const toplam = (veri.total || 0) + (veri.bonus || 0);
        if (toplam < sart.davet) uygun = false;
      }
      if (uygun) uygunlar.push(w);
    }
    if (uygunlar.length < winners.length) {
      const eksik = winners.length - uygunlar.length;
      for (let i = 0; i < eksik; i++) {
        await client.giveawaysManager.reroll(giveaway.messageId, {
          winnerCount: 1,
          messages: {
            congrat: "🎉 Tebrikler {winners}! **{this.prize}** ödülünü kazandın! {this.messageURL}",
            error: "Şartı karşılayan başka katılımcı bulunamadı.",
            replyWhenNoWinner: true
          }
        }).catch(() => {});
      }
    }
  } catch {}
});

/* ── r!girisrol: çoklu rol + bildirim kanalı (bkz. komutlar/girisrol.js) ──
   Eski otoRL_ dinleyicisinden ÖNCE çalışır çünkü o dinleyici tek rol alıp
   hemen çıkar; girisrol ayarı varsa asıl işi bu blok yapar ve alttaki
   otorol bloğunu atlar (aksi halde iki rol birden verilir). */
client.on("guildMemberAdd", async (member) => {
  try {
    const GR = require("./komutlar/girisrol");
    const ayar = GR.ayarAl(member.guild.id);
    if (!ayar.acik || !ayar.idler.length) return;

    /* Sistem açıksa bu üye artık girisrol tarafından yönetiliyor. İşareti
       HEMEN koy: aşağıdaki erken çıkışlarda da eski otoRL bloğu çalışmamalı,
       yoksa üyeye iki rol birden verilir. */
    try { member.__girisrolIslendi = true; } catch {}

    // Botlara dokunma (ayar açık değilse)
    if (member.user.bot && !ayar.botlara) return;

    // Yeni hesap koruması
    if (ayar.yeniHesabiAtla && GR.yeniHesapMi(member.user)) {
      const otoId = db.fetch(`otoRL_${member.guild.id}`);
      if (otoId) { try { await member.roles.add(otoId, "Otomatik rol (yeni hesap)").catch(() => {}); } catch {} }
      const kh = ayar.kanal ? member.guild.channels.cache.get(ayar.kanal) : null;
      if (kh?.isTextBased()) {
        const gl = getGuildLang(member.guild.id);
        await kh.send({ embeds: [new Discord.EmbedBuilder().setColor("Orange").setTimestamp().setFooter({ text: "RiseBunny" })
          .setDescription(gl === "en"
            ? `⚠️ **${member.user.username}** joined, but the account is too new (< ${GR.MISAFIR_GUN}d) — role skipped.`
            : `⚠️ **${member.user.username}** katıldı ama hesabı çok yeni (< ${GR.MISAFIR_GUN} gün) — rol verilmedi.`)
        ] }).catch(() => {});
      }
      return;
    }

    const sonuc = await GR.rolVer(member, ayar.idler, { kayitsizRolunuSil: ayar.kayitsizRolunuSil });

    // Hiç rol verilemediyse ownerLog'a düş — sessiz başarısızlık olmasın
    if (!sonuc.verilen.length && sonuc.hata.length) {
      try {
        const { ownerLog } = require("./utils");
        ownerLog(client, `🚪 **Giriş rolü verilemedi** — ${member.guild.name} (\`${member.guild.id}\`)\n` +
          `Üye: ${member.user.tag} (\`${member.id}\`)\n` +
          `Hatalı roller: ${sonuc.hata.map(id => `<@&${id}>`).join(", ")}\n` +
          `Muhtemel sebep: botun rolü bu rollerin **altında** (Sunucu Ayarları → Roller).`);
      } catch {}
    }

    const kanal = ayar.kanal ? member.guild.channels.cache.get(ayar.kanal) : null;
    if (kanal?.isTextBased()) {
      const gl = getGuildLang(member.guild.id);
      const verilenler = sonuc.verilen.map(id => `<@&${id}>`).join(", ");
      const e = new Discord.EmbedBuilder().setColor("Green").setTimestamp().setFooter({ text: "RiseBunny" })
        .setThumbnail(member.user.displayAvatarURL({ size: 128 }))
        .setDescription(
          (gl === "en"
            ? `**${member.user.username}** welcome! You are member #**${member.guild.memberCount}**.`
            : `**${member.user.username}** hoş geldin! **${member.guild.memberCount}.** üyemizsin.`) +
          (verilenler ? (gl === "en" ? `\n\n🎭 Roles: ${verilenler}` : `\n\n🎭 Rollerin: ${verilenler}`) : "") +
          (sonuc.hata.length && gl === "en" ? `\n\n⚠️ Could not assign: ${sonuc.hata.map(id => `<@&${id}>`).join(", ")}` : "") +
          (sonuc.hata.length && gl !== "en" ? `\n\n⚠️ Verilemeyen: ${sonuc.hata.map(id => `<@&${id}>`).join(", ")}` : "")
        );
      await kanal.send({ embeds: [e] }).catch(() => {});
    }
  } catch (e) {
    console.error("girisrol guildMemberAdd:", e?.message || e);
  }
});

client.on("guildMemberAdd", async (member) => {
  if (member.__girisrolIslendi) return; // r!girisrol ayarı varsa bu blok atlanır
  try {
    const rol = db.fetch(`otoRL_${member.guild.id}`);
    if (!rol) return;
    const kanalId = db.fetch(`otoRK_${member.guild.id}`);
    const sablon = db.fetch(`otoRM_${member.guild.id}`);
    await member.roles.add(rol).catch(() => {});
    const kanal = kanalId ? member.guild.channels.cache.get(kanalId) : null;
    if (!kanal?.isTextBased()) return;
    if (!sablon) {
      const olang = getGuildLang(member.guild.id);
      const e = new Discord.EmbedBuilder().setColor("Blue").setTimestamp().setFooter({ text: "RiseBunny" })
        .setDescription(olang === "en" ? `**${member.user.username}** welcome! Your auto role was given. We are now **${member.guild.memberCount}** people!` : `**${member.user.username}** hoş geldin! Otomatik rolün verildi. Seninle beraber **${member.guild.memberCount}** kişiyiz!`)
        .setImage("https://media.discordapp.net/attachments/1116091601907875870/1145356129820483584/Picsart_23-08-27_16-55-54-843.jpg");
      return kanal.send({ embeds: [e] }).catch(() => {});
    }
    const rolAd = member.guild.roles.cache.get(rol)?.name || "rol";
    const botSayi = member.guild.members.cache.filter(m => m.user.bot).size;
    const metin = String(sablon).replace("-uye-", `${member.user}`).replace("-uyetag-", `${member.user.tag}`).replace("-rol-", rolAd).replace("-server-", member.guild.name).replace("-uyesayisi-", `${member.guild.memberCount}`).replace("-botsayisi-", `${botSayi}`).replace("-kanalsayisi-", `${member.guild.channels.cache.size}`);
    await kanal.send(metin).catch(() => {});
  } catch {}
});

client.on("guildMemberAdd", (member) => {
  try {
    const kanalId = db.fetch(`kayıthg_${member.guild.id}`);
    if (!kanalId) return;
    const kanal = member.guild.channels.cache.get(kanalId);
    if (!kanal?.isTextBased()) return;
    const kayitci = db.fetch(`kayıtçırol_${member.guild.id}`);
    const klang = getGuildLang(member.guild.id);
    const aylar = klang === "en"
      ? { "01": "January", "02": "February", "03": "March", "04": "April", "05": "May", "06": "June", "07": "July", "08": "August", "09": "September", "10": "October", "11": "November", "12": "December" }
      : { "01": "Ocak", "02": "Şubat", "03": "Mart", "04": "Nisan", "05": "Mayıs", "06": "Haziran", "07": "Temmuz", "08": "Ağustos", "09": "Eylül", "10": "Ekim", "11": "Kasım", "12": "Aralık" };
    const moment = require("moment");
    require("moment-duration-format");
    const kurulus = Date.now() - member.user.createdAt.getTime();
    const ay = Number(moment.duration(kurulus).format("M")) || 0;
    const guven = ay < 1 ? (klang === "en" ? "**Suspicious**" : "**Şüpheli**") : (klang === "en" ? "**Trusted**" : "**Güvenilir**");
    const gifler = ["https://media.discordapp.net/attachments/744976703163728032/751451554132918323/tenor-1.gif"];
    const embed = new Discord.EmbedBuilder().setColor(0x36393F)
      .setImage(gifler[0])
      .setThumbnail(member.user.displayAvatarURL())
      .setDescription(klang === "en"
        ? `**Welcome!** ${member.user}, we are now **${member.guild.memberCount}** people!\nWrite your **name** and **age** to register.\nAccount created: **${moment(member.user.createdAt).format("DD")} ${aylar[moment(member.user.createdAt).format("MM")]} ${moment(member.user.createdAt).format("YYYY HH:mm:ss")}**\nThis account: ${guven}\n${kayitci ? `<@&${kayitci}>` : ""}`
        : `**Hoş geldin!** ${member.user}, seninle beraber **${member.guild.memberCount}** kişi olduk!\nKaydın için **isim** ve **yaş** yazman gerek.\nHesap kuruluş: **${moment(member.user.createdAt).format("DD")} ${aylar[moment(member.user.createdAt).format("MM")]} ${moment(member.user.createdAt).format("YYYY HH:mm:ss")}**\nBu hesap: ${guven}\n${kayitci ? `<@&${kayitci}>` : ""}`);
    kanal.send({ embeds: [embed] }).catch(() => {});
    if (kayitci) kanal.send(`<@&${kayitci}>`).catch(() => {});
  } catch {}
});

client.on("guildMemberAdd", async (member) => {
  try {
    const ayar = db.fetch(`raidkoruma_${member.guild.id}`);
    if (!ayar || ayar.durum !== "açık") return;
    const simdi = Date.now();
    const anahtar = `raid_${member.guild.id}`;
    const liste = (db.fetch(anahtar) || []).filter(t => simdi - t < 10000);
    liste.push(simdi);
    db.set(anahtar, liste);
    if (liste.length >= (ayar.esik || 5)) {
      const yas = simdi - member.user.createdAt.getTime();
      if (yas < 7 * 86400000) {
        if (ayar.rol && member.guild.roles.cache.get(ayar.rol)) {
          await member.roles.add(ayar.rol).catch(() => {});
        } else {
          await member.kick("Raid koruması").catch(() => {});
        }
        const lang = getGuildLang(member.guild.id);
        const kc = member.guild.systemChannel;
        if (kc?.isTextBased()) kc.send(t(lang, "raid.tespit")).catch(() => {});
      }
    }
  } catch {}
});

client.on("guildMemberUpdate", async (eski, yeni) => {
  try {
    const kanalId = db.fetch(`isimlog_${yeni.guild.id}`);
    if (!kanalId) return;
    if (eski.nickname === yeni.nickname) return;
    const kanal = yeni.guild.channels.cache.get(kanalId);
    if (!kanal?.isTextBased()) return;
    const lang = getGuildLang(yeni.guild.id);
    const e = new Discord.EmbedBuilder().setColor("Blue").setAuthor({ name: yeni.user.username, iconURL: yeni.user.displayAvatarURL() })
      .addFields(
        { name: lang === "en" ? "Old nickname" : "Eski isim", value: eski.nickname || "-" },
        { name: lang === "en" ? "New nickname" : "Yeni isim", value: yeni.nickname || "-" }
      ).setTimestamp();
    await kanal.send({ embeds: [e] }).catch(() => {});
  } catch {}
});

const tokenLeak = /[\w-]{24}\.[\w-]{6}\.[\w-]{27}/g;
client.on("warn", e => console.log(String(e).replace(tokenLeak, "[redacted]")));
client.on("error", e => console.log(String(e).replace(tokenLeak, "[redacted]")));
/* Hataları dosya:satır bilgisiyle logla — "InvalidNumber" gibi tek kelimelik mesajlar
   nerede olduğunu anlamayı imkânsızlaştırıyordu. */
const hataKokeni = (e) => {
  const kare = String(e?.stack || "")
    .split("\n")
    .map((l) => l.trim())
    .find((l) => /at .*(komutlar|events|ai|util|Helpers|bot\.js)/.test(l)) || "";
  const yer = (kare.match(/\(([^()]+:\d+:\d+)\)/) || kare.match(/at\s+(\S+:\d+:\d+)/) || [])[1] || "?";
  return yer.split(/[\\/]/).slice(-2).join("/");
};
const hataMetni = (e) => {
  const kod = e?.code ?? e?.errorCode;
  const baslik = `${e?.name || "Hata"}: ${e?.message || e}${kod != null ? ` (kod: ${kod})` : ""}`;
  return `${baslik}\n→ kaynak: ${hataKokeni(e)}\n\`\`\`\n${String(e?.stack || e).split("\n").slice(0, 8).join("\n").slice(0, 1200)}\n\`\`\``;
};
client.hataMetni = hataMetni;
process.on("unhandledRejection", (e) => console.error("[YAKALANMAYAN REJECTION]", hataKokeni(e), "|", e?.message || e, "\n", String(e?.stack || "").split("\n").slice(1, 5).join("\n")));
process.on("uncaughtException", (e) => console.error("[YAKALANMAYAN EXCEPTION]", hataKokeni(e), "|", e?.message || e, "\n", String(e?.stack || "").split("\n").slice(1, 8).join("\n")));

try {
  const cevaplarPath = path.join(__dirname, "cevaplar.json");
  if (fs.existsSync(cevaplarPath)) {
    fs.watch(cevaplarPath, (event) => {
      if (event === "change") {
        console.log("🔄 [AI] cevaplar.json değişti, yeniden yükleniyor...");
        try {
          delete require.cache[require.resolve("./ai/matcher")];
          delete require.cache[require.resolve("./ai/handler")];
          const { reloadMatcher } = require("./ai/handler");
          if (typeof reloadMatcher === "function") reloadMatcher();
          console.log("✅ [AI] Yeniden yüklendi");
        } catch (e) {
          console.error("❌ [AI] Reload hatası:", e.message);
        }
      }
    });
    console.log("📚 [AI] cevaplar.json izleniyor (hot reload aktif)");
  } else {
    console.warn("⚠️ [AI] cevaplar.json bulunamadı — hot reload kapalı");
  }
} catch (e) {
  console.warn("⚠️ [AI] Hot reload başlatılamadı:", e.message);
}

const discordToken = process.env.DISCORD_BOT_TOKEN || process.env.token;
if (!discordToken) {
  console.warn("[UYARI] .env içinde DISCORD_BOT_TOKEN yok.");
} else {
  client.login(discordToken).catch(err => console.error("Discord Login Hatası:", err.message));
}