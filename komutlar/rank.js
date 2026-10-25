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

/** Argumanlardan hedefleri cikar (mention + ciplak ID). */
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
            "`r!rank al @kisi`",
            "`r!rank liste`",
            "`r!rank kim @kisi`",
            "",
            "Rank yalnizca **gorseldir**: Lunar adinin ustunde, Vape Online",
            "profilde ve config paylasani goruntulemede cikar.",
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
      const hedefler = hedefleriCikar(message, args.slice(1));
      if (!hedefler.length) {
        return message.reply("Kullanim: `r!rank kim @kisi`").catch(() => {});
      }
      const satirlar = hedefler.map(id => {
        const r = R.rankAl(id);
        const e = R.etiket(r) || "User";
        return `<@${id}> \`${id}\` -> **${e}**`;
      });
      const e = new EmbedBuilder()
        .setColor(R.rengi(hedefler.length === 1 ? R.rankAl(hedefler[0]) : "user"))
        .setTitle("Rank sorgusu")
        .setDescription(satirlar.join("\n"));
      return message.reply({ embeds: [e] }).catch(() => {});
    }

    /* ── al (sil) ──────────────────────────────────────────────────── */
    if (["al", "sil", "kaldir", "remove", "del"].includes(alt)) {
      const hedefler = hedefleriCikar(message, args.slice(1));
      if (!hedefler.length) {
        return message.reply("Kullanim: `r!rank al @kisi`").catch(() => {});
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
      const hedefler = hedefleriCikar(message, args.slice(1));
      const rank = rankKelimesi(args.slice(1));

      if (!hedefler.length) {
        return message
          .reply("Kullanim: `r!rank ver @kisi owner|admin|mod|youtuber|user`")
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
