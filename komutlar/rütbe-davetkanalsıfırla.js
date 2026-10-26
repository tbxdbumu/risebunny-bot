const Discord = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

/**
 * r!davet-kanal-sıfırla — davet bildirim kanalını kapatır.
 *
 * ESKİ HATA: `db.set("settings")` değer vermeden çağrılıyordu; hiçbir ayarı
 * temizlemiyordu (ve global "settings" anahtarını bozuyordu).
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

  try { db.delete(`davetkanal_${message.guild.id}`); } catch {}

  await message.channel
    .send(EN ? "✅ Invite notifications disabled." : "✅ Davet bildirimleri kapatıldı.")
    .catch(() => {});
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["davetkanalsıfırla", "davet-kanalsıfırla", "davetkanal-sıfırla", "invite-channel-reset"],
  permLevel: 0,
  kategori: "davet",
};
exports.help = {
  name: "davet-kanal-sıfırla",
  description: "Davet bildirim kanalını kapatır.",
  usage: "davet-kanal-sıfırla",
};
