const { EmbedBuilder } = require("discord.js");
const { getLang, t } = require("../dil");
const { SAHIP_ID } = require("../utils");

/* r!launcher — RiseBunny Launcher kayıt + anlık aktif (Vape içi) sayacı.
 * SADECE sahip görebilir (Discord ID'leri listelenir).
 * Kaynak: croxydb `launcher_kayit_*` (kayıt) + `presence_*` (canlılık).
 * Metinler dil/komutlar.js kaydıyla dil/tr.js + dil/en.js içindedir. */
exports.run = async (client, message, args) => {
  const lang = await getLang(message.author.id);
  if (String(message.author.id) !== String(SAHIP_ID)) {
    try { await message.reply(t(lang, "launcher_msg.yetkisiz")); } catch {}
    return;
  }
  const db = require("croxydb");

  const SIMDI = Date.now();
  const AKTIF_PENCERE = 10 * 60 * 1000;  // heartbeat 5 dk → 10 dk pencere
  const TEMIZLE_ESIK = 30 * 60 * 1000;   // 30 dk'dan eski presence budanır

  let tum = {};
  try { tum = db.all() || {}; } catch { tum = {}; }

  let kayitli = 0;
  let son24 = 0;
  let aktif = [];
  let budanacak = [];
  for (const anahtar of Object.keys(tum)) {
    if (anahtar.startsWith("launcher_kayit_")) {
      kayitli++;
      const v = tum[anahtar];
      const son = Number(v && v.son) || 0;
      if (son && SIMDI - son < 24 * 3600 * 1000) son24++;
    } else if (anahtar.startsWith("presence_")) {
      const v = tum[anahtar] || {};
      const at = Number(v.at) || 0;
      const id = anahtar.slice("presence_".length);
      if (at && SIMDI - at < AKTIF_PENCERE) {
        aktif.push({ id, ad: String(v.username || `Kullanıcı_${id.slice(-4)}`), at });
      } else if (!at || SIMDI - at > TEMIZLE_ESIK) {
        budanacak.push(anahtar);
      }
    }
  }
  aktif.sort((a, b) => b.at - a.at);

  // Bayat presence budaması — komut başına en fazla 50 anahtar (tek yazım).
  let budandi = 0;
  try {
    for (const k of budanacak.slice(0, 50)) { db.delete(k); budandi++; }
  } catch {}

  const ago = (ms) => {
    const sn = Math.max(0, Math.floor(ms / 1000));
    if (sn < 60) return t(lang, "launcher_msg.snOnce", { n: sn });
    const dk = Math.floor(sn / 60);
    if (dk < 60) return t(lang, "launcher_msg.dkOnce", { n: dk });
    return t(lang, "launcher_msg.saOnce", { n: Math.floor(dk / 60) });
  };
  const ilkN = Math.min(aktif.length, 15);
  const liste = aktif.slice(0, 15)
    .map((k, i) => `\`${i + 1}.\` **${k.ad}** (<@${k.id}>) — ${ago(SIMDI - k.at)}`)
    .join("\n") || "—";

  const e = new EmbedBuilder()
    .setColor(aktif.length ? "Green" : "Grey")
    .setTitle(t(lang, "launcher_msg.baslik"))
    .addFields(
      { name: t(lang, "launcher_msg.kayitli"), value: `**${kayitli}**`, inline: true },
      { name: t(lang, "launcher_msg.aktif"), value: `**${aktif.length}**`, inline: true },
      { name: t(lang, "launcher_msg.son24"), value: `**${son24}**`, inline: true },
      { name: t(lang, "launcher_msg.liste", { n: ilkN }), value: liste.slice(0, 1000) || "—", inline: false }
    )
    .setFooter({ text: budandi ? t(lang, "launcher_msg.budandi", { n: budandi }) : "RiseBunny" })
    .setTimestamp();
  try { await message.channel.send({ embeds: [e] }); } catch {}
};

exports.conf = { enabled: true, guildOnly: false, aliases: ["launcherdurum", "vapedurum", "aktiflik"], permLevel: 0, kategori: "bot" };
exports.help = { name: "launcher", description: "Launcher kayıtlı + Vape içi aktif kullanıcı sayısını gösterir.", usage: "launcher" };
