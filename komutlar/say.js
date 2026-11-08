const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { getLangSync, t } = require("../dil");

/**
 * r!say — sunucu istatistikleri.
 *
 * ESKİ HATALAR
 * ------------
 * 1) `m.user.presence?.status` okunuyordu. discord.js v14'te presence
 *    `GuildMember#presence` alanındadır, `User#presence` DİYE BİR ALAN YOK.
 *    Sonuç: `undefined` -> tüm durum sayaçları (online/idle/dnd) ve
 *    "çevrimiçi üye" sayısı HER ZAMAN 0 görünüyordu.
 * 2) `GuildPresences` ayrıcalıklı intent'i hiç istenmiyordu. Bu intent
 *    olmadan `presence` alanı hiç doldurulmaz — alan adı düzeltilse bile
 *    sayılar 0 kalırdı.
 *
 * BU DOSYA NE YAPIYOR
 * -------------------
 * Presence verisi varsa gerçek sayıları gösterir; yoksa 0 uydurmak yerine
 * "bilinmiyor" der. 10.000+ üyeli sunucuda presence intent'ini açmak
 * ayrıca bir ayrıcalıklı intent incelemesi gerektirdiği için burada
 * zorlamıyoruz: yalnızca gerçekten varsa kullanıyoruz.
 */
exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["bilgi", "sunucubilgi", "sunucu-bilgi", "sb"],
  permLevel: 0,
  kategori: "bot",
};

exports.help = {
  name: "say",
  description: "Sunucu istatistiklerini gösterir.",
  usage: "say",
};

exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  const guild = message.guild;

  const seskanallari = guild.channels.cache.filter((c) => c.isVoiceBased());
  const metinkanallari = guild.channels.cache.filter((c) => c.isTextBased()).size;

  let sesliUye = 0;
  for (const [, kanal] of seskanallari) sesliUye += kanal.members?.size || 0;

  /* Presence verisi gerçekten geliyor mu? Gelmiyorsa 0 göstermeyelim. */
  const presenceVar =
    client.options?.intents?.has?.(1 << 8) /* GuildPresences */ ||
    guild.members.cache.some((m) => m.presence != null);

  const sayi = (durum) =>
    guild.members.cache.filter((m) => !m.user.bot && m.presence?.status === durum).size;
  const cevrimici = guild.members.cache.filter(
    (m) => !m.user.bot && m.presence && m.presence.status !== "offline"
  ).size;

  const bilinmiyor = EN ? "unknown" : "bilinmiyor";

  const embed = new EmbedBuilder()
    .setColor(0x36393f)
    .setTitle(EN ? "RiseBunny — Server" : "RiseBunny — Say")
    .setFooter({ text: "RiseBunny" })
    .setTimestamp()
    .addFields(
      {
        name: EN ? "Members" : "Üyeler",
        value: [
          `${EN ? "Total" : "Toplam"}: **${guild.memberCount}**`,
          `${EN ? "Online" : "Çevrimiçi"}: **${presenceVar ? cevrimici : bilinmiyor}**`,
          `${EN ? "In voice" : "Seste"}: **${sesliUye}**`,
        ].join("\n"),
        inline: true,
      },
      {
        name: EN ? "Channels" : "Kanallar",
        value: [
          `${EN ? "Text" : "Metin"}: **${metinkanallari}**`,
          `${EN ? "Voice" : "Ses"}: **${seskanallari.size}**`,
        ].join("\n"),
        inline: true,
      }
    );

  if (presenceVar) {
    embed.addFields({
      name: EN ? "Status" : "Durumlar",
      value: [
        `🟢 ${EN ? "Online" : "Çevrimiçi"}: **${sayi("online")}**`,
        `🌙 ${EN ? "Idle" : "Boşta"}: **${sayi("idle")}**`,
        `⛔ ${EN ? "Do not disturb" : "Rahatsız etme"}: **${sayi("dnd")}**`,
      ].join("\n"),
      inline: false,
    });
  } else {
    /* Presence intent'i kapalı: sayı uydurmak yerine nedenini yaz. */
    embed.addFields({
      name: EN ? "Status" : "Durumlar",
      value: EN
        ? "Not available — the bot does not have the **Presence** intent enabled."
        : "Kullanılamıyor — botta **Presence** (durum) intent'i açık değil.",
      inline: false,
    });
  }

  return message.channel.send({ embeds: [embed] }).catch(() => {});
};
