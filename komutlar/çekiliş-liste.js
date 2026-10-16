const { EmbedBuilder } = require("discord.js");
const { getLangSync } = require("../dil");

exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";

  const list = client.giveawaysManager.giveaways
    .filter(g => !g.ended && g.guildId === message.guild.id)
    .sort((a, b) => a.endAt - b.endAt)
    .slice(0, 10);

  if (!list.length)
    return message.channel.send(EN
      ? "🎉 No active giveaways in this server."
      : "🎉 Bu sunucuda aktif çekiliş yok.\nBaşlatmak için: `r!çekiliş #kanal 1d 1 Ödül`");

  const e = new EmbedBuilder().setColor("Gold")
    .setTitle(EN ? "🎉 Active Giveaways" : "🎉 Aktif Çekilişler")
    .setFooter({ text: EN ? `Showing ${list.length} giveaway(s)` : `${list.length} çekiliş gösteriliyor` });

  for (const g of list) {
    const kalan = Math.max(0, g.endAt - Date.now());
    const saat = Math.floor(kalan / 3600000);
    const dakika = Math.floor((kalan % 3600000) / 60000);
    e.addFields({
      name: `${g.winnerCount}x ${g.prize}`,
      value: `${EN ? "Ends" : "Bitiş"}: <t:${Math.round(g.endAt / 1000)}:R> (${saat}h ${dakika}m)\n<#${g.channelId}> • ${g.messageURL}`,
      inline: false
    });
  }
  return message.channel.send({ embeds: [e] });
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["çekiliş-liste", "cekilis-liste", "gliste", "çekilişler", "giveaway-list"],
  permLevel: 0,
  kategori: "cekilis"
};
exports.help = {
  name: "çekiliş-liste",
  description: "Aktif çekilişleri listeler.",
  usage: "çekiliş-liste"
};
