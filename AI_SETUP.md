# RiseBunny AI Sistemi - Kurulum ve KullanÄ±m Rehberi

## ğŸ“‹ Genel BakÄ±ÅŸ

RiseBunny AI sistemi, Discord sunucularÄ±nda doÄŸal dil iÅŸleme yeteneÄŸi saÄŸlayan bir yapay zeka sohbet sistemidir. Sistem iki katmanlÄ± Ã§alÄ±ÅŸÄ±r:

1. **Local DB (croxydb)** - HÄ±zlÄ±, Ã¼cretsiz, Ã§evrimdÄ±ÅŸÄ± cevaplar (BM25 + TÃ¼rkÃ§e kÃ¶k + trigram)
2. **River AI (DeepSeek-V4.1-Flash-1017)** - Birincil Ã§evrimiÃ§i model
3. **Yedek zincir** - Groq â†’ NVIDIA â†’ Gemini â†’ Cerebras â†’ OpenRouter (yalnÄ±zca River hata verirse)

> **SÄ±ra garantisi:** Her istekte Ã¶nce **River** denenir. River 401/403/404 hata verirse
> (anahtar yok / model adÄ± yanlÄ±ÅŸ / eriÅŸim yok) sÄ±rayla diÄŸer saÄŸlayÄ±cÄ±lar devreye girer.
> Kod hiÃ§bir yerde API anahtarÄ± iÃ§ermez â€” anahtar **yalnÄ±zca** `.env`'dedir.

## ğŸš€ Kurulum

### 1. Gereksinimler

```bash
# Gerekli paketler (package.json'da zaten mevcut)
npm install node-fetch croxydb discord.js
```

### 2. Environment Variables

`.env` dosyasÄ±na ÅŸu deÄŸiÅŸkenleri ekleyin:

```env
# Discord Bot Token
DISCORD_BOT_TOKEN=your_bot_token_here

# River AI (BÄ°RÄ°NCÄ°L) â€” https://api.river.ai -> API keys
# KullanÄ±lan modeller: DeepSeek-V4.1-Flash-1017 (birincil) â†’ DeepSeek-V4.1-Flash (yedek)
RIVER_API_KEY=

# Groq API Key (https://console.groq.com/keys adresinden alÄ±nabilir)
GROQ_API_KEY=gsk_xxxxxxxxxxxxxxxxxxxxxxxx

# Sahip ID (Owner log butonlarÄ± iÃ§in)
OWNER_ID=985126554306773063

# Owner Log Kanal ID
OWNER_LOG=1192951046012670204
```

### 2b. River model tanÄ±lama

```bash
node -e "require('./ai/providers').tanila().then(console.log)"
```

Her saÄŸlayÄ±cÄ±nÄ±n anahtarÄ±nÄ±n olup olmadÄ±ÄŸÄ±nÄ± ve River modellerinin eriÅŸilebilirliÄŸini yazar.


### 3. AI Verilerini YÃ¼kleme

Ä°lk kurulumda ve `cevaplar.json` gÃ¼ncellendiÄŸinde:

```bash
node migrate-ai-data.js
```

Bu komut `cevaplar.json` dosyasÄ±ndaki tÃ¼m soru-cevap Ã§iftlerini croxydb'ye `ai_qa_*` anahtarlarÄ±yla kaydeder.

## ğŸ¤– KullanÄ±m

### Temel Komutlar

| Komut | AÃ§Ä±klama |
|-------|----------|
| `rise <soru>` | AI'ya soru sor |
| `rise` | KarÅŸÄ±lama mesajÄ± |

### Ã–rnekler

```
KullanÄ±cÄ±: rise nasÄ±lsÄ±n
Bot: Sistemlerim tÄ±kÄ±r tÄ±kÄ±r Ã§alÄ±ÅŸÄ±yor! âš¡ Sen nasÄ±lsÄ±n Ahmet? BugÃ¼n nasÄ±l yardÄ±mcÄ± olabilirim?

KullanÄ±cÄ±: rise adÄ±n ne
Bot: Ben **RiseBunny**! ğŸ° Bu sunucuyu yÃ¶netmeye, eÄŸlendirmeye ve size yardÄ±mcÄ± olmaya gelmiÅŸ bir Discord botuyum.

KullanÄ±cÄ±: rise quantum computing nedir
Bot: [Groq AI cevabÄ±] + "ğŸ§  RiseBunny'ye Ã¶ÄŸret" butonu
```

## ğŸ§  AI Sistemi NasÄ±l Ã‡alÄ±ÅŸÄ±r?

### AkÄ±ÅŸ ÅemasÄ±

```
KullanÄ±cÄ±: "rise <soru>"
         â†“
0. Dil + onay kapÄ±sÄ± (sahip muaf)
   â€¢ dil seÃ§ilmemiÅŸ â†’ mesaj dili algÄ±lanÄ±r (TR/EN), deÄŸilse EN
   â€¢ onay verilmemiÅŸ â†’ Ã§alÄ±ÅŸmaz, onay istenir
   â€¢ desteklenmeyen alfabe (ru/ar/zh/â€¦) â†’ "dilini anlamÄ±yorum" (uydurma cevap yok)
         â†“
1. AI komut motoru (beta-tester kapÄ±sÄ±)
   â€¢ komutun GERÃ‡EK izni koddan okunur (BanMembers, KickMembersâ€¦)
   â€¢ yetersiz izin â†’ kullanÄ±cÄ±nÄ±n dilinde "ÅŸu izin gerekli" cevabÄ±
         â†“
2. Local DB (croxydb) ara â†’ matcher.bul()
   â†“ âœ… Bulundu (skor â‰¥ 0.42, belirsizlik kapÄ±sÄ± geÃ§ildi)
3. Cevap ver (cevap_en varsa ve dil EN ise Ä°ngilizcesi)
   â†“ âŒ BulunamadÄ±
4. SaÄŸlayÄ±cÄ± zinciri â†’ **River Ã¶nce**, yoksa Groq â†’ NVIDIA â†’ Gemini â†’ Cerebras â†’ OpenRouter
   â†“ âœ… Cevap geldi
5. Cevap ver + "ğŸ§  RiseBunny'ye Ã¶ÄŸret" butonu
   â†“ âŒ TÃ¼m saÄŸlayÄ±cÄ±lar hata
6. Hata mesajÄ± + Owner log (âœ… AnlaÅŸÄ±ldÄ± / ğŸ§  Ã–ÄŸret butonlarÄ±)
```

### Dil KurallarÄ±

| Durum | DavranÄ±ÅŸ |
|-------|----------|
| KullanÄ±cÄ± `r!dil tr` / `r!dil en` ile dil seÃ§ti | Her zaman o dilde cevap |
| Dil seÃ§medi, mesaj TR ise | TR cevap (varsayÄ±lan EN'dir, algÄ±lama devreye girer) |
| Dil seÃ§medi, mesaj EN ise | EN cevap |
| KÄ±sa/emoji/sayÄ± (dil belirsiz) | VarsayÄ±lan **EN** |
| RusÃ§a/ArapÃ§a/Ã‡inceâ€¦ | "Dilini anlamÄ±yorum" + TR/EN Ã¶nerisi â€” **asla uydurma cevap yok** |
| Onay verilmedi | Bot kullanÄ±lamaz, onay istenir |

### Veri KaynaklarÄ±

| Kaynak | Ã–ncelik | AÃ§Ä±klama |
|--------|---------|----------|
| `cevaplar.json` | 1 | 22 kategori, 197+ soru-cevap Ã§ifti (TR/EN) |
| `ai_qa_*` (croxydb) | 2 | KullanÄ±cÄ±/sahip tarafÄ±ndan Ã¶ÄŸretilenler |
| Groq AI | 3 | Bilinmeyen sorular iÃ§in |

### Dil DesteÄŸi

- **TR/EN** otomatik algÄ±lama (kullanÄ±cÄ± diline gÃ¶re)
- `cevaplar.json`: `cevap` (TR) + `cevap_en` (EN) alanlarÄ±
- Groq system prompt: KullanÄ±cÄ± diline gÃ¶re TR/EN
- TÃ¼m kullanÄ±cÄ± arayÃ¼zÃ¼: TR/EN desteÄŸi

## ğŸ¯ "RiseBunny'ye Ã¶ÄŸret" Sistemi

### KullanÄ±cÄ± TarafÄ±ndan Ã–ÄŸretme

1. KullanÄ±cÄ± `rise <bilinmeyen soru>` sorar
2. Groq cevap verir + **"ğŸ§  RiseBunny'ye Ã¶ÄŸret"** butonu
3. KullanÄ±cÄ± butona basar â†’ `learnCache`'ten alÄ±nÄ±r
3. Local DB'ye kaydedilir (`kaynak: "groq_learned"`)
4. Matcher cache temizlenir
5. Owner log'a gÃ¶nderilir (**ğŸ’¾ Kaydet** / **ğŸ—‘ï¸ Sil** butonlarÄ±)

### Sahip TarafÄ±ndan YÃ¶netim

| Buton | Ä°ÅŸlem | Yetki |
|-------|-------|-------|
| ğŸ’¾ **Kaydet** | OnaylÄ± olarak DB'ye kalÄ±cÄ± kaydet | Sadece Sahip |
| ğŸ—‘ï¸ **Sil** | Ä°lgili kayÄ±tlarÄ± DB'den sil | Sadece Sahip |
| ğŸ§  **Ã–ÄŸret** | Modal ile yeni cevap yazÄ±p kaydet | Sadece Sahip |

### Owner Log FormatÄ±

| Log TÃ¼rÃ¼ | Renk | Butonlar | Bilgiler |
|----------|------|----------|----------|
| **Hata** | ğŸ”´ KÄ±rmÄ±zÄ± | âœ… AnlaÅŸÄ±ldÄ± | Soru, Hata, Sunucu, KullanÄ±cÄ±, Dil |
| **Ã–ÄŸrenme** | ğŸŸ¡ AltÄ±n | ğŸ’¾ Kaydet / ğŸ—‘ï¸ Sil | Soru, Cevap, Sunucu, KullanÄ±cÄ±, Eylem |
| **Cevap Yok** | ğŸŸ  Turuncu | ğŸ§  Ã–ÄŸret | Soru, Sunucu, KullanÄ±cÄ± |

**TÃ¼m loglarda:** `<@985126554306773063>` etiketi + Sunucu adÄ±+ID + KullanÄ±cÄ± tag+ID + Zaman damgasÄ±

## ğŸ”§ GeliÅŸtirici KomutlarÄ±

| Komut | AÃ§Ä±klama |
|-------|----------|
| `node migrate-ai-data.js` | `cevaplar.json` â†’ croxydb migration |
| `node -e "require('./ai/handler').cacheTemizle()"` | Matcher cache temizle |

## ğŸ“ Dosya YapÄ±sÄ±

```
dc bot/
â”œâ”€â”€ bot.js                    # Ana bot dosyasÄ± (AI entegre)
â”œâ”€â”€ AI_SETUP.md              # Bu dosya
â”œâ”€â”€ cevaplar.json            # 22 kategori, 197+ Q&A (TR/EN)
â”œâ”€â”€ migrate-ai-data.js       # Migration script
â”œâ”€â”€ .env                     # Environment variables
â”œâ”€â”€ ai/
â”‚   â”œâ”€â”€ handler.js           # Ana AI iÅŸleyici (dil + onay kapÄ±sÄ±, zincir)
â”‚   â”œâ”€â”€ river.js             # River AI client (DeepSeek-V4.1-Flash-1017 â†’ Flash)
â”‚   â”œâ”€â”€ providers.js         # SaÄŸlayÄ±cÄ± zinciri: River â†’ Groq â†’ NVIDIA â†’ Gemini â†’ Cerebras â†’ OpenRouter
â”‚   â”œâ”€â”€ lang.js              # Dil algÄ±lama (TR/EN + desteklenmeyen alfabeler)
â”‚   â”œâ”€â”€ matcher.js           # Yerel eÅŸleÅŸtirici (BM25 + TÃ¼rkÃ§e kÃ¶k + trigram + konu fÃ¼zyonu)
â”‚   â”œâ”€â”€ bilgi-ek.js          # Ek bilgi tabanÄ± (hoÅŸgeldin, Vape/Lunar, hile, komutlar)
â”‚   â”œâ”€â”€ executor.js          # AI ile komut Ã§alÄ±ÅŸtÄ±rma (gerÃ§ek izin denetimi)
â”‚   â”œâ”€â”€ groq.js              # Groq client + system prompt
â”‚   â””â”€â”€ index.js             # Export
â”œâ”€â”€ dil/
â”‚   â”œâ”€â”€ index.js             # Dil yÃ¶neticisi (getLang/setLang/hasConsent/t)
â”‚   â”œâ”€â”€ tr.js Â· en.js        # Ã‡eviri dosyalarÄ±
â”‚   â””â”€â”€ komutlar.js          # 182 komutun TR/EN ad + alias haritasÄ±
â”œâ”€â”€ events/
â”‚   â”œâ”€â”€ message.js           # Komut Ã§Ã¶zÃ¼mleme + dil/onay kapÄ±sÄ± + AI tetikleyici
â”‚   â”œâ”€â”€ guildMemberAdd.js    # Otorol + hoÅŸgeldin DM (kart bot.js'te)
â”‚   â””â”€â”€ guildMemberRemove.js # KayÄ±t temizliÄŸi (kart bot.js'te)
â””â”€â”€ utils.js                 # ownerLog (components desteÄŸi)
```

## ğŸ”‘ Ã–nemli DeÄŸiÅŸkenler

| DeÄŸiÅŸken | AÃ§Ä±klama |
|----------|----------|
| `RIVER_API_KEY` | River AI anahtarÄ± (birincil saÄŸlayÄ±cÄ±). **Sadece `.env`'de** |
| `GROQ_API_KEY` | Groq Console'dan alÄ±nan API key (1. yedek) |
| `OWNER_ID` / `SAHIP_ID` | Sahip Discord ID |
| `DESTEK_SUNUCU` | `https://discord.gg/mEfz5SfpbR` |
| River modelleri | `deepseek-ai/DeepSeek-V4.1-Flash-1017` â†’ `deepseek-ai/DeepSeek-V4.1-Flash` |
| `AI_ESIK` | Yerel eÅŸleÅŸtirme eÅŸiÄŸi (varsayÄ±lan `0.42`) |
| `AI_MARJ` | En iyi/ikinci cevap farkÄ± (varsayÄ±lan `0.02`) |

## ğŸ›¡ï¸ AI ile Komut Ã‡alÄ±ÅŸtÄ±rma (executor)

Beta-tester kapÄ±sÄ± **kapalÄ±yken** AI'ya komut kataloÄŸu hiÃ§ gÃ¶nderilmez; kullanÄ±cÄ±ya
kendi dilinde "closed beta" mesajÄ± dÃ¶ner â€” hiÃ§bir hata/uydurma metin yoktur.

Katalog aÃ§Ä±kken AI bir komut Ã§aÄŸÄ±rmak isterse:

1. Komut `SAHIP_KOMUTLARI` listesinde mi? (eval, bakÄ±m, veri, yedekâ€¦) â†’ **her zaman reddedilir**
2. `komutYetkisi()` komut dosyasÄ±nÄ±n **kaynak kodunu** okur (`PermissionFlagsBits.*`)
   ve `permLevel` alanÄ±nÄ± birleÅŸtirir. `permLevel` yanlÄ±ÅŸ yazÄ±lmÄ±ÅŸ olsa bile
   (Ã¶r. `ban.js` â†’ `permLevel: 0` ama iÃ§inde `BanMembers`) gerÃ§ek izin bulunur.
3. KullanÄ±cÄ±nÄ±n o izni yoksa â†’ kendi dilinde "**Ãœyeleri Yasakla** izni gerekli" cevabÄ±.
4. Ä°zin varsa komut **kendi dosyasÄ±ndaki** kontrollerle Ã§alÄ±ÅŸÄ±r (Ã§ift gÃ¼venlik).

## ğŸ“Š Veri Komutu (sahip)

| KullanÄ±m | Ä°ÅŸlev |
|----------|-------|
| `r!veri` | YardÄ±m menÃ¼sÃ¼ |
| `r!veri gÃ¶r <id>` | O ID'ye baÄŸlÄ± **tÃ¼m** kayÄ±tlar (sayfalÄ±, butonlu) |
| `r!veri say` | Toplam anahtar + nesne/dizi/metin/sayÄ± daÄŸÄ±lÄ±mÄ± |
| `r!veri kategori` | TÃ¼m veri gruplarÄ± (ekonomi, seviye, AI, otomasyon, ticketâ€¦) |
| `r!veri ara <metin>` | Anahtar **veya** deÄŸer iÃ§inde arama |
| `r!veri kullanici <id>` | Bakiye, banka, XP, seviye, premium, dil, onay Ã¶zet kartÄ± |
| `r!veri sunucu <id>` | Sunucu ayarlarÄ± Ã¶zet kartÄ± |
| `r!veri dosya [filtre]` | Tam dÃ¶kÃ¼mÃ¼ `.txt` dosyasÄ± olarak gÃ¶nderir |
| `r!veri sil <id>` | O ID'nin tÃ¼m verilerini siler |

Gizli deÄŸerler (token/ÅŸifre/webhook) **hiÃ§bir** Ã§Ä±ktÄ±da gÃ¶sterilmez.

## ğŸš¨ Sorun Giderme

| Sorun | Ã‡Ã¶zÃ¼m |
|-------|-------|
| "Ä°ÅŸlem sÄ±rasÄ±nda hata oluÅŸtu" (Ã–ÄŸren butonu) | `learnCache` sÃ¼resi dolmuÅŸ, tekrar deneyin |
| River 404 | Model adÄ± `deepseek-ai/DeepSeek-V4.1-Flash-1017` olmalÄ± (zincir otomatik yedeÄŸe geÃ§er) |
| River 401/403 | `RIVER_API_KEY` boÅŸ veya geÃ§ersiz â€” `.env`'e ekleyin |
| Ã‡ift dil cevabÄ± | System prompt'ta "TEK DÄ°L" vurgusu var |
| "rise" tepkisiz | `rise` (boÅŸluksuz) da Ã§alÄ±ÅŸÄ±r; onay + dil seÃ§imi gerekli |
| Owner log gelmiyor | `OWNER_LOG` kanal ID'si doÄŸru mu? |
| HoÅŸgeldin/Ã§Ä±kÄ±ÅŸ mesajÄ± gelmiyor | `r!hg-ayarla #kanal` ile kanal ayarlanmalÄ± (DB'de `gÃ§kanal_<id>` yoksa sessizdir) |

## ğŸ“ Yeni Soru-Cevap Ekleme

1. `cevaplar.json` dosyasÄ±nÄ± aÃ§Ä±n
2. Yeni kategori veya mevcut kategoriye ekleyin:

```json
{
  "kategori": "yeni_kategori",
  "sorular": [
    "soru 1",
    "soru 2 varyasyonu",
    "soru 3 farklÄ± yazÄ±m"
  ],
  "cevap": "TÃ¼rkÃ§e cevap {{user}} iÃ§in {{time}} zamanÄ±nda.",
  "cevap_en": "English answer for {{user}} at {{time}}."
}
```

3. Migration Ã§alÄ±ÅŸtÄ±rÄ±n: `node migrate-ai-data.js`
4. Cache temizleyin: `require('./ai/handler').cacheTemizle()`

## ğŸ“Š Limitler ve Kotalar

| Kaynak | Limit | Not |
|--------|-------|-----|
| Groq GPT-OSS 20B | 14.400 req/gÃ¼n | Ãœcretsiz tier |
| Groq dakikalÄ±k token | 6.000 |  |
| Karakter limiti | 4000 | KullanÄ±cÄ± sorusu iÃ§in |
| Cooldown (spam) | 3 saniye | KullanÄ±cÄ± baÅŸÄ±na |
| Cooldown (Groq) | 10 saniye | KullanÄ±cÄ± baÅŸÄ±na |
| Learn cache TTL | 10 dakika | Buton sÃ¼re dolduktan sonra Ã§alÄ±ÅŸmaz |

## ğŸ“ Destek

- **Destek Sunucusu**: https://discord.gg/mEfz5SfpbR
- **Web Sitesi**: https://risebunny.vercel.app
- **Sahip**: `<@985126554306773063>`

---

*Son gÃ¼ncelleme: 2026 - RiseBunny AI v3.0 (River + dil kapisi + izin denetimi)*
