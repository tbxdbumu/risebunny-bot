const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { getLangSync, t } = require("../dil");
const { komutLog } = require("../utils");

/* Hata mesajlari (TR/EN) */
const MSG = {
  botMesajYonet: {
    tr: "Kanaldaki mesajları silmek için bana **Mesajları Yönet** yetkisi verilmeli.",
    en: "I need the **Manage Messages** permission in this channel to delete messages.",
  },
  botMesajGonder: {
    tr: "Bu kanala mesaj gönderme yetkim yok.",
    en: "I don't have permission to send messages in this channel.",
  },
  age: {
    tr: "14 günden eski mesajlar toplu silinemez. Daha yeni bir sayı dene.",
    en: "Messages older than 14 days can't be bulk deleted. Try a smaller count.",
  },
  dm: {
    tr: "Bu komut yalnızca sunucu kanallarında çalışır.",
    en: "This command only works in server channels.",
  },
  bilinmeyen: {
    tr: "Mesajlar silinemedi: {sebep}",
    en: "Couldn't delete messages: {sebep}",
  },
};

function m(lang, anahtar, yer = {}) {
  const metin = MSG[anahtar][lang === "en" ? "en" : "tr"];
  return metin.replace(/\{(\w+)\}/g, (_, k) => (yer[k] !== undefined ? yer[k] : `{${k}}`));
}

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);

  if (!message.guild) return message.reply(m(lang, "dm")).catch(() => {});

  // Kullanici tarafi yetki
  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
    return message.reply(t(lang, "sistem.mesajYonet"));

  const amount = Number.parseInt(args[0], 10);
  if (!Number.isInteger(amount) || amount < 1 || amount > 100)
    return message.reply(lang === "en"
      ? "Specify a message count between 1 and 100."
      : "1 ile 100 arasında bir mesaj sayısı belirtmelisin.");

  // Bot tarafi yetki — ONCEDEN kontrol et ki 50013 ile patlamasin
  const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
  if (!me || !message.channel.permissionsFor(me)?.has(PermissionsBitField.Flags.ManageMessages))
    return message.reply(m(lang, "botMesajYonet")).catch(() => {});

  let deleted;
  try {
    deleted = await message.channel.bulkDelete(amount, true);
  } catch (err) {
    // 50034: Bulk delete age limiti — Discord mesajin 14 gununu gectigini soyler
    const sebep = err?.code === 50034
      ? m(lang, "age")
      : (err?.rawError?.message || err?.message || "bilinmeyen hata");
    return message.reply(m(lang, "bilinmeyen", { sebep })).catch(() => {});
  }

  const adet = deleted?.size ?? 0;

  // Onay mesaji: gonderemiyorsak (yetki yok) sessizce gec, komutu basarisiz sayma
  const response = await message.channel.send({ embeds: [
    new EmbedBuilder().setColor("Green").setDescription(lang === "en"
      ? `${adet} messages deleted.`
      : `${adet} mesaj silindi.`)
  ]}).catch(() => null);

  if (response) setTimeout(() => response.delete().catch(() => {}), 5000);

  await komutLog(client, message, "sil").catch(() => {});
};

exports.conf = { enabled: true, guildOnly: true, aliases: ["temizle", "clear", "purge", "temizlemesaj"], permLevel: 0 };
exports.help = { name: "sil", description: "Mesajları siler.", usage: "sil <1-100>" };
