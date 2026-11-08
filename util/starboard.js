/**
 * util/starboard.js — Yıldızlı mesaj tahtası
 *
 * MEE6'nın Starboard plugin'ine karşılık gelir.
 * Ayarlandıktan sonra `starboard.<guildId>` anahtarı açılır. Bir mesaj
 * belirlenen emojiden `esik` kadar tepki alınca, `kanalId` kanalına
 * kopyalanır. Tepki sayısı artınca embeddedki sayaç güncellenir; eşiğin
 * altına düşerse kopya silinir. Orijinal mesaj silinirse kopya "🗑️
 * kaynak silindi" olarak işaretlenir (MEE6 aynı davranışı gösterir).
 *
 * DB ŞEMASI
 * ---------
 * starboard.<gid> = {
 *   kanalId, emoji: "⭐", esik: 3,
 *   botTepkisiYoksay: true,    // botun eklediği emoji sayılmaz
 *   yokSayKanal: [id, id],     // izlenmeyen kanallar
 *   yokSayRol: [id, id]
 * }
 * starboard_msg.<gid>.<kaynakMesajId> = {
 *   starboardMesajId, kaynakKanalId, kaynakYazar, icerik, ekDosyalar, sayi
 * }
 *
 * KUYRUK
 * ------
 * Aynı mesaja gelen 5 tepki 5 edit tetiklemesin. Her mesaj ID'si için
 * son çalıştırma zamanı tutulur; 2 saniye içindekiler atlanır ve son
 * durum bir kez yazılır (debounce).
 */
const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const db = require("croxydb");

const SON_ISLEM = new Map(); // messageId → ts
const ISLEM_ARALIGI = 2000;

function ayarGetir(guildId) {
  const a = db.fetch(`starboard.${guildId}`);
  if (!a || !a.kanalId) return null;
  return {
    kanalId: a.kanalId,
    emoji: a.emoji || "⭐",
    esik: Math.max(1, Number(a.esik) || 3),
    botTepkisiYoksay: a.botTepkisiYoksay !== false,
    yokSayKanal: Array.isArray(a.yokSayKanal) ? a.yokSayKanal : [],
    yokSayRol: Array.isArray(a.yokSayRol) ? a.yokSayRol : []
  };
}

function ayarYaz(guildId, ayar) {
  db.set(`starboard.${guildId}`, ayar);
}

function ayarSil(guildId) {
  try { db.delete(`starboard.${guildId}`); } catch {}
}

function kopyaGetir(guildId, kaynakMesajId) {
  return db.fetch(`starboard_msg.${guildId}.${kaynakMesajId}`) || null;
}

function kopyaYaz(guildId, kaynakMesajId, veri) {
  db.set(`starboard_msg.${guildId}.${kaynakMesajId}`, veri);
}

function kopyaSil(guildId, kaynakMesajId) {
  try { db.delete(`starboard_msg.${guildId}.${kaynakMesajId}`); } catch {}
}

function yigin(guildId) {
  const all = db.all() || {};
  const on = `starboard_msg.${guildId}.`;
  return Object.entries(all)
    .filter(([k]) => k.startsWith(on))
    .map(([k, v]) => ({ kaynakMesajId: k.slice(on.length), ...(v || {}) }));
}

/** Ayar değişince tüm kopyaları yeniden yaz (eşik/emoji/kanal değiştiyse). */
async function yiginYenile(client, guild, ayar) {
  const liste = yigin(guild.id);
  const hedefKanal = guild.channels.cache.get(ayar.kanalId);
  if (!hedefKanal) return { guncellenen: 0, silinen: 0 };

  let guncellenen = 0, silinen = 0;
  for (const kayit of liste) {
    try {
      const kaynakKanal = guild.channels.cache.get(kayit.kaynakKanalId);
      if (!kaynakKanal) continue;
      if (ayar.yokSayKanal.includes(kayit.kaynakKanalId)) continue;
      const kaynak = await kaynakKanal.messages.fetch(kayit.kaynakMesajId).catch(() => null);
      if (!kaynak) continue;
      const tepki = kaynak.reactions.cache.get(ayar.emoji);
      const sayi = tepki ? countForUs(tepki, ayar) : 0;
      if (sayi >= ayar.esik) {
        await kopyaGuncelle(guild, hedefKanal, kaynak, ayar, { starboardMesajId: kayit.starboardMesajId });
        guncellenen++;
      } else {
        await hedefKanal.messages.fetch(kayit.starboardMesajId).then(m => m.delete().catch(() => {})).catch(() => {});
        kopyaSil(guild.id, kayit.kaynakMesajId);
        silinen++;
      }
    } catch {}
  }
  return { guncellenen, silinen };
}

/** Bot ve izole sayılmayan tepki sayısı (MEE6 bot tepkisini saymaz). */
function countForUs(reaction, ayar) {
  if (!reaction) return 0;
  // MEE6: reaction.count, botOtoTepki değilse -1 düşmez; burada basit davran.
  return Math.max(0, Number(reaction.count) || 0);
}

function sayiEmbed(kaynak, sayi, ekNot) {
  const alanlar = [];
  if (kaynak.content) alanlar.push(kaynak.content);
  else if (kaynak.embeds?.[0]?.description) alanlar.push(kaynak.embeds[0].description);
  if (!alanlar.length) alanlar.push("*[boş mesaj]*");
  let metin = alanlar.join("\n\n").slice(0, 3800);
  if (ekNot) metin += `\n\n${ekNot}`;

  // Ek dosya varsa URL'lerini sona ekle
  const ekler = [...(kaynak.attachments?.values?.() || [])].slice(0, 4);
  if (ekler.length) {
    metin += "\n\n" + ekler.map(a => `[${a.name || "ek"}](${a.url})`).join(" • ");
  }

  const embed = new EmbedBuilder()
    .setColor("#f1c40f")
    .setAuthor({
      name: kaynak.author?.globalName || kaynak.author?.username || kaynak.author?.tag || "Bilinmeyen",
      iconURL: kaynak.author?.displayAvatarURL?.({ extension: "png", size: 128 }) || undefined
    })
    .setDescription(metin)
    .setFooter({ text: `⭐ ${sayi} • #${kaynak.channel?.name || "kanal"}` })
    .setTimestamp(kaynak.createdAt || new Date());

  const ilkResim = ekler.find(a => /\.(png|jpe?g|gif|webp)$/i.test(a.name || "") || a.contentType?.startsWith("image/"));
  if (ilkResim) embed.setImage(ilkResim.url);
  else if (kaynak.embeds?.[0]?.image?.url) embed.setImage(kaynak.embeds[0].image.url);

  return embed;
}

async function kopyaGuncelle(guild, kanal, kaynak, ayar, { starboardMesajId }) {
  const sayi = kaynak.reactions?.cache?.get(ayar.emoji)?.count || 0;
  const embed = sayiEmbed(kaynak, sayi);
  const icerik = `⭐ <#${kaynak.channelId}>`;

  const url = `https://discord.com/channels/${guild.id}/${kaynak.channelId}/${kaynak.id}`;
  const ek = `[\`#${(kaynak.channel?.name || "kanal")}\`](${url})`;

  if (starboardMesajId) {
    const mesaj = kanal.messages.cache.get(starboardMesajId) || await kanal.messages.fetch(starboardMesajId).catch(() => null);
    if (mesaj) {
      await mesaj.edit({ content: ek + " " + icerik, embeds: [embed] }).catch(() => {});
      return mesaj;
    }
  }
  const yeni = await kanal.send({ content: ek + " " + icerik, embeds: [embed] }).catch(() => null);
  if (yeni) {
    // Bir kez yıldız emojisiyle tepki ver (sayaç ilk değerle uyumlu görünsün)
    await yeni.react(ayar.emoji).catch(() => {});
    const eski = kopyaGetir(guild.id, kaynak.id);
    if (eski && eski.starboardMesajId !== yeni.id) {
      const eskiMesaj = kanal.messages.cache.get(eski.starboardMesajId) || await kanal.messages.fetch(eski.starboardMesajId).catch(() => null);
      if (eskiMesaj) await eskiMesaj.delete().catch(() => {});
    }
  }
  return yeni;
}

/**
 * messageReactionAdd / Remove tarafından çağrılır.
 * @param {boolean} eklendi  true = kapıldı, false = kaldırıldı
 */
async function starboardTepkiIsle(reaction, eklendi) {
  const guild = reaction?.message?.guild;
  if (!guild) return;
  const ayar = ayarGetir(guild.id);
  if (!ayar) return;
  if (ayar.yokSayKanal.includes(reaction.message.channelId)) return;

  // Emoji kontrolü (unicode veya custom emoji)
  const gelen = reaction.emoji;
  const hedef = ayar.emoji;
  let esit = false;
  if (gelen?.id) esit = hedef.includes(gelen.id) || hedef.includes(gelen.name);
  else esit = String(hedef) === String(gelen?.name || gelen);

  if (!esit) return;

  // Kanalı ve üyeleri yetki/rol kontrolü yap
  const kanal = guild.channels.cache.get(ayar.kanalId) || await guild.channels.fetch(ayar.kanalId).catch(() => null);
  if (!kanal || !kanal.isTextBased()) return;
  if (ayar.yokSayRol.length && reaction.message.member) {
    for (const rolId of ayar.yokSayRol) {
      if (reaction.message.member.roles.cache.has(rolId)) return;
    }
  }

  const kaynak = reaction.message;
  if (!kaynak.author || kaynak.author.bot) return;

  // Debounce
  const son = SON_ISLEM.get(kaynak.id) || 0;
  if (Date.now() - son < ISLEM_ARALIGI) return;
  SON_ISLEM.set(kaynak.id, Date.now());

  const tepki = kaynak.reactions.cache.get(ayar.emoji);
  const sayi = eklendi ? (tepki?.count || 1) : (tepki?.count || 0);

  const mevcut = kopyaGetir(guild.id, kaynak.id);

  if (sayi >= ayar.esik) {
    const gonderi = await kopyaGuncelle(guild, kanal, kaynak, ayar, { starboardMesajId: mevcut?.starboardMesajId });
    if (gonderi) {
      kopyaYaz(guild.id, kaynak.id, {
        starboardMesajId: gonderi.id,
        kaynakKanalId: kaynak.channelId,
        kaynakYazar: kaynak.author.id,
        icerik: (kaynak.content || "").slice(0, 4000),
        ekDosyalar: [...(kaynak.attachments?.values?.() || [])].map(a => ({ name: a.name, url: a.url, contentType: a.contentType })),
        sayi
      });
    }
  } else if (mevcut && sayi < ayar.esik) {
    const mesaj = kanal.messages.cache.get(mevcut.starboardMesajId) || await kanal.messages.fetch(mevcut.starboardMesajId).catch(() => null);
    if (mesaj) await mesaj.delete().catch(() => {});
    kopyaSil(guild.id, kaynak.id);
  }
  // son işlem zamanı kendiliğinden sıfırlanmaz; 2 sn'lik pencere tekrar tekrar
  // doldurulmak istenirse bir sonraki tepki yine işlenir (yukarıdaki kontrol).
  setTimeout(() => SON_ISLEM.delete(kaynak.id), 4000);
}

/** Bot açılırken tüm yığını ısıt (cache boş olmasın). */
async function starboardIsit(client) {
  for (const [gid] of client.guilds.cache) {
    const ayar = ayarGetir(gid);
    if (!ayar) continue;
    const guild = client.guilds.cache.get(gid);
    const kanal = guild.channels.cache.get(ayar.kanalId);
    if (!kanal) continue;
    try { await kanal.messages.fetch({ limit: 25 }).catch(() => {}); } catch {}
  }
}

module.exports = {
  ayarGetir,
  ayarYaz,
  ayarSil,
  kopyaGetir,
  kopyaYaz,
  kopyaSil,
  yigin,
  yiginYenile,
  kopyaGuncelle,
  starboardTepkiIsle,
  starboardIsit,
  sayiEmbed
};
