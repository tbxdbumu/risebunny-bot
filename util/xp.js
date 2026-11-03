/**
 * util/xp.js — Mesaj başına XP + seviye
 *
 * Neden ayrı dosya: `utils.js` hem komut motorunu hem ekonomiyi yüklüyor;
 * messageCreate her mesajda çalıştığı için yalnızca XP'ye ihtiyaç duyan
 * kısım buraya alındı (daha hızlı yükleme, daha az yan etki).
 *
 * KURALLAR
 * - Mesaj başına cooldown: XP_CD_MS (varsayılan 60 sn, kullanıcı+kanal).
 * - Kazanç: XP_MIN..XP_MAX arası rastgele (varsayılan 15-25).
 * - Premium: `xp_carpan` (varsayılan 1.5) uygulanır.
 * - Sunucu ayarları: `xp_ayar.<gid>` = { acik, cd, min, max, carpan,
 *   yokSayKanal: [], yokSayRol: [], mesaj: "acik"|"kapali", mesajKanal }
 * - Komut kullanımı da aynı `xp_<uid>` anahtarına yazar (utils.giveCommandXp).
 *
 * ÖDÜLLER
 * - Her seviye için para (utils seviyeOdulu)
 * - L25 → VIP rol, L50 → 1 yıllık premium (utils.handleLevelReward)
 * - Seviye atlama DM bildirimi
 */
const db = require("croxydb");

const XP_MIN = 15;
const XP_MAX = 25;
const XP_CD_MS = 60_000;
const VARSAYILAN_CARPAN = 1.5;

const sonXp = new Map(); // `${userId}:${channelId}` → ts

function ayarGetir(guildId) {
  const a = db.fetch(`xp_ayar.${guildId}`);
  return {
    acik: a ? a.acik !== false : true,
    cd: Number(a?.cd) > 0 ? Number(a.cd) : XP_CD_MS,
    min: Number(a?.min) > 0 ? Number(a.min) : XP_MIN,
    max: Number(a?.max) > 0 ? Number(a.max) : XP_MAX,
    carpan: Number(a?.carpan) > 0 ? Number(a.carpan) : VARSAYILAN_CARPAN,
    yokSayKanal: Array.isArray(a?.yokSayKanal) ? a.yokSayKanal : [],
    yokSayRol: Array.isArray(a?.yokSayRol) ? a.yokSayRol : [],
    mesaj: a?.mesaj === "kapali" ? "kapali" : "acik",
    mesajKanal: a?.mesajKanal || null
  };
}

function ayarYaz(guildId, ayar) {
  const mevcut = db.fetch(`xp_ayar.${guildId}`) || {};
  db.set(`xp_ayar.${guildId}`, { ...mevcut, ...ayar });
}

function xpSeviye(xp) {
  const x = Math.max(0, Number(xp) || 0);
  return Math.floor((1 + Math.sqrt(1 + 4 * x / 25)) / 2);
}

function xpGerekli(seviye) {
  return 50 * Math.max(1, Number(seviye) || 1);
}

function xpToplam(seviye) {
  const s = Math.max(1, Number(seviye) || 1);
  return 25 * (s - 1) * s;
}

/**
 * Mesaj XP'si ver. Uygun değilse (bot, DM, kapalı, cooldown) sessizce çıkar.
 * @returns {Promise<{verildi:boolean, xp?:number, seviye?:number, atladi?:boolean}>}
 */
async function mesajXpIsle(member, message) {
  try {
    if (!member || !message?.guild || message.author?.bot) return { verildi: false };
    const guild = message.guild;
    const ayar = ayarGetir(guild.id);
    if (!ayar.acik) return { verildi: false };

    if (ayar.yokSayKanal.includes(message.channelId)) return { verildi: false };
    if (ayar.yokSayRol.length && ayar.yokSayRol.some(r => member.roles.cache.has(r))) return { verildi: false };
    // Çok kısa mesajlar XP kazandırmasın (spam engeli)
    if (!message.content || message.content.trim().length < 2) return { verildi: false };

    const key = `${member.id}:${message.channelId}`;
    const simdi = Date.now();
    const son = sonXp.get(key) || 0;
    if (simdi - son < ayar.cd) return { verildi: false };
    sonXp.set(key, simdi);

    // Map'in büyümesini engelle
    if (sonXp.size > 5000) {
      for (const [k, ts] of sonXp) if (simdi - ts > ayar.cd * 2) sonXp.delete(k);
    }

    const { isPremium } = require("../utils");
    const carpan = isPremium(member.id) ? ayar.carpan : 1;
    const aralik = Math.max(1, ayar.max - ayar.min + 1);
    const kazanç = Math.floor((ayar.min + Math.random() * aralik) * carpan);

    const oncekiXP = Number(db.fetch(`xp_${member.id}`) || 0);
    const yeniXP = oncekiXP + kazanç;
    db.set(`xp_${member.id}`, yeniXP);

    const oncekiSeviye = xpSeviye(oncekiXP);
    const yeniSeviye = xpSeviye(yeniXP);
    if (yeniSeviye <= oncekiSeviye) return { verildi: true, xp: kazanç };

    await seviyeAtlama(member, guild, oncekiSeviye, yeniSeviye, ayar);
    return { verildi: true, xp: kazanç, seviye: yeniSeviye, atladi: true };
  } catch (e) {
    console.warn("[xp]", e?.message || e);
    return { verildi: false };
  }
}

async function seviyeAtlama(member, guild, onceki, yeni, ayar) {
  const { seviyeOdulu, handleLevelReward } = require("../utils");
  const { getLangSync, t } = require("../dil");
  const { EmbedBuilder } = require("discord.js");

  for (let s = onceki + 1; s <= yeni; s++) {
    const odul = seviyeOdulu(s);
    if (odul > 0) db.add(`para_${member.id}`, odul);
    if (s === 25) await handleLevelReward(member.client, member.id, guild.id, 25, odul, "VIP rol", true).catch(() => {});
    if (s === 50) await handleLevelReward(member.client, member.id, guild.id, 50, odul, "1 yıllık Premium", false).catch(() => {});
  }

  // Kanal duyurusu
  if (ayar.mesaj !== "kapali") {
    const lang = getLangSync(member.id);
    const kanalId = ayar.mesajKanal;
    const kanal = kanalId
      ? guild.channels.cache.get(kanalId)
      : null;
    const embed = new EmbedBuilder()
      .setColor("Gold")
      .setTitle(t(lang, "xp.seviyeAtladi"))
      .setDescription(t(lang, "xp.seviyeAtladiAciklama", {
        kullanici: `<@${member.id}>`, seviye: yeni
      }));
    if (kanal) await kanal.send({ embeds: [embed] }).catch(() => {});
  }

  // DM bildirimi
  try {
    const lang = getLangSync(member.id);
    const u = await member.client.users.fetch(member.id).catch(() => null);
    if (u) {
      await u.send({
        embeds: [new EmbedBuilder().setColor("Gold")
          .setTitle(t(lang, "xp.seviyeAtladi"))
          .setDescription(t(lang, "xp.seviyeAtladiDM", { seviye: yeni, sunucu: guild.name }))]
      }).catch(() => {});
    }
  } catch {}
}

module.exports = { mesajXpIsle, ayarGetir, ayarYaz, xpSeviye, xpGerekli, xpToplam, XP_CD_MS };
