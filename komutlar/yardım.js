const { EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { t, getLang, KATEGORILER, KOMUTLAR, katAdi, katCoz, komutAdi, komutBilgi } = require("../dil");
const { isPremium, DESTEK, PREFIX, SAHIP_ID } = require("../utils");

// Menüde SAHİP kategorisi artık görünür — sadece kullanan kişiye sahip satırları gösterilir
const GIZLI = new Set(["yardim"]);

/** Kategorideki komutları o dilde listeler. */
function kategoriListesi(client, lang, katId) {
  const EN = lang === "en";
  const satirlar = [];

  /* SAHİP kategorisi: listeyi elle tutmak yerine gerçek komutlardan türet.
     Böylece sahip-only (permLevel 5) her komut + sözlükte "sahip" işaretli
     komutlar eksiksiz görünür. */
  if (katId === "sahip") {
    const eklenen = new Set();
    const ekle = (canonical, cmd) => {
      if (eklenen.has(canonical)) return;
      eklenen.add(canonical);
      const b = komutBilgi(lang, canonical);
      const kapali = cmd && cmd.conf && cmd.conf.enabled === false ? (EN ? " (disabled)" : " (kapalı)") : "";
      const kisa = String(b.kullanim || "").split(" | ")[0].trim();
      satirlar.push(
        `**\`${PREFIX}${komutAdi(lang, canonical)}\`**${kapali} — ${b.aciklama || "-"}` +
        (kisa ? `\n> \`${PREFIX}${kisa}\`` : "")
      );
    };
    /* 1) Sahip-only komutlar (komut dosyasındaki permLevel: 5) */
    for (const [canonical, cmd] of client.commands) {
      if (cmd && cmd.conf && cmd.conf.permLevel === 5) ekle(canonical, cmd);
    }
    /* 2) Sözlükte "sahip" kategorisinde işaretli komutlar */
    for (const [canonical, bilgi] of Object.entries(KOMUTLAR)) {
      if (bilgi.kat !== "sahip") continue;
      const cmd = client.commands.get(canonical);
      if (cmd) ekle(canonical, cmd);
    }
    return satirlar;
  }

  for (const [canonical] of Object.entries(KOMUTLAR)) {
    const bilgi = KOMUTLAR[canonical];
    if (bilgi.kat !== katId) continue;
    const cmd = client.commands.get(canonical);
    if (!cmd) continue;
    const ad = komutAdi(lang, canonical);
    const b = komutBilgi(lang, canonical);
    const kisa = String(b.kullanim || "").split(" | ")[0].trim();
    satirlar.push(
      `**\`${PREFIX}${ad}\`** — ${b.aciklama || "-"}` +
      (kisa ? `\n> \`${PREFIX}${kisa}\`` : "")
    );
  }
  return satirlar;
}

/**
 * Tek komut icin detayli yardim karti.
 * r!yardim <komut>  →  aciklama + kullanim + ornek + takma adlar
 */
function komutDetay(client, lang, katId, canonical) {
  const EN = lang === "en";
  const cmd = client.commands.get(canonical);
  const b = komutBilgi(lang, canonical);
  const ad = komutAdi(lang, canonical);
  const aliases = (cmd?.conf?.aliases || []).filter((a) => a !== canonical);

  const embed = new EmbedBuilder().setColor("Random");
  const ikon = client.user?.displayAvatarURL?.() || "";
  embed.setAuthor({
    name: `${PREFIX}${ad}`,
    ...(/^https?:\/\//.test(ikon) ? { iconURL: ikon } : {}),
  });
  embed.setDescription(b.aciklama || "-");

  if (b.kullanim) {
    embed.addFields({
      name: EN ? "📋 Usage" : "📋 Kullanım",
      value: String(b.kullanim)
        .split(" | ")
        /* Alt komut da ayni komutla baslamali. `embed alan ekle <ad> | <değer>`
           gibi arguman icindeki boru isareti yeni komut sanilmasin. */
        .reduce((out, parca) => {
          const s = parca.trim();
          if (!s) return out;
          const onceki = out[out.length - 1];
          if (onceki && !s.startsWith(ad)) out[out.length - 1] = `${onceki.slice(0, -1)} | ${s}\``;
          else out.push(`\`${PREFIX}${s}\``);
          return out;
        }, [])
        .join("\n")
        .slice(0, 1024),
    });
  }
  if (aliases.length) {
    embed.addFields({
      name: EN ? "🔗 Aliases" : "🔗 Takma adlar",
      value: aliases.slice(0, 12).map((a) => `\`${PREFIX}${a}\``).join(", ").slice(0, 1024),
    });
  }
  const kat = KATEGORILER.find((k) => k.id === katId);
  if (kat) {
    embed.addFields({ name: EN ? "📁 Category" : "📁 Kategori", value: `${kat.emoji} ${katAdi(lang, kat.id)}`, inline: true });
  }
  if (cmd?.conf?.permLevel >= 1) {
    const seviye = [EN ? "Everyone" : "Herkes", EN ? "Moderator" : "Moderatör", EN ? "Admin" : "Yönetici",
      EN ? "Server Owner" : "Sunucu Sahibi", EN ? "Bot Owner" : "Bot Sahibi"][Math.min(cmd.conf.permLevel, 4)];
    embed.addFields({ name: EN ? "🔑 Permission" : "🔑 Gerekli yetki", value: seviye, inline: true });
  }
  const footer = EN
    ? `Type \`${PREFIX}help <category>\` to list a category`
    : `Kategori listesi için \`${PREFIX}yardım <kategori>\` yaz`;
  embed.setFooter({ text: footer });
  return embed;
}

/** AI komutlarını öne çıkararak listeler */
function aiKomutListesi(lang) {
  const EN = lang === "en";
  const aiKomutlar = [
    { canonical: "otomasyon", label: EN ? "🤖 AI Server Training" : "🤖 Sunucuya Özel AI Eğitimi", desc: EN ? "Train AI with your server's Q&A" : "Sunucunuzun soru-cevaplarıyla AI eğitin" },
    { canonical: "cevir", label: EN ? "🌐 AI Translate" : "🌐 AI Çeviri", desc: EN ? "Translate text with AI" : "AI ile metin çevirin" },
    { canonical: "y-kayıt-sistem", label: EN ? "📝 AI Registration" : "📝 AI Kayıt Sistemi", desc: EN ? "AI-powered registration system" : "Yapay zeka destekli kayıt sistemi" },
    { canonical: "y-koruma", label: EN ? "🛡️ AI Protection" : "🛡️ AI Koruma", desc: EN ? "AI-based server protection" : "Yapay zeka tabanlı koruma" },
    { canonical: "y-otosistem", label: EN ? "⚙️ AI Auto Setup" : "⚙️ AI Otomatik Kurulum", desc: EN ? "Auto-setup AI registration" : "AI kayıt sistemini otomatik kur" }
  ];

  const liste = aiKomutlar.map(k => {
    const b = komutBilgi(lang, k.canonical);
    const cmd = b ? komutAdi(lang, k.canonical) : k.canonical;
    return `**${k.label}** — \`${PREFIX}${cmd}\`\n  ${k.desc}`;
  }).join("\n\n");

  // YENİ: doğal dille komut çalıştırma (rise) + beta/mod bilgisi
  const riseBilgi = EN
    ? `**✨ Run Commands with AI (NEW!)** — \`rise <request in plain words>\`\n  Ex: \`rise mute @Ahmet 10m spam\`, \`rise how much money do I have\`\n  Permissions are checked, owner commands excluded. Beta + Premium required.`
    : `**✨ AI ile Komut Çalıştırma (YENİ!)** — \`rise <doğal dilde istek>\`\n  Örn: \`rise @Ahmet'i 10dk sustur spam\`, \`rise param ne kadar\`\n  Yetkiler denetlenir, sahip komutları hariç. Beta + Premium gerekir.`;
  return `${riseBilgi}\n\n${liste}`;
}

exports.run = async (client, message, args) => {
  const lang = await getLang(message.author.id);
  const EN = lang === "en";
  const premiumMu = isPremium(message.author.id);
  const uyelik = premiumMu ? "💎 Premium" : (EN ? "Standard" : "Standart");
  const davet = `https://discord.com/api/oauth2/authorize?client_id=${client.user.id}&permissions=8&scope=bot%20applications.commands`;

  // r!yardım <kategori> (TR veya EN kategori adıyla)
  const alt = (args[0] || "").toLowerCase();
  if (alt) {
    const kat = katCoz(alt);
    if (kat && !GIZLI.has(kat.id)) {
      // Sahip kategorisi sadece sahip tarafından görülebilir
      if (kat.id === "sahip" && message.author.id !== SAHIP_ID) {
        return message.reply(EN ? "This category is owner-only." : "Bu kategori sadece bot sahibine açıktır.").catch(() => {});
      }
      const satirlar = kategoriListesi(client, lang, kat.id);
      const embed = new EmbedBuilder()
        .setAuthor({ name: `${kat.emoji} ${katAdi(lang, kat.id)}`, iconURL: client.user.displayAvatarURL() })
        .setColor("Random")
        .setDescription(satirlar.length ? satirlar.join("\n").slice(0, 3900) : "-")
        .setFooter({ text: `RiseBunny • ${PREFIX}${komutAdi(lang, "yardım")}` })
        .setTimestamp();
      return message.channel.send({ embeds: [embed] }).catch(() => {});
    }
    // Eski alt-yardım komutlarına geri uyumluluk (ekonomi, moderasyon...)
    const eski = client.commands.get(alt) || client.commands.get(client.aliases.get(alt));
    if (eski && (eski.conf.kategori === "Bot" || eski.conf.kategori === "bot" || eski.conf.kategori === "yardım")) {
      return eski.run(client, message, args.slice(1));
    }
    /* r!yardım <komut> — tek komut icin detayli kart */
    if (eski) {
      const canonical = eski.help?.name || alt;
      const kayit = KOMUTLAR[canonical] || Object.entries(KOMUTLAR).find(([, v]) => v.en === canonical)?.[1];
      const detay = komutDetay(client, lang, kayit?.kat || "kullanici", canonical);
      return message.channel.send({ embeds: [detay] }).catch(() => {});
    }
  }

  const menuKategoriler = KATEGORILER.filter(k => !GIZLI.has(k.id) && (k.id !== "sahip" || message.author.id === SAHIP_ID));

  /* Kategori bolumleri: kategori ADLARI komut degildir, o yuzden
     `r!ad` gibi uydurma komut yazmiyoruz. Sadece dil-bagimsiz kimlik
     gosterilir ve secim menusu kullanilir. */
  const kategoriSatirlari = menuKategoriler
    .map(k => `${k.emoji} **${katAdi(lang, k.id)}**`)
    .join(" • ");

  const embed = new EmbedBuilder()
    .setAuthor({ name: t(lang, "yardim.baslik"), iconURL: client.user.displayAvatarURL() })
    .setColor("Random")
    .setThumbnail(message.author.displayAvatarURL())
    .setDescription(
      t(lang, "yardim.aciklama", { kullanici: `<@${message.author.id}>`, prefix: PREFIX, uyelik }) +
      (EN
        ? `\n\n**How to use**\n\`${PREFIX}help <category>\` — list commands in a category\n\`${PREFIX}help <command>\` — detailed help for one command`
        : `\n\n**Nasıl kullanılır**\n\`${PREFIX}yardım <kategori>\` — kategorideki komutları listeler\n\`${PREFIX}yardım <komut>\` — tek komut için detaylı yardım`)
    )
    .addFields({
      name: `📁 ${t(lang, "yardim.kategoriler")}`,
      value: kategoriSatirlari.slice(0, 1024)
    })
    .addFields({
      name: `💎 ${t(lang, "yardim.premiumBaslik")}`,
      value: t(lang, "yardim.premiumPerks")
    })
    .setFooter({ text: "RiseBunny", iconURL: message.author.displayAvatarURL() })
    .setTimestamp();

  const menu = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("yardim_kategori")
      .setPlaceholder(EN ? "Select category..." : "Kategori seç...")
      .addOptions(menuKategoriler.slice(0, 25).map(k => ({
        label: katAdi(lang, k.id).slice(0, 90),
        description: t(lang, `kategoriler.${k.id}`).slice(0, 90),
        value: k.id,
        emoji: k.emoji
      })))
  );
  const butonlar = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel("WebSite").setStyle(ButtonStyle.Link).setURL("https://risebunny.vercel.app").setEmoji("🌐"),
    new ButtonBuilder().setLabel(t(lang, "yardim.davetEt")).setStyle(ButtonStyle.Link).setURL(davet).setEmoji("📨"),
    new ButtonBuilder().setLabel(t(lang, "yardim.destekSunucu")).setStyle(ButtonStyle.Link).setURL(DESTEK).setEmoji("💬")
  );
  await message.channel.send({ embeds: [embed], components: [menu, butonlar] });
};

exports.kategoriListesi = kategoriListesi;
exports.komutDetay = komutDetay;
exports.conf = { enabled: true, guildOnly: false, aliases: ["y", "help", "h", "yardim"], permLevel: 0, kategori: "bot" };
exports.help = { name: "yardım", description: "Yardım menüsünü gösterir.", usage: "yardım [kategori]" };
