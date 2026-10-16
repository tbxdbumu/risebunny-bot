const { EmbedBuilder } = require("discord.js");
const { getLang, t } = require("../dil");

/* r!sayac — herkese açık sayısal durum: toplam kayıtlı + anlık aktif.
 * İsim/ID İÇERMEZ, yalnızca sayı gösterir; herkes kullanabilir.
 * Kaynak: croxydb `launcher_kayit_*` (kayıt) + `presence_*` (canlılık).
 * Budama yapmaz (yazım yok); bayat temizliği r!launcher + süpürücüdedir.
 * Metinler dil/komutlar.js kaydıyla dil/tr.js + dil/en.js içindedir. */
exports.run = async (client, message, args) => {
  const lang = await getLang(message.author.id);
  const db = require("croxydb");

  const SIMDI = Date.now();
  const AKTIF_PENCERE = 10 * 60 * 1000; // heartbeat 5 dk → 10 dk pencere

  let tum = {};
  try { tum = db.all() || {}; } catch { tum = {}; }

  let kayitli = 0;
  let aktif = 0;
  for (const anahtar of Object.keys(tum)) {
    if (anahtar.startsWith("launcher_kayit_")) {
      kayitli++;
    } else if (anahtar.startsWith("presence_")) {
      const v = tum[anahtar] || {};
      const at = Number(v.at) || 0;
      if (at && SIMDI - at < AKTIF_PENCERE) aktif++;
    }
  }

  const e = new EmbedBuilder()
    .setColor(aktif ? "Green" : "Grey")
    .setTitle(t(lang, "sayac_msg.baslik"))
    .addFields(
      { name: t(lang, "sayac_msg.kayitli"), value: `**${kayitli}**`, inline: true },
      { name: t(lang, "sayac_msg.aktif"), value: `**${aktif}**`, inline: true }
    )
    .setFooter({ text: "RiseBunny" })
    .setTimestamp();
  try { await message.channel.send({ embeds: [e] }); } catch {}
};

exports.conf = { enabled: true, guildOnly: false, aliases: ["durum", "online"], permLevel: 0, kategori: "bot" };
exports.help = { name: "sayac", description: "Toplam kayıtlı ve anlık aktif kullanıcı sayısını gösterir.", usage: "sayac" };
