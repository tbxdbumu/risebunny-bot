/**
 * guildMemberAdd — yeni üye katıldığında çalışır.
 *
 * NOT: Hoşgeldin/güle güle KARTI bot.js içindeki `hosgeldinKart()` tarafından
 * gönderilir. Burada o iş YAPILMAZ (çift mesaj olmasın).
 * Burada yalnızca bot.js'te olmayan ek işler yapılır: otomatik rol / hoşgeldin DM'i
 * ve hata ayıklama logu.
 */
const db = require("croxydb");

module.exports = async (member) => {
  if (!member?.guild) return;
  const { guild, user } = member;

  try {
    // 1) Otomatik rol (r!otorol @rol ile ayarlanır) — varsa ekle
    const otoRol = db.fetch(`otorol_${guild.id}`);
    if (otoRol) {
      const rol = guild.roles.cache.get(otoRol);
      if (rol && !member.roles.cache.has(rol.id)) {
        await member.roles.add(rol.id).catch(() => {});
      }
    }

    // 2) Hoşgeldin DM'i (r!hgdmesaj ile açılır, varsayılan kapalı)
    const dmAcik = db.fetch(`hgdmesaj_${guild.id}`);
    if (dmAcik) {
      const metin = db.fetch(`hgdmesaj_metin_${guild.id}`) ||
        `Merhaba ${user.username}! **${guild.name}** sunucusuna hoş geldin. 🐰`;
      await user.send(String(metin).replace(/\{uye\}/g, user.username).replace(/\{sunucu\}/g, guild.name)).catch(() => {});
    }
  } catch (e) {
    console.warn("[guildMemberAdd]", e?.message || e);
  }
};
