/**
 * /api/rank/:id  —  site ve launcher icin rank ucu (SALT OKUNUR)
 *
 * GUVENLIK
 * --------
 *  - Yalnizca GET. Yazma ucu YOKTUR: rank sadece `r!rank ver` ile
 *    degisir. Boylece bot sirmi ele geciren biri bile HTTP'den rank
 *    dagitamaz (ayri bir yetki katmani gerekir).
 *  - `_botAuth` (x-bot-secret) ister: site disinda kimse erisemez.
 *  - Disari yalnizca { ok, rank, kullaniciAdi, avatar } cikar. Discord ID
 *    listesi, mod listesi, premium listesi, e-posta YOK.
 *  - Bilinmeyen ID -> hata degil, rank "user" (yetki yukseltmez).
 *
 * Bu dosya bot.js icinden `registerRankApi(app, { _botAuth, R })` ile
 * baglanir; bot.js'e 40 satir eklemek yerine modul olarak durur.
 */

module.exports = function registerRankApi(app, deps) {
  const { _botAuth, R } = deps;

  app.get("/api/rank/:id", _botAuth, async (req, res) => {
    try {
      const id = String(req.params.id || "").replace(/\D/g, "");
      if (!/^\d{15,25}$/.test(id)) {
        return res.status(400).json({ ok: false, error: "gecersiz id" });
      }

      const rank = R.rankAl(id);
      const { kullaniciAdi, avatar } = await R.profilBilgisi(
        req.app && req.app.locals ? req.app.locals.client : null,
        id
      );

      return res.status(200).json({
        ok: true,
        rank,
        kullaniciAdi,
        avatar
      });
    } catch (e) {
      // Hata detayi DISARI VERILMEZ (sizinti riski).
      console.error("[rank] hata:", e && e.message);
      return res.status(500).json({ ok: false, error: "sunucu hatasi" });
    }
  });

  console.log("[Rank] :/api/rank/:id hazir (salt okunur, x-bot-secret)");
};
