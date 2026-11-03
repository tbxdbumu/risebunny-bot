/**
 * events/messageReactionRemove.js
 *
 * Tepki kaldırıldığında:
 *   - kullanıcıdan rolü alır
 *   - starboard sayısını düşürür / eşik altına inerse gönderiyi siler
 */
module.exports = async (reaction, user) => {
  try {
    if (!reaction) return;
    if (reaction.partial) await reaction.fetch().catch(() => {});
    if (!reaction.message) return;
    if (reaction.message.partial) await reaction.message.fetch().catch(() => {});
    if (!reaction.message?.guild) return;
    if (!user || user.bot || user.id === reaction.message.client?.user?.id) return;

    const { emojiTepkiIsle } = require("../util/rol");
    await emojiTepkiIsle(reaction, user, false).catch(() => {});

    const { starboardTepkiIsle } = require("../util/starboard");
    await starboardTepkiIsle(reaction, false).catch(() => {});
  } catch (e) {
    console.error("[messageReactionRemove]", e?.message || e);
  }
};
