/**
 * rank.js hedef cozumleme testi — GERCEK modul uzerinde.
 *
 * NEDEN: "node --check" yalnizca sozdizimi dogrular. Kullanici istegi
 * "rank komutuna kullanici adi/tag yazilabilsin" idi; bunun gercekten
 * calistigini ve TEHLIKELI durumda (birden fazla kisi eslesirse) rank
 * VERMEDIGINI olcmek gerekiyor.
 *
 * Olculen iddialar:
 *   1) `@mention` ve ciplak ID eski gibi calisir (geriye uyumluluk)
 *   2) kullanici adi ("ahmetbs") hedefi cozer
 *   3) gorunen ad ("Ahmet BS") cozer
 *   4) tag bicimi ("ahmetbs#6079") cozer
 *   5) `@ahmetbs` (Discord mention'i olmayan @onek) cozer
 *   6) onek eslesmesi YALNIZCA tek aday varsa kabul edilir
 *   7) birden fazla aday -> rank VERILMEZ, adaylar listelenir
 *   8) hicbir aday yok -> "Bulunamadi" (sessiz basari YOK)
 *   9) bot hesaplari hedef olamaz
 *
 * Calistirma: node tools/rank-komut-test.js
 * Cikis kodu 0 = tum olcumler gecti.
 */

const path = require("path");
const Module = require("module");

/* ── Sahte bagimliliklar ────────────────────────────────────────────────
 * rank.js discord.js EmbedBuilder, ../utils (SAHIP_ID, ownerLog) ve
 * ../Helpers/rankler istiyor. Bunlari bellege yaziyoruz; diskteki gercek
 * modul yuklenmiyor (bot tokeni/CDN erisimi gerekmesin). */

class EmbedBuilder {
  constructor() {
    this.data = {};
  }
  setColor(c) {
    this.data.color = c;
    return this;
  }
  setTitle(t) {
    this.data.title = t;
    return this;
  }
  setDescription(d) {
    this.data.description = d;
    return this;
  }
  setFooter(f) {
    this.data.footer = f;
    return this;
  }
}

const orijinalYukle = Module._load;
const RANK_DEFTER = new Map();

Module._load = function (istek, ust, ana) {
  if (istek === "discord.js") return { EmbedBuilder };
  if (istek === "../utils") {
    return {
      SAHIP_ID: "999000000000000001",
      ownerLog: async () => {},
    };
  }
  if (istek === "../Helpers/rankler") {
    return {
      GECERLI: ["owner", "admin", "moderator", "youtuber", "user"],
      normalize(x) {
        const t = String(x || "").trim().toLowerCase();
        if (t === "mod") return "moderator";
        if (t === "yt") return "youtuber";
        return this.GECERLI.includes(t) ? t : "";
      },
      etiket(r) {
        if (r === "owner") return "Owner";
        if (r === "admin") return "Admin";
        if (r === "moderator") return "Moderator";
        if (r === "youtuber") return "Youtuber";
        return "";
      },
      rengi: () => 0xffcc00,
      rankAl: (id) => RANK_DEFTER.get(id) || "user",
      rankVer: (id, r) => {
        RANK_DEFTER.set(id, r);
        return true;
      },
      rankSil: (id) => RANK_DEFTER.delete(id),
      rankListesi: () =>
        [...RANK_DEFTER.entries()].map(([id, rank]) => ({ id, rank })),
    };
  }
  if (istek === "../ai/executor") {
    return { isMod: (id) => id === "999000000000000002" };
  }
  return orijinalYukle.call(this, istek, ust, ana);
};

const rankKomut = require(path.join(__dirname, "..", "komutlar", "rank.js"));

/* ── Sahte Discord nesneleri ──────────────────────────────────────────── */

function uye(id, username, globalName, displayName) {
  return {
    id,
    user: { id, username, globalName: globalName || null, bot: false },
    displayName: displayName || username,
  };
}

const UYELER = [
  uye("111000000000000001", "ahmetbs", "Ahmet BS"),
  uye("111000000000000002", "ahmetpro", null),
  uye("111000000000000003", "ahmetkral", null),
  uye("111000000000000004", "zeynep", "Zeynep", "Zeynep"),
  uye("111000000000000005", "bothesap", null),
];
UYELER[4].user.bot = true;

function koleksiyon(liste) {
  const c = new Map(liste.map((u) => [u.id, u]));
  return {
    size: c.size,
    filter: (fn) => koleksiyon([...c.values()].filter(fn)),
    first: () => [...c.values()][0],
    values: () => c.values(),
    [Symbol.iterator]: () => c.values(),
  };
}

function sahteMesaj(metin, yazarId) {
  const kelimeler = metin.split(/\s+/).filter(Boolean);
  return {
    content: metin,
    author: { id: yazarId || "999000000000000001", tag: "ahmetbs#6079" },
    mentions: { users: new Map() },
    guild: {
      members: {
        cache: koleksiyon(UYELER),
        fetch: async () => koleksiyon(UYELER),
      },
    },
    replies: [],
    reply(govde) {
      this.replies.push(govde);
      return Promise.resolve();
    },
  };
}

/** Komutu calistir; donen mesaj metnini topla. */
async function calistir(metin, yazarId) {
  const m = sahteMesaj(metin, yazarId);
  const args = metin.split(/\s+/).slice(1);
  await rankKomut.run(null, m, args);
  await new Promise((r) => setTimeout(r, 30));
  return m.replies
    .map((r) => {
      if (typeof r === "string") return r;
      const e = (r && r.embeds && r.embeds[0]) || null;
      if (!e) return "";
      const d = e.data || {};
      return [d.title, d.description].filter(Boolean).join(" | ");
    })
    .join(" ");
}

let hata = [];
function olc(ad, kosul, ayrinti) {
  if (kosul) {
    console.log("  " + ad.padEnd(58) + " OK");
  } else {
    console.log("  " + ad.padEnd(58) + " HATA");
    hata.push(ad + (ayrinti ? " -> " + ayrinti : ""));
  }
}

async function main() {
  process.env.RB_TEST = "1";

  console.log("=== 1) Geriye uyumluluk: mention + ciplak ID ===");
  let s = await calistir("r!rank kim 111000000000000004");
  olc("ciplak ID cozuldu", s.includes("111000000000000004"), s);
  s = await calistir("r!rank kim <@111000000000000004>");
  olc("mention cozuldu", s.includes("111000000000000004"), s);

  console.log("\n=== 2) Kullanici adi ile hedef ===");
  s = await calistir("r!rank kim zeynep");
  olc("username 'zeynep' cozuldu", s.includes("111000000000000004"), s);

  console.log("\n=== 3) Gorunen ad ile hedef ===");
  s = await calistir("r!rank kim Ahmet BS");
  olc("gorunen ad 'Ahmet BS' cozuldu", s.includes("111000000000000001"), s);

  console.log("\n=== 4) Tag bicimi ===");
  s = await calistir("r!rank kim zeynep#1234");
  olc("'zeynep#1234' cozuldu", s.includes("111000000000000004"), s);

  console.log("\n=== 5) @onek bicimi ===");
  s = await calistir("r!rank kim @zeynep");
  olc("'@zeynep' cozuldu", s.includes("111000000000000004"), s);

  console.log("\n=== 6) Onek eslesmesi: TEK aday -> kabul ===");
  s = await calistir("r!rank kim zey");
  olc("'zey' -> tek aday kabul", s.includes("111000000000000004"), s);

  console.log("\n=== 7) Coklu eslesme -> rank VERILMEZ ===");
  RANK_DEFTER.clear();
  s = await calistir("r!rank ver ahmet admin");
  olc("'ahmet' birden fazla -> rank verilmedi", RANK_DEFTER.size === 0, s);
  olc("adaylar listelendi", s.includes("Birden fazla kisi esledi"), s);
  olc("ilk 5 aday gosterildi", s.includes("111000000000000"), s);

  console.log("\n=== 8) Bulunamayan ad sessizce basarili olmuyor ===");
  RANK_DEFTER.clear();
  s = await calistir("r!rank ver boyleksiyok admin");
  olc("bulunamadi -> rank verilmedi", RANK_DEFTER.size === 0, s);
  olc("'Bulunamadi' yazdi", s.includes("Bulunamadi"), s);

  console.log("\n=== 9) Bot hesabi hedef olamaz ===");
  RANK_DEFTER.clear();
  s = await calistir("r!rank ver bothesap admin");
  olc("bot hesabina rank verilmedi", !RANK_DEFTER.has("111000000000000005"), s);

  console.log("\n=== 10) Tek ad ile rank verme ===");
  RANK_DEFTER.clear();
  s = await calistir("r!rank ver zeynep youtuber");
  olc("username ile rank verildi", RANK_DEFTER.get("111000000000000004") === "youtuber", s);

  console.log("\n=== 11) Yetki: bot moderatoru kullanabiliyor ===");
  RANK_DEFTER.clear();
  s = await calistir("r!rank ver zeynep mod", "999000000000000002");
  olc(
    "mod 'mod' -> moderator",
    RANK_DEFTER.get("111000000000000004") === "moderator",
    s
  );

  console.log("\n=== 12) Yetki: yetkisiz kisi kullanamaz ===");
  RANK_DEFTER.clear();
  s = await calistir("r!rank ver zeynep owner", "555000000000000001");
  olc("yetkisiz reddedildi", RANK_DEFTER.size === 0, s);
  olc(
    "mesaj dogru",
    s.includes("yalnizca bot sahibi ve bot moderatorleri"),
    s
  );

  console.log("\n=== 13) al (sil) kullanici adiyla ===");
  RANK_DEFTER.clear();
  RANK_DEFTER.set("111000000000000004", "admin");
  await calistir("r!rank al zeynep");
  olc("username ile rank silindi", !RANK_DEFTER.has("111000000000000004"));

  console.log("\n=== 14) Sunucusuz (DM) baglam: patlamamali ===");
  {
    const m = sahteMesaj("r!rank kim zeynep");
    m.guild = null;
    m.replies = [];
    let patladi = null;
    try {
      await rankKomut.run(null, m, ["kim", "zeynep"]);
      await new Promise((r) => setTimeout(r, 20));
    } catch (e) {
      patladi = e;
    }
    olc("guild yokken patlamiyor", patladi === null, patladi && patladi.message);
    /**/ if (patladi) {
      // eslint-disable-next-line no-undef
      process.exitCode = 1;
    }
  }

  if (hata.length) {
    console.log("\nSONUC: HATA (" + hata.length + ")");
    for (const h of hata) console.log("  - " + h);
    process.exit(1);
  }
  console.log("\nSONUC: TEMIZ - kullanici adi/tag/gorunen ad hedefleri cozuluyor,");
  console.log("         belirsizlikte rank VERILMIYOR");
}

main().catch((e) => {
  console.error("TEST PATLADI:", e);
  process.exit(1);
});
