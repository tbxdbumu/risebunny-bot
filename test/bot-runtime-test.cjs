const crypto = require("crypto");

process.env.TICKET_SECRET = process.env.TICKET_SECRET || "test-secret-abc123";
process.env.BOT_API_SECRET = process.env.BOT_API_SECRET || "";

const d = require(require("path").resolve(__dirname, "bot-driver.cjs"));

const SIR = process.env.TICKET_SECRET;
const KULLANICI = "985126554306773063";
const HEDEF = "111222333444555666";

function bilet(id) {
  const exp = Date.now() + 3600 * 1000;
  const imza = crypto.createHmac("sha256", SIR).update(`${id}.${exp}`).digest("hex");
  return `${id}.${exp}.${imza}`;
}

function saglayici(discordId) {
  return (req) => {
    const b = `Bearer ${bilet(discordId)}`;
    req.get = (ad) => (String(ad).toLowerCase() === "authorization" ? b : undefined);
    req.headers = { authorization: b };
    return req;
  };
}

(async () => {
  const sonuc = [];
  const ekle = (ad, ok, detay) => {
    sonuc.push({ ad, ok, detay: detay === undefined ? "" : String(detay).slice(0, 220) });
  };
  const cagir = (m, yol, govde, id) =>
    d.cagir(m, yol, govde, {}, saglayici(id || KULLANICI));

  console.log("  yakalanan uc: " + d.uclar.length);
  ekle("T0 bot.js yuklendi, uclar yakalandi", d.uclar.length > 30, d.uclar.length + " uc");

  // ── gercek config kaydi olustur (route degil, DB'ye dogrudan) ────────
  const CONFIG_ID = "123456789012345678";
  const ILK = Buffer.from("ILK-ICERIK-AAAAA").toString("base64");
  d.store._d["rb_configler"] = [{
    id: CONFIG_ID, discordId: KULLANICI, username: "ahmetbs", avatar: "",
    ad: "eski-ad", not: "eski-aciklama", boyut: 17, icerik: ILK,
    durum: "approved", sebep: "", at: Date.now(), onaylayan: "bot",
    oylar: [], indirme: 0, logChannelId: "", logMessageId: "",
  }];

  // ── T1: edit GERCEKTEN icerik yaziyor mu ────────────────────────────
  const YENI = Buffer.from("YENI-ICERIK-BBBBB-9876543210").toString("base64");
  const r1 = await cagir("POST", "/api/public/edit", {
    discordId: KULLANICI, configId: CONFIG_ID,
    name: "yeni-ad", description: "yeni-aciklama", data: YENI,
  });
  const kayit = (d.store._d["rb_configler"] || []).find(c => c.id === CONFIG_ID) || {};
  ekle("T1a edit 200 donuyor", r1.durum === 200,
    `durum=${r1.durum} govde=${JSON.stringify(r1.govde)}`);
  ekle("T1b yanitta icerikYazildi=true", !!(r1.govde && r1.govde.icerikYazildi),
    JSON.stringify(r1.govde));
  ekle("T1c DB'deki icerik GERCEKTEN degisti", kayit.icerik === YENI,
    `db=${String(kayit.icerik).slice(0, 30)} beklenen=${YENI.slice(0, 30)}`);
  ekle("T1d boyut guncellendi", Number(kayit.boyut) === YENI.length,
    `boyut=${kayit.boyut} beklenen=${YENI.length}`);
  ekle("T1e ad/aciklama guncellendi", kayit.ad === "yeni-ad" && kayit.not === "yeni-aciklama",
    `ad=${kayit.ad} not=${kayit.not}`);
  ekle("T1f guncelleyen yazildi", kayit.guncelleyen === KULLANICI, `guncelleyen=${kayit.guncelleyen}`);

  // ── T2: data yoksa icerik BOZULMUYOR mu ─────────────────────────────
  const r2 = await cagir("POST", "/api/public/edit", {
    discordId: KULLANICI, configId: CONFIG_ID, name: "sadece-ad",
  });
  const kayit2 = (d.store._d["rb_configler"] || []).find(c => c.id === CONFIG_ID) || {};
  ekle("T2a data yoksa 200", r2.durum === 200, `durum=${r2.durum}`);
  ekle("T2b data yoksa icerikYazildi=false", r2.govde && r2.govde.icerikYazildi === false,
    JSON.stringify(r2.govde));
  ekle("T2c data yoksa ICERIK AYNEN KALDI", kayit2.icerik === YENI,
    `db=${String(kayit2.icerik).slice(0, 30)}`);

  // ── T3: bozuk base64 -> 400, icerik bozulmuyor ──────────────────────
  const r3 = await cagir("POST", "/api/public/edit", {
    discordId: KULLANICI, configId: CONFIG_ID, name: "x", data: "!!!base64 degil!!!",
  });
  const kayit3 = (d.store._d["rb_configler"] || []).find(c => c.id === CONFIG_ID) || {};
  ekle("T3a bozuk base64 -> 400", r3.durum === 400, `durum=${r3.durum} govde=${JSON.stringify(r3.govde)}`);
  ekle("T3b bozuk base64 icerige dokunmadi", kayit3.icerik === YENI,
    `db=${String(kayit3.icerik).slice(0, 30)}`);

  // ── T3c: baska kullanicinin configini duzenleyemiyor ────────────────
  const BASKA = "444555666777888999";
  const r3c = await cagir("POST", "/api/public/edit", {
    discordId: BASKA, configId: CONFIG_ID, name: "ele gecir",
  }, BASKA);
  ekle("T3c baska kullanici duzenleyemiyor (403/404)", r3c.durum === 403 || r3c.durum === 404,
    `durum=${r3c.durum} govde=${JSON.stringify(r3c.govde)}`);

  // ── T4: friends/request kayitsiz hedef ──────────────────────────────
  const r4 = await cagir("POST", "/api/friends/request", { from: KULLANICI, to: HEDEF });
  ekle("T4a friends/request kayitsiz hedefte 404 VERMIYOR", r4.durum !== 404,
    `durum=${r4.durum} govde=${JSON.stringify(r4.govde)}`);
  const aliciIstekleri = d.store._d[`arkadas_istek_${HEDEF}`] || [];
  ekle("T4b alicinin istek listesine yazildi", aliciIstekleri.some(x => String(x.from) === KULLANICI),
    JSON.stringify(aliciIstekleri).slice(0, 160));
  const giden = d.store._d[`arkadas_giden_${KULLANICI}`] || [];
  ekle("T4c gonderenin giden listesine yazildi", giden.some(x => String(x.id) === HEDEF),
    JSON.stringify(giden).slice(0, 160));
  /* bu düzeltmenin asıl kanıtı: hedefin etiketi oluştu mu (kabul eden taraf
     arkadaş listesinde ID değil isim görsün) */
  ekle("T4d hedefin rbetiket kaydi olustu (isim gorunecek)",
    !!d.store._d[`rbetiket_${HEDEF}`],
    JSON.stringify(d.store._d[`rbetiket_${HEDEF}`] || null).slice(0, 160));

  // ── T5: cancel yalnizca hedefi siliyor ─────────────────────────────
  const DIGERI = "777888999000111222";
  d.store._d[`arkadas_giden_${KULLANICI}`] = [
    { id: HEDEF, tag: "a#1", at: 1 },
    { id: DIGERI, tag: "b#2", at: 2 },
  ];
  const r5 = await cagir("POST", "/api/friends/cancel", { discordId: KULLANICI, to: HEDEF });
  const kalan = d.store._d[`arkadas_giden_${KULLANICI}`] || [];
  ekle("T5a cancel 200", r5.durum === 200, `durum=${r5.durum} govde=${JSON.stringify(r5.govde)}`);
  ekle("T5b hedef silindi", !kalan.some(x => String(x.id) === HEDEF), JSON.stringify(kalan));
  ekle("T5c DIGER giden istek KORUNDU (eski hata: hepsi siliniyordu)",
    kalan.some(x => String(x.id) === DIGERI), JSON.stringify(kalan));

  // ── T6: party/invite kayitsiz hedef ────────────────────────────────
  const r6 = await cagir("POST", "/api/party/invite", { discordId: KULLANICI, to: HEDEF });
  ekle("T6a party/invite kayitsiz hedefte 404 VERMIYOR", r6.durum !== 404,
    `durum=${r6.durum} govde=${JSON.stringify(r6.govde)}`);

  // ── rapor ───────────────────────────────────────────────────────────
  console.log("");
  let ok = 0;
  for (const s of sonuc) {
    console.log(`  [${s.ok ? "OK " : "YOK"}] ${s.ad}`);
    if (!s.ok) console.log(`        ${s.detay}`);
    if (s.ok) ok++;
  }
  console.log("");
  console.log(`  SONUC: ${ok}/${sonuc.length}`);
  process.exit(ok === sonuc.length ? 0 : 1);
})();
