/**
 * komutlar/ses-hub.js — Geçici ses kanalları ("Katıl ve oluştur")
 *
 * KULLANIM
 *   r!ses-hub kur #hub [kategori]        → hub kanalını ayarla
 *   r!ses-hub ad "🔊 {kullanici} • {sayi}"
 *   r!ses-hub limit 5 | limit kapat
 *   r!ses-hub bitrate 64000
 *   r!ses-hub bakici @rol --ekle|--çıkar  → odayı yönetebilecek roller
 *   r!ses-hub kapat                       → sistemi kapat
 *   r!ses-hub durum                       → mevcut ayar
 *   r!ses-hub temizle                     → boş/sahipsiz geçici odaları sil
 */
const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const { getLangSync, t } = require("../dil");
const { isPremium } = require("../utils");
const ses = require("../util/ses");

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  if (!isPremium(message.author.id)) return message.reply(t(lang, "ortak.premiumGerek"));
  const gid = message.guild.id;
  const alt = (args[0] || "").toLowerCase();

  if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels))
    return message.reply(t(lang, "ses.yetki"));

  const me = message.guild.members.me;
  if (!me.permissions.has(PermissionFlagsBits.ManageChannels))
    return message.reply(t(lang, "ses.botYetki"));

  const a = ses.ayarGetir(gid);

  /* ── kur ────────────────────────────────────────────────────────────── */
  if (["kur", "ayarla", "set", "ekle"].includes(alt)) {
    const kanal = message.mentions.channels.first() ||
      message.guild.channels.cache.get(args[1]);
    if (!kanal || kanal.type !== ChannelType.GuildVoice)
      return message.reply(t(lang, "ses.kanalGerek"));

    const kategori = message.mentions.channels.find(c => c.type === ChannelType.GuildCategory) ||
      kanal.parent || null;

    ses.ayarYaz(gid, {
      hubId: kanal.id,
      kategoriId: kategori?.id || null,
      ad: a?.ad || "🔊 {kullanici} • {sayi}",
      limit: a?.limit ?? null,
      bitrate: a?.bitrate ?? null,
      kilitli: true,
      izinliRoller: a?.izinliRoller || []
    });

    return message.reply({
      embeds: [new EmbedBuilder().setColor("#5865F2")
        .setTitle(t(lang, "ses.baslik"))
        .setDescription(t(lang, "ses.ayarlandi", {
          kanal: `<#${kanal.id}>`,
          kategori: kategori ? `<#${kategori.id}>` : t(lang, "ses.kategorisiz")
        }))]
    });
  }

  /* ── kapat ──────────────────────────────────────────────────────────── */
  if (["kapat", "sıfırla", "sifirla", "reset", "off"].includes(alt)) {
    if (!a) return message.reply(t(lang, "ses.yok"));
    ses.ayarSil(gid);
    return message.reply(t(lang, "ses.kapandi"));
  }

  /* ── temizle ────────────────────────────────────────────────────────── */
  if (["temizle", "clean", "süpür", "supur"].includes(alt)) {
    const all = require("croxydb").all() || {};
    const on = `ses_oda.${gid}.`;
    let n = 0;
    for (const [k] of Object.entries(all)) {
      if (!k.startsWith(on)) continue;
      const cid = k.slice(on.length);
      const kanal = message.guild.channels.cache.get(cid);
      if (!kanal || kanal.members.size === 0) {
        if (kanal) { await kanal.delete("Geçici oda temizliği").catch(() => {}); n++; }
        try { require("croxydb").delete(k); } catch {}
      }
    }
    return message.reply(t(lang, "ses.temizlendi", { n }));
  }

  if (!a) {
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#5865F2")
        .setTitle(t(lang, "ses.baslik"))
        .setDescription(t(lang, "ses.kullanim"))]
    });
  }

  /* ── ad ─────────────────────────────────────────────────────────────── */
  if (["ad", "isim", "name"].includes(alt)) {
    const yeni = args.slice(1).join(" ").replace(/^{|}$/g, "").trim();
    if (!yeni || !/\{(kullanici|sayi)\}/.test(yeni)) return message.reply(t(lang, "ses.adHata"));
    ses.ayarYaz(gid, { ...a, ad: yeni.slice(0, 90) });
    return message.reply(t(lang, "ses.adOk", { ad: yeni }));
  }

  /* ── limit ──────────────────────────────────────────────────────────── */
  if (["limit", "sınır", "sinir"].includes(alt)) {
    const v = (args[1] || "").toLowerCase();
    if (["kapat", "yok", "off", "0"].includes(v)) {
      ses.ayarYaz(gid, { ...a, limit: null });
      return message.reply(t(lang, "ses.limitKapali"));
    }
    const n = parseInt(v, 10);
    if (!n || n < 1 || n > 99) return message.reply(t(lang, "ses.limitHata"));
    ses.ayarYaz(gid, { ...a, limit: n });
    return message.reply(t(lang, "ses.limitOk", { n }));
  }

  /* ── bitrate ────────────────────────────────────────────────────────── */
  if (["bitrate"].includes(alt)) {
    const n = parseInt(args[1], 10);
    if (!n || n < 8000 || n > 96000) return message.reply(t(lang, "ses.bitrateHata"));
    ses.ayarYaz(gid, { ...a, bitrate: n });
    return message.reply(t(lang, "ses.bitrateOk", { n }));
  }

  /* ── bakıcı roller ──────────────────────────────────────────────────── */
  if (["bakici", "bakıcı", "moderatör", "moderator"].includes(alt)) {
    const rol = message.mentions.roles.first();
    if (!rol) return message.reply(t(lang, "ses.rolGerek"));
    const cikar = args.includes("--çıkar") || args.includes("--cikar") || args.includes("--remove");
    let liste = a.izinliRoller;
    if (cikar) liste = liste.filter(x => x !== rol.id);
    else if (!liste.includes(rol.id)) liste = [...liste, rol.id];
    ses.ayarYaz(gid, { ...a, izinliRoller: liste });
    return message.reply(t(lang, "ses.rollerOk", { adet: liste.length }));
  }

  /* ── durum ──────────────────────────────────────────────────────────── */
  const all = require("croxydb").all() || {};
  const odaSayi = Object.keys(all).filter(k => k.startsWith(`ses_oda.${gid}.`)).length;

  return message.reply({
    embeds: [new EmbedBuilder().setColor("#5865F2")
      .setTitle(t(lang, "ses.baslik"))
      .setDescription(t(lang, "ses.durum", {
        kanal: `<#${a.hubId}>`,
        kategori: a.kategoriId ? `<#${a.kategoriId}>` : t(lang, "ses.kategorisiz"),
        ad: a.ad,
        limit: a.limit ?? t(lang, "ses.limitsiz"),
        bitrate: a.bitrate ? `${a.bitrate}` : t(lang, "ses.varsayilan"),
        roller: a.izinliRoller.length,
        oda: odaSayi
      }))]
  });
};

exports.conf = {
  enabled: true, guildOnly: true,
  aliases: ["ses-hub", "voice-hub", "gecici-ses", "tmpvoice"],
  permLevel: 0, kategori: "ses"
};
exports.help = {
  name: "ses-hub",
  description: "Katılınca geçici ses odası açan hub kurar.",
  usage: "ses-hub kur #kanal [kategori] | ad | limit | bitrate | bakici @rol | kapat | temizle"
};
