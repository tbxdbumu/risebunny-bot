/**
 * Slash komut altyapısı — TEK KAYNAK.
 *
 * NEDEN BU DOSYA
 * --------------
 * Ölçülen sorun (2026-10-26): Botun kodunda slash komut altyapısı HİÇ
 * yoktu — ne `SlashCommandBuilder`, ne `client.application.commands.set`,
 * ne `interaction.isChatInputCommand()`; `events/interactionCreate.js`
 * yalnızca buton/select/modal işliyordu.
 *
 * Buna rağmen Discord'da 8 komut görünüyordu (`/daily`, `/help`,
 * `/language`, `/level`, `/ping`, `/profile`, `/stats`, `/balance`) çünkü
 * eski bir sürüm bunları kaydetmişti. Ama hiçbirinin arkasında işleyici
 * olmadığı için hepsi "Bu komut yüklenemedi" veriyordu.
 *
 * ÇÖZÜM
 * -----
 * 1) Komutlar `SlashCommandBuilder` ile tanımlanır ve bot açılışında
 *    `client.application.commands.set(...)` ile GERÇEK listeyle
 *    ÜZERİNE YAZILIR (eski/stale kayıtlar böylece temizlenir).
 * 2) Her slash komut, mevcut prefix komutunun `run()` fonksiyonuna delege
 *    edilir. Böylece iş mantığı TEK yerde kalır — davet, para, XP, soft-ban
 *    gibi yan etkiler prefix'le birebir aynı çalışır.
 * 3) Mevcut komutlar `message` beklediği için ince bir "sahte message"
 *    nesnesi kurulur ve `channel.send/reply` çağrıları etkileşime yönlenir.
 *
 * KOMUT EŞLEŞMELERİ (hepsi mevcut prefix komutlarına gider)
 * --------------------------------------------------------
 *   /daily     → komutlar/gunluk.js        (r!günlük)
 *   /help      → komutlar/yardım.js        (r!yardım)
 *   /language  → komutlar/dil.js           (r!dil)
 *   /level     → komutlar/seviye.js        (r!seviye)
 *   /ping      → komutlar/ping.js          (r!ping)
 *   /stats     → komutlar/istatistik.js    (r!istatistik)
 *   /balance   → komutlar/param.js         (r!param)
 *   /profile   → burada özel (kayıtlı profil — prefix karşılığı yoktu)
 *
 * VERİ KAYNAĞI (profil için)
 * --------------------------
 * `profil_<id>` anahtarı `ai/handler.js` içindeki profil-kaydetme akışı
 * tarafından yazılıyor. Yoksa uydurmuyoruz: "kayıtlı profil yok" diyoruz.
 */
const {
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  PermissionFlagsBits,
} = require("discord.js");
const db = require("croxydb");
const path = require("path");

/* ── Yardımcılar ──────────────────────────────────────────────────── */

/**
 * Prefix komutun `run(client, message, args)` imzasını slash etkileşimine
 * bağlayan ince uyarlayıcı.
 *
 * Komutlar `message.author`, `message.member`, `message.guild`,
 * `message.channel.send/reply` kullanıyor. Etkileşimde mesaj henüz yok
 * (yanıtlanmadı), o yüzden ilk çıktıyı `reply` ile, sonrakileri
 * `followUp` ile gönderiyoruz.
 */
function mesajTaklidi(interaction, args) {
  const sahte = {
    client: interaction.client,
    author: interaction.user,
    member: interaction.member,
    guild: interaction.guild,
    channel: interaction.channel,
    channelId: interaction.channelId,
    guildId: interaction.guildId,
    id: interaction.id,
    content: `/${interaction.commandName} ${args.join(" ")}`.trim(),
    args,
    createdAt: new Date(interaction.createdTimestamp),
    createdTimestamp: interaction.createdTimestamp,
    system: false,
    webhookId: null,
    pinnable: false,
    partial: false,
    type: 0,
    url: `https://discord.com/channels/${interaction.guildId}/${interaction.channelId}/${interaction.id}`,
    mentions: { members: new Map(), users: new Map(), roles: new Map(), channels: new Map(), everyone: false },
    attachments: new Map(),
    embeds: [],
    components: [],
    stickers: new Map(),
    flags: { bitfield: 0, has: () => false },
  };

  const gonder = async (payload) => {
    const govde = typeof payload === "string" ? { content: payload } : { ...payload };
    /* Geçici (`ephemeral`) yanıtlar etkileşim yoluyla gönderilmeli. */
    if (interaction.deferred || interaction.replied) return interaction.followUp(govde);
    return interaction.reply(govde);
  };

  sahte.channel = interaction.channel;
  sahte.reply = gonder;
  sahte.answer = gonder;
  /* Bazı komutlar `message.channel.send` çağırıyor — kanal nesnesini
     geçici olarak sarmalıyoruz ki çıktı etkileşime gitsin. */
  return sahte;
}

/**
 * `message.channel` erişimini yakalayıp `send`'i etkileşime yönlendiren
 * vekil. Komutlar `message.channel.send(...)` yazdığı için şart.
 */
function kanalVekili(interaction) {
  return new Proxy(
    {},
    {
      get(_t, prop) {
        if (prop === "id") return interaction.channelId;
        if (prop === "guild") return interaction.guild;
        if (prop === "isTextBased") return () => true;
        if (prop === "send" || prop === "sendTyping") {
          if (prop === "sendTyping") return () => Promise.resolve();
          return async (payload) => {
            const govde = typeof payload === "string" ? { content: payload } : { ...payload };
            if (interaction.deferred || interaction.replied) return interaction.followUp(govde);
            return interaction.reply(govde);
          };
        }
        const gercek = interaction.channel;
        if (gercek && typeof gercek[prop] === "function") return gercek[prop].bind(gercek);
        return gercek?.[prop];
      },
    }
  );
}

/** Prefix komut dosyasını yükler; yoksa null. */
function komutYukle(dosya) {
  try {
    return require(path.join(__dirname, "..", "komutlar", dosya));
  } catch (e) {
    console.error(`[Slash] ${dosya} yüklenemedi:`, e?.message || e);
    return null;
  }
}

/** Prefix komutunu slash etkileşimi üzerinden çalıştırır. */
async function prefixCagir(interaction, dosya, args = []) {
  const komut = komutYukle(dosya);
  if (!komut?.run) {
    const msg = interaction.locale?.startsWith("tr")
      ? "Bu komut şu an kullanılamıyor."
      : "This command is currently unavailable.";
    return interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
  }

  const sahte = mesajTaklidi(interaction, args);
  sahte.channel = kanalVekili(interaction);
  /* Prefix komutları `message.args` beklemiyor; `args` dizisi ile çağrılır. */
  try {
    await komut.run(interaction.client, sahte, args);
  } catch (e) {
    console.error(`[Slash] ${dosya} hatası:`, e?.message || e);
    const msg = interaction.locale?.startsWith("tr")
      ? "Komut çalıştırılırken hata oluştu."
      : "Something went wrong while running the command.";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
}

/** Botun verdiği dile göre TR/EN metin. */
function dil(interaction) {
  let lang = null;
  try {
    /* Önce kullanıcı dili, sonra sunucu dili. */
    const { getLangSync } = require("../dil");
    lang = getLangSync(interaction.user.id);
  } catch {}
  if (!lang) lang = String(interaction.locale || "").startsWith("tr") ? "tr" : "en";
  return lang === "en" ? "en" : "tr";
}
const ceviri = (interaction) => {
  const L = dil(interaction);
  return (tr, en) => (L === "en" ? en : tr);
};

/* ── Komut tanımları ──────────────────────────────────────────────── */

const TANIMLAR = [
  {
    ad: "daily",
    yerel: { tr: "günlük", en: "daily" },
    aciklama: { tr: "Günlük coin ödülünü al.", en: "Claim your daily coin reward." },
    dosya: "gunluk.js",
  },
  {
    ad: "help",
    yerel: { tr: "yardım", en: "help" },
    aciklama: { tr: "Tüm bot komutlarını göster.", en: "Show all bot commands." },
    dosya: "yardım.js",
  },
  {
    ad: "language",
    yerel: { tr: "dil", en: "language" },
    aciklama: { tr: "Bot dilini ayarla.", en: "Set your language." },
    dosya: "dil.js",
    secenek: {
      ad: "kod",
      aciklama: { tr: "Dil kodu (tr/en)", en: "Language code (tr/en)" },
      secimler: [
        { ad: "tr", tr: "Türkçe", en: "Turkish" },
        { ad: "en", tr: "İngilizce", en: "English" },
      ],
    },
  },
  {
    ad: "level",
    yerel: { tr: "seviye", en: "level" },
    aciklama: { tr: "XP ve seviyeni göster.", en: "Show your XP and level." },
    dosya: "seviye.js",
  },
  {
    ad: "ping",
    yerel: { tr: "ping", en: "ping" },
    aciklama: { tr: "Bot gecikmesini göster.", en: "Show bot latency." },
    dosya: "ping.js",
  },
  {
    ad: "stats",
    yerel: { tr: "istatistik", en: "stats" },
    aciklama: { tr: "Kullanım istatistiklerini göster.", en: "Show your usage statistics." },
    dosya: "istatistik.js",
  },
  {
    ad: "balance",
    yerel: { tr: "bakiye", en: "balance" },
    aciklama: { tr: "Coin bakiyeni göster.", en: "Show your coin balance." },
    dosya: "param.js",
  },
  {
    ad: "profile",
    yerel: { tr: "profil", en: "profile" },
    aciklama: { tr: "Kayıtlı profilini göster.", en: "Show your saved profile." },
    ozel: "profil",
    kullaniciSecenegi: { ad: "kullanıcı", aciklama: { tr: "Profili gösterilecek kullanıcı", en: "User whose profile to show" } },
  },
];

/** Discord'a kaydedilecek komut listesini üretir. */
function build() {
  const out = [];
  for (const t of TANIMLAR) {
    const b = new SlashCommandBuilder()
      .setName(t.ad)
      .setDescription(t.aciklama.en)
      .setDescriptionLocalizations({
        tr: t.aciklama.tr,
        "en-US": t.aciklama.en,
      })
      .setNameLocalizations({ tr: t.yerel.tr });

    if (t.secenek) {
      b.addStringOption((o) =>
        o
          .setName(t.secenek.ad)
          .setDescription(t.secenek.aciklama.en)
          .setDescriptionLocalizations({ tr: t.secenek.aciklama.tr })
          .setRequired(false)
          .addChoices(...t.secenek.secimler.map((s) => ({ name: s.en, value: s.ad, name_localizations: { tr: s.tr } })))
      );
    }
    if (t.kullaniciSecenegi) {
      b.addUserOption((o) =>
        o
          .setName(t.kullaniciSecenegi.ad)
          .setDescription(t.kullaniciSecenegi.aciklama.en)
          .setDescriptionLocalizations({ tr: t.kullaniciSecenegi.aciklama.tr })
          .setRequired(false)
      );
    }
    out.push(b);
  }
  return out;
}

/* ── /profile özel işleyicisi ─────────────────────────────────────── */

async function profilIsle(interaction) {
  const L = ceviri(interaction);
  const hedef = interaction.options.getUser("kullanıcı") || interaction.user;
  const uid = hedef.id;

  /* ai/handler.js'in yazdığı profil kaydı. */
  let p = null;
  try { p = db.fetch(`profil_${uid}`); } catch {}

  const embed = new EmbedBuilder()
    .setAuthor({ name: hedef.username, iconURL: hedef.displayAvatarURL() })
    .setColor(p ? "Blue" : "Grey")
    .setThumbnail(hedef.displayAvatarURL({ size: 256 }))
    .setFooter({ text: "RiseBunny" })
    .setTimestamp();

  if (!p || typeof p !== "object") {
    embed.setDescription(
      L(
        "Bu kullanıcı için kayıtlı profil yok.\nAI sohbette profilinizi kaydettiğinizde burada görünür.",
        "No saved profile for this user.\nSave one through the AI chat and it will appear here."
      )
    );
    return interaction.reply({ embeds: [embed] });
  }

  const alanlar = [];
  const ekle = (ad, deger) => {
    if (deger === undefined || deger === null || deger === "") return;
    alanlar.push({ name: ad, value: String(deger).slice(0, 1024), inline: true });
  };

  ekle(L("İsim", "Name"), p.isim || p.ad || p.name);
  ekle(L("Yaş", "Age"), p.yas || p.yash || p.age);
  ekle(L("Cinsiyet", "Gender"), p.cinsiyet || p.gender);
  ekle(L("Minecraft", "Minecraft"), p.minecraft || p.mc);
  ekle(L("Sunucu", "Server"), p.sunucu || p.server);
  ekle(L("Sürüm", "Version"), p.surum || p.version);
  ekle(L("İşletim Sistemi", "OS"), p.os || p.isletim || p.platform);
  ekle(L("Hile", "Cheat"), p.hile || p.cheat);
  if (p.not || p.notlar || p.notes) {
    alanlar.push({ name: L("Notlar", "Notes"), value: String(p.not || p.notlar || p.notes).slice(0, 1024), inline: false });
  }

  if (alanlar.length) embed.addFields(alanlar.slice(0, 25));
  else embed.setDescription(L("Profil kaydedilmiş ama boş görünüyor.", "A profile exists but appears empty."));

  return interaction.reply({ embeds: [embed] });
}

/* ── Genel işleyici ───────────────────────────────────────────────── */

/**
 * Slash komut çağrısını işler.
 * @returns {Promise<boolean>} işlendiyse true
 */
async function isle(interaction) {
  const t = TANIMLAR.find((x) => x.ad === interaction.commandName);
  if (!t) return false;

  /* Onay kapısı: butonlarla aynı kural — dil seçimi ve onay butonları
     hariç, onay verilmemişse komut çalışmaz. */
  try {
    const { hasConsent, t: tr } = require("../dil");
    if (!hasConsent(interaction.user.id)) {
      const L = dil(interaction);
      await interaction.reply({ content: tr(L, "onay.gerekli"), ephemeral: true });
      return true;
    }
  } catch {}

  if (t.ozel === "profil") {
    await profilIsle(interaction);
    return true;
  }

  /* Seçenekli komutlarda seçenek değerini argümana çevir. */
  const args = [];
  if (t.secenek) {
    const deger = interaction.options.getString(t.secenek.ad);
    if (deger) args.push(deger);
  }

  await prefixCagir(interaction, t.dosya, args);
  return true;
}

/**
 * Komutları Discord'a kaydeder. Bot her açılışta çağırır; `.set()` eski
 * kayıtların ÜZERİNE yazdığı için stale komutlar kendiliğinden temizlenir.
 */
async function kaydet(client) {
  if (!client?.application) return false;
  try {
    const govde = build();
    const sonuc = await client.application.commands.set(govde);
    console.log(`[Slash] ${sonuc.size} komut kaydedildi: ${[...sonuc.values()].map((c) => "/" + c.name).join(", ")}`);
    return true;
  } catch (e) {
    console.error("[Slash] Kayıt başarısız:", e?.message || e);
    return false;
  }
}

module.exports = { TANIMLAR, build, isle, kaydet, prefixCagir };
