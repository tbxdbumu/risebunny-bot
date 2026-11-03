/**
 * guildMemberRemove — üye ayrıldığında çalışır.
 *
 * NOT: Güle güle KARTI bot.js içindeki `hosgeldinKart()` tarafından gönderilir.
 * Burada çift mesaj gönderilmez; yalnızca kayıt temizliği yapılır.
 */
const db = require("croxydb");

module.exports = async (member) => {
  if (!member?.guild) return;
  try {
    // Ayrılan üyenin kayıt akışı askıda kalmasın: bekleyen kayıt bayrağını temizle
    const bekleyen = db.fetch(`kayıtBekleyen_${member.guild.id}_${member.id}`);
    if (bekleyen) db.delete(`kayıtBekleyen_${member.guild.id}_${member.id}`);

    /* Otomasyon: ayrılma tetiği (kanal bilgisi olmadan) */
    require("../util/automation")
      .calistir(member.client, member.guild, "ayrilma", { uye: member })
      .catch(() => {});
  } catch (e) {
    console.warn("[guildMemberRemove]", e?.message || e);
  }
};
