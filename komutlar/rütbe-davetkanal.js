const Discord = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

/**
 * r!davet-kanal [#kanal] — davet bildirimlerinin gideceği kanal.
 *
 * ESKİ HATA: `db.set(\`settings.Channel\`, kanal.id)` yazıyordu. Bu anahtar
 * ne okunuyordu ne de sunucuya özeldi (tüm sunucular aynı "settings.Channel"
 * anahtarını eziyordu). Artık `davetkanal_<guildId>` kullanılıyor ve
 * bot.js'teki davet dinleyicisi bu kanala bildirim atıyor.
 */
exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";

  if (
    !message.member.permissions.has(Discord.PermissionFlagsBits.Administrator) &&
    !message.member.permissions.has(Discord.PermissionFlagsBits.ManageGuild)
  ) {
    return message.reply(t(lang, "sistem.yetkiYok"));
  }

  /* Argüman yoksa mevcut ayarı göster */
  const kanal =
    message.mentions.channels.first() ||
    (args[0] ? message.guild.channels.cache.get(args[0]) : null);

  if (!kanal) {
    const mevcutId = db.fetch(`davetkanal_${message.guild.id}`);
    const mevcut = mevcutId ? message.guild.channels.cache.get(mevcutId) : null;
    const embed = new Discord.EmbedBuilder()
      .setColor(mevcut ? "Green" : "Grey")
      .setTitle(EN ? "Invite log channel" : "Davet bildirim kanalı")
      .setDescription(
        mevcut
          ? EN
            ? `Currently set to ${mevcut}.\nTo change: \`${process.env.PREFIX || "r!"}invite-channel #channel\``
            : `Şu an ${mevcut} olarak ayarlı.\nDeğiştirmek için: \`${process.env.PREFIX || "r!"}davet-kanal #kanal\``
          : EN
            ? "Not set. Invite notifications are off.\nTo enable: `invite-channel #channel`"
            : "Ayarlı değil. Davet bildirimleri kapalı.\nAçmak için: `davet-kanal #kanal`"
      );
    return message.channel.send({ embeds: [embed] }).catch(() => {});
  }

  if (!kanal.isTextBased()) {
    return message.reply(EN ? "Pick a text channel." : "Bir metin kanalı seç.");
  }

  db.set(`davetkanal_${message.guild.id}`, kanal.id);
  await message.channel
    .send(EN ? `✅ Invite notifications will be sent to ${kanal}.` : `✅ Davet bildirimleri ${kanal} kanalına gönderilecek.`)
    .catch(() => {});
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["invite-channel", "davetkanal"],
  permLevel: 0,
  kategori: "davet",
};
exports.help = {
  name: "davet-kanal",
  description: "Davet bildirim kanalını ayarlar.",
  usage: "davet-kanal [#kanal]",
};
