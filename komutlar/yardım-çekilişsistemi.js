const WestraDiscord = require('discord.js');
const ayarlar = require('../ayarlar.json');
const { getLangSync } = require("../dil");
let Prefix = ayarlar.prefix

exports.run = (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
 const WestraEmbed = new WestraDiscord.EmbedBuilder()
  .setColor(0x36393F)
 .setAuthor({ name: (EN ? "Giveaway Help Menu" : `${client.user.username} | Çekiliş Sistemi Yardım Menüsü`) })
  .setDescription((EN ? `
  **${Prefix}giveaway #channel <duration> <winners> <prize>**
  → Starts a giveaway. Example: \`${Prefix}giveaway #giveaway 2 days 6 hours 1 Discord Nitro\`
  **${Prefix}giveaway-req #channel <duration> <winners> <prize> --invites 5 / --role @Member**
  → Starts a giveaway that requires invites or a role.
  **${Prefix}giveaway-list** → Lists active giveaways and their end times.
  **${Prefix}end <messageID>** → Ends a giveaway right away and draws the winner.
  **${Prefix}reroll <messageID>** → Draws a new winner for an ended giveaway.

  ⏳ **Duration formats (Turkish and English both work):**
  \`2 gün 6 saat\` · \`2g 3s\` · \`2d 3h\` · \`2day 6hours\` · \`30m\` · \`1sa\` · \`2 hafta\` · \`1 ay\`
  Minimum 10 seconds, maximum 90 days. A bare number (\`30\`) is read as minutes.

  📌 If the channel is not found, type \`#\` in the message and pick the channel from Discord's list.
  🎉 Members join by clicking the 🎉 reaction on the giveaway message.` : `
  **${Prefix}çekiliş #kanal <süre> <kazanan> <ödül>**
  → Çekiliş başlatır. Örnek: \`${Prefix}çekiliş #çekiliş 2 gün 6 saat 1 Discord Nitro\`
  **${Prefix}çekiliş-şart #kanal <süre> <kazanan> <ödül> --davet 5 / --rol @Üye**
  → Davet veya rol şartı olan çekiliş başlatır.
  **${Prefix}çekiliş-liste** → Aktif çekilişleri ve bitiş sürelerini listeler.
  **${Prefix}sonlandır <mesajID>** → Çekilişi hemen bitirir, kazananı çeker.
  **${Prefix}reroll <mesajID>** → Bitmiş çekilişin kazananını yeniden çeker.

  ⏳ **Süre yazımı (Türkçe ve İngilizce ikisi de çalışır):**
  \`2 gün 6 saat\` · \`2g 3s\` · \`2d 3h\` · \`2day 6hours\` · \`30m\` · \`1sa\` · \`2 hafta\` · \`1 ay\`
  En az 10 saniye, en fazla 90 gün. Sadece sayı yazılırsa (örn. \`30\`) dakika kabul edilir.

  📌 Kanal bulunamazsa mesaj içinde \`#\` yazıp kanalı Discord'un listesinden seçin.
  🎉 Katılmak için çekiliş mesajındaki 🎉 tepkisine tıklanır.`))
 .setFooter({ text: `RiseBunny` })
  .setTimestamp()
  .setImage("https://media.discordapp.net/attachments/1126239630203818095/1130479789757693952/standard.gif")
 message.channel.send({ embeds: [WestraEmbed] })
}
exports.conf = {
  enabled: true,
  guildOnly: false,
  aliases: [],
  kategori: "Bot",
  permLevel: 0
};

exports.help = {
  name: 'çekilişsistemi',
  description: 'Çekiliş sistemi hakkında bilgi verir.',
  usage: 'çekilişsistemi'
};
