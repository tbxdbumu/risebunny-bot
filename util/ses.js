/**
 * util/ses.js — Geçici ses kanalları ("join to create", MEE6 Voice Hubs)
 *
 * DB
 * --  ses_hub.<gid> = {
 *       hubId: string,          // "Katıl ve oluştur" kanalı
 *       kategoriId: string|null,
 *       ad: string,             // "🔊 {kullanici} • {sayi}"
 *       limit: number|null,     // üye limiti
 *       bitrate: number|null,
 *       kilitli: boolean,       // odayı kuran kilitleyebilir mi
 *       izinliRoller: []        // bakıcı roller (kanalı yönetebilir)
 *     }
 * --  ses_oda.<gid>.<kanalId> = { sahipId, olusturuldu }
 *
 * AKIŞ
 *  hub'a girilir → oda açılır, üye taşınır
 *  oda boşalır  → oda silinir
 *  oda sahibi çıkar → sahiplik sıradaki üyeye geçer (yoksa oda silinir)
 */
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

const ANAHTAR = (gid) => `ses_hub.${gid}`;
const ODA = (gid, cid) => `ses_oda.${gid}.${cid}`;

function ayarGetir(gid) {
  const a = db.fetch(ANAHTAR(gid));
  return a && a.hubId ? { ...a, izinliRoller: Array.isArray(a.izinliRoller) ? a.izinliRoller : [] } : null;
}
function ayarYaz(gid, a) { db.set(ANAHTAR(gid), a); }
function ayarSil(gid) { try { db.delete(ANAHTAR(gid)); } catch {} }

function adUret(sablon, member, sayi) {
  return String(sablon || "🔊 {kullanici} • {sayi}")
    .replace(/\{kullanici\}/g, member.displayName || member.user.username)
    .replace(/\{sayi\}/g, Number(sayi).toLocaleString("tr-TR"))
    .replace(/[^\p{L}\p{N}\p{Emoji} _\-#|·•]/gu, "")
    .slice(0, 100) || `🔊 ${member.user.username}`;
}

/** Hub'a giren üye için oda oluşturur. */
async function odaOlustur(client, ayar, member, guild) {
  const dil = getLangSync(guild.ownerId);
  const kategori = ayar.kategoriId
    ? guild.channels.cache.get(ayar.kategoriId)
    : guild.channels.cache.get(guild.channels.cache.get(ayar.hubId)?.parentId);

  const izinler = [
    { id: guild.roles.everyone.id, deny: [PermissionFlagsBits.Connect], allow: [PermissionFlagsBits.ViewChannel] },
    {
      id: member.id,
      allow: [
        PermissionFlagsBits.Connect,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.ManageRoles,
        PermissionFlagsBits.MoveMembers,
        PermissionFlagsBits.MuteMembers
      ]
    }
  ];
  for (const rolId of ayar.izinliRoller) {
    const rol = guild.roles.cache.get(rolId);
    if (rol) izinler.push({ id: rol.id, allow: [PermissionFlagsBits.Connect, PermissionFlagsBits.MoveMembers] });
  }

  const kanal = await guild.channels.create({
    name: adUret(ayar.ad, member, member.guild.memberCount),
    type: ChannelType.GuildVoice,
    parent: kategori?.id || null,
    ...(ayar.bitrate ? { bitrate: Math.min(96000, Number(ayar.bitrate)) } : {}),
    ...(ayar.limit ? { userLimit: Math.min(99, Number(ayar.limit)) } : {}),
    permissionOverwrites: izinler,
    reason: t(dil, "ses.olusturmaSebep", { kisi: member.user.tag })
  }).catch(() => null);

  if (!kanal) return null;

  db.set(ODA(guild.id, kanal.id), { sahipId: member.id, olusturuldu: Date.now() });
  await member.voice.setChannel(kanal, t(dil, "ses.olusturmaSebep", { kisi: member.user.tag })).catch(() => {});
  return kanal;
}

/** Odanın kaydı varsa döner. */
function odaKaydi(gid, cid) { return db.fetch(ODA(gid, cid)) || null; }

/** Odanın sahibini üye adı üzerinden değiştir (sahip çıktığında). */
async function sahiplikDevret(channel, kayit) {
  const uyeler = [...channel.members.values()];
  if (!uyeler.length) return false;
  const yeni = uyeler.find(m => !m.user.bot) || uyeler[0];
  const onceki = kayit.sahipId;

  const eskiUye = channel.guild.members.cache.get(onceki);
  await channel.permissionOverwrites.edit(yeni.id, {
    Connect: true,
    ManageChannels: true,
    ManageRoles: true,
    MoveMembers: true,
    MuteMembers: true
  }).catch(() => {});

  db.set(ODA(channel.guild.id, channel.id), { ...kayit, sahipId: yeni.id });
  const dil = getLangSync(channel.guild.ownerId);
  await channel.send(t(dil, "ses.sahipDegisti", { kisi: `<@${yeni.id}>` })).catch(() => {});
  void eskiUye;
  return true;
}

/**
 * voiceStateUpdate gövdesi.
 * @param {VoiceState} eski
 * @param {VoiceState} yeni
 */
async function sesIsle(client, eski, yeni) {
  const guild = yeni?.guild || eski?.guild;
  if (!guild) return;
  const member = yeni?.member || eski?.member;
  if (!member || member.user.bot) {
    // Bot çıkışlarında da boş oda temizliği gerekir
  }

  const ayar = ayarGetir(guild.id);
  if (!ayar) return;

  /* ── 1) Hub'a giriş → oda aç ─────────────────────────────────────── */
  if (yeni?.channelId === ayar.hubId && eski?.channelId !== ayar.hubId && member && !member.user.bot) {
    // Aynı anda birden fazla oda açılmasın
    if (!client._sesKilit?.has?.(guild.id)) {
      try {
        client._sesKilit = client._sesKilit || new Set();
        client._sesKilit.add(guild.id);
        await odaOlustur(client, ayar, member, guild);
      } catch (e) {
        console.warn("[ses:hub]", e?.message || e);
      } finally {
        setTimeout(() => client._sesKilit?.delete(guild.id), 1500);
      }
    }
    return;
  }

  /* ── 2) Odadan çıkış ─────────────────────────────────────────────── */
  const eskiKanalId = eski?.channelId;
  if (!eskiKanalId || eskiKanalId === yeni?.channelId) return;

  const kayit = odaKaydi(guild.id, eskiKanalId);
  if (!kayit) return;

  const kanal = guild.channels.cache.get(eskiKanalId) ||
    await guild.channels.fetch(eskiKanalId).catch(() => null);
  if (!kanal) {
    try { db.delete(ODA(guild.id, eskiKanalId)); } catch {}
    return;
  }

  // Oda boşaldı → sil
  if (kanal.members.size === 0) {
    await kanal.delete("Geçici ses odası boşaldı").catch(() => {});
    try { db.delete(ODA(guild.id, eskiKanalId)); } catch {}
    return;
  }

  // Sahip çıktı → devret
  if (kayit.sahipId === member.id) {
    await sahiplikDevret(kanal, kayit).catch(() => {});
  }
}

module.exports = { ayarGetir, ayarYaz, ayarSil, odaOlustur, odaKaydi, sesIsle, adUret, ODA };
