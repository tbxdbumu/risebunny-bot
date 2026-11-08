const { PermissionsBitField, EmbedBuilder } = require("discord.js");
const db = require("croxydb");
const { getLangSync, t } = require("../dil");
const { cekilisArgumanlari, kanalKontrolü, sureHataMetni, norm } = require("../util/cekilisCozum");

const SURE_ORNEK = "`2 gün 6 saat` · `2g 3s` · `2day 6hours` · `2d 3h` · `30m` · `1sa` · `2 hafta` · `1 ay`";

exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";

  if (!message.member.permissions.has(PermissionsBitField.Flags.ManageMessages))
    return message.channel.send(t(lang, "sistem.mesajYonet"));

  const hatalar = [];
  let cozum = { kanal: null, odul: "" };

  if (!args.length) {
    hatalar.push(EN ? "channel, duration, winner count and prize are missing" : "kanal, süre, kazanan sayısı ve ödül eksik");
  } else {
    cozum = await cekilisArgumanlari(message, args, lang);
    if (cozum.hata === "kanal") {
      hatalar.push(EN ? "channel not found — write `#` and pick the channel from Discord's list"
        : "kanal bulunamadı — `#` yazıp Discord'un açtığı listeden kanalı seçin");
    } else if (cozum.hata === "kanal_erisim") {
      hatalar.push(EN
        ? `I can't see that channel (\`${cozum.kanalId}\`) — it was deleted or the bot lacks **View Channel** there`
        : `o kanalı göremiyorum (\`${cozum.kanalId}\`) — kanal silinmiş ya da botun **Kanalı Görme (View Channel)** yetkisi yok`);
    } else if (cozum.hata === "sure") {
      hatalar.push(EN ? `duration problem: ${sureHataMetni(cozum.sureNeden, cozum.sureDetay, lang)}`
        : `süre sorunu: ${sureHataMetni(cozum.sureNeden, cozum.sureDetay, lang)}`);
    } else if (cozum.hata === "kazanan") {
      hatalar.push(EN ? "winner count must be a whole number right after the duration"
        : "süreden hemen sonra kazanan sayısı rakam olarak yazılmalı (örn. `1d 2 Nitro` → 2 kazanan)");
    } else if (cozum.hata === "odul") {
      hatalar.push(EN ? "prize text is missing" : "ödül yazısı eksik (örn. `Discord Nitro`)");
    } else {
      const kanalSorunu = kanalKontrolü(message, cozum.kanal, lang);
      if (kanalSorunu) hatalar.push(EN ? `channel problem: ${kanalSorunu}` : `kanal sorunu: ${kanalSorunu}`);
    }
  }

  /* Ödül metninden şart bayraklarını ayır: --davet/--invites <sayı>, --rol/--role @rol */
  let odulMetni = cozum.odul || "";
  let davetSarti = 0;
  let rolSarti = null;
  let rolBulunamadi = false;

  const rolM = odulMetni.match(/--?(?:rol|role)\s+(?:<@&(\d+)>|(\S+))/i);
  if (rolM) {
    rolSarti = rolM[1] || message.guild.roles.cache.find((r) => norm(r.name) === norm(rolM[2]))?.id || null;
    if (!rolSarti) rolBulunamadi = true;
    odulMetni = odulMetni.replace(rolM[0], " ");
  }
  const davetM = odulMetni.match(/--?(?:davet|invites?|invitecount)\s+(\d+)/i);
  if (davetM) {
    davetSarti = parseInt(davetM[1], 10) || 0;
    odulMetni = odulMetni.replace(davetM[0], " ");
  }
  const odul = odulMetni.replace(/\s+/g, " ").trim();

  if (rolBulunamadi) hatalar.push(EN ? "the role after `--rol` was not found" : "`--rol` sonrası rol bulunamadı, rolü etiketleyin (@Rol)");
  if (!hatalar.length && !davetSarti && !rolSarti) {
    hatalar.push(EN ? "at least one requirement: `--davet <count>` and/or `--rol @role`"
      : "en az bir katılım şartı: `--davet <sayı>` ve/veya `--rol @rol`");
  }
  if (!hatalar.length && !odul) hatalar.push(EN ? "prize text is missing" : "ödül yazısı eksik (örn. `Discord Nitro`)");

  if (hatalar.length) {
    const e = new EmbedBuilder().setColor("Red")
      .setTitle(EN ? "❌ Missing / invalid values" : "❌ Eksik veya geçersiz bilgi")
      .setDescription(hatalar.map((h) => `• ${h}`).join("\n"))
      .addFields(
        {
          name: EN ? "Correct usage" : "Doğru kullanım",
          value: EN
            ? "`r!giveaway-requirement #channel <duration> <winners> <prize> --invites <count> / --role @role`\nExample: `r!giveaway-requirement #giveaway 1 day 1 Nitro --invites 5`"
            : "`r!çekiliş-şart #kanal <süre> <kazanan> <ödül> --davet <sayı> / --rol @rol`\nÖrnek: `r!çekiliş-şart #çekiliş 1 gün 1 Nitro --davet 5`",
        },
        { name: EN ? "Supported durations" : "Desteklenen süreler", value: `${SURE_ORNEK}\n${EN ? "min 10 seconds, max 90 days" : "en az 10 saniye, en fazla 90 gün"}` }
      );
    return message.channel.send({ embeds: [e] });
  }

  const { kanal, ms: sure, okunabilir, kazanan } = cozum;
  const bitis = Math.floor((Date.now() + sure) / 1000);
  const sartMetni = [
    davetSarti ? (EN ? `${davetSarti}+ server invites` : `**${davetSarti}+** sunucu daveti`) : null,
    rolSarti ? (EN ? `<@&${rolSarti}> role` : `<@&${rolSarti}> rolü`) : null,
  ].filter(Boolean).join(EN ? " and " : " ve ");

  /* Şartı çekiliş anında uygula: şartı karşılamayan katılımcı kazanamaz. */
  const sart = { davet: davetSarti, rol: rolSarti, guild: message.guild.id };
  const exemptMembers = (member) => {
    if (!member || member.user.bot) return true;
    if (rolSarti && !member.roles.cache.has(rolSarti)) return true;
    if (davetSarti > 0) {
      /* Davet verisi tek kaynaktan (ai/davet.js). Önceden ham
         `db.fetch("invites.<id>")` okunuyordu; o anahtara yazan kod
         olmadığı için şart hiçbir zaman karşılanamıyordu. */
      if (require("../ai/davet").toplamGetir(member.id) < davetSarti) return true;
    }
    return false;
  };

  const mesajlar = EN
    ? {
        giveaway: "🎉 **CONDITIONAL GIVEAWAY** 🎉",
        giveawayEnded: "🎉 **GIVEAWAY ENDED** 🎉",
        title: "{this.prize}",
        drawing: "⏳ Ends: {timestamp}",
        inviteToParticipate: `Requirement: ${sartMetni}\nClick the 🎉 reaction to join!`,
        winMessage: "🎉 Congrats {winners}! You won **{this.prize}**! {this.messageURL}",
        embedFooter: "{this.winnerCount} winner(s)",
        noWinner: "Cancelled — no valid participant met the requirement.",
        winners: "Winner(s):",
        endedAt: "Ended",
        hostedBy: "Hosted by: {this.hostedBy}",
      }
    : {
        giveaway: "🎉 **ŞARTLI ÇEKİLİŞ** 🎉",
        giveawayEnded: "🎉 **ÇEKİLİŞ SONA ERDİ** 🎉",
        title: "{this.prize}",
        drawing: "⏳ Bitiş: {timestamp}",
        inviteToParticipate: `Katılım şartı: ${sartMetni}\nKatılmak için 🎉 tepkisine tıklayın!`,
        winMessage: "🎉 Tebrikler {winners}! **{this.prize}** ödülünü kazandın! {this.messageURL}",
        embedFooter: "{this.winnerCount} kazanan",
        noWinner: "Çekiliş iptal edildi, şartı karşılayan katılım yok.",
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
      exemptMembers,
      extraData: sart,
      messages: mesajlar,
    });
    db.set(`cekilis_sart_${giveaway.messageId}`, sart);

    const e = new EmbedBuilder().setColor("Green")
      .setTitle(EN ? "🎉 Conditional giveaway started" : "🎉 Şartlı çekiliş başlatıldı")
      .setDescription(`[[${EN ? "open the giveaway message" : "çekiliş mesajını aç"}](${giveaway.messageURL})]`)
      .addFields(
        { name: EN ? "Channel" : "Kanal", value: `${kanal}`, inline: true },
        { name: EN ? "Prize" : "Ödül", value: odul.slice(0, 1024), inline: true },
        { name: EN ? "Requirement" : "Şart", value: sartMetni, inline: true },
        { name: EN ? "Winners" : "Kazanan sayısı", value: String(kazanan), inline: true },
        { name: EN ? "Duration" : "Süre", value: okunabilir, inline: true },
        { name: EN ? "Ends" : "Bitiş zamanı", value: `<t:${bitis}:R>\n<t:${bitis}:F>`, inline: true }
      )
      .setFooter({ text: EN ? `To end it early: r!end ${giveaway.messageId}` : `Erken bitirmek için: r!sonlandır ${giveaway.messageId}` })
      .setTimestamp();
    return message.channel.send({ embeds: [e] });
  } catch (err) {
    const msg = typeof err === "string" ? err : err.message;
    console.error("şartlı çekiliş başlatılamadı:", msg);
    return message.channel.send({ embeds: [new EmbedBuilder().setColor("Red")
      .setTitle(EN ? "❌ The giveaway could not be started" : "❌ Çekiliş başlatılamadı")
      .setDescription(`${msg}\n\n${EN ? "Check that the bot can send messages in" : "Botun bu kanalda mesaj gönderabildiğinden ve mesaj eklerini (Embed Links) kullanabildiğinden emin olun. Kontrol edin:"} ${kanal}`)] });
  }
};

exports.conf = {
  enabled: true,
  guildOnly: true,
  aliases: ["çekiliş-şart", "cekilis-sart", "greq", "giveaway-req"],
  permLevel: 0,
  kategori: "cekilis"
};
exports.help = {
  name: "çekiliş-şart",
  description: "Davet veya rol şartlı çekiliş başlatır. Süre Türkçe/İngilizce yazılabilir.",
  usage: "çekiliş-şart #kanal <süre> <kazanan> <ödül> --davet <sayı> / --rol @rol"
};
