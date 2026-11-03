/**
 * komutlar/tepkirol.js — Tepki rol sistemi
 *
 * ALT KOMUTLAR
 *   r!tepkirol                       → yardım / kullanım
 *   r!tepkirol oluştur [mesaj-id]    → yeni kurulum taslağı / var olan mesajı kullan
 *   r!tepkirol ekle <emoji> @rol     → emoji → rol
 *   r!tepkirol buton @rol [etiket]   → buton → rol
 *   r!tepkirol mod buton|emoji       → panel türü
 *   r!tepkirol seçim tek|çok         → tek/çok rol
 *   r!tepkirol başlık <metin>
 *   r!tepkirol açıklama <metin>
 *   r!tepkirol yayinla [mesaj-id]    → canlıya al (mesaj oluştur ya da güncelle)
 *   r!tepkirol sil [mesaj-id | @rol] → panel/rol sil
 *   r!tepkirol liste                 → sunucudaki tüm paneller
 *
 * Tüm metinler `dil/{tr,en}.js → tepkirol.*` anahtarlarından gelir.
 */
const {
  EmbedBuilder, PermissionFlagsBits, ActionRowBuilder, ButtonBuilder, ButtonStyle
} = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const rolMod = require("../util/rol");

const TASLAK = (gid) => `tepkirol_taslak.${gid}`;

function taslakGetir(gid) {
  return db.fetch(TASLAK(gid)) || { tur: "emoji", secim: "cok", baslik: "", aciklama: "", roller: [] };
}
function taslakYaz(gid, v) { db.set(TASLAK(gid), v); }
function taslakSil(gid) { try { db.delete(TASLAK(gid)); } catch {} }

/** Emoji metnini (<:ad:id>, <a:ad:id>, :ad:id, unicode) yakalar. */
function emojiParsel(args) {
  for (const a of args) {
    if (/^<a?:[a-zA-Z0-9_~]+:\d+>$/.test(a)) return a;
    if (/^:[a-zA-Z0-9_~]+:\d+$/.test(a)) return a;
    if ([...a].length <= 3 && /\p{Extended_Pictographic}/u.test(a)) return a;
  }
  return null;
}

function mesajIdBul(args) {
  for (const a of args) if (/^\d{15,22}$/.test(a)) return a;
  return null;
}

function rolBul(message, args) {
  const m = message.mentions.roles.first();
  if (m) return m;
  for (const a of args) {
    if (/^\d{15,22}$/.test(a)) {
      const r = message.guild.roles.cache.get(a);
      if (r) return r;
    }
  }
  return null;
}

function ayarPaneli(gid, taslak, lang) {
  const roller = taslak.roller.length
    ? taslak.roller.map((r, i) => {
        const etiket = r.emoji ? r.emoji : `[${(r.label || "").slice(0, 40)}]`;
        return `${i + 1}. ${etiket} → <@&${r.rolId}>`;
      }).join("\n")
    : t(lang, "tepkirol.rolYok");

  return new EmbedBuilder()
    .setColor("#ee7621")
    .setTitle(t(lang, "tepkirol.baslik"))
    .setDescription(
      `**${t(lang, "tepkirol.tur")}:** ${taslak.tur === "buton" ? t(lang, "tepkirol.buton") : t(lang, "tepkirol.emojiTepki")}\n` +
      `**${t(lang, "tepkirol.secim")}:** ${taslak.secim === "tek" ? t(lang, "tepkirol.tek") : t(lang, "tepkirol.cok")}\n` +
      `**${t(lang, "tepkirol.baslikEtiket")}:** ${taslak.baslik || "—"}\n` +
      `**${t(lang, "tepkirol.aciklamaEtiket")}:** ${taslak.aciklama ? taslak.aciklama.slice(0, 140) : "—"}\n\n` +
      `**${t(lang, "tepkirol.rollerSayi", { n: taslak.roller.length, max: rolMod.MAX_ROL })}:**\n${roller.slice(0, 3000)}`
    )
    .setFooter({ text: t(lang, "tepkirol.footer") });
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles))
    return message.reply(t(lang, "tepkirol.yetki"));
  if (!message.guild.members.me.permissions.has(PermissionFlagsBits.ManageRoles))
    return message.reply(t(lang, "tepkirol.botYetki"));

  const alt = (args[0] || "").toLowerCase();
  const gid = message.guild.id;

  /* ── yayinla ─────────────────────────────────────────────────────── */
  if (["yayinla", "publish"].includes(alt)) {
    const taslak = taslakGetir(gid);
    if (!taslak.roller.length) return message.reply(t(lang, "tepkirol.onceRol"));
    if (!message.guild.members.me.permissions.has(PermissionFlagsBits.AddReactions))
      return message.reply(t(lang, "tepkirol.tepkiYetki"));

    const hedefMesajId = mesajIdBul(args);
    if (hedefMesajId && rolMod.kayitGetir(gid, hedefMesajId)) {
      const a = rolMod.kayitGetir(gid, hedefMesajId);
      rolMod.kayitYaz(gid, hedefMesajId, { ...a, ...taslak });
      const yenilenen = await rolMod.rolMesajiYenile(client, message.guild, hedefMesajId);
      taslakSil(gid);
      if (!yenilenen) return message.reply(t(lang, "tepkirol.eskiMesajYok"));
      return message.reply(t(lang, "tepkirol.guncellendi", { url: yenilenen.url }));
    }

    const gonderi = await rolMod.rolMesajiGonder(client, message.guild, message.channel, taslak, lang)
      .catch(() => null);
    if (!gonderi) return message.reply(t(lang, "tepkirol.gonderilemez"));
    taslakSil(gid);
    return message.reply(t(lang, "tepkirol.yayinda", { url: gonderi.url, id: gonderi.id }));
  }

  /* ── oluştur ─────────────────────────────────────────────────────── */
  if (["oluştur", "olustur", "create"].includes(alt)) {
    const hedefMesajId = mesajIdBul(args);
    if (hedefMesajId) {
      const kanal = message.mentions.channels.first() || message.channel;
      const mevcut = await kanal.messages.fetch(hedefMesajId).catch(() => null);
      if (!mevcut) return message.reply(t(lang, "tepkirol.mesajYok"));
      const eski = rolMod.kayitGetir(gid, hedefMesajId) || {
        kanalId: kanal.id, tur: "emoji", secim: "cok", baslik: "", aciklama: "", roller: []
      };
      rolMod.kayitYaz(gid, hedefMesajId, eski);
      return message.reply(t(lang, "tepkirol.hazir", { id: hedefMesajId }));
    }

    const taslak = { tur: "emoji", secim: "cok", baslik: "", aciklama: "", roller: [] };
    taslakYaz(gid, taslak);

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("rrw_mode_emoji").setLabel(t(lang, "tepkirol.emojiTepki")).setStyle(ButtonStyle.Secondary).setEmoji("😀"),
      new ButtonBuilder().setCustomId("rrw_mode_buton").setLabel(t(lang, "tepkirol.buton")).setStyle(ButtonStyle.Secondary).setEmoji("🔘"),
      new ButtonBuilder().setCustomId("rrw_secim").setLabel(t(lang, "tepkirol.secim")).setStyle(ButtonStyle.Secondary).setEmoji("🎚️"),
      new ButtonBuilder().setCustomId("rrw_title").setLabel(t(lang, "tepkirol.baslikEtiket")).setStyle(ButtonStyle.Primary).setEmoji("📝"),
      new ButtonBuilder().setCustomId("rrw_publish").setLabel(alt).setStyle(ButtonStyle.Success).setEmoji("✅")
    );
    row.components[4].data.label = lang === "en" ? "Publish" : "Yayınla";

    return message.channel.send({ embeds: [ayarPaneli(gid, taslak, lang)], components: [row] });
  }

  /* ── ekle / buton ────────────────────────────────────────────────── */
  if (["ekle", "add", "buton", "button"].includes(alt)) {
    const taslak = taslakGetir(gid);
    if (taslak.roller.length >= rolMod.MAX_ROL)
      return message.reply(t(lang, "tepkirol.maxRol", { n: rolMod.MAX_ROL }));

    const rol = rolBul(message, args);
    if (!rol) return message.reply(t(lang, "tepkirol.rolEtiketle"));
    if (rol.managed || rol.id === gid)
      return message.reply(t(lang, "tepkirol.yonetilenRol"));

    if (["buton", "button"].includes(alt)) {
      const etiket = args
        .filter(a => !a.startsWith("<@&") && !/^\d{15,22}$/.test(a) && !["buton", "button"].includes(a.toLowerCase()))
        .join(" ").slice(0, 80);
      taslak.tur = "buton";
      taslak.roller.push({
        rolId: rol.id, emoji: null,
        label: etiket || rol.name,
        style: ButtonStyle.Secondary
      });
    } else {
      const emoji = emojiParsel(args);
      if (!emoji) return message.reply(t(lang, "tepkirol.emojiGerek"));
      taslak.roller.push({ emoji, rolId: rol.id, label: rol.name });
    }
    taslakYaz(gid, taslak);
    return message.reply({ embeds: [ayarPaneli(gid, taslak, lang)] });
  }

  /* ── sil / kaldır ────────────────────────────────────────────────── */
  if (["sil", "kaldır", "kaldir", "remove", "delete"].includes(alt)) {
    const hedefMesajId = mesajIdBul(args);
    if (hedefMesajId) {
      const kayit = rolMod.kayitGetir(gid, hedefMesajId);
      if (!kayit) return message.reply(t(lang, "tepkirol.ayarYok"));
      const kanal = message.guild.channels.cache.get(kayit.kanalId);
      if (kanal) {
        const msg = await kanal.messages.fetch(hedefMesajId).catch(() => null);
        if (msg) await msg.delete().catch(() => {});
      }
      rolMod.kayitSil(gid, hedefMesajId);
      return message.reply(t(lang, "tepkirol.silindi"));
    }
    const rol = rolBul(message, args);
    if (rol) {
      const tl = taslakGetir(gid);
      tl.roller = tl.roller.filter(r => r.rolId !== rol.id);
      taslakYaz(gid, tl);
      return message.reply({ embeds: [ayarPaneli(gid, tl, lang)] });
    }
    taslakSil(gid);
    return message.reply(t(lang, "tepkirol.taslakSilindi"));
  }

  /* ── mod / seçim / başlık / açıklama ─────────────────────────────── */
  if (["mod", "mode"].includes(alt)) {
    const tl = taslakGetir(gid);
    tl.tur = (args[1] || "").toLowerCase().startsWith("buton") ? "buton" : "emoji";
    taslakYaz(gid, tl);
    return message.reply({ embeds: [ayarPaneli(gid, tl, lang)] });
  }
  if (["seçim", "secim", "choice"].includes(alt)) {
    const tl = taslakGetir(gid);
    tl.secim = (args[1] || "").toLowerCase().startsWith("tek") ? "tek" : "cok";
    taslakYaz(gid, tl);
    return message.reply({ embeds: [ayarPaneli(gid, tl, lang)] });
  }
  if (["başlık", "baslik", "title"].includes(alt)) {
    const tl = taslakGetir(gid);
    tl.baslik = args.slice(1).join(" ").slice(0, 200);
    taslakYaz(gid, tl);
    return message.reply({ embeds: [ayarPaneli(gid, tl, lang)] });
  }
  if (["açıklama", "aciklama", "desc"].includes(alt)) {
    const tl = taslakGetir(gid);
    tl.aciklama = args.slice(1).join(" ").slice(0, 800);
    taslakYaz(gid, tl);
    return message.reply({ embeds: [ayarPaneli(gid, tl, lang)] });
  }

  /* ── liste ───────────────────────────────────────────────────────── */
  if (["liste", "list"].includes(alt)) {
    const liste = rolMod.guildKayitlari(gid);
    if (!liste.length) return message.reply(t(lang, "tepkirol.panelYok"));
    const satirlar = liste.slice(0, 15).map(k => {
      const tur = k.tur === "buton" ? t(lang, "tepkirol.buton") : t(lang, "tepkirol.emojiTepki");
      return `• [${tur}] <#${k.kanalId}> \`${k.messageId}\` — ${(k.roller || []).length} — ` +
             `[${lang === "en" ? "open" : "aç"}](https://discord.com/channels/${gid}/${k.kanalId}/${k.messageId})`;
    });
    return message.reply({
      embeds: [new EmbedBuilder().setColor("#ee7621")
        .setTitle(t(lang, "tepkirol.panelBaslik"))
        .setDescription(satirlar.join("\n").slice(0, 3800))]
    });
  }

  /* ── yardım ──────────────────────────────────────────────────────── */
  return message.reply({
    embeds: [new EmbedBuilder()
      .setColor("#ee7621")
      .setTitle(t(lang, "tepkirol.yardimBaslik"))
      .setDescription(
        "`r!tepkirol oluştur` — " + (lang === "en" ? "start a new setup" : "yeni kurulum başlat") + "\n" +
        "`r!tepkirol ekle 🔥 @rol` — " + (lang === "en" ? "emoji → role" : "emoji → rol") + "\n" +
        "`r!tepkirol buton @rol [etiket]` — " + (lang === "en" ? "button → role" : "buton → rol") + "\n" +
        "`r!tepkirol mod buton|emoji` — " + t(lang, "tepkirol.tur").toLowerCase() + "\n" +
        "`r!tepkirol seçim tek|çok` — " + t(lang, "tepkirol.secim").toLowerCase() + "\n" +
        "`r!tepkirol başlık|açıklama <metin>`\n" +
        "`r!tepkirol yayinla` — " + (lang === "en" ? "publish" : "canlıya al") + "\n" +
        "`r!tepkirol sil [mesaj-id]` — " + (lang === "en" ? "remove" : "sil") + "\n" +
        "`r!tepkirol liste` — " + (lang === "en" ? "list panels" : "panelleri listele")
      )
      .setFooter({ text: t(lang, "tepkirol.panelFt") })]
  });
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["tepkirol", "rr", "reactionrole"], permLevel: 0, kategori: "rol" };
exports.help = { name: "tepkirol", description: "Emoji/buton ile rol dağıtır.", usage: "tepkirol [oluştur|ekle|buton|mod|seçim|başlık|açıklama|yayinla|sil|liste]" };
