const db = require('croxydb');
const { getLangSync } = require("../dil");
const { bilgiKarti } = require("./_kart");
exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  const hedef = message.mentions.members.first() || message.member || message.author;
  // Slash yolunda `member` bazen tam bir GuildMember değil (yalnızca API
  // objesi) ve `.user` alanı olmaz; o zaman yazarın kendisine düş.
  const user = hedef.user || (hedef.id ? { id: hedef.id, username: hedef.username || hedef.displayName || "?", displayAvatarURL: () => (hedef.displayAvatarURL ? hedef.displayAvatarURL({ extension: "png", size: 256 }) : "") } : message.author);
  const wallet = Number(db.fetch(`para_${user.id}`) || 0);
  const bank = Number(db.fetch(`bankapara_${user.id}`) || 0);
  const kart = await bilgiKarti({
    baslik: user.username,
    avatarURL: user.displayAvatarURL({ extension: 'png', size: 256 }),
    satirlar: [
      `${EN ? "Wallet" : "Cüzdan"}: ${wallet.toLocaleString()} 💸`,
      `${EN ? "Bank" : "Banka"}: ${bank.toLocaleString()} 🏦`,
      `${EN ? "Total" : "Toplam"}: ${(wallet + bank).toLocaleString()} 💰`
    ],
    lang, dosya: 'param-kart.png'
  });
  return message.channel.send({ files: [kart] });
};
exports.conf = { enabled: true, guildOnly: false, aliases: ["para", "param", "bakiye"], permLevel: 0 };
exports.help = { name: "param", description: "Para bakiyeni resimli kartla gösterir.", usage: "param [@kullanıcı]" };
