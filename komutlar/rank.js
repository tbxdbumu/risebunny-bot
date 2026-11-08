/**
 * r!rank — Owner / Admin / Moderator / Youtuber / User
 *
 * KULLANIM
 *   r!rank ver @kullanici owner|admin|mod|youtuber|user   (coklu hedef olur)
 *   r!rank al @kullanici
 *   r!rank liste
 *   r!rank kim @kullanici|<id>
 *   r!rank yardim
 *
 * YETKI (kullanici talebi): botun MODERATORLERI + bot SAHIBI.
 * Discord sunucu sahibi veya sunucu moderatoru BU KOMUTU KULLANAMAZ;
 * yetki sunucudaki role gore DEGIL, botun kendi `modlar` listesine
 * (`ai/executor.isMod`) ve `SAHIP_ID`ye gore verilir.
 *
 * Rank yalnizca GORSELDIR: hicbir yetki/erisim karari rank'e baglanmaz.
 * Tek istisna bu komutun kendisi — o da rank'e degil, yukaridaki listeye
 * bakar.
 */

const { EmbedBuilder } = require("discord.js");
const { SAHIP_ID, ownerLog } = require("../utils");
const R = require("../Helpers/rankler");

/** Bot yetkilisi mi? (sahip veya bot moderatori) */
function yetkiliMi(userId) {
  const id = String(userId || "");
  if (!id) return false;
  if (id === String(SAHIP_ID)) return true;
  try {
    const { isMod } = require("../ai/executor");
    return isMod(id);
  } catch {
    return false;
  }
}

/**
 * Discord etiketini normalize eder: kucuk harf, `@` ve `#discriminator` atilir.
 * "AhmetBS#6079" -> "ahmetbs", "@ahmetbs" -> "ahmetbs"
 */
function etiketNormal(ham) {
  return String(ham || "")
    .trim()
    .toLowerCase()
    .replace(/^@/, "")
    .replace(/#\d{1,4}$/, "")
    .trim();
}

/**
 * Sunucudaki uyeleri ad / kullanici adi / gorunen ad ile eslestirir.
 *
 * NEDEN: kullanici istegi "rank komutuna kullanici adi/tag yazilabilsin".
 * Once yalnizca `@mention` ve ciplak ID kabul ediliyordu; kullanici
 * `r!rank kim ahmetbs` yazinca "Kullanim: r!rank kim @kisi" aliyordu.
 *
 * Eslesme SIRA ile kesinlestirilir (belirsizlik sessiz yanlis kisiye rank
 * vermekten cok daha kotudur):
 *   1) birebir kullanici adi (username)
 *   2) birebir gorunen ad (globalName / displayName)
 *   3) tek bir onek eslesmesi (en az 3 karakter) -> yalnizca TEK aday varsa
 * Belirsizlik/ birden fazla aday -> eslestirme YOK, cagirana rapor edilir.
 *
 * Sunucu uyesi onbellekte yoksa once `members.fetch` denenir; bu basarisiz
 * olursa komut yine calisir (mention/ID yolu her zaman acik).
 */
async function uyeleriCoz(message, kelimeler) {
  const sonuc = { idler: [], eslesmeyen: [], belirsiz: [] };
  const kalan = [];
  for (const ham of kelimeler) {
    const temiz = String(ham).replace(/[<@!>]/g, "");
    if (/^\d{15,25}$/.test(temiz)) {
      sonuc.idler.push(temiz);
      continue;
    }
    kalan.push(String(ham));
  }
  if (!kalan.length || !message.guild) return { ...sonuc, kalan };

  let uyeler = message.guild.members.cache;
  try {
    // Onbellek kucukse sunucudan cek (buyuk sunucularda hepsi gelmez ama
    // gorunur kisim yeterli; hedef `@mention` ile her zaman verilebilir).
    if (uyeler.size < 50) {
      await message.guild.members.fetch({ limit: 1000 });
    }
  } catch {}

  for (const ham of kalan) {
    const aranan = etiketNormal(ham);
    if (aranan.length < 2) {
      sonuc.eslesmeyen.push(ham);
      continue;
    }
    const birebir = uyeler.filter(m => {
      if (m.user.bot) return false;
      const un = etiketNormal(m.user.username);
      const gn = etiketNormal(m.user.globalName || "");
      const dn = etiketNormal(m.displayName || "");
      return aranan === un || aranan === gn || aranan === dn;
    });
    if (birebir.size === 1) {
      sonuc.idler.push(birebir.first().id);
      continue;
    }
    if (birebir.size > 1) {
      sonuc.belirsiz.push(
        `${ham} -> ${birebir.map(m => `<@${m.id}>`).join(", ")}`
      );
      continue;
    }
    if (aranan.length >= 3) {
      const onek = uyeler.filter(m => {
        if (m.user.bot) return false;
        return (
          etiketNormal(m.user.username).startsWith(aranan) ||
          etiketNormal(m.displayName || "").startsWith(aranan)
        );
      });
      if (onek.size === 1) {
        sonuc.idler.push(onek.first().id);
        continue;
      }
      if (onek.size > 1) {
        // Cok fazla eslesme: kullaniciya ilk 5 adayi goster, otomatik secme.
        const ilk = [...onek.values()].slice(0, 5);
        sonuc.belirsiz.push(
          `${ham} -> ${ilk.map(m => `<@${m.id}>`).join(", ")}` +
            (onek.size > 5 ? ` (+${onek.size - 5})` : "")
        );
        continue;
      }
    }
    sonuc.eslesmeyen.push(ham);
  }
  return { ...sonuc, kalan: [] };
}

/** Eski senkron yol (mention + ID). Testler ve geriye uyumluluk icin duruyor. */
function hedefleriCikar(message, args) {
  const idler = new Set();
  message.mentions.users.forEach(u => {
    if (!u.bot) idler.add(u.id);
  });
  for (const a of args) {
    const id = String(a).replace(/[<@!>]/g, "");
    if (/^\d{15,25}$/.test(id)) idler.add(id);
  }
  return [...idler];
}

/** Eslesme sorunlarini tek satirla ozetler; sorun yoksa "". */
function sorunOzeti(cozum) {
  const s = [];
  if (cozum.eslesmeyen.length) {
    s.push("Bulunamadi: `" + cozum.eslesmeyen.join("`, `") + "`");
  }
  if (cozum.belirsiz.length) {
    s.push("Birden fazla kisi esledi (tam ad veya `@etiket` yaz):");
    s.push(cozum.belirsiz.map(x => `> ${x}`).join("\n"));
  }
  return s.join("\n");
}

/** Argumanlardan rank kelimesini cikar (ID/mention haric). */
function rankKelimesi(args) {
  for (const a of args) {
    const ham = String(a).replace(/[<@!>]/g, "");
    if (/^\d{15,25}$/.test(ham)) continue;
    const n = R.normalize(a);
    if (n) return n;
  }
  return "";
}

module.exports = {
  ad: "rank",
  aliases: ["ranklar", "rutbe"],
  aciklama: "Owner/Admin/Mod/Youtuber/User rank ver (bot yetkilisi)",

  /* DİKKAT — bot.js yükleyici sözleşmesi:
     `command.help.name` ve `command.run` ZORUNLU, yoksa komut atlanır:
       if (!command?.help?.name || typeof command.run !== "function")
         console.warn(`Atlandı: ${file} ...`)
     Bu dosya eskiden yalnızca `ad`/`aciklama` alanlarını tanımlıyordu,
     bu yüzden bot açılışta "Atlandı: rank.js" deyip komutu HİÇ
     yüklemiyordu — `r!rank` çalışmıyordu. Aşağıdaki `help`/`conf`
     alanları bu sözleşme için eklendi; mevcut `ad`/`aciklama` korundu. */
  help: {
    name: "rank",
    description: "Owner/Admin/Mod/Youtuber/User rank ver (bot yetkilisi)",
    usage: "rank [ver|al|liste|kim] ...",
  },
  conf: {
    enabled: true,
    guildOnly: true,
    aliases: ["ranklar", "rutbe"],
    permLevel: 0,
    kategori: "bot",
  },

  run: async (client, message, args) => {
    const alt = String(args[0] || "").toLowerCase();

    /* ── yardim ─────────────────────────────────────────────────────── */
    if (!alt || ["yardim", "help", "?"].includes(alt)) {
      const e = new EmbedBuilder()
        .setColor(0x7c8798)
        .setTitle("rank komutlari")
        .setDescription(
          [
            "`r!rank ver @kisi owner|admin|mod|youtuber|user`",
            "`r!rank ver <kullanici adi> <rank>`",
            "`r!rank al @kisi`",
            "`r!rank liste`",
            "`r!rank kim @kisi` / `r!rank kim <kullanici adi>`",
            "",
            "Hedef `@etiket`, Discord ID, kullanici adi veya sunucu ici",
            "gorunen ad olabilir. Birden fazla kisi eslesirse komut",
            "rank VERMEZ, adaylari listeler.",
            "",
            "Rank yalnizca **gorseldir**: Vape Online profilinde ve",
            "config paylasani goruntulemede cikar.",
            "Bu komutu yalnizca bot sahibi ve bot moderatorleri kullanabilir."
          ].join("\n")
        );
      return message.reply({ embeds: [e] }).catch(() => {});
    }

    /* ── YETKI: buradan sonrasi yetkili ister ───────────────────────────
       Sirasi onemli: `liste`/`kim` de yetkili ister cunku tam ID listesi
       doner. Yetkisiz kisiye yalnizca "kendi rankin" bilgisi verilebilir;
       o da zaten discord disinda gorunur. */
    if (!yetkiliMi(message.author.id)) {
      return message
        .reply("Bunu yalnizca bot sahibi ve bot moderatorleri kullanabilir.")
        .catch(() => {});
    }

    /* ── liste ─────────────────────────────────────────────────────── */
    if (["liste", "list"].includes(alt)) {
      const l = R.rankListesi();
      if (!l.length) {
        return message.reply("Hic rank verilmemis.").catch(() => {});
      }
      const gruplu = {};
      for (const x of l) (gruplu[x.rank] = gruplu[x.rank] || []).push(x.id);
      const satirlar = [];
      for (const r of ["owner", "admin", "moderator", "youtuber"]) {
        const ids = gruplu[r];
        if (!ids) continue;
        satirlar.push(`**${R.etiket(r)}** (${ids.length})`);
        satirlar.push(ids.map(id => `> <@${id}> \`${id}\``).join("\n"));
        satirlar.push("");
      }
      // Tek mesaj siniri: cok uzunsa kirp
      let metin = satirlar.join("\n").trim();
      if (metin.length > 3800) metin = metin.slice(0, 3800) + "\n… (kirpildi)";
      const e = new EmbedBuilder()
        .setColor(0x7c8798)
        .setTitle(`Rank listesi (${l.length} kisi)`)
        .setDescription(metin);
      return message.reply({ embeds: [e] }).catch(() => {});
    }

    /* ── kim ───────────────────────────────────────────────────────── */
    if (["kim", "who", "goster", "show"].includes(alt)) {
      const cozum = await uyeleriCoz(message, args.slice(1));
      message.mentions.users.forEach(u => {
        if (!u.bot && !cozum.idler.includes(u.id)) cozum.idler.push(u.id);
      });
      const hedefler = [...new Set(cozum.idler)];
      if (!hedefler.length) {
        const ozet = sorunOzeti(cozum);
        return message
          .reply(
            ozet
              ? ozet
              : "Kullanim: `r!rank kim @kisi` veya `r!rank kim <kullanici adi>`"
          )
          .catch(() => {});
      }
      const satirlar = hedefler.map(id => {
        const r = R.rankAl(id);
        const e = R.etiket(r) || "User";
        return `<@${id}> \`${id}\` -> **${e}**`;
      });
      const ozet = sorunOzeti(cozum);
      if (ozet) satirlar.push("", ozet);
      const e = new EmbedBuilder()
        .setColor(R.rengi(hedefler.length === 1 ? R.rankAl(hedefler[0]) : "user"))
        .setTitle("Rank sorgusu")
        .setDescription(satirlar.join("\n"));
      return message.reply({ embeds: [e] }).catch(() => {});
    }

    /* ── al (sil) ──────────────────────────────────────────────────── */
    if (["al", "sil", "kaldir", "remove", "del"].includes(alt)) {
      const cozum = await uyeleriCoz(message, args.slice(1));
      message.mentions.users.forEach(u => {
        if (!u.bot && !cozum.idler.includes(u.id)) cozum.idler.push(u.id);
      });
      const hedefler = [...new Set(cozum.idler)];
      if (!hedefler.length) {
        const ozet = sorunOzeti(cozum);
        return message
          .reply(
            ozet
              ? ozet
              : "Kullanim: `r!rank al @kisi` veya `r!rank al <kullanici adi>`"
          )
          .catch(() => {});
      }
      let n = 0;
      for (const id of hedefler) if (R.rankSil(id)) n++;
      try {
        await ownerLog(
          client,
          new EmbedBuilder()
            .setColor(0xff5c5c)
            .setDescription(
              `**Rank alindi:** ${hedefler.map(id => `<@${id}>`).join(" ")}\nIslem: ${message.author.tag}`
            )
        );
      } catch {}
      return message
        .reply(n ? `Rank alindi: ${hedefler.map(id => `<@${id}>`).join(" ")}` : "Islem yapilamadi.")
        .catch(() => {});
    }

    /* ── ver ───────────────────────────────────────────────────────── */
    if (["ver", "ayarla", "set", "ekle", "add"].includes(alt)) {
      const cozum = await uyeleriCoz(message, args.slice(1));
      message.mentions.users.forEach(u => {
        if (!u.bot && !cozum.idler.includes(u.id)) cozum.idler.push(u.id);
      });
      const hedefler = [...new Set(cozum.idler)];
      const rank = rankKelimesi(args.slice(1));

      if (!hedefler.length) {
        const ozet = sorunOzeti(cozum);
        return message
          .reply(
            ozet
              ? ozet
              : "Kullanim: `r!rank ver @kisi owner|admin|mod|youtuber|user`\n" +
                  "veya `r!rank ver <kullanici adi> owner`"
          )
          .catch(() => {});
      }
      if (!rank) {
        return message
          .reply(
            `Gecerli rank yaz: \`${R.GECERLI.join(" | ")}\`\n` +
              "Kisaltmalar: `mod` -> moderator, `yt` -> youtuber"
          )
          .catch(() => {});
      }

      const ok = [];
      for (const id of hedefler) if (R.rankVer(id, rank)) ok.push(id);
      const et = R.etiket(rank) || "User";

      try {
        await ownerLog(
          client,
          new EmbedBuilder()
            .setColor(R.rengi(rank))
            .setDescription(
              `**Rank verildi:** ${ok.map(id => `<@${id}>`).join(" ")} -> **${et}**\nIslem: ${message.author.tag}`
            )
        );
      } catch {}

      const e = new EmbedBuilder()
        .setColor(R.rengi(rank))
        .setTitle("Rank guncellendi")
        .setDescription(
          ok.length
            ? `${ok.map(id => `<@${id}>`).join(" ")} -> **${et}**`
            : "Hicbiri guncellenemedi."
        )
        .setFooter({ text: "Rank sadece gorseldir; yetki vermez." });
      return message.reply({ embeds: [e] }).catch(() => {});
    }

    return message
      .reply("Bilinmeyen alt komut. `r!rank` yazarak yardim al.")
      .catch(() => {});
  }
};
