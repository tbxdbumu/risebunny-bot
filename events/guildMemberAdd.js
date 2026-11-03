/**
 * events/guildMemberAdd — yeni üye katıldığında çalışır.
 *
 * NOT: Hoşgeldin/güle güle KARTI bot.js içindeki `hosgeldinKart()` tarafından
 * gönderilir. Burada o iş YAPILMAZ (çift mesaj olmasın).
 * Burada yalnızca bot.js'te olmayan ek işler yapılır:
 *   1) Otorol (r!otorol-ayarla)
 *   2) Hoşgeldin DM'i
 *   3) Yeni hesap uyarısı (log kanalına)
 */
const db = require("croxydb");
const { getLangSync, t } = require("../dil");

module.exports = async (member) => {
  if (!member?.guild) return;
  const { guild, user } = member;
  const lang = getLangSync(guild.ownerId);

  try {
    /* ── 1) Otorol ─────────────────────────────────────────────────────
       Tek kaynak `otoRL_<gid>` (komutlar/otorol-ayarla.js yazar).
       Eski anahtar `otorol_<gid>`'i de destekle (geriye uyum). */
    const otoRolId = db.fetch(`otoRL_${guild.id}`) || db.fetch(`otorol_${guild.id}`);
    if (otoRolId) {
      const rol = guild.roles.cache.get(otoRolId);
      if (rol && !member.roles.cache.has(rol.id)) {
        const izin = guild.members.me?.permissions?.has("ManageRoles");
        if (izin && rol.position < guild.members.me.roles.highest.position) {
          await member.roles.add(rol.id, "Otorol").catch(() => {});
        }
      }
    }

    /* ── 2) Hoşgeldin DM'i (varsayılan kapalı) ───────────────────────── */
    const dmAcik = db.fetch(`hgdmesaj_${guild.id}`);
    if (dmAcik) {
      const metin = db.fetch(`hgdmesaj_metin_${guild.id}`) ||
        `Merhaba ${user.username}! **${guild.name}** sunucusuna hoş geldin. 🐰`;
      await user.send(String(metin)
        .replace(/\{uye\}/g, user.username)
        .replace(/\{sunucu\}/g, guild.name)).catch(() => {});
    }

    /* ── 3) Log kanalı: yeni üye duyurusu (otorol mesajı) ───────────── */
    const logKanalId = db.fetch(`otoRK_${guild.id}`);
    if (logKanalId && otoRolId) {
      const kanal = guild.channels.cache.get(logKanalId);
      if (kanal) {
        await kanal.send(t(lang, "otorol.yeniUye", {
          kullanici: `<@${user.id}>`,
          rol: `<@&${otoRolId}>`
        })).catch(() => {});
      }
    }

    /* ── 4) Otomasyon: katılım tetiği ───────────────────────────────── */
    require("../util/automation")
      .calistir(member.client, guild, "katilim", { uye: member })
      .catch(() => {});
  } catch (e) {
    console.warn("[guildMemberAdd]", e?.message || e);
  }
};
