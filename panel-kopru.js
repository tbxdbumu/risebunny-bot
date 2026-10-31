/* ═══ RiseBunny PANEL KÖPRÜSÜ ══════════════════════════════════════════════
   Bu modül Minecraft projesinden BAĞIMSIZDIR. `bot.js` içindeki ekonomiyi,
   pelerinleri, petleri okumaz-yazmaz; yalnızca Discord kimliği, premium
   durumu ve panelin kendi "bağlı / günlük seri" kaydını yönetir.

   Veri kökü: `panel_<alan>` (croxydb anahtar uzayı). Başka bir projeye
   taşınacağında `db` enjekte edilir; modülün geri kalanı değişmez.
   CommonJS: bot `require` eder, kök `package.json`a `"type": "module"`
   eklemek gerekmez.

   Uçlar (`registerPanelApi(app, { db, client, _botAuth, premiumOf })`):

     GET  /api/panel/session/:id        → hesap kartı (RB site proxy'si kullanır)
     POST /api/panel/disconnect         → bağlılık + seri sıfırlama
     GET  /api/panel/avatars?limit=500  → hash → Discord kimliği (avatar proxy)
     GET  /api/public/avatar-owner/:hash → kartın `.avatar` alanından sahip bul

   Kimlik doğrulama: `_botAuth` (x-bot-secret). Panel doğrudan bu uçlara
   erişmez; her zaman `rb-fixed` proxy'sinden geçer. */

const DAY = 86400000;

function sanitizeId(v) {
  return String(v || "").replace(/\D/g, "").slice(0, 20);
}

/* Discord avatar adresi → yalnızca dosya adı (hash). CDN adresi kimliği
   içerdiği için panel tarafına ASLA ham adres verilmez. */
function avatarHashOf(url) {
  const m = /\/avatars\/\d+\/([a-z0-9_]+)\.(?:png|webp|gif|jpe?g)/i.exec(String(url || ""));
  if (m) return m[1];
  const s = String(url || "");
  return /^[a-z0-9_]{1,64}$/i.test(s) ? s : "";
}

function dayKey(ts = Date.now()) {
  return new Date(ts).toISOString().slice(0, 10);
}

function createPanel({ db, client, premiumOf }) {
  function recordOf(id) {
    const r = db.fetch(`panel_${id}`);
    return r && typeof r === "object" ? r : null;
  }

  function writeRecord(id, patch) {
    const now = Date.now();
    const prev = recordOf(id) || { firstSeen: now, streak: 0, days: 0 };
    const next = { ...prev, ...patch, lastSeen: now };
    db.set(`panel_${id}`, next);
    return next;
  }

  /* Günlük seri: aynı gün tekrar giriş seriyi artırmaz; ardışık gün +1,
     gün atlanırsa 1'e döner. */
  function touchStreak(id, username) {
    const rec = recordOf(id) || { firstSeen: Date.now(), streak: 0, days: 0 };
    const today = dayKey();
    if (rec.lastDay === today) {
      return writeRecord(id, { username: username || rec.username || "" });
    }
    const yesterday = dayKey(Date.now() - DAY);
    const streak = rec.lastDay === yesterday ? (Number(rec.streak) || 0) + 1 : 1;
    return writeRecord(id, {
      username: username || rec.username || "",
      lastDay: today,
      streak,
      days: (Number(rec.days) || 0) + 1,
    });
  }

  async function discordIdentity(id) {
    if (!client) return null;
    try {
      const u = client.users.cache.get(id) || (await client.users.fetch(id).catch(() => null));
      if (!u) return null;
      return {
        username: u.username || "",
        globalName: u.globalName || u.displayName || "",
        avatar: u.displayAvatarURL ? u.displayAvatarURL({ extension: "png", size: 128 }) : "",
      };
    } catch {
      return null;
    }
  }

  async function sessionCard(id) {
    const rec = touchStreak(id, "");
    const kimlik = await discordIdentity(id);
    let pre = { premium: false, daysLeft: 0, bitis: 0, role: "member", staff: false };
    try {
      if (typeof premiumOf === "function") {
        const p = await premiumOf(id);
        if (p && typeof p === "object") pre = { ...pre, ...p };
      }
    } catch { /* premium okunamadı: ücretsiz kabul */ }
    const role = String(db.fetch(`siterol_${id}`) || pre.role || "member");
    const hash = avatarHashOf(kimlik?.avatar);
    return {
      ok: true,
      id,
      username: kimlik?.username || rec.username || "",
      globalName: kimlik?.globalName || "",
      avatarHash: hash,
      avatarUrl: hash ? `/api/panel/avatar?h=${hash}` : `/api/panel/avatar?id=${id}`,
      premium: {
        active: !!pre.premium || pre.daysLeft === -1,
        daysLeft: pre.daysLeft === -1 ? -1 : Number(pre.daysLeft) || 0,
        paidUntil: pre.bitis ? new Date(Number(pre.bitis)).toISOString() : null,
        role,
        staff: role !== "member" || pre.daysLeft === -1,
      },
      stats: {
        firstSeen: rec.firstSeen,
        lastSeen: rec.lastSeen,
        streak: Number(rec.streak) || 0,
        days: Number(rec.days) || 0,
        lastDay: rec.lastDay || null,
      },
      at: Date.now(),
    };
  }

  function avatarIndex(limit = 500) {
    /* Discord önbelleğindeki kullanıcıların hash listesi. Panel avatar
       proxy'si bilinmeyen hash'lerde buraya düşer. */
    const items = [];
    if (!client) return items;
    for (const u of client.users.cache.values()) {
      const hash = avatarHashOf(u.displayAvatarURL ? u.displayAvatarURL({ extension: "png", size: 128 }) : "");
      if (!hash) continue;
      items.push({ discordId: u.id, avatarHash: hash });
      if (items.length >= limit) break;
    }
    return items;
  }

  function ownerOfHash(hash) {
    const h = String(hash || "");
    if (!/^[a-z0-9_]{1,64}$/i.test(h)) return "";
    if (!client) return "";
    for (const u of client.users.cache.values()) {
      const uh = avatarHashOf(u.displayAvatarURL ? u.displayAvatarURL({ extension: "png", size: 128 }) : "");
      if (uh === h) return u.id;
    }
    return "";
  }

  return { recordOf, writeRecord, touchStreak, sessionCard, avatarIndex, ownerOfHash, avatarHashOf };
}

function registerPanelApi(app, deps) {
  const { db, client, _botAuth, premiumOf, expressJson } = deps;
  const P = createPanel({ db, client, premiumOf });
  const json = typeof expressJson === "function" ? expressJson() : null;

  app.get("/api/panel/session/:id", _botAuth, async (req, res) => {
    const id = sanitizeId(req.params.id);
    if (!id) return res.status(400).json({ error: "geçersiz id" });
    try {
      res.json(await P.sessionCard(id));
    } catch (e) {
      res.status(500).json({ error: "hata", detail: String(e?.message || "") });
    }
  });

  app.post("/api/panel/disconnect", _botAuth, ...(json ? [json] : []), (req, res) => {
    /* Kimlik hem gövdeden hem route parametresinden kabul edilir:
       proxy `POST /api/panel/disconnect?userId=<id>` de, bot-içi çağrı
       `POST /api/panel/disconnect/<id>` de çalışır. */
    const id = sanitizeId(req.params?.id || req.body?.userId || req.query?.userId);
    if (!id) {
      return res.json({ ok: false, error: "geçersiz id" });
    }
    db.delete(`panel_${id}`);
    return res.json({ ok: true, id });
  });

  app.get("/api/panel/avatars", _botAuth, (req, res) => {
    const limit = Math.min(1000, Math.max(1, Number(req.query?.limit) || 500));
    res.json({ ok: true, items: P.avatarIndex(limit) });
  });

  app.get("/api/public/avatar-owner/:hash", (req, res) => {
    const id = P.ownerOfHash(req.params.hash);
    if (!id) return res.status(404).json({ ok: false });
    res.json({ ok: true, discordId: id });
  });

  /* Bot her açılışta panelin günlük serisini "sıcak" tutar: kimse giriş
     yapmasa da kayıt var olur. Panelin gördüğü alanlar `panelSession` ile
     birebir aynıdır. */
  async function warm(id) {
    const rec = P.recordOf(id);
    if (!rec) P.writeRecord(id, { streak: 0, days: 0 });
  }

  return { ...P, warm };
}

module.exports = registerPanelApi;
module.exports.registerPanelApi = registerPanelApi;
module.exports.createPanel = createPanel;
