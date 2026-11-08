const Discord = require('discord.js');
const db = require('croxydb')
const { getLangSync, t } = require("../dil");
exports.run = async (client, message, args) => {
  const lang = getLangSync(message.author.id); 
let prefix = (await db.fetch(`prefix_${message.guild.id}`)) || ("!");
  
if (!message.member.permissions.has(Discord.PermissionFlagsBits.Administrator)) return message.channel.send({ content: t(lang, "sistem.yonetici") });
  
  let mesaj = args.slice(0).join(' ');
  if(mesaj.length < 5) return message.channel.send((lang === "en" ? ' 6 variables are supported for the autorole message: -uye- -uyetag- -rol- -server- -uyesayisi- -kanalsayisi-.\nExample: `r!autorole-message -uye- welcome! We are now -uyesayisi- people!`\nNote: -uye- writes the member name only, nobody is pinged.' : ' Otorol mesajı için 6 değişken desteklenmektedir: -uye- -uyetag- -rol- -server- -uyesayisi- -kanalsayisi-.\nÖrnek: `r!otorol-mesaj-ayarla -uye- hoş geldin! Senle beraber -uyesayisi- kişiyiz!`\nNot: -uye- üyenin sadece adını yazar, kimse etiketlenmez.'))
  
 message.channel.send((lang === "en" ? ' Autorole message successfully `' : ' Otorol mesajı başarıyla `')+mesaj+(lang === "en" ? '` has been set!' : '` olarak ayarlandı!')) 
 db.set(`otoRM_${message.guild.id}`, mesaj)  

  
};
exports.conf = {
    enabled: true,
    guildOnly: false,
    permLevel: 0,
    aliases: ['otorol-mesaj-ayarla']
  };
  
  exports.help = {
    name: 'otorol-mesaj',
    description: 'Türkiyenin Saatini Gösterir',
    usage: 'gç'
  };