const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const { getLangSync, t } = require("../dil");

function bul(client, args) {
  return client.giveawaysManager.giveaways.find(g => g.messageId === args[0])
    || client.giveawaysManager.giveaways.find(g => g.messageURL.endsWith(`/${args[0]}`))
    || client.giveawaysManager.giveaways.find(g => g.prize === args.join(" "));
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
    return message.channel.send(t(lang, "sistem.mesajYonet"));

  if (!args[0])
    return message.channel.send(EN
      ? "❌ Give a message ID. Tip: `r!çekiliş-liste` to see active giveaways."
      : "❌ Mesaj ID'sini belirt. Aktif çekilişler için: `r!çekiliş-liste`");

  const giveaway = bul(client, args);
  if (!giveaway)
    return message.channel.send(EN
      ? `❌ Giveaway not found. Active giveaways: ${client.giveawaysManager.giveaways.filter(g => !g.ended).length}`
      : `❌ Çekiliş bulunamadı. Aktif çekiliş sayısı: ${client.giveawaysManager.giveaways.filter(g => !g.ended).length}`);

  if (giveaway.ended)
    return message.channel.send(EN ? "⚠️ This giveaway has already ended." : "⚠️ Bu çekiliş zaten sona ermiş.");

  try {
    await client.giveawaysManager.end(giveaway.messageId);
    return message.channel.send(EN ? "✅ Giveaway ended, winners are being drawn." : "✅ Çekiliş sonlandırıldı, kazananlar belirleniyor.");
  } catch (e) {
    const msg = typeof e === "string" ? e : e.message;
    console.error("çekiliş sonlandırılamadı:", msg);
    return message.channel.send(EN ? `❌ Could not end the giveaway: ${msg}` : `❌ Çekiliş sonlandırılamadı: ${msg}`);
  }
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["end", "bitir", "gend", "çekiliş-sonlandır", "giveaway-end"],
  permLevel: 0,
  kategori: "cekilis"
};
exports.help = {
  name: "sonlandır",
  description: "Çekilişi hemen sonlandırır ve kazananı seçer.",
  usage: "sonlandır <mesajID>  •  Aktif çekilişler: r!çekiliş-liste"
};
