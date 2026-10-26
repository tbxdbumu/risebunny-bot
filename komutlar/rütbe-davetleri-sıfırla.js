const Discord = require("discord.js");
const { getLangSync, t } = require("../dil");
const D = require("../ai/davet");

/**
 * r!davetleri-sıfırla — sunucudaki tüm davet sayaçlarını siler.
 *
 * ESKİ HATA: `db2.set("invites")` değer VERMEDEN çağrılıyordu (bozuk kayıt
 * yazıyordu) ve aslında hiçbir kullanıcının verisini silmiyordu.
 */
exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  if (
    !message.member.permissions.has(Discord.PermissionFlagsBits.Administrator) &&
    !message.member.permissions.has(Discord.PermissionFlagsBits.ManageGuild)
  ) {
    return message.reply(t(lang, "sistem.yetkiYok"));
  }

  const silinen = D.sofraSifirla(message.guild.id);
  await message.channel.send(
    EN
      ? `✅ **${silinen}** invite record(s) reset.`
      : `✅ **${silinen}** davet kaydı sıfırlandı.`
  ).catch(() => {});
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["reset-invites", "davetsıfırla"],
  permLevel: 0,
  kategori: "davet",
};
exports.help = {
  name: "davetleri-sıfırla",
  description: "Tüm davet sayaçlarını sıfırlar.",
  usage: "davetleri-sıfırla",
};
