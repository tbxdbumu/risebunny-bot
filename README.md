# RiseBunny Discord Bot

Çok dilli (Türkçe / İngilizce), Firestore tabanlı, 182 önek komutlu Discord botu.
Prefix: `r!` — sunucuya göre değişebilir (`r!ayarlar` ile görülür).

> **English:** A bilingual (TR/EN) Discord bot built on discord.js v14 with Firestore as its
> database. 182 prefix commands covering moderation, leveling, economy, tickets, giveaways,
> protection, logging, AI chat and utility.

---

## Özellikler / Features

| Kategori | İçerik |
|---|---|
| Moderasyon | ban, kick, mute, unban, rol-ver, temizle, sunucu-logları, uyarı sistemi |
| Kayıt / Seviye | kayıt, seviye, xp, sıralama tablosu, seviye rolleri, XP kartı (canvas) |
| Ekonomi | para, banka, çalış, soy, günlük, market, mağaza-yönet, transfer |
| Çekiliş | çekiliş başlat / bitir / yeniden, gelişmiş süre çözümlemesi (TR + EN) |
| Ticket | ticket aç / kapat / transfer, owner panosu |
| Koruma | anti-spam, anti-link, küfür filtresi, susturma, webhook koruması |
| Yapay Zekâ | yerel AI (tokenizer + matcher, `cevaplar.json`) ve opsiyonel Groq bulut AI |
| Logo / Eğlence | logo üretimi, meme, profil kartları, anket, tepki komutları |
| Abone / Premium | abonelik, premium komutlar, top.gg ödülleri |

Tüm komutların listesi: `r!yardım` (veya `r!help`).

## Teknoloji

- **discord.js** `14.27.0` (Gateway intents: `Guilds`, `GuildMembers`, `GuildMessages`, `MessageContent`, `GuildVoiceStates`, `GuildMessageReactions`, `GuildModeration`, `DirectMessages`)
- **Node.js** `>=18` (geliştirme sırasında v22 kullanıldı)
- **Firestore** (Google Cloud) — `croxydb` API'sini birebir taklit eden `firestore-db.js` shim'i üzerinden
- **express** — site/launcher ile konuşan `/api/*` uçları
- **@napi-rs/canvas** — XP kartları ve sıralama görselleri

## Kurulum

```bash
# 1) bağımlılıklar
npm install

# 2) ortam değişkenleri
cp .env.example .env
# .env içine DISCORD_BOT_TOKEN, FIREBASE_SERVICE_ACCOUNT_PATH vb. yazın

# 3) veritabanını ilk kez Firestore'a taşı (yalnızca göç sırasında)
npm run migrate

# 4) botu başlat
npm start
```

`.env` dosyası ve `firebase-service-account.json` **asla** repoya eklenmez
(`.gitignore` içinde). Bu JSON anahtarına sahip olan herkes veritabanını admin
yetkisiyle silip yazabilir; bu yüzden dosyayı yalnızca kendi makinanızda ve
Render'ın ortam değişkenlerinde tutun.

`ayarlar.json` da (sahip ID, premium üye ID'leri, log kanal ID'leri) repoda değil.
29 komut ve `events/ready.js` onu `require` ettiği için bot açılışta eksik dosyayı
`ayarlar.example.json`'dan otomatik üretir; böylece GitHub'dan deploy sessizce
çökmez. Değerleri env ile de verebilirsiniz: `SAHIP_ID`, `OWNER_LOG_CHANNEL_ID`.

### Zorunlu ortam değişkenleri

| Değişken | Nereden alınır |
|---|---|
| `DISCORD_BOT_TOKEN` | discord.com/developers → Applications → Bot → Reset Token |
| `FIREBASE_SERVICE_ACCOUNT_PATH` | Firebase Console → Project Settings → Service accounts → Generate new private key |
| `FIREBASE_PROJECT_ID` | Firebase Console → Project Settings → General |
| `BOT_API_SECRET` | Kendiniz üretin: `openssl rand -hex 32` (site tarafıyla aynı olmalı) |
| `SAHIP_ID` | Discord'da kendine sağ tık → Copy User ID (ayarlar.json üretilirken yazılır) |
| `OWNER_LOG_CHANNEL_ID` | Hataların düşeceği log kanalının ID'si |
| `TOPGG_TOKEN` | top.gg → Manage → Webhooks & API (opsiyonel) |
| `GROQ_API_KEY` | console.groq.com/keys (opsiyonel, bulut AI için) |

### Yerel AI bilgisi

Botun beyin kısmı harici API istemeden de çalışır: eğitim verisi `cevaplar.json`
+ `isimler.json` içindedir, eşleştirme `ai/tokenizer.js` ve `ai/matcher.js`
tarafından yapılır. Groq anahtarı tanımlıysa yanıtlar bulut modele devredilir.

## Hata günlüğü

Komutlar tek bir `try/catch` şemsiyesi altında çalışır. Bir komut hata verdiğinde
log şu bilgileri içerir: **komut dosyasının adı**, hata tipi (`InvalidTypeArgument`,
`ColorConvert` vb.), mesaj, Discord API hata kodu ve **dosya + satır numaralı stack**.
Böylece hatayı gördüğünüz yerden düzeltebilirsiniz.

## Repo yapısı

```
bot.js                 giriş noktası (client, intentler, komut yükleyici)
komutlar/              182 önek komutu (dosya adı = komut adı)
events/                ready, message, interactionCreate, guildMemberAdd/Remove
dil/                   tr.js, en.js, komutlar.js (çok dilli destek + komut/alias çözümü)
ai/                    yerel tokenizer, matcher, executor, Groq sağlayıcısı
util/                  yardımcı fonksiyonlar, fuzzy match, çekiliş çözümleyici
Helpers/               sunucu bazlı yerel veriler (gitignore'lu)
firestore-db.js        croxydb uyumlu Firestore katmanı
ayarlar.example.json   ayarlar.json için şablon (canlı hali repoya alınmaz)
```

## Deploy (Render)

Render → New Web Service (veya Background Worker) → Node 18+, build: `npm install`,
run: `npm start`. Service account JSON'unu **dosya yoluyla değil**, tek satırlık
`FIREBASE_SERVICE_ACCOUNT` ortam değişkeni olarak verin; Render'da dosya yolu
container içinde bulunamaz.

## Lisans

MIT
