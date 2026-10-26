const { EmbedBuilder } = require("discord.js");
const { getLangSync } = require("../dil");
const D = require("../ai/davet");

/**
 * r!davet-top — davet sıralaması.
 *
 * ESKİ HATA: `db.fetch(\`invites_${guild.id}\`)` okunuyordu. Böyle bir anahtar
 * hiçbir yerde yazılmıyordu (gerçek veri `invites.<kullanıcıId>` biçiminde),
 * bu yüzden komut HER ZAMAN "Henüz davet verisi yok." diyordu.
 */
exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  if (!message.guild) return;

  const list = D.sirala(10);
  if (!list.length) {
    return message.reply(EN ? "No invite data yet." : "Henüz davet verisi yok.");
  }

  const satirlar = list
    .map((item, i) => {
      const madalya = ["🥇", "🥈", "🥉"][i] || `\`${i + 1}.\``;
      return `${madalya} <@${item.id}> — **${item.toplam}** ${EN ? "invites" : "davet"}`;
    })
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor("Gold")
    .setTitle(EN ? "🏆 Invite Leaderboard" : "🏆 Davet Sıralaması")
    .setDescription(satirlar.slice(0, 3900))
    .setFooter({ text: EN ? "Total = regular + bonus" : "Toplam = düzenli + bonus" });

  return message.channel.send({ embeds: [embed] }).catch(() => {});
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["davettop", "invitetop"], permLevel: 0, kategori: "davet" };
exports.help = { name: "davettop", description: "Davet sıralamasını gösterir.", usage: "davettop" };
