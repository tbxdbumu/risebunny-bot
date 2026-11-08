/**
 * komutlar/sayac.js — Canlı kanal sayacı
 * (Eski sayaç: "kayıtlı/aktif kullanıcı" embed'i. Korunuyor.)
 *
 * KULLANIM
 *   r!sayac                          → eski canlı sayı raporu (mevcut davranış)
 *   r!sayac kur #ses-kanalı [tür]    → kanal ismini canlı günceller
 *   r!sayac şablon "👥 Üye: {n}"
 *   r!sayac tür uyeler|cevrimici|bot|insan|kayitli
 *   r!sayac sıfırla
 *   r!sayac durum
 */
const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const { isPremium } = require("../utils");
const sayac = require("../util/sayac");

const TURLER = ["uyeler", "cevrimici", "bot", "insan", "kayitli"];

/** Eski davranış: kayıtlı/aktif kullanıcı raporu */
function eskiSayac(client, message, lang) {
  const EN = lang === "en";
  const prefix = process.env.PREFIX || "r!";
  const LF = "__rb_live_users__";
  const live = db.fetch(LF) || {};
  const esik = Date.now() - 24 * 3600 * 1000;
  const aktif = Object.entries(live).filter(([, ts]) => Number(ts) > esik);
  const toplam = Object.keys(live).length;

  const e = new EmbedBuilder()
    .setColor("#2ecc71")
    .setTitle(EN ? "🖥️ RiseBunny Live Count" : "🖥️ RiseBunny Canlı Sayısı")
    .addFields(
      { name: EN ? "Registered (total)" : "Kayıtlı (toplam)", value: `**${toplam}**`, inline: true },
      { name: EN ? "Active in last 24h" : "Son 24 saatte aktif", value: `**${aktif.length}**`, inline: true }
    )
    .setFooter({ text: `${prefix}sayac • ${EN ? "live channel counter" : "canlı kanal sayacı"}` })
    .setTimestamp();
  return message.reply({ embeds: [e] });
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  if (!isPremium(message.author.id)) return message.reply(t(lang, "ortak.premiumGerek"));
  const gid = message.guild.id;
  const alt = (args[0] || "").toLowerCase();

  /* ── durum ──────────────────────────────────────────────────────── */
  if (["durum", "status"].includes(alt)) {
    const a = db.fetch(`sayac.${gid}`);
    if (!a) return message.reply(t(lang, "sayacKanal.yok"));
    const kanal = message.guild.channels.cache.get(a.kanalId);
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#2ecc71")
        .setTitle(t(lang, "sayacKanal.baslik"))
        .setDescription(t(lang, "sayacKanal.durum", {
          kanal: kanal ? `<#${kanal.id}>` : "—",
          tur: t(lang, `sayacKanal.tur_${a.tur || "uyeler"}`),
          sablon: a.sablon || "👥 {n}",
          deger: sayac.deger(message.guild, a.tur || "uyeler")
        }))]
    });
  }

  /* ── sıfırla ────────────────────────────────────────────────────── */
  if (["sıfırla", "sifirla", "kapat", "reset"].includes(alt)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply(t(lang, "sayacKanal.yetki"));
    if (!db.fetch(`sayac.${gid}`)) return message.reply(t(lang, "sayacKanal.yok"));
    db.delete(`sayac.${gid}`);
    return message.reply(t(lang, "sayacKanal.sifirlandi"));
  }

  /* ── tür ────────────────────────────────────────────────────────── */
  if (["tür", "tur", "type"].includes(alt)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply(t(lang, "sayacKanal.yetki"));
    const a = db.fetch(`sayac.${gid}`);
    if (!a) return message.reply(t(lang, "sayacKanal.yok"));
    const tur = (args[1] || "").toLowerCase();
    if (!TURLER.includes(tur)) return message.reply(t(lang, "sayacKanal.turHata"));
    db.set(`sayac.${gid}`, { ...a, tur });
    await sayac.guncelle(client, gid, true).catch(() => {});
    return message.reply(t(lang, "sayacKanal.turOk", { tur: t(lang, `sayacKanal.tur_${tur}`) }));
  }

  /* ── şablon ─────────────────────────────────────────────────────── */
  if (["şablon", "sablon", "template"].includes(alt)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply(t(lang, "sayacKanal.yetki"));
    const a = db.fetch(`sayac.${gid}`);
    if (!a) return message.reply(t(lang, "sayacKanal.yok"));
    const sablon = args.slice(1).join(" ").slice(0, 95);
    if (!sablon || !sablon.includes("{n}")) return message.reply(t(lang, "sayacKanal.sablonHata"));
    db.set(`sayac.${gid}`, { ...a, sablon });
    await sayac.guncelle(client, gid, true).catch(() => {});
    return message.reply(t(lang, "sayacKanal.sablonOk", { sablon }));
  }

  /* ── kur ────────────────────────────────────────────────────────── */
  if (["kur", "ayarla", "set", "ekle"].includes(alt)) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
      return message.reply(t(lang, "sayacKanal.yetki"));
    const kanal = message.mentions.channels.first();
    if (!kanal || !kanal.isVoiceBased())
      return message.reply(t(lang, "sayacKanal.kanalGerek"));

    const turAday = (args.find(x => TURLER.includes(String(x).toLowerCase())) || "uyeler").toLowerCase();
    db.set(`sayac.${gid}`, {
      kanalId: kanal.id,
      tur: turAday,
      sablon: "👥 {n}",
      sonDeger: 0
    });
    const ok = await sayac.guncelle(client, gid, true).catch(() => false);
    if (!ok) return message.reply(t(lang, "sayacKanal.izinHata"));
    return message.reply(t(lang, "sayacKanal.ayarlandi", {
      kanal: `<#${kanal.id}>`,
      tur: t(lang, `sayacKanal.tur_${turAday}`)
    }));
  }

  /* ── varsayılan: eski rapor ─────────────────────────────────────── */
  return eskiSayac(client, message, lang);
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["sayac", "counter", "uye-sayac"], permLevel: 0, kategori: "genel" };
exports.help = { name: "sayac", description: "Canlı kanal sayacı kurar (üye/bot/insan).", usage: "sayac kur #kanal [tür] | şablon <metin> | tür <tür> | sıfırla | durum" };
