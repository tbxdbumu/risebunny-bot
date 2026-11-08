const { PermissionsBitField } = require("discord.js");
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
    return message.channel.send(EN ? "❌ Give a message ID." : "❌ Mesaj ID'sini belirt.");

  const giveaway = bul(client, args);
  if (!giveaway)
    return message.channel.send(EN ? "❌ Giveaway not found." : "❌ Çekiliş bulunamadı.");

  if (!giveaway.ended)
    return message.channel.send(EN ? "⚠️ This giveaway hasn't ended yet." : "⚠️ Bu çekiliş henüz bitmedi. Önce `r!sonlandır <mesajID>` kullan.");

  try {
    await client.giveawaysManager.reroll(giveaway.messageId, {
      messages: {
        congrat: "🎉 Yeni kazanan: {winners}! Tebrikler, **{this.prize}** ödülünü kazandın! {this.messageURL}",
        error: "Yeni kazanan seçilemedi, başka katılımcı kalmadı."
      }
    });
    return message.channel.send(EN ? "✅ A new winner has been picked!" : "✅ Yeni kazanan çekildi!");
  } catch (e) {
    const msg = typeof e === "string" ? e : e.message;
    console.error("çekiliş yenilenemedi:", msg);
    return message.channel.send(EN ? `❌ Could not reroll: ${msg}` : `❌ Çekiliş yenilenemedi: ${msg}`);
  }
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["yenile", "greroll", "çekiliş-yenile", "reroll", "giveaway-reroll"],
  permLevel: 0,
  kategori: "cekilis"
};
exports.help = {
  name: "reroll",
  description: "Biten çekilişin kazananını yeniden çeker.",
  usage: "reroll <mesajID>"
};
