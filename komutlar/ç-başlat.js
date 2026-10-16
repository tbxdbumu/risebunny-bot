const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const { getLangSync, t } = require("../dil");
const { cekilisArgumanlari, kanalKontrolü, sureHataMetni } = require("../util/cekilisCozum");

const SURE_ORNEK = "`2 gün 6 saat` · `2g 3s` · `2day 6hours` · `2d 3h` · `30m` · `1sa` · `2 hafta` · `1 ay`";

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
    return message.channel.send(t(lang, "sistem.mesajYonet"));

  const hatalar = [];
  let cozum = { kanal: null };

  if (!args.length) {
    hatalar.push(EN ? "channel, duration, winner count and prize are missing" : "kanal, süre, kazanan sayısı ve ödül eksik");
  } else {
    cozum = await cekilisArgumanlari(message, args, lang);
    if (cozum.hata === "kanal") {
      hatalar.push(EN
        ? "channel not found — write `#` and pick the channel from Discord's list"
        : "kanal bulunamadı — `#` yazıp Discord'un açtığı listeden kanalı seçin");
    } else if (cozum.hata === "kanal_erisim") {
      hatalar.push(EN
        ? `I can't see that channel (\`${cozum.kanalId}\`) — it was deleted or the bot lacks **View Channel** there`
        : `o kanalı göremiyorum (\`${cozum.kanalId}\`) — kanal silinmiş ya da botun **Kanalı Görme (View Channel)** yetkisi yok`);
    } else if (cozum.hata === "sure") {
      hatalar.push(EN ? `duration problem: ${sureHataMetni(cozum.sureNeden, cozum.sureDetay, lang)}`
        : `süre sorunu: ${sureHataMetni(cozum.sureNeden, cozum.sureDetay, lang)}`);
    } else if (cozum.hata === "kazanan") {
      hatalar.push(EN
        ? "winner count must be a whole number right after the duration"
        : "süreden hemen sonra kazanan sayısı rakam olarak yazılmalı (örn. `1d 2 Nitro` → 2 kazanan)");
    } else if (cozum.hata === "odul") {
      hatalar.push(EN ? "prize text is missing" : "ödül yazısı eksik (örn. `Discord Nitro`)");
    } else {
      const kanalSorunu = kanalKontrolü(message, cozum.kanal, lang);
      if (kanalSorunu) hatalar.push(EN ? `channel problem: ${kanalSorunu}` : `kanal sorunu: ${kanalSorunu}`);
    }
  }

  if (hatalar.length) {
    const e = new EmbedBuilder().setColor("Red")
      .setTitle(EN ? "❌ Missing / invalid values" : "❌ Eksik veya geçersiz bilgi")
      .setDescription(hatalar.map((h) => `• ${h}`).join("\n"))
      .addFields(
        {
          name: EN ? "Correct usage" : "Doğru kullanım",
          value: EN ? "`r!giveaway #channel <duration> <winners> <prize>`\nExample: `r!giveaway #giveaway 2 days 6 hours 1 Discord Nitro`"
            : "`r!çekiliş #kanal <süre> <kazanan sayısı> <ödül>`\nÖrnek: `r!çekiliş #çekiliş 2 gün 6 saat 1 Discord Nitro`",
        },
        {
          name: EN ? "Supported durations" : "Desteklenen süreler",
          value: `${SURE_ORNEK}\n${EN ? "Turkish and English units both work · min 10 seconds, max 90 days" : "Türkçe ve İngilizce birimler ikisi de çalışır · en az 10 saniye, en fazla 90 gün"}`,
        },
        {
          name: EN ? "Order matters" : "Sıra önemli",
          value: EN
            ? "1️⃣ channel → 2️⃣ duration → 3️⃣ winner count → 4️⃣ prize (everything left is the prize)"
            : "1️⃣ kanal → 2️⃣ süre → 3️⃣ kazanan sayısı → 4️⃣ ödül (bundan sonrası ödül yazılır)",
          inline: false,
        }
      )
      .setFooter({ text: EN ? "Tip: mention the channel with #, don't type its name by hand" : "İpucu: kanalı elle yazmak yerine # ile etiketleyin" });
    return message.channel.send({ embeds: [e] });
  }

  const { kanal, ms: sure, okunabilir, kazanan, odul } = cozum;
  const bitis = Math.floor((Date.now() + sure) / 1000);

  const mesajlar = EN
    ? {
        giveaway: "🎉 **GIVEAWAY** 🎉",
        giveawayEnded: "🎉 **GIVEAWAY ENDED** 🎉",
        title: "{this.prize}",
        drawing: "⏳ Ends: {timestamp}",
        inviteToParticipate: "Click the 🎉 reaction to join!",
        winMessage: "🎉 Congrats {winners}! You won **{this.prize}**! {this.messageURL}",
        embedFooter: "{this.winnerCount} winner(s)",
        noWinner: "Cancelled — nobody joined with a valid reaction.",
        winners: "Winner(s):",
        endedAt: "Ended",
        hostedBy: "Hosted by: {this.hostedBy}",
      }
    : {
        giveaway: "🎉 **ÇEKİLİŞ** 🎉",
        giveawayEnded: "🎉 **ÇEKİLİŞ SONA ERDİ** 🎉",
        title: "{this.prize}",
        drawing: "⏳ Bitiş: {timestamp}",
        inviteToParticipate: "Katılmak için 🎉 tepkisine tıklayın!",
        winMessage: "🎉 Tebrikler {winners}! **{this.prize}** ödülünü kazandın! {this.messageURL}",
        embedFooter: "{this.winnerCount} kazanan",
        noWinner: "Çekiliş iptal edildi, geçerli katılım yok.",
        winners: "Kazanan:",
        endedAt: "Sona erdi",
        hostedBy: "Çekilişi yapan: {this.hostedBy}",
      };

  try {
    const giveaway = await client.giveawaysManager.start(kanal, {
      duration: sure,
      prize: odul,
      winnerCount: kazanan,
      hostedBy: message.author,
      messages: mesajlar,
    });

    const e = new EmbedBuilder().setColor("Green")
      .setTitle(EN ? "🎉 Giveaway started" : "🎉 Çekiliş başlatıldı")
      .setDescription(`[[${EN ? "open the giveaway message" : "çekiliş mesajını aç"}](${giveaway.messageURL})]`)
      .addFields(
        { name: EN ? "Channel" : "Kanal", value: `${kanal}`, inline: true },
        { name: EN ? "Prize" : "Ödül", value: odul.slice(0, 1024), inline: true },
        { name: EN ? "Winners" : "Kazanan sayısı", value: String(kazanan), inline: true },
        { name: EN ? "Duration" : "Süre", value: okunabilir, inline: true },
        { name: EN ? "Ends" : "Bitiş zamanı", value: `<t:${bitis}:R>\n<t:${bitis}:F>`, inline: true },
        { name: EN ? "Hosted by" : "Başlatan", value: `${message.author}`, inline: true }
      )
      .setFooter({ text: EN ? `To end it early: r!end ${giveaway.messageId}` : `Erken bitirmek için: r!sonlandır ${giveaway.messageId}` })
      .setTimestamp();
    return message.channel.send({ embeds: [e] });
  } catch (err) {
    const msg = typeof err === "string" ? err : err.message;
    console.error("çekiliş başlatılamadı:", msg);
    return message.channel.send({ embeds: [new EmbedBuilder().setColor("Red")
      .setTitle(EN ? "❌ The giveaway could not be started" : "❌ Çekiliş başlatılamadı")
      .setDescription(`${msg}\n\n${EN ? "Check that the bot can send messages in" : "Botun bu kanalda mesaj gönderabildiğinden ve mesaj eklerini (Embed Links) kullanabildiğinden emin olun. Kontrol edin:"} ${kanal}`)] });
  }
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["start", "çekiliş", "gstart", "cekilis", "giveaway"],
  permLevel: 0,
  kategori: "cekilis"
};
exports.help = {
  name: "başlat",
  description: "Çekilişi başlatır. Süre Türkçe veya İngilizce yazılabilir (2 gün 6 saat / 2d 3h / 30m).",
  usage: "çekiliş #kanal <süre> <kazanan sayısı> <ödül>  •  Örnek: r!çekiliş #çekiliş 2 gün 6 saat 1 Discord Nitro"
};
