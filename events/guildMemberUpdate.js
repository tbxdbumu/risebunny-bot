/**
 * events/guildMemberUpdate — üye güncellendiğinde çalışır.
 *
 * Burada yalnızca otomasyonun "rol-verildi" tetiği işlenir.
 * Nickname / rol log'ları bot.js içindeki kendi dinleyicilerinde yapılıyor;
 * çift mesaj olmaması için burada TEKRAR gönderilmez.
 */
module.exports = async (eskiUye, yeniUye) => {
  try {
    if (!yeniUye?.guild) return;
    const eski = eskiUye?.roles?.cache;
    const yeni = yeniUye?.roles?.cache;
    if (!eski || !yeni) return;

    // Rol listesi değişmediyse çık
    if (eski.size === yeni.size && [...yeni.keys()].every(id => eski.has(id))) return;

    // Yalnızca rol EKLENDİYSE çalıştır (kaldırma tetiği yok)
    const eklendi = [...yeni.keys()].some(id => !eski.has(id));
    if (!eklendi) return;

    require("../util/automation")
      .calistir(yeniUye.client, yeniUye.guild, "rol_verildi", { uye: yeniUye, eskiUye })
      .catch(() => {});
  } catch (e) {
    console.warn("[guildMemberUpdate]", e?.message || e);
  }
};
