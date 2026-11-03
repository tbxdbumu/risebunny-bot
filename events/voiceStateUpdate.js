/**
 * events/voiceStateUpdate — geçici ses kanalları (util/ses.js)
 */
module.exports = async (eski, yeni) => {
  try {
    const client = yeni?.client || eski?.client;
    if (!client) return;
    await require("../util/ses").sesIsle(client, eski, yeni);
  } catch (e) {
    console.warn("[voiceStateUpdate]", e?.message || e);
  }
};
