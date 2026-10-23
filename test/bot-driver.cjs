
const Module = require("module");
const path = require("path");

// ── stub'lar ────────────────────────────────────────────────────────────
const BOT_YOLU = require("path").resolve(__dirname, "..", "bot.js");
const kayitlar = {};
function db() {
  const h = {
    _d: {},
    get(k) { return this._d[k]; },
    set(k, v) { this._d[k] = v; return v; },
    delete(k) { delete this._d[k]; },
    has(k) { return k in this._d; },
    all() { return Object.keys(this._d).map(k => ({ id: k, value: this._d[k] })); },
    push(k, v) { (this._d[k] = this._d[k] || []).push(v); return v; },
    add(k, v) { return this.push(k, v); },
  };
  return new Proxy(h, {
    get(t, p) { return p in t ? t[p] : (t._d[p] !== undefined ? t._d[p] : undefined); },
    set(t, p, v) { t._d[p] = v; return true; },
  });
}

const store = db();
const sahte = {
  "dotenv": { config() {} },
  "croxydb": {
    get: (k, d) => (k in store._d ? store._d[k] : d),
    set: (k, v) => { store._d[k] = v; return v; },
    delete: (k) => { delete store._d[k]; },
    has: (k) => k in store._d,
    all: () => Object.keys(store._d).map(k => ({ ID: k, data: store._d[k] })),
  },
  "./firestore-db": { install() {} },
  "@napi-rs/canvas": new Proxy({}, { get: () => () => ({ getContext: () => new Proxy({}, { get: () => () => {} }) }) }),
  "./dil": { t: (k) => k, getLangSync: () => "tr", getGuildLang: () => "tr" },
  "./utils": new Proxy({}, { get: () => () => {} }),
  "./util/eventLoader.js": () => {},
  "cors": () => (req, res, next) => next(),
  "dotenv/config": {},
  "moment": () => ({ format: () => "", fromNow: () => "", unix: () => 0 }),
  "moment-duration-format": {},
  "discord-giveaways": { GiveawaysManager: class {} },
  "@top-gg/sdk": { Api: class {} },
  "./ai/handler": { reloadMatcher: () => {} },
  "./util/iletisim": new Proxy({}, { get: () => () => ({ catch: () => {} }) }),
  "./isimler.json": [],
  "./komutlar/config.js": { _helpers: {
    tumConfigler: () => (store._d["rb_configler"] = store._d["rb_configler"] || []),
    kaydetListe: (l) => { store._d["rb_configler"] = l; },
    cfgOnayaGonder: async () => null,
    yeniId: () => String(Date.now()),
  } },
  "./komutlar/girisrol": { ruletOynat: () => {} },
};

const eskiRequire = Module.prototype.require;
const uclar = [];
Module.prototype.require = function (ad) {
  if (ad in sahte) return sahte[ad];
  // bilinmeyen yerel dosya -> bos proxy
  if (ad.startsWith("./") || ad.startsWith("../")) {
    try { return eskiRequire.call(this, ad); } catch (e) { return new Proxy({}, { get: () => () => {} }); }
  }
  try { return eskiRequire.call(this, ad); } catch (e) { return new Proxy({}, { get: () => () => {} }); }
};

// ── express stub: route'lari yakala ─────────────────────────────────────
function express() {
  const app = function () {};
  app.use = () => app;
  const yonlendir = (m) => (yol, ...isleyiciler) => {
    if (typeof yol === "string") uclar.push({ m, yol, isleyiciler });
    return app;
  };
  app.get = yonlendir("GET");
  app.post = yonlendir("POST");
  app.put = yonlendir("PUT");
  app.delete = yonlendir("DELETE");
  app.listen = () => ({ close() {} });
  app.set = () => app;
  app.engine = () => app;
  app.Router = () => app;
  return app;
}
express.json = () => (req, res, next) => next();
express.urlencoded = () => (req, res, next) => next();
express.static = () => (req, res, next) => next();
express.Router = () => express();
sahte["express"] = express;

// discord.js stub
const djs = {
  Client: class {
    constructor() { this.user = { id: "999", tag: "bot#0001", setActivity() {}, setPresence() {} }; }
    on() { return this; }
    once() { return this; }
    login() { return Promise.resolve(); }
    users = { cache: new Map(), fetch: async (id) => ({ id, username: "hedef_" + id, tag: "hedef_" + id + "#0001", bot: false, displayAvatarURL: () => "https://cdn/" + id + ".png", send: async () => {} }) };
    guilds = { cache: new Map(), fetch: async () => null };
    channels = { cache: new Map(), fetch: async () => null };
  },
  GatewayIntentBits: new Proxy({}, { get: () => 1 }),
  Partials: new Proxy({}, { get: () => 1 }),
  Collection: class extends Map {},
  EmbedBuilder: class { setColor() { return this; } setTitle() { return this; } setDescription() { return this; } setFooter() { return this; } setAuthor() { return this; } addFields() { return this; } setThumbnail() { return this; } setImage() { return this; } setTimestamp() { return this; } },
  ActionRowBuilder: class { addComponents() { return this; } },
  ButtonBuilder: class { setCustomId() { return this; } setLabel() { return this; } setStyle() { return this; } setEmoji() { return this; } },
  StringSelectMenuBuilder: class { setCustomId() { return this; } setPlaceholder() { return this; } addOptions() { return this; } },
  Events: new Proxy({}, { get: () => "e" }),
  PermissionsBitField: class { static Flags = new Proxy({}, { get: () => 1n }); has() { return true; } },
  ChannelType: new Proxy({}, { get: () => 1 }),
  ActivityType: new Proxy({}, { get: () => 1 }),
  REST: class { setToken() { return this; } },
  Routes: new Proxy({}, { get: () => () => "" }),
  SlashCommandBuilder: class { setName() { return this; } setDescription() { return this; } addStringOption() { return this; } addIntegerOption() { return this; } addUserOption() { return this; } addBooleanOption() { return this; } },
  MessageFlags: new Proxy({}, { get: () => 1 }),
};
sahte["discord.js"] = djs;

// ── ekspres app'i yakalamak icin preload yukle ──────────────────────────
try {
  require(BOT_YOLU);
} catch (e) {
  console.log("BOOT_HATA:" + (e && e.message));
}

// ── calistirici ─────────────────────────────────────────────────────────
function cagir(m, yol, govde, sorgu, zenginlestir) {
  const u = uclar.find(x => x.m === m && x.yol === yol);
  if (!u) return { bulunamadi: true, yol, m, bilinen: uclar.map(x => x.m + " " + x.yol) };
  return new Promise((coz) => {
    let req = { body: govde || {}, query: sorgu || {}, params: {}, headers: {}, method: m, get: () => undefined };
    if (typeof zenginlestir === "function") req = zenginlestir(req) || req;
    let durum = 200;
    const res = {
      status(k) { durum = k; return res; },
      json(g) { coz({ durum, govde: g }); return res; },
      send(g) { coz({ durum, govde: g }); return res; },
      end() { coz({ durum, govde: null }); return res; },
      setHeader() {}, type() { return res; }, redirect() { return res; },
    };
    const hepsi = u.isleyiciler.flat();
    let i = 0;
    const next = async (hata) => {
      if (hata) return coz({ durum: 500, govde: String(hata && hata.message || hata) });
      const h = hepsi[i++];
      if (!h) return coz({ durum: 404, govde: "isleyici yok" });
      try { await h(req, res, next); } catch (e) { coz({ durum: 500, govde: String(e && e.message || e) }); }
    };
    next();
  });
}

module.exports = { cagir, store, uclar };
