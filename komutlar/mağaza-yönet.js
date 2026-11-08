const Discord = require('discord.js');
const db = require('croxydb');
const { getLangSync } = require("../dil");
const U = require("../utils");

// Katalog varsayılanları (bot.js SHOP_CATALOG ile aynı ID'ler)
const VARSAYILAN = {
  premium_30:  { ad: "💎 Premium 30 Gün", fiyat: 250000 },
  pet_tavsan:  { ad: "🐰 Tavşan", fiyat: 72000 },
  pet_kopek:   { ad: "🐶 Köpek", fiyat: 90000 },
  pet_kedi:    { ad: "🐱 Kedi", fiyat: 135000 },
  pet_balik:   { ad: "🐠 Balık", fiyat: 162000 },
  pet_aslan:   { ad: "🦁 Aslan", fiyat: 315000 },
  pet_kaplan:  { ad: "🐅 Kaplan", fiyat: 342000 },
  paket_rastgele: { ad: "🎁 Rastgele Paket", fiyat: 150000 },
  minecon2011:   { ad: "🏛️ Minecon 2011 Pelerini", fiyat: 100000 },
  "bunny-neon":  { ad: "⚡ Bunny Neon Pelerini", fiyat: 200000 },
  anniversary15: { ad: "💚 15. Yıl Creeper Pelerini", fiyat: 300000 },
  "ender-heart": { ad: "💜 Ender Heart Pelerini", fiyat: 400000 },
  "bunny-gold":  { ad: "🐰 Bunny Gold Pelerini", fiyat: 500000 },
  migrator:      { ad: "🧭 Migrator Pelerini", fiyat: 600000 },
  "trosa-crown": { ad: "👑 Trosa Crown Pelerini", fiyat: 700000 },
  "bandana-red":  { ad: "🎀 Kırmızı Bandana", fiyat: 50000 },
  "bandana-blue": { ad: "💙 Mavi Bandana", fiyat: 100000 },
  "bandana-gold": { ad: "👑 Altın Bandana", fiyat: 150000 },
  "ember-cape":   { ad: "🔥 Ember Pelerini", fiyat: 0 },
  "ocean-cape":   { ad: "🌊 Ocean Pelerini", fiyat: 0 },
  "mint-cape":    { ad: "🌿 Mint Pelerini", fiyat: 0 },
  "blossom-cape": { ad: "🌸 Blossom Pelerini", fiyat: 0 },
  "royal-cape":   { ad: "👑 Royal Pelerini", fiyat: 250000 },
  "bloodmoon-cape": { ad: "🌙 Blood Moon Pelerini", fiyat: 350000 },
  "frost-cape":   { ad: "❄️ Frost Pelerini", fiyat: 450000 },
  "shadow-cape":  { ad: "🌑 Shadow Pelerini", fiyat: 600000 },
  "dragon-wings": { ad: "🐲 Dragon Wings", fiyat: 250000 }
};

const SAYFA_BOYUT = 25;

function liste() {
  return Object.entries(VARSAYILAN).map(([id, v]) => {
    const oz = db.fetch(`magaza_${id}`) || {};
    const fiyat = Math.max(0, Math.floor(Number(oz.fiyat ?? v.fiyat)));
    return { id, ad: v.ad, fiyat: Number.isFinite(fiyat) ? fiyat : v.fiyat, gorunur: oz.gorunur !== false };
  });
}

/* Discord sınırları: etiket 1-100, açıklama 2-100, placeholder 1-150, en fazla 25 seçenek. */
function menuYap(items, sayfa, EN) {
  const toplamSayfa = Math.max(1, Math.ceil(items.length / SAYFA_BOYUT));
  const guvenli = Math.min(Math.max(0, sayfa), toplamSayfa - 1);
  const dilim = items.slice(guvenli * SAYFA_BOYUT, guvenli * SAYFA_BOYUT + SAYFA_BOYUT);
  const menu = new Discord.StringSelectMenuBuilder()
    .setCustomId("magaza_sec")
    .setPlaceholder((EN ? `Pick a product... (${guvenli + 1}/${toplamSayfa})` : `Ürün seç... (${guvenli + 1}/${toplamSayfa})`).slice(0, 150))
    .addOptions(dilim.map((it) => new Discord.StringSelectMenuOptionBuilder()
      .setLabel(`${it.gorunur ? "🟢" : "🔴"} ${it.ad}`.slice(0, 100))
      .setValue(String(it.id).slice(0, 100))
      .setDescription((`${it.fiyat.toLocaleString("tr-TR")} 💸`).padEnd(2, " ").slice(0, 100))));
  return { menu, sayfa: guvenli, toplamSayfa };
}

function embedYap(EN, secili, sayfa, toplamSayfa) {
  const items = liste();
  const e = new Discord.EmbedBuilder().setColor("Gold")
    .setTitle(EN ? "🛒 Shop Management (Site)" : "🛒 Mağaza Yönetimi (Site)")
    .setDescription(items.map(it =>
      `${it.gorunur ? "🟢" : "🔴"} \`${it.id}\` — ${it.ad}: **${it.fiyat.toLocaleString()}** 💸${secili === it.id ? " ⬅️" : ""}`
    ).join("\n") + "\n\n" + (EN
      ? "_Pick a product, then use the buttons. Only you can change these._"
      : "_Ürünü seç, sonra butonları kullan. Bunları sadece sen değiştirebilirsin._"));
  return e;
}

exports.run = async (client, message) => {
  const lang = getLangSync(message.author.id);
  const EN = lang === "en";
  if (message.author.id !== U.SAHIP_ID)
    return message.channel.send({ content: EN ? " Only **my owner** can manage the shop." : " Mağazayı sadece **sahibim** yönetebilir." });

  const items = liste();
  let secili = items[0].id;
  let sayfa = 0;
  const satirYap = () => {
    const itemsG = liste();
    const { menu, sayfa: g, toplamSayfa } = menuYap(itemsG, sayfa, EN);
    sayfa = g;
    const row1 = new Discord.ActionRowBuilder().addComponents(menu);
    const row2 = new Discord.ActionRowBuilder().addComponents(
      new Discord.ButtonBuilder().setCustomId("magaza_fiyat").setLabel(EN ? "Change Price" : "Fiyat Değiştir").setStyle(Discord.ButtonStyle.Primary).setEmoji("💰"),
      new Discord.ButtonBuilder().setCustomId("magaza_gorunur").setLabel(EN ? "Show/Hide" : "Göster/Gizle").setStyle(Discord.ButtonStyle.Secondary).setEmoji("👁️"),
      new Discord.ButtonBuilder().setCustomId("magaza_once").setLabel("◀").setStyle(Discord.ButtonStyle.Secondary).setDisabled(toplamSayfa <= 1 || sayfa === 0),
      new Discord.ButtonBuilder().setCustomId("magaza_sonra").setLabel("▶").setStyle(Discord.ButtonStyle.Secondary).setDisabled(toplamSayfa <= 1 || sayfa >= toplamSayfa - 1)
    );
    return { row1, row2, toplamSayfa };
  };

  let s0 = satirYap();
  const panel = await message.channel.send({ embeds: [embedYap(EN, secili, sayfa, s0.toplamSayfa)], components: [s0.row1, s0.row2] });
  const col = panel.createMessageComponentCollector({ filter: (i) => i.user.id === message.author.id, time: 180000 });

  const taze = async (i) => {
    const s = satirYap();
    const hedef = i.message ?? panel;
    await hedef.edit({ embeds: [embedYap(EN, secili, sayfa, s.toplamSayfa)], components: [s.row1, s.row2] })
      .catch((e) => console.error(`[KOMUT HATASI] mağaza-yönet.js (panel güncelleme) | ${e?.name}: ${e?.message}` + (e?.code != null ? ` (kod: ${e.code})` : ""), "\n  ", String(e?.stack || "").split("\n")[1]?.trim() || "?"));
  };

  col.on("collect", async (i) => {
    try {
      if (i.isStringSelectMenu() && i.customId === "magaza_sec") {
        secili = i.values[0];
        await i.deferUpdate().catch(() => {});
        return taze(i);
      }
      if (i.customId === "magaza_once" || i.customId === "magaza_sonra") {
        sayfa += i.customId === "magaza_once" ? -1 : 1;
        await i.deferUpdate().catch(() => {});
        return taze(i);
      }
      if (i.customId === "magaza_gorunur") {
        const oz = db.fetch(`magaza_${secili}`) || {};
        const cur = liste().find(x => x.id === secili);
        db.set(`magaza_${secili}`, { fiyat: oz.fiyat ?? cur.fiyat, gorunur: !(cur.gorunur) });
        await i.reply({ content: `👁️ \`${secili}\`: ${cur.gorunur ? (EN ? "HIDDEN from site" : "sitede GİZLENDİ") : (EN ? "VISIBLE on site" : "sitede GÖRÜNÜYOR")}`, ephemeral: true }).catch(() => {});
        return taze(i);
      }
      if (i.customId === "magaza_fiyat") {
        await i.reply({ content: (EN ? `💰 Send the new price for \`${secili}\` in chat within 30s (numbers only).` : `💰 \`${secili}\` için yeni fiyatı 30 sn içinde sohbete yaz (sadece sayı).`), ephemeral: true }).catch(() => {});
        const f = (m) => m.author.id === message.author.id && /^\d+$/.test(m.content.trim());
        const top = await message.channel.awaitMessages({ filter: f, max: 1, time: 30000 }).catch(() => null);
        const msg = top?.first?.();
        if (!msg) { await message.channel.send(EN ? "⏳ Cancelled (timeout)." : "⏳ İptal (süre doldu).").catch(() => {}); return; }
        const fiyat = Math.max(0, Math.min(100000000, parseInt(msg.content.trim(), 10)));
        const oz = db.fetch(`magaza_${secili}`) || {};
        const cur = liste().find(x => x.id === secili);
        db.set(`magaza_${secili}`, { fiyat, gorunur: oz.gorunur ?? cur.gorunur });
        await message.channel.send(`✅ \`${secili}\` → **${fiyat.toLocaleString()}** 💸`).catch(() => {});
        try { await msg.delete(); } catch {}
        const s = satirYap();
        await panel.edit({ embeds: [embedYap(EN, secili, sayfa, s.toplamSayfa)], components: [s.row1, s.row2] }).catch(() => {});
      }
    } catch (hata) {
      /* Eskiden boş catch'ti: buton/menü hataları iz bırakmadan kayboluyordu. */
      console.error(`[KOMUT HATASI] mağaza-yönet.js (etkileşim: ${i.customId || "?"}) | ${hata?.name || "Error"}: ${hata?.message || hata}` + (hata?.code != null ? ` (kod: ${hata.code})` : ""));
      console.error(String(hata?.stack || "").split("\n").slice(0, 6).join("\n"));
      await i.followUp({ content: `❌ Hata: \`${String(hata?.message || hata).slice(0, 300)}\` (detay sunucu günlüğünde)`, flags: Discord.MessageFlags.Ephemeral }).catch(async () => {
        await message.channel.send(`❌ mağaza-yönet etkileşim hatası: \`${String(hata?.message || hata).slice(0, 300)}\``).catch(() => {});
      });
    }
  });
  col.on("end", async () => { await panel.edit({ components: [] }).catch(() => {}); });
};

exports.conf = { enabled: true, guildOnly: false, aliases: ["mağaza-ayarla", "magaza"], permLevel: 5, kategori: "sahip" };
exports.help = { name: "mağaza-yönet", description: "Site mağazası: fiyat + görünürlük (sahip).", usage: "mağaza-yönet" };
