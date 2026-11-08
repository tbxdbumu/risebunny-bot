const Discord = require("discord.js");
const { getLangSync } = require("../dil");
const D = require("../ai/davet");

/**
 * r!davetlerim — kullanıcının davet istatistikleri.
 *
 * ESKİ DURUM: `new Database("./Servers/...")` (croxydb shim) üzerinden
 * `invites.<id>` okunuyordu; bu anahtara YAZAN kod yoktu -> herkes 0.
 * Artık veri ai/davet.js'ten geliyor (takip bot.js'teki olaylarla yapılır).
 */
exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  const v = D.veriGetir(message.member.id);
  const toplam = v.total + v.bonus;

  const embed = new Discord.EmbedBuilder()
    .setAuthor({ name: EN ? "Your invites" : "Davetlerin", iconURL: message.author.displayAvatarURL() })
    .setColor(toplam > 0 ? "Green" : "Grey")
    .addFields(
      { name: EN ? "Total" : "Toplam", value: `**${toplam}**`, inline: true },
      { name: EN ? "Regular" : "Düzenli", value: `${v.regular}`, inline: true },
      { name: EN ? "Bonus" : "Bonus", value: `${v.bonus}`, inline: true },
      { name: EN ? "Left" : "Ayrılanlar", value: `${v.leave}`, inline: true },
      { name: EN ? "Fake" : "Sahte", value: `${v.fake}`, inline: true }
    )
    .setFooter({
      text: EN
        ? `Fake = accounts newer than ${D.SAHTE_HESAP_GUN} days`
        : `Sahte = ${D.SAHTE_HESAP_GUN} günden yeni hesaplar`
    });

  if (toplam === 0) {
    embed.setDescription(
      EN
        ? "You have no invites yet. Share your invite link and invite people to the server!"
        : "Henüz davetin yok. Davet linkini paylaşıp sunucuya kişi davet et!"
    );
  }

  await message.channel.send({ embeds: [embed] }).catch(() => {});
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["davetsayım", "davetsayı", "myinvites", "invites"],
  permLevel: 0,
  kategori: "davet",
};
exports.help = {
  name: "davetlerim",
  description: "Davet istatistiklerini gösterir.",
  usage: "davetlerim",
};
