/**
 * events/messageReactionAdd.js
 *
 * İki iş yapar:
 *   1) Tepki rol — kullanıcı emoji basınca rol verir  (util/rol.js)
 *   2) Starboard — yıldız eşiği geçilince mesajı kanala kopyalar (util/starboard.js)
 *
 * Kendi bot tepkisi ignore edilir. Yetkisiz (BOT_REACTIONS) durumunda sessiz.
 */
module.exports = async (reaction, user) => {
  try {
    if (!reaction) return;
    // Partial ise yükle (bot.js partials açık)
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (!reaction.message) return;
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
    if (!reaction.message?.guild) return;
    if (!user || user.bot || user.id === reaction.message.client?.user?.id) return;

    const { emojiTepkiIsle } = require("../util/rol");
    await emojiTepkiIsle(reaction, user, true).catch(() => {});

    const { starboardTepkiIsle } = require("../util/starboard");
    await starboardTepkiIsle(reaction, true).catch(() => {});
  } catch (e) {
    console.error("[messageReactionAdd]", e?.message || e);
  }
};
