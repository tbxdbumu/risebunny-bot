const Discord = require("discord.js");
const Database = require("../Helpers/Database");
const { getLangSync, t } = require("../dil");
// exports.onLoad = (client) => {};
/**
 * @param {Discord.Client} client 
 * @param {Discord.Message} message 
 * @param {Array<String>} args 
 */
exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id);
    if(!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator) && !message.member.permissions.has(Discord.PermissionFlagsBits.ManageGuild)) return message.reply(t(lang, "sistem.yetkiYok"));

    var victim = message.mentions.members.size > 0 ? message.mentions.members.first().id : args.length > 0 ? args[0] : undefined;
    if(!victim) return message.reply((lang === "en" ? "Please Write Someone's ID" : "Lütfen Birinin İD Sini Yaz"));
    victim = message.guild.members.cache.get(victim);
    if(!victim) return message.reply((lang === "en" ? "The Person Whose ID You Wrote Is Not On The Server." : "İD Sini Yazdığınız Kişi Sunucuda Bulunmamaktadır."));

    var num = Number(args[1]);
    if(isNaN(num)) return message.reply((lang === "en" ? "Please Enter The Bonus Number." : "Lütfen Bonus Olacak Sayı Giriniz."));

    /* Bonus ai/davet.js üzerinden yazılır — davet verisi tek yerden
       yönetilsin diye (r!davetlerim ve r!çekiliş-şart aynı biçimi okur).
       ESKİ HATA: burada `global.onUpdateInvite(...)` çağrılıyordu ama o
       fonksiyon HİÇBİR yerde tanımlı değildi; komut her seferinde
       "TypeError: global.onUpdateInvite is not a function" ile çöküyordu. */
    const D = require("../ai/davet");
    const oncekiToplam = D.toplamGetir(victim.id);
    const guncel = D.bonusEkle(victim.id, num);
    const yeniToplam = guncel.total + guncel.bonus;

    message.channel.send((lang === "en"
      ? `Added **${num}** bonus invite(s) to ${victim}. Total: **${oncekiToplam} → ${yeniToplam}**.`
      : `${victim} adlı kişiye **${num}** bonus davet eklendi. Toplam: **${oncekiToplam} → ${yeniToplam}**.`));
};

exports.conf = {
  enabled: true,
  guildOnly: false,
  aliases: [],
  permLevel: 0
};
exports.help = {
  name: 'bonus-ekle',
  description: 'Logo Yaparsınız',
  usage: 'm-logo <yazı>'
};
