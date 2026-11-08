const { EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const settings = require("../ayarlar.json");
const { getLangSync, t } = require("../dil");

const ONAY = "✅";
const RED = "❌";

async function oneriKanal(client, guildId) {
  // Öncelik: sunucuya özel ayar -> ortam değişkeni -> ayarlar.json
  const id = (guildId && db.fetch(`oneri_kanal_${guildId}`))
    || process.env.SUGGESTION_CHANNEL_ID
    || settings.suggestionChannelId;
  if (!id) return null;
  const ch = client.channels.cache.get(id) || await client.channels.fetch(id).catch(() => null);
  return ch && ch.isTextBased() && ch.sendable ? ch : null;
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  const text = args.join(" ").trim();
  if (!text) {
    return message.reply(EN ? "Please write your suggestion. Usage: `öneri <your idea>`" : "Önerini yazmalısın. Kullanım: `öneri <fikrin>`");
  }

  // Sunucudaysa sunucuya özel kanala, değilse genel kanala gönder.
  const kanal = await oneriKanal(client, message.guild?.id);
  if (!kanal) {
    return message.reply(EN
      ? "❌ The suggestion channel is not available right now. Please contact the bot owner."
      : "❌ Öneri kanalına şu anda ulaşılamıyor. Lütfen bot sahibine bildir.");
  }

  const embed = new EmbedBuilder()
    .setColor(0x5865f2)
    .setAuthor({ name: EN ? `Suggestion from ${message.author.tag}` : `${message.author.tag} kullanıcısının önerisi`, iconURL: message.author.displayAvatarURL() })
    .setDescription(text)
    .setFooter({ text: `ID: ${message.id} • ${EN ? "React to vote" : "Oylamak için tepkiye bas"}` })
    .setTimestamp();

  try {
    const gonderilen = await kanal.send({
      embeds: [embed],
      components: [{
        type: 1,
        components: [
          { type: 2, style: 1, label: "0", custom_id: `oneri_evet_${message.id}`, emoji: "👍" },
          { type: 2, style: 2, label: "0", custom_id: `oneri_hayir_${message.id}`, emoji: "👎" }
        ]
      }],
      allowedMentions: { parse: [] }
    });
    await gonderilen.react(ONAY);
    await gonderilen.react(RED);

    return message.reply(EN
      ? `✅ Your suggestion was sent to ${kanal}! (<#${kanal.id}>)`
      : `✅ Önerin ${kanal} kanalına gönderildi! (<#${kanal.id}>)`);
  } catch (e) {
    return message.reply(EN
      ? `❌ Could not send the suggestion: ${e.message}`
      : `❌ Öneri gönderilemedi: ${e.message}`);
  }
};

exports.oneriKanal = oneriKanal;
exports.conf = { enabled: true, guildOnly: false, aliases: ["oneri", "öner", "suggest", "idea"], permLevel: 0, kategori: "genel" };
exports.help = { name: "öneri", description: "Öneri gönderir.", usage: "öneri <metin>" };
