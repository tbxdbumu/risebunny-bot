/**
 * komutlar/otorol-ayarla.js — Otorol
 *
 * KULLANIM
 *   r!otorol-ayarla @rol [#bildirim]   → otorolü açar (kanal opsiyonel)
 *   r!otorol-ayarla @rol --mevcut      → mevcut üyelere de ver
 *   r!otorol-ayarla sıfırla            → kapat
 *
 * DB (tek kaynak): `otoRL_<gid>` (rol), `otoRK_<gid>` (bildirim kanalı).
 * `guildMemberAdd` bu anahtarları okur.
 */
const Discord = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const { isPremium } = require("../utils");

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  if (!isPremium(message.author.id)) return message.reply(t(lang, "ortak.premiumGerek"));
  const gid = message.guild.id;

  if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator))
    return message.reply(t(lang, "sistem.yonetici"));

  const alt = (args[0] || "").toLowerCase();
  if (["sıfırla", "sifirla", "kapat", "reset"].includes(alt)) {
    const rol = db.fetch(`otoRL_${gid}`);
    if (!rol) return message.reply(t(lang, "otorol.zatenKapali"));
    db.delete(`otoRL_${gid}`);
    db.delete(`otoRK_${gid}`);
    return message.reply(t(lang, "otorol.kapatildi"));
  }

  const rol = message.mentions.roles.first();
  if (!rol) return message.reply(t(lang, "otorol.rolGerek"));

  const kanal = message.mentions.channels.first() || null;
  if (args.includes("--kanal") && !kanal) return message.reply(t(lang, "otorol.kanalGerek"));

  // Rol hiyerarşisi kontrolü
  if (rol.position >= message.guild.members.me.roles.highest.position)
    return message.reply(t(lang, "otorol.rolYuksek"));

  if (!message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.ManageRoles))
    return message.reply(t(lang, "tepkirol.botYetki"));

  db.set(`otoRL_${gid}`, rol.id);
  if (kanal) db.set(`otoRK_${gid}`, kanal.id);
  else db.delete(`otoRK_${gid}`);

  /* Rol mention edilmez — düz ad yazılır (ping atmasın). */
  await message.reply({
    content: t(lang, "otorol.ayarlandi", {
      rol: rol.name,
      kanal: kanal ? `<#${kanal.id}>` : "—"
    }),
    allowedMentions: { parse: [] }
  });

  // Mevcut üyelere uygula (isteğe bağlı ama GUI'de sık istenen)
  if (args.includes("--mevcut") || args.includes("--all")) {
    let ok = 0;
    for (const [, m] of message.guild.members.cache) {
      if (m.user.bot || m.roles.cache.has(rol.id)) continue;
      try { await m.roles.add(rol.id, "Otorol: mevcut üyeler"); ok++; } catch {}
      if (ok % 40 === 0) await new Promise(r => setTimeout(r, 100));
    }
    message.channel.send({
      content: t(lang, "otorol.hepsiVerildi", { adet: ok, rol: rol.name }),
      allowedMentions: { parse: [] }
    }).catch(() => {});
  }
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  permLevel: 0,
  aliases: ["otorol-ayarla", "otorol", "autorole-set", "arset"]
};

exports.help = {
  name: "otorol-ayarla",
  description: "Sunucuya katılan herkese otomatik rol verir.",
  usage: "otorol-ayarla @rol [#kanal] [--mevcut]"
};
