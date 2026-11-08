/**
 * komutlar/embed.js — Embed / duyuru oluşturucu
 *
 * KULLANIM
 *   r!embed                                 → modal (hızlı oluştur)
 *   r!embed başlık <metin>
 *   r!embed açıklama <metin>
 *   r!embed renk #ff8800
 *   r!embed resim <url>
 *   r!embed küçükresim <url>
 *   r!embed altbilgi <metin>
 *   r!embed yazar <metin> [ikon-url]
 *   r!embed kanal #kanal                    → gönderilecek kanal
 *   r!embed alan ekle <ad> | <değer> [satır-içi]
 *   r!embed alan sil <n>
 *   r!embed gönder [#kanal] [@rol]
 *   r!embed sıfırla
 *   r!embed önizle
 *
 * Taslak DB: `embed_taslak.<gid>` = { baslik, aciklama, renk, resim, kucukresim,
 *   altbilgi, yazar, yazarIkon, alanlar: [{ad, deger, satirIci}] }
 * Kanal DB:  `embed_kanal.<gid>` (opsiyonel varsayılan kanal)
 */
const {
  EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

const TASLAK = (gid) => `embed_taslak.${gid}`;
const BOS = { baslik: "", aciklama: "", renk: "#ee7621", resim: "", kucukresim: "", altbilgi: "", yazar: "", yazarIkon: "", alanlar: [] };

function taslakGetir(gid) { return { ...BOS, ...(db.fetch(TASLAK(gid)) || {}) }; }
function taslakYaz(gid, v) { db.set(TASLAK(gid), { ...BOS, ...v }); }

/* Discord bir embed'de en az bir İÇERİK alanı ister (başlık/açıklama/alan).
   Sadece renkli boş embed gönderilirse 50035 BASE_TYPE_REQUIRED döner.
   Bu yüzden içerik yoksa açıklamayı zorunlu olarak dolduruyoruz. */
function icerikVarMi(d) {
  return !!(d.baslik || d.aciklama || d.alanlar?.length || d.resim || d.kucukresim);
}

function embedOlustur(d, lang) {
  const e = new EmbedBuilder().setColor(d.renk || "#ee7621");
  if (d.baslik) e.setTitle(d.baslik.slice(0, 256));
  if (d.aciklama) e.setDescription(d.aciklama.slice(0, 4000));
  /* İçerik yoksa boş embed Discord'a gönderilemez → bilgilendirici açıklama koy */
  if (!icerikVarMi(d)) e.setDescription(t(lang, "embed.bosOnizleme"));
  if (d.resim) e.setImage(d.resim);
  if (d.kucukresim) e.setThumbnail(d.kucukresim);
  if (d.altbilgi) e.setFooter({ text: d.altbilgi.slice(0, 2048) });
  if (d.yazar) e.setAuthor({
    name: d.yazar.slice(0, 256),
    ...(d.yazarIkon ? { iconURL: d.yazarIkon } : {})
  });
  if (d.alanlar?.length) {
    e.addFields(d.alanlar.slice(0, 25).map(a => ({
      name: String(a.ad || "—").slice(0, 256),
      value: String(a.deger || "—").slice(0, 1024),
      inline: !!a.satirIci
    })));
  }
  return e;
}

function onizleme(d, lang) {
  const ozet = new EmbedBuilder()
    .setColor("#2b2d31")
    .setTitle(t(lang, "embed.baslik"))
    .setDescription(t(lang, "embed.onizleme"))
    .addFields(
      { name: t(lang, "embed.baslikAlan"), value: (d.baslik || "—").slice(0, 100), inline: true },
      { name: t(lang, "embed.renkAlan"), value: d.renk || "—", inline: true },
      { name: t(lang, "embed.alanSayi"), value: `${d.alanlar?.length || 0}`, inline: true },
      { name: t(lang, "embed.aciklamaAlan"), value: (d.aciklama || "—").slice(0, 300) },
      { name: t(lang, "embed.kullanimBaslik"), value: t(lang, "embed.kullanim") }
    )
    .setTimestamp();
  return ozet;
}

function urlMu(s) {
  return /^https?:\/\/\S+$/i.test(String(s || ""));
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const gid = message.guild.id;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages))
    return message.reply(t(lang, "embed.yetki"));

  const alt = (args[0] || "").toLowerCase();
  const geri = args.slice(1).join(" ").trim();
  const d = taslakGetir(gid);

  /* ── argümansız → modal ─────────────────────────────────────────────── */
  if (!alt) {
    const modal = new ModalBuilder().setCustomId("embed_modal").setTitle(t(lang, "embed.baslik"));
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("baslik")
        .setLabel(t(lang, "embed.baslikAlan")).setStyle(TextInputStyle.Short)
        .setRequired(false).setMaxLength(256).setValue(d.baslik || "")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("aciklama")
        .setLabel(t(lang, "embed.aciklamaAlan")).setStyle(TextInputStyle.Paragraph)
        .setRequired(false).setMaxLength(4000).setValue(d.aciklama || "")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("renk")
        .setLabel(t(lang, "embed.renkAlan") + " (#ee7621)").setStyle(TextInputStyle.Short)
        .setRequired(false).setMaxLength(9).setValue(d.renk || "#ee7621")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("resim")
        .setLabel(t(lang, "embed.resimAlan")).setStyle(TextInputStyle.Short)
        .setRequired(false).setValue(d.resim || "")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("altbilgi")
        .setLabel(t(lang, "embed.altbilgiAlan")).setStyle(TextInputStyle.Short)
        .setRequired(false).setMaxLength(200).setValue(d.altbilgi || ""))
    );
    return message.channel.send({
      embeds: [onizleme(d, lang)],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId("embed_duzenle").setLabel(t(lang, "embed.duzenle"))
          .setStyle(ButtonStyle.Primary).setEmoji("✏️"),
        new ButtonBuilder().setCustomId("embed_gonder").setLabel(t(lang, "embed.gonderBtn"))
          .setStyle(ButtonStyle.Success).setEmoji("📤")
      )]
    }).catch(() => {});
  }

  /* ── basit alanlar ──────────────────────────────────────────────────── */
  if (["başlık", "baslik", "title"].includes(alt)) {
    d.baslik = geri.slice(0, 256);
    taslakYaz(gid, d);
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }
  if (["açıklama", "aciklama", "desc", "description"].includes(alt)) {
    d.aciklama = geri.replace(/\\n/g, "\n").slice(0, 4000);
    taslakYaz(gid, d);
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }
  if (["renk", "color", "colour"].includes(alt)) {
    const r = geri.trim();
    if (!/^#?[0-9a-f]{6}$/i.test(r)) return message.reply(t(lang, "embed.renkHata"));
    d.renk = r.startsWith("#") ? r : `#${r}`;
    taslakYaz(gid, d);
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }
  if (["resim", "image"].includes(alt)) {
    if (geri && !urlMu(geri)) return message.reply(t(lang, "embed.urlHata"));
    d.resim = geri;
    taslakYaz(gid, d);
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }
  if (["küçükresim", "kucukresim", "thumb", "thumbnail"].includes(alt)) {
    if (geri && !urlMu(geri)) return message.reply(t(lang, "embed.urlHata"));
    d.kucukresim = geri;
    taslakYaz(gid, d);
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }
  if (["altbilgi", "footer"].includes(alt)) {
    d.altbilgi = geri.slice(0, 2048);
    taslakYaz(gid, d);
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }
  if (["yazar", "author"].includes(alt)) {
    // r!embed yazar İsim | ikon-url
    const [ad, ikon] = geri.split("|").map(s => s.trim());
    if (!ad) return message.reply(t(lang, "embed.yazarHata"));
    d.yazar = ad.slice(0, 256);
    d.yazarIkon = ikon && urlMu(ikon) ? ikon : "";
    taslakYaz(gid, d);
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }

  /* ── alanlar ────────────────────────────────────────────────────────── */
  if (["alan", "field"].includes(alt)) {
    const islem = (args[1] || "").toLowerCase();
    const govde = args.slice(2).join(" ");
    if (["ekle", "add"].includes(islem)) {
      const parca = govde.split("|").map(s => s.trim());
      if (parca.length < 2 || !parca[0]) return message.reply(t(lang, "embed.alanHata"));
      const satirIci = parca.some(p => /^(satır|satir|inline|satıriçi)$/i.test(p));
      const [ad, deger] = parca.filter(p => !/^(satır|satir|inline|satıriçi)$/i.test(p));
      d.alanlar = d.alanlar || [];
      if (d.alanlar.length >= 25) return message.reply(t(lang, "embed.alanLimit", { n: 25 }));
      d.alanlar.push({ ad: ad.slice(0, 256), deger: deger.slice(0, 1024), satirIci });
      taslakYaz(gid, d);
      return message.reply({ embeds: [embedOlustur(d, lang)] });
    }
    if (["sil", "remove", "kaldır", "kaldir"].includes(islem)) {
      const n = parseInt(args[2], 10);
      if (!n || !d.alanlar?.[n - 1]) return message.reply(t(lang, "embed.alanYok"));
      d.alanlar.splice(n - 1, 1);
      taslakYaz(gid, d);
      return message.reply({ embeds: [embedOlustur(d, lang)] });
    }
    if (["temizle", "clear"].includes(islem)) {
      d.alanlar = [];
      taslakYaz(gid, d);
      return message.reply({ embeds: [embedOlustur(d, lang)] });
    }
    return message.reply(t(lang, "embed.alanHata"));
  }

  /* ── kanal ──────────────────────────────────────────────────────────── */
  if (["kanal", "channel"].includes(alt)) {
    const kanal = message.mentions.channels.first();
    if (!kanal) return message.reply(t(lang, "embed.kanalGerek"));
    db.set(`embed_kanal.${gid}`, kanal.id);
    return message.reply(t(lang, "embed.kanalAyarlandi", { kanal: `<#${kanal.id}>` }));
  }

  /* ── gönder ─────────────────────────────────────────────────────────── */
  if (["gönder", "gonder", "send", "yayinla", "publish"].includes(alt)) {
    if (!d.baslik && !d.aciklama && !d.alanlar?.length)
      return message.reply(t(lang, "embed.bosTaslak"));

    const kanal = message.mentions.channels.first() ||
      db.fetch(`embed_kanal.${gid}`) && message.guild.channels.cache.get(db.fetch(`embed_kanal.${gid}`)) ||
      message.channel;
    const rol = message.mentions.roles.first();

    const gonderi = await kanal.send({
      content: rol ? `${rol}` : undefined,
      embeds: [embedOlustur(d, lang)],
      allowedMentions: rol ? { roles: [rol.id] } : { parse: [] }
    }).catch(() => null);
    if (!gonderi) return message.reply(t(lang, "embed.gonderHata"));
    return message.reply(t(lang, "embed.gonderildi", { url: gonderi.url }));
  }

  /* ── sıfırla / önizle ───────────────────────────────────────────────── */
  if (["sıfırla", "sifirla", "reset", "temizle"].includes(alt)) {
    taslakYaz(gid, { ...BOS });
    return message.reply(t(lang, "embed.sifirlandi"));
  }
  if (["önizle", "onizle", "preview"].includes(alt)) {
    return message.reply({ embeds: [embedOlustur(d, lang)] });
  }

  /* ── yardım ─────────────────────────────────────────────────────────── */
  return message.reply({ embeds: [onizleme(d, lang)] });
};

exports.onizleme = onizleme;
exports.embedOlustur = embedOlustur;
exports.taslakGetir = taslakGetir;
exports.taslakYaz = taslakYaz;
exports.BOS = BOS;

exports.conf = {
  enabled: true, guildOnly: true,
  aliases: ["embed", "embed-olustur", "duyuru-olustur", "embedbuilder"],
  permLevel: 0, kategori: "duyuru"
};
exports.help = {
  name: "embed",
  description: "Embed/duyuru oluşturup gönderir (modal destekli).",
  usage: "embed [başlık|açıklama|renk|resim|küçükresim|altbilgi|yazar|alan|kanal|gönder|sıfırla|önizle]"
};
