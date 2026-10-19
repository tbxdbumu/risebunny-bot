const reqEvent = (event) => require(`../events/${event}`);
module.exports = client => {
  client.once('clientReady', () => {
    try {
      reqEvent('ready')(client);
    } catch (error) {
      console.error('Ready event hatası:', error);
    }
  });
  client.on('messageCreate', message => {
    Promise.resolve(reqEvent('message')(message)).catch(error => {
      console.error('Mesaj/komut hatası:', error);
    });
  });
  client.on('interactionCreate', interaction => {
    Promise.resolve(reqEvent('interactionCreate')(interaction)).catch(error => {
      console.error('Interaction hatası:', error);
    });
  });

  // ── Üye olayları (giriş / çıkış) ──────────────────────────────────────────
  // ÖNEMLİ: bot.js içinde de guildMemberAdd/Remove dinleyicileri var (hosgeldin kartı).
  // Buradaki dinleyiciler ayrıca çalışır; ikisi de aynı olayda tetiklendiği için
  // tekrar mesaj göndermemek adına bu dosyalardaki handler'lar SADECE
  // `events/*.js` içinde tanımlı ek işleri yapar (kayıt sistemi, log vb.).
  client.on('guildMemberAdd', member => {
    Promise.resolve(reqEvent('guildMemberAdd')(member)).catch(error => {
      console.error('guildMemberAdd hatası:', error?.message || error);
    });
  });
  client.on('guildMemberRemove', member => {
    Promise.resolve(reqEvent('guildMemberRemove')(member)).catch(error => {
      console.error('guildMemberRemove hatası:', error?.message || error);
    });
  });
};
