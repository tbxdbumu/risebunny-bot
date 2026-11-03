/**
 * komutlar/otomasyon.js — Otomasyon kuralları (MEE6 Automations)
 *
 *   r!otomasyon                                      → kural listesi
 *   r!otomasyon yeni <tetik> <ad...>                 → kural oluştur
 *   r!otomasyon tetik <id> <tetik>
 *   r!otomasyon kosul <id> icerir <metin>
 *   r!otomasyon kosul <id> esit <metin>
 *   r!otomasyon kosul <id> regex <ifade>
 *   r!otomasyon kosul <id> kanal #kanal
 *   r!otomasyon kosul <id> rol @rol
 *   r!otomasyon kosul <id> temizle
 *   r!otomasyon eylem <id> mesaj [#kanal] <metin>
 *   r!otomasyon eylem <id> dm <metin>
 *   r!otomasyon eylem <id> rol-ver @rol | rol-al @rol
 *   r!otomasyon eylem <id> tepki <emoji>
 *   r!otomasyon eylem <id> sil | kilit
 *   r!otomasyon eylem <id> sil-<n>                   → n. eylemi kaldır
 *   r!otomasyon aç|kapat <id>
 *   r!otomasyon bilgi <id>
 *   r!otomasyon sil <id>
 *
 * Tetikler: mesaj | katilim | ayrilma | rol-verildi | ses-katilim
 * Değişkenler: {kullanici} {kullaniciAdi} {sunucu} {kanal} {mesaj} {sayi}
 */
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getLangSync, t } = require("../dil");
const oto = require("../util/automation");

const TETIK_ESLE = {
  "mesaj": "mesaj", "message": "mesaj",
  "katilim": "katilim", "katılım": "katilim", "join": "katilim", "giris": "katilim",
  "ayrilma": "ayrilma", "ayrılma": "ayrilma", "leave": "ayrilma", "cikis": "ayrilma",
  "rol-verildi": "rol_verildi", "rol_verildi": "rol_verildi", "role": "rol_verildi",
  "ses-katilim": "ses_katilim", "ses_katilim": "ses_katilim", "voice": "ses_katilim"
};

const EYLEM_ESLE = {
  "mesaj": "mesaj", "message": "mesaj",
  "dm": "dm",
  "rol-ver": "rol_ver", "rol_ver": "rol_ver", "rolver": "rol_ver",
  "rol-al": "rol_al", "rol_al": "rol_al", "rolal": "rol_al",
  "tepki": "tepki", "reaction": "tepki",
  "sil": "sil", "delete": "sil",
  "kilit": "kilit", "lock": "kilit"
};

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const gid = message.guild.id;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
    return message.reply(t(lang, "otomasyon.yetki"));

  const alt = (args[0] || "").toLowerCase();
  const id = (args[1] || "").trim();

  /* ── tamamı / liste ─────────────────────────────────────────────────── */
  if (!alt || ["liste", "list"].includes(alt)) {
    const liste = oto.kurallar(gid);
    if (!liste.length) {
      return message.reply({
        embeds: [new EmbedBuilder().setColor("#ee7621")
          .setTitle(t(lang, "otomasyon.baslik"))
          .setDescription(t(lang, "otomasyon.bos"))
          .addFields({ name: t(lang, "otomasyon.kullanimBaslik"), value: t(lang, "otomasyon.kullanim") })]
      });
    }
    const satirlar = liste.slice(0, 25).map(k =>
      `${k.acik === false ? "⏸️" : "▶️"} \`${k.id}\` **${k.ad}** — ${t(lang, `otomasyon.tetik_${k.tetik}`)} • ${(k.eylemler || []).length} ${t(lang, "otomasyon.eylemKisa")} • ${k.sayac || 0}x`);
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#ee7621")
        .setTitle(t(lang, "otomasyon.baslik"))
        .setDescription(satirlar.join("\n").slice(0, 3900))
        .setFooter({ text: t(lang, "otomasyon.listeFt", { n: liste.length, max: oto.MAX_KURAL }) })]
    });
  }

  /* ── yeni ───────────────────────────────────────────────────────────── */
  if (["yeni", "ekle", "new", "create"].includes(alt)) {
    const tetikHam = (args[1] || "").toLowerCase();
    const tetik = TETIK_ESLE[tetikHam];
    if (!tetik) return message.reply(t(lang, "otomasyon.tetikHata"));
    const ad = args.slice(2).join(" ").slice(0, 80) || t(lang, `otomasyon.tetik_${tetik}`);
    const kural = oto.ekle(gid, { ad, tetik, kosul: {}, eylemler: [] });
    if (!kural) return message.reply(t(lang, "otomasyon.limit", { n: oto.MAX_KURAL }));
    return message.reply({
      embeds: [oto.kuralEmbed(kural, message.guild, lang)
        .setFooter({ text: t(lang, "otomasyon.yeniFt", { id: kural.id }) })]
    });
  }

  if (!id) return message.reply(t(lang, "otomasyon.idGerek"));
  const kural = oto.bul(gid, id);
  if (!kural) return message.reply(t(lang, "otomasyon.kuralYok"));

  /* ── bilgi ──────────────────────────────────────────────────────────── */
  if (["bilgi", "info", "goster", "göster"].includes(alt)) {
    return message.reply({ embeds: [oto.kuralEmbed(kural, message.guild, lang)] });
  }

  /* ── aç / kapat ────────────────────────────────────────────────────── */
  if (["aç", "ac", "on", "kapat", "off", "kapa"].includes(alt)) {
    const acik = ["aç", "ac", "on"].includes(alt);
    oto.guncelle(gid, id, { acik });
    return message.reply(acik ? t(lang, "otomasyon.acik") : t(lang, "otomasyon.kapali"));
  }

  /* ── sil ───────────────────────────────────────────────────────────── */
  if (["sil", "kaldır", "kaldir", "delete"].includes(alt)) {
    oto.sil(gid, id);
    return message.reply(t(lang, "otomasyon.silindi"));
  }

  /* ── tetik değiştir ────────────────────────────────────────────────── */
  if (["tetik", "trigger"].includes(alt)) {
    const tetik = TETIK_ESLE[(args[2] || "").toLowerCase()];
    if (!tetik) return message.reply(t(lang, "otomasyon.tetikHata"));
    const g = oto.guncelle(gid, id, { tetik });
    return message.reply({ embeds: [oto.kuralEmbed(g, message.guild, lang)] });
  }

  /* ── koşul ─────────────────────────────────────────────────────────── */
  if (["koşul", "kosul", "if", "kosullar"].includes(alt)) {
    const tur = (args[2] || "").toLowerCase();
    const deger = args.slice(3).join(" ").trim();
    const kosul = { ...(kural.kosul || {}) };

    if (["temizle", "sıfırla", "sifirla", "clear"].includes(tur)) {
      const g = oto.guncelle(gid, id, { kosul: {} });
      return message.reply({ embeds: [oto.kuralEmbed(g, message.guild, lang)] });
    }
    if (["icerir", "içerir", "contains"].includes(tur)) {
      if (!deger) return message.reply(t(lang, "otomasyon.degerGerek"));
      kosul.icerir = deger.slice(0, 200);
      delete kosul.esit; delete kosul.regex;
    } else if (["esit", "eşit", "equals"].includes(tur)) {
      if (!deger) return message.reply(t(lang, "otomasyon.degerGerek"));
      kosul.esit = deger.slice(0, 200);
      delete kosul.icerir; delete kosul.regex;
    } else if (["regex", "desen"].includes(tur)) {
      if (!deger) return message.reply(t(lang, "otomasyon.degerGerek"));
      try { new RegExp(deger); } catch { return message.reply(t(lang, "otomasyon.regexHata")); }
      kosul.regex = deger.slice(0, 200);
      delete kosul.icerir; delete kosul.esit;
    } else if (["kanal", "channel"].includes(tur)) {
      const kanal = message.mentions.channels.first();
      if (!kanal) return message.reply(t(lang, "otomasyon.kanalGerek"));
      kosul.kanalId = kanal.id;
    } else if (["rol", "role"].includes(tur)) {
      const rol = message.mentions.roles.first();
      if (!rol) return message.reply(t(lang, "otomasyon.rolGerek"));
      kosul.rolId = rol.id;
    } else {
      return message.reply(t(lang, "otomasyon.kosulKullanim"));
    }

    const g = oto.guncelle(gid, id, { kosul });
    return message.reply({ embeds: [oto.kuralEmbed(g, message.guild, lang)] });
  }

  /* ── eylem ─────────────────────────────────────────────────────────── */
  if (["eylem", "aksiyon", "action"].includes(alt)) {
    const eylemAd = (args[2] || "").toLowerCase();
    const kalan = args.slice(3).join(" ").trim();

    // eylem sil-<n>
    const silEsle = /^sil[-_](\d+)$/.exec(eylemAd);
    if (silEsle) {
      const n = parseInt(silEsle[1], 10);
      const eylemler = [...(kural.eylemler || [])];
      if (!eylemler[n - 1]) return message.reply(t(lang, "otomasyon.eylemYok"));
      eylemler.splice(n - 1, 1);
      const g = oto.guncelle(gid, id, { eylemler });
      return message.reply({ embeds: [oto.kuralEmbed(g, message.guild, lang)] });
    }

    const tur = EYLEM_ESLE[eylemAd];
    if (!tur) return message.reply(t(lang, "otomasyon.eylemHata"));

    const eylemler = [...(kural.eylemler || [])];
    if (eylemler.length >= oto.MAX_EYLEM)
      return message.reply(t(lang, "otomasyon.eylemLimit", { n: oto.MAX_EYLEM }));

    let yeniEylem = null;
    if (tur === "mesaj") {
      const kanal = message.mentions.channels.first();
      const metin = args.slice(3)
        .filter(a => !a.startsWith("<#"))
        .join(" ")
        .replace(/\\n/g, "\n")
        .trim();
      if (!metin) return message.reply(t(lang, "otomasyon.metinGerek"));
      yeniEylem = { tur, metin: metin.slice(0, 2000), ...(kanal ? { kanalId: kanal.id } : {}) };
    } else if (tur === "dm") {
      if (!kalan) return message.reply(t(lang, "otomasyon.metinGerek"));
      yeniEylem = { tur, metin: kalan.replace(/\\n/g, "\n").slice(0, 2000) };
    } else if (tur === "rol_ver" || tur === "rol_al") {
      const rol = message.mentions.roles.first();
      if (!rol) return message.reply(t(lang, "otomasyon.rolGerek"));
      if (rol.position >= message.guild.members.me.roles.highest.position)
        return message.reply(t(lang, "toplurol.rolYuksek", { rol: rol.name }));
      yeniEylem = { tur, rolId: rol.id };
    } else if (tur === "tepki") {
      const emoji = args[3] && /^(<a?:[a-zA-Z0-9_~]+:\d+>|.{1,4})$/u.test(args[3]) ? args[3] : null;
      if (!emoji) return message.reply(t(lang, "tepkirol.emojiGerek"));
      yeniEylem = { tur, emoji };
    } else {
      yeniEylem = { tur };
    }

    eylemler.push(yeniEylem);
    const g = oto.guncelle(gid, id, { eylemler });
    return message.reply({ embeds: [oto.kuralEmbed(g, message.guild, lang)] });
  }

  return message.reply({
    embeds: [new EmbedBuilder().setColor("#ee7621")
      .setTitle(t(lang, "otomasyon.baslik"))
      .setDescription(t(lang, "otomasyon.kullanim"))]
  });
};

exports.conf = {
  enabled: true, guildOnly: true,
  aliases: ["otomasyon", "automation", "automations", "otomasyon-kural"],
  permLevel: 0, kategori: "otomasyon"
};
exports.help = {
  name: "otomasyon",
  description: "Mesaj/katılım/rol/ses tetikli otomasyon kuralları.",
  usage: "otomasyon [yeni|tetik|koşul|eylem|aç|kapat|bilgi|sil] <id>"
};
