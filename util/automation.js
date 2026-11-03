/**
 * util/automation.js — Otomasyon kuralları (MEE6 "Automations")
 *
 * KURAL ŞEMASI  →  otomasyon.<gid> = [ kural, ... ]
 * kural = {
 *   id: string,
 *   ad: string,
 *   tetik: "mesaj" | "katilim" | "ayrilma" | "rol_verildi" | "ses_katilim",
 *   kosul: {               // tetiğe göre opsiyonel
 *     icerir?: string,     // mesajda geçmeli
 *     esit?: string,       // mesaj tam olarak bu
 *     regex?: string,
 *     kanalId?: string,
 *     rolId?: string,      // katilim/ayrilma/rol için filtre
 *     icerirBuyuk?: boolean
 *   },
 *   eylemler: [ eylem, ... ],   // en fazla 5
 *   acik: boolean,
 *   sayac: number
 * }
 *
 * eylem = { tur: "mesaj" | "dm" | "rol_ver" | "rol_al" | "tepki" | "sil" | "kilit" }
 *   mesaj: { kanalId?, metin }
 *   dm:    { metin }
 *   rol_ver / rol_al: { rolId }
 *   tepki: { emoji }
 *   sil:   {}            (tetikleyen mesajı siler)
 *   kilit: {}            (kanalı kilitler)
 *
 * DEĞİŞKENLER: {kullanici} {kullaniciAdi} {sunucu} {kanal} {mesaj} {sayi}
 */
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

const ANAHTAR = (gid) => `otomasyon.${gid}`;
const MAX_KURAL = 40;
const MAX_EYLEM = 5;

const TETIKLER = ["mesaj", "katilim", "ayrilma", "rol_verildi", "ses_katilim"];
const EYLEMLER = ["mesaj", "dm", "rol_ver", "rol_al", "tepki", "sil", "kilit"];

function kurallar(gid) {
  const k = db.fetch(ANAHTAR(gid));
  return Array.isArray(k) ? k : [];
}
function yaz(gid, liste) { db.set(ANAHTAR(gid), liste.slice(0, MAX_KURAL)); }

function ekle(gid, kural) {
  const liste = kurallar(gid);
  if (liste.length >= MAX_KURAL) return null;
  const id = `k${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
  const yeni = {
    id,
    ad: kural.ad || `Kural ${liste.length + 1}`,
    tetik: kural.tetik || "mesaj",
    kosul: kural.kosul || {},
    eylemler: (kural.eylemler || []).slice(0, MAX_EYLEM),
    acik: true,
    sayac: 0
  };
  liste.push(yeni);
  yaz(gid, liste);
  return yeni;
}

function sil(gid, id) {
  const liste = kurallar(gid).filter(k => k.id !== id);
  yaz(gid, liste);
  return liste.length;
}

function bul(gid, id) { return kurallar(gid).find(k => k.id === id) || null; }

function guncelle(gid, id, yama) {
  const liste = kurallar(gid).map(k => (k.id === id ? { ...k, ...yama } : k));
  yaz(gid, liste);
  return bul(gid, id);
}

/** {kullanici} gibi değişkenleri doldurur. */
function degisken(metin, ctx = {}) {
  if (!metin) return "";
  return String(metin).replace(/\{(\w+)\}/g, (m, k) => (ctx[k] !== undefined ? String(ctx[k]) : m));
}

function kosulUyuyor(kosul = {}, mesaj) {
  if (!mesaj) return true;
  const icerik = mesaj.content || "";
  if (kosul.kanalId && mesaj.channelId !== kosul.kanalId) return false;
  if (kosul.icerir) {
    const a = kosul.icerirBuyuk ? icerik : icerik.toLowerCase();
    const b = kosul.icerirBuyuk ? kosul.icerir : String(kosul.icerir).toLowerCase();
    if (!a.includes(b)) return false;
  }
  if (kosul.esit && icerik.trim().toLowerCase() !== String(kosul.esit).trim().toLowerCase()) return false;
  if (kosul.regex) {
    try { if (!new RegExp(kosul.regex, kosul.icerirBuyuk ? "" : "i").test(icerik)) return false; }
    catch { return false; }
  }
  if (kosul.rolId && mesaj.member && !mesaj.member.roles.cache.has(kosul.rolId)) return false;
  return true;
}

/**
 * Eylemleri uygular.
 * @param {object} ctx { kullanici, kullaniciAdi, sunucu, kanal, mesaj, sayi }
 */
async function eylemCalistir(client, guild, kural, mesaj, ctx) {
  const lang = getLangSync(guild.ownerId);
  const botUye = guild.members.me;
  let silinsin = false;

  for (const e of kural.eylemler || []) {
    try {
      if (e.tur === "mesaj") {
        const kanal = (e.kanalId && guild.channels.cache.get(e.kanalId)) || mesaj?.channel || null;
        if (kanal && e.metin) {
          await kanal.send({
            content: degisken(e.metin, ctx).slice(0, 2000),
            allowedMentions: { parse: ["users"] }
          }).catch(() => {});
        }
      } else if (e.tur === "dm") {
        const kullanici = mesaj?.author || ctx.uye?.user;
        if (kullanici && e.metin) {
          await kullanici.send({ content: degisken(e.metin, ctx).slice(0, 2000) }).catch(() => {});
        }
      } else if (e.tur === "rol_ver" || e.tur === "rol_al") {
        const hedef = mesaj?.member || ctx.uye;
        const rol = e.rolId && guild.roles.cache.get(e.rolId);
        if (!hedef || !rol) continue;
        if (!botUye?.permissions.has(PermissionFlagsBits.ManageRoles)) continue;
        if (rol.position >= botUye.roles.highest.position) continue;
        if (e.tur === "rol_ver") await hedef.roles.add(rol.id, `Otomasyon: ${kural.ad}`).catch(() => {});
        else await hedef.roles.remove(rol.id, `Otomasyon: ${kural.ad}`).catch(() => {});
      } else if (e.tur === "tepki") {
        if (mesaj && e.emoji) await mesaj.react(e.emoji).catch(() => {});
      } else if (e.tur === "sil") {
        silinsin = true;
      } else if (e.tur === "kilit") {
        const kanal = mesaj?.channel;
        if (kanal) {
          await kanal.permissionOverwrites.edit(guild.roles.everyone, { SendMessages: false }).catch(() => {});
        }
      }
    } catch (err) {
      console.warn(`[automation:${kural.ad}]`, err?.message || err);
    }
  }

  if (silinsin && mesaj && mesaj.deletable) await mesaj.delete().catch(() => {});
}

/**
 * Bir tetik için uygun kuralları çalıştırır.
 * @param {"mesaj"|"katilim"|"ayrilma"|"rol_verildi"|"ses_katilim"} tetik
 */
async function calistir(client, guild, tetik, { mesaj, uye, eskiUye, kanal } = {}) {
  if (!guild) return 0;
  const liste = kurallar(guild.id).filter(k => k.acik !== false && k.tetik === tetik);
  if (!liste.length) return 0;

  let sayac = 0;
  for (const kural of liste) {
    if (tetik === "mesaj") {
      if (mesaj?.author?.bot) continue;
      if (!kosulUyuyor(kural.kosul, mesaj)) continue;
    } else {
      // rol_verildi → sadece yeni rol eklendiyse
      if (tetik === "rol_verildi") {
        const eski = eskiUye?.roles?.cache;
        const yeni = uye?.roles?.cache;
        const eklendi = yeni && [...yeni.keys()].some(id => !eski?.has(id));
        if (!eklendi) continue;
        if (kural.kosul?.rolId && !yeni.has(kural.kosul.rolId)) continue;
      }
      if (kural.kosul?.rolId && tetik !== "rol_verildi" && !uye?.roles?.cache?.has(kural.kosul.rolId)) continue;
    }

    const ctx = {
      kullanici: uye ? `<@${uye.id}>` : "",
      kullaniciAdi: uye?.user?.username || uye?.user?.tag || "",
      sunucu: guild.name,
      kanal: kanal ? `<#${kanal.id}>` : (mesaj ? `<#${mesaj.channelId}>` : ""),
      mesaj: mesaj?.content?.slice(0, 500) || "",
      sayi: (kural.sayac || 0) + 1,
      uye
    };

    await eylemCalistir(client, guild, kural, mesaj, ctx);
    guncelle(guild.id, kural.id, { sayac: (kural.sayac || 0) + 1 });
    sayac++;
  }
  return sayac;
}

/** Kural özet embed'i (liste / detay). */
function kuralEmbed(kural, guild, lang) {
  const T = (k) => t(lang, `otomasyon.tetik_${k}`);
  const E = (e) => {
    const ad = t(lang, `otomasyon.eylem_${e.tur}`);
    if (e.tur === "mesaj") return `${ad}: ${e.kanalId ? `<#${e.kanalId}>` : t(lang, "otomasyon.buKanal")} — \`${String(e.metin || "").slice(0, 60)}\``;
    if (e.tur === "dm") return `${ad}: \`${String(e.metin || "").slice(0, 60)}\``;
    if (e.tur === "rol_ver" || e.tur === "rol_al") return `${ad}: <@&${e.rolId}>`;
    if (e.tur === "tepki") return `${ad}: ${e.emoji}`;
    return ad;
  };

  const kosul = [];
  const k = kural.kosul || {};
  if (k.icerir) kosul.push(`\`${t(lang, "otomasyon.icerir")}: ${k.icerir}\``);
  if (k.esit) kosul.push(`\`${t(lang, "otomasyon.esit")}: ${k.esit}\``);
  if (k.regex) kosul.push(`\`regex: ${k.regex}\``);
  if (k.kanalId) kosul.push(t(lang, "otomasyon.kanalKosul", { kanal: `<#${k.kanalId}>` }));
  if (k.rolId) kosul.push(t(lang, "otomasyon.rolKosul", { rol: `<@&${k.rolId}>` }));

  return new EmbedBuilder()
    .setColor(kural.acik === false ? "#80848e" : "#ee7621")
    .setTitle(`${kural.acik === false ? "⏸️" : "▶️"} ${kural.ad}`)
    .setDescription(
      `**ID:** \`${kural.id}\`\n` +
      `**${t(lang, "otomasyon.tetik")}:** ${T(kural.tetik)}\n` +
      (kosul.length ? `**${t(lang, "otomasyon.kosul")}:** ${kosul.join(" • ")}\n` : "") +
      `**${t(lang, "otomasyon.calisma")}:** ${kural.sayac || 0}\n\n` +
      `**${t(lang, "otomasyon.eylemler")}:**\n${(kural.eylemler || []).map((e, i) => `${i + 1}. ${E(e)}`).join("\n") || "—"}`
    );
}

module.exports = {
  kurallar, yaz, ekle, sil, bul, guncelle,
  calistir, degisken, kuralEmbed,
  TETIKLER, EYLEMLER, MAX_KURAL, MAX_EYLEM
};
