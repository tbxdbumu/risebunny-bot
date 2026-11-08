/**
 * komutlar/otorol-sıfırla.js — Otorol kapat
 *
 * KULLANIM:  r!otorol-kapat  (alias: r!otorol-sıfırla)
 */
const { PermissionFlagsBits } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const gid = message.guild.id;

  if (!message.member.permissions.has(PermissionFlagsBits.Administrator))
    return message.reply(t(lang, "sistem.yonetici"));

  const rol = db.fetch(`otoRL_${gid}`);
  if (!rol) return message.reply(t(lang, "otorol.zatenKapali"));

  db.delete(`otoRL_${gid}`);
  db.delete(`otoRK_${gid}`);
  return message.reply(t(lang, "otorol.kapatildi"));
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  permLevel: 0,
  aliases: ["otorol-sıfırla", "otorol-sifirla", "autorole-reset"]
};

exports.help = {
  name: "otorol-kapat",
  description: "Otorol sistemini kapatır.",
  usage: "otorol-kapat"
};
