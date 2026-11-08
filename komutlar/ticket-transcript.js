/**
 * komutlar/ticket-transcript.js — Ticket transkripti ayarları
 *
 * KULLANIM
 *   r!ticket-transcript                    → durum
 *   r!ticket-transcript kanal #kanal       → transkriptler buraya
 *   r!ticket-transcript kanal kapat        → bilet kanalının kendisine
 *   r!ticket-transcript otomatik aç|kapat  → kapatınca otomatik al
 *   r!ticket-transcript al [mesaj]         → bu kanalın transkriptini şimdi al
 */
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const { isPremium } = require("../utils");
const tr = require("../util/transcript");

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  if (!isPremium(message.author.id)) return message.reply(t(lang, "ortak.premiumGerek"));
  const gid = message.guild.id;
  const alt = (args[0] || "").toLowerCase();

  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
    return message.reply(t(lang, "transcript.yetki"));

  /* ── elle transkript ────────────────────────────────────────────────── */
  if (["al", "take", "olustur", "oluştur"].includes(alt)) {
    await message.channel.sendTyping().catch(() => {});
    const { buffer, adet, ad } = await tr.transkriptOlustur(message.channel, { kapatan: message.author.id });
    const ok = await tr.transkriptGonder(client, message.guild, message.channel, {
      buffer, adet, ad, kapatanId: message.author.id
    });
    if (!ok) return message.reply(t(lang, "transcript.hata"));
    return;
  }

  /* ── otomatik ───────────────────────────────────────────────────────── */
  if (["otomatik", "auto"].includes(alt)) {
    const durum = (args[1] || "").toLowerCase();
    const acik = ["aç", "ac", "on", "evet"].includes(durum);
    const kapali = ["kapat", "off", "hayır", "hayir"].includes(durum);
    if (!acik && !kapali) return message.reply(t(lang, "transcript.otomatikHata"));
    db.set(`ticket_transcript_otomatik.${gid}`, acik);
    return message.reply(acik ? t(lang, "transcript.otomatikAcik") : t(lang, "transcript.otomatikKapali"));
  }

  /* ── kanal ──────────────────────────────────────────────────────────── */
  if (["kanal", "channel"].includes(alt)) {
    const kapali = ["kapat", "yok", "off", "sıfırla", "sifirla"].includes((args[1] || "").toLowerCase());
    if (kapali) {
      db.delete(`ticket_transcript_kanal.${gid}`);
      return message.reply(t(lang, "transcript.kanalKapatildi"));
    }
    const kanal = message.mentions.channels.first();
    if (!kanal) return message.reply(t(lang, "transcript.kanalGerek"));
    if (!kanal.permissionsFor(message.guild.members.me)?.has(PermissionFlagsBits.SendMessages))
      return message.reply(t(lang, "transcript.kanalIzin"));
    db.set(`ticket_transcript_kanal.${gid}`, kanal.id);
    return message.reply(t(lang, "transcript.kanalAyarlandi", { kanal: `<#${kanal.id}>` }));
  }

  /* ── durum ──────────────────────────────────────────────────────────── */
  const hedefId = db.fetch(`ticket_transcript_kanal.${gid}`);
  const otomatik = db.fetch(`ticket_transcript_otomatik.${gid}`) !== false;

  return message.reply({
    embeds: [new EmbedBuilder()
      .setColor("#2b2d31")
      .setTitle(t(lang, "transcript.baslik"))
      .setDescription(t(lang, "transcript.durum", {
        kanal: hedefId ? `<#${hedefId}>` : t(lang, "transcript.varsayilanKanal"),
        otomatik: otomatik ? "✅" : "❌",
        limit: tr.MAX_MESAJ
      }))
      .addFields({ name: t(lang, "transcript.kullanimBaslik"), value: t(lang, "transcript.kullanim") })]
  });
};

exports.conf = {
  enabled: true, guildOnly: true,
  aliases: ["ticket-transcript", "ticket-log", "transcript"],
  permLevel: 0, kategori: "ticket"
};
exports.help = {
  name: "ticket-transcript",
  description: "Ticket kapanınca HTML transkript alır.",
  usage: "ticket-transcript [kanal #kanal|otomatik aç|kapat|al]"
};
