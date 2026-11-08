/**
 * komutlar/seviye-ayar.js — XP ayarları  (alias: r!xp-ayar)
 *
 * KULLANIM
 *   r!seviye-ayar                       → mevcut ayarlar
 *   r!seviye-ayar aç | kapat            → XP sistemi
 *   r!seviye-ayar cooldown <saniye>     → mesaj cooldown
 *   r!seviye-ayar aralık <min> <max>    → kazanç aralığı
 *   r!seviye-ayar çarpan <1.0-5.0>      → premium çarpanı
 *   r!seviye-ayar mesaj aç|kapat [#kanal]
 *   r!seviye-ayar kanal <#kanal> --ekle|--çıkar
 *   r!seviye-ayar rol @rol --ekle|--çıkar   → XP kazandırmayan roller
 *   r!seviye-ayar sıfırla               → tüm ayarları varsayılana döndür
 */
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getLangSync, t } = require("../dil");
const xp = require("../util/xp");

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const gid = message.guild.id;
  if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild))
    return message.reply(t(lang, "seviyeAyar.yetki"));

  const alt = (args[0] || "").toLowerCase();
  const a = xp.ayarGetir(gid);

  /* ── aç / kapat ─────────────────────────────────────────────────── */
  if (["aç", "ac", "on"].includes(alt)) { xp.ayarYaz(gid, { acik: true }); return message.reply(t(lang, "seviyeAyar.acildi")); }
  if (["kapat", "off", "kapa"].includes(alt)) { xp.ayarYaz(gid, { acik: false }); return message.reply(t(lang, "seviyeAyar.kapandi")); }

  /* ── cooldown ───────────────────────────────────────────────────── */
  if (["cooldown", "cd", "bekleme"].includes(alt)) {
    const n = parseInt(args[1], 10);
    if (!n || n < 5 || n > 3600) return message.reply(t(lang, "seviyeAyar.cooldownHata"));
    xp.ayarYaz(gid, { cd: n * 1000 });
    return message.reply(t(lang, "seviyeAyar.cooldownOk", { n }));
  }

  /* ── aralık ─────────────────────────────────────────────────────── */
  if (["aralık", "aralik", "range"].includes(alt)) {
    const min = parseInt(args[1], 10);
    const max = parseInt(args[2], 10);
    if (!min || !max || min < 1 || max < min || max > 1000)
      return message.reply(t(lang, "seviyeAyar.aralikHata"));
    xp.ayarYaz(gid, { min, max });
    return message.reply(t(lang, "seviyeAyar.aralikOk", { min, max }));
  }

  /* ── çarpan ─────────────────────────────────────────────────────── */
  if (["çarpan", "carpan", "mult"].includes(alt)) {
    const n = parseFloat(String(args[1]).replace(",", "."));
    if (!n || n < 1 || n > 5) return message.reply(t(lang, "seviyeAyar.carpanHata"));
    xp.ayarYaz(gid, { carpan: n });
    return message.reply(t(lang, "seviyeAyar.carpanOk", { n }));
  }

  /* ── seviye mesajı ──────────────────────────────────────────────── */
  if (["mesaj", "message"].includes(alt)) {
    const durum = (args[1] || "").toLowerCase();
    const acik = ["aç", "ac", "on"].includes(durum);
    const kapali = ["kapat", "off", "kapa"].includes(durum);
    if (!acik && !kapali) return message.reply(t(lang, "seviyeAyar.mesajHata"));

    const kanal = message.mentions.channels.first();
    xp.ayarYaz(gid, {
      mesaj: acik ? "acik" : "kapali",
      ...(kanal ? { mesajKanal: kanal.id } : {})
    });
    return message.reply(acik
      ? t(lang, "seviyeAyar.mesajAcik", { kanal: kanal ? `<#${kanal.id}>` : t(lang, "seviyeAyar.kanalYok") })
      : t(lang, "seviyeAyar.mesajKapali"));
  }

  /* ── kanal / rol filtreleri ─────────────────────────────────────── */
  const ekle = args.includes("--ekle") || args.includes("--add");
  const cikar = args.includes("--çıkar") || args.includes("--cikar") || args.includes("--remove");

  if (["kanal", "channel"].includes(alt)) {
    const kanal = message.mentions.channels.first();
    if (!kanal) return message.reply(t(lang, "seviyeAyar.kanalGerek"));
    let liste = a.yokSayKanal;
    if (cikar) liste = liste.filter(x => x !== kanal.id);
    else if (!liste.includes(kanal.id)) liste = [...liste, kanal.id];
    xp.ayarYaz(gid, { yokSayKanal: liste });
    return message.reply(cikar
      ? t(lang, "seviyeAyar.kanalEklendi", { kanal: `<#${kanal.id}>`, adet: liste.length })
      : t(lang, "seviyeAyar.kanalEklendi", { kanal: `<#${kanal.id}>`, adet: liste.length }));
  }

  if (["rol", "role"].includes(alt)) {
    const rol = message.mentions.roles.first();
    if (!rol) return message.reply(t(lang, "seviyeAyar.rolGerek"));
    let liste = a.yokSayRol;
    if (cikar) liste = liste.filter(x => x !== rol.id);
    else if (!liste.includes(rol.id)) liste = [...liste, rol.id];
    xp.ayarYaz(gid, { yokSayRol: liste });
    return message.reply(t(lang, "seviyeAyar.rolEklendi", { rol: `<@&${rol.id}>`, adet: liste.length }));
  }

  /* ── sıfırla ────────────────────────────────────────────────────── */
  if (["sıfırla", "sifirla", "reset"].includes(alt)) {
    require("croxydb").delete(`xp_ayar.${gid}`);
    return message.reply(t(lang, "seviyeAyar.sifirlandi"));
  }

  /* ── durum ──────────────────────────────────────────────────────── */
  const d = xp.ayarGetir(gid);
  return message.reply({
    embeds: [new EmbedBuilder().setColor("#5865F2")
      .setTitle(t(lang, "seviyeAyar.baslik"))
      .setDescription(
        t(lang, "seviyeAyar.durum", {
          durum: d.acik ? "✅" : "❌",
          cd: Math.round(d.cd / 1000),
          min: d.min, max: d.max, carpan: d.carpan,
          mesaj: d.mesaj === "acik" ? "✅" : "❌",
          kanal: d.mesajKanal ? `<#${d.mesajKanal}>` : "—",
          kanalSayi: d.yokSayKanal.length,
          rolSayi: d.yokSayRol.length
        }))
      .setFooter({ text: t(lang, "seviyeAyar.footer") })]
  });
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["xp-ayar", "level-settings", "seviyeayar"], permLevel: 0, kategori: "seviye" };
exports.help = { name: "seviye-ayar", description: "Mesaj XP, cooldown, aralık ve filtreleri ayarlar.", usage: "seviye-ayar [aç|kapat|cooldown|aralık|çarpan|mesaj|kanal|rol|sıfırla]" };
