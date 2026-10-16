const Discord = require("discord.js");
const db = require('croxydb')
const { getLangSync, t } = require("../dil");
module.exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const bankapara = db.fetch(`bankapara_${message.author.id}`) || 0;
  const miktar = args[0];

  if (!miktar) return message.channel.send({ embeds: [new Discord.EmbedBuilder()
    .setColor("Red")
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({}) })
    .setDescription((lang === "en" ? `⛔ Enter how much to withdraw!\n\n\`r!withdraw <amount || all>\`` : `⛔ Bankadan çekmek istediğin para miktarını girmelisin!\n\n\`r!çek <miktar || hepsi>\``))] });

  if (miktar === 'all' || miktar === 'hepsi') {
    if (!bankapara) return message.channel.send({ embeds: [new Discord.EmbedBuilder()
      .setColor("Red")
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({}) })
      .setDescription((lang === "en" ? `⛔ You have no money to withdraw!` : `⛔ Bankadan çekmek için hiç paran yok!`))] });
    db.add(`bankapara_${message.author.id}`, -bankapara);
    db.add(`para_${message.author.id}`, bankapara);
    return message.channel.send({ embeds: [new Discord.EmbedBuilder()
      .setColor("Green")
      .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({}) })
      .setDescription((lang === "en" ? `✅ Success, you withdrew ${bankapara} 💸 from the bank!` : `✅ Başarılı, bankadan ${bankapara} 💸 çektin!`))] });
  }

  const sayi = Number(miktar);
  if (!Number.isFinite(sayi) || sayi <= 0) return message.channel.send({ embeds: [new Discord.EmbedBuilder()
    .setColor("Red")
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({}) })
    .setDescription((lang === "en" ? `🤔 The amount you entered is not a valid number!?` : `🤔 Girdiğin miktar geçerli bir sayı değil !?`))] });

  if (sayi > bankapara) return message.channel.send({ embeds: [new Discord.EmbedBuilder()
    .setColor("Red")
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({}) })
    .setDescription((lang === "en" ? `⛔ You only have ${bankapara} 💸 in the bank right now` : `⛔ Şuan bankanda sadece ${bankapara} 💸 var`))] });

  const cekilecek = Math.floor(sayi);
  message.channel.send({ embeds: [new Discord.EmbedBuilder()
    .setColor("Green")
    .setAuthor({ name: message.author.tag, iconURL: message.author.displayAvatarURL({}) })
    .setDescription((lang === "en" ? `✅ Success, you withdrew ${cekilecek} 💸 from the bank!` : `✅ Başarılı, bankadan ${cekilecek} 💸 çektin!`))] });
  db.add(`para_${message.author.id}`, cekilecek);
  db.add(`bankapara_${message.author.id}`, -cekilecek);
};

exports.conf = {
  enabled: true,
  guildOnly: false,
  aliases: ["with", "cek", "withdraw", "paraçek"],
  permLevel: 0
};

exports.help = {
  name: 'çek' };
