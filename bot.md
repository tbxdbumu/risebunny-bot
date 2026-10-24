# bot.md — RiseBunny Bot Çalışma Notları

> Bu dosya, yapılan işlerin kalıcı kaydıdır. Sohbet bitse de buradan kaldığın yerden devam edebilirsin.
> Son güncelleme: 2026 — RiseBunny AI v3.0

---

## 1. Proje

| Alan | Değer |
|------|-------|
| Klasör | `C:\Users\enesi\OneDrive\Resimler\Desktop\rb2-main` |
| Bot | RiseBunny (Discord, discord.js v14) |
| Prefix | `r!` |
| Dil | Türkçe (TR) + İngilizce (EN) |
| Komut sayısı | 182 (hepsi yükleniyor, doğrulandı) |
| Veritabanı | croxydb (Firestore destekli) |

---

## 2. Bu oturumda yapılanlar

### 2.1 Giriş / Çıkış (join / leave) düzeltmesi ✅

**Sorun:** Üye katılınca/ayrılınca hiçbir mesaj gelmiyordu.

**Kök neden (iki katmanlı):**

1. `util/eventLoader.js` yalnızca 3 event kaydediyordu — `guildMemberAdd` / `guildMemberRemove` hiç dinlenmiyordu.
2. `events/guildMemberAdd.js` ve `guildMemberRemove.js` boş iskeletlerdi.
3. Gerçek kart gönderen fonksiyon `bot.js` içindeki `hosgeldinKart()` idi ve `gçkanal_${guild.id}` anahtarına bakıyordu — DB'de bu anahtar **yoktu** (ve hâlâ yok).

**Yapılanlar:**

- `util/eventLoader.js` → `guildMemberAdd` + `guildMemberRemove` kaydedildi, hata loglama eklendi.
- `events/guildMemberAdd.js` → sadece otorol + hoşgeldin DM (karta dokunmaz, çift mesaj olmaz).
- `events/guildMemberRemove.js` → sadece bekleyen kayıt temizliği.
- `bot.js` → partials `GuildMember` + `User` eklendi (cache'te olmayan üyeler için).
- `hosgeldinKart()` baştan yazıldı:
  - `partial` üye desteği, `channel.cache → fetch` yedeği, `SendMessages` izin kontrolü
  - Avatar: `displayAvatarURL({ extension: "png", forceStatic: true })` (node-superfetch kaldırıldı)
  - **Arka plan görselleri Discord CDN'de 404 veriyordu** → yerel gradyan arka plan + yuvarlak avatar çerçevesi (giriş yeşil, çıkış kırmızı) + başlık yazısı
  - Canvas/avatar yüklenemezse düz metin fallback

**⚠️ Kalan tek adım (senin yapman gerek):**

```
r!hg-ayarla #hosgeldin-kanalı
```

Bu komut DB'ye `gçkanal_<sunucuID>` yazar. Yazılmadığı sürece sistem **bilerek sessizdir** (rastgele kanala mesaj atmaz).

**Doğrulama:** Simülasyonda kanal yoksa 0 mesaj, varsa tam 1 mesaj ("sunucuya katıldı" / "sunucudan ayrıldı").

---

### 2.2 River AI entegrasyonu ✅

- Yeni dosya: `ai/river.js`
  - Endpoint: `https://api.river.ai/v1/chat/completions`
  - Header: `Authorization: Bearer <key>`
  - **Anahtar yalnızca `process.env.RIVER_API_KEY`** — kodda hiçbir yerde yok
  - Modeller: `deepseek-ai/DeepSeek-V4.1-Flash-1017` (birincil) → `deepseek-ai/DeepSeek-V4.1-Flash` (yedek)
- `ai/providers.js` yeniden yazıldı: **River her zaman ilk**, 401/403/404'te tekrar denenmez, sonra sırayla yedekler.
- `node -e "require('./ai/providers').tanila()"` ile canlı tanılama yapılabilir.

**Sıra:** River → Groq → NVIDIA → Gemini → Cerebras → OpenRouter

**⚠️ Senin yapman gerek:** `.env` dosyasında şu satır boş duruyor:

```env
RIVER_API_KEY=
```

Değerini `api.river.ai` panelinden alıp buraya yaz. `.env.example` ve `AI_SETUP.md` da güncellendi.

---

### 2.3 Yerel (offline) AI iyileştirmesi ✅

`ai/matcher.js` tamamen yeniden yazıldı:

| Özellik | Açıklama |
|---------|----------|
| Türkçe kök bulma | Ek soyma (`-mek/-mak/-lar/-dan/-sı/...`), tam + kök biçim birlikte indekslenir |
| BM25 / IDF | Nadir kelimeler daha çok ağırlık taşır |
| Trigram Dice | Yazım hatalarına dayanıklılık |
| Eşanlamlı genişletme | vape/hile/rubidium → aynı havuz |
| **Konu füzyonu** | `KONU` haritası: vape·rubidium·hile·launcher·config → "hile"; premium → "mağaza"; bot·genel·yardım → "sohbet"; moderasyon·koruma·kayıt·ticket → "yönetim" |
| Belirsizlik kapısı | Aynı cevap değilse ve cevap kelime örtüşmesi (Jaccard) < 0.30 ise cevap verilmez |
| Görünür metrikler | `benzerlik`, `guven`, `eslesmeSayisi` döner |

Yeni dosya `ai/bilgi-ek.js` — dev `cevaplar.json`'a elle dokunmadan ek kayıt (hoşgeldin, Vape, Lunar, hile, komutlar, adın ne).

`cevaplar.json` → 158 kayıt, yeni `hile` kategorisi eklendi.

**Eşikler:** `AI_ESIK` (varsayılan `0.42`), `AI_MARJ` (`0.02`).

**Sonuç:** 22 testte 21 geçti (kalan 1 testin beklentisi yanlıştı — bot doğru cevap verdi).

---

### 2.4 Hile / 3. parti yazılım soruları ✅

Kullanıcı "en iyi hile nedir" gibi sorularda artık şu sabit cevap sınıfına yönlendiriliyor:

- **En iyi hile: Rubidium** (V4)
- Kurulum yolu: **RiseBunny Launcher**
- **Vape V4 / V4.22** ve **Lunar Client cosmetics modu** launcher üzerinden **ücretsiz**
- Site: `https://risebunny.vercel.app/risebunny`
- Discord: `https://dsc.gg/risebunny` · Destek: `https://discord.gg/mEfz5SfpbR`

Uygulandığı yerler:
- `ai/groq.js` → `buildSystemPrompt` TR + EN "özel kurallar" bloğu (model "öneremem" diyemez)
- `cevaplar.json` → `hile` kategorisi
- `ai/bilgi-ek.js` → yerel cevaplar

**Doğrulama:** 39 hile/ilgili sorgu tarandı, 38 doğru cevap; sadece anlamsız metin boş döndü.

---

### 2.5 Dil sistemi ✅ (yeni)

**İstek:** "Kullanıcının dilinde cevap versin, dili anlamazsa anlamadığını söylesin, yalan olmasın. Dil seçmemişse varsayılan İngilizce. Dil seçmeden ve onay vermeden botu kullanamaz."

Yeni dosya: `ai/lang.js`

| Fonksiyon | Görev |
|-----------|-------|
| `dilAlgila(metin)` | TR/EN tespiti (ı/ş/ğ/ç/ö/ü, ekler, sık kelimeler), Latin dışı alfabe tespiti |
| `cevapDili(seciliDil, metin)` | Seçim → algılanan dil → varsayılan **EN** |
| `anlamiyorumMesaji(alg)` | TR+EN "dilini anlamıyorum" mesajı |

**Kurallar:**

| Durum | Davranış |
|-------|----------|
| `r!dil tr` / `r!dil en` seçmiş | Her zaman o dil |
| Seçmemiş, mesaj TR | TR cevap |
| Seçmemiş, mesaj EN | EN cevap |
| Kısa/emoji/sayı | Varsayılan EN |
| Rusça/Arapça/Çince/Japonca… | "Dilini anlamıyorum (Rusça/Russian) — TR veya EN yaz" — **uydurma cevap yok** |
| Onay yok | Bot çalışmaz, onay istenir |

`ai/handler.js` üç noktaya bağlandı:
1. Giriş kapısı (dil + onay + anlaşılmayan dil)
2. Sağlayıcı çağrısı öncesi dil tespiti
3. Yerel KB cevabında `cevap_en` seçimi

**Doğrulama:** 10/10 dil testi geçti.

---

### 2.6 AI komutlarında gerçek yetki denetimi ✅

**İstek:** "AI komutlarında her komutun orijinal kodunu ve gereken yetki seviyesini kontrol etsin."

`ai/executor.js` içine eklendi:

- `komutKaynakIzni(canonical)` → komut dosyasının **kaynak kodunu** okur, `PermissionFlagsBits.*` kullanımını çıkarır (önbellekli)
- `komutYetkisi(canonical, lang)` → kod izinleri **∪** `permLevel` izinleri → birleşik gerçek izin listesi + TR/EN adı
- `yetkiDenetle(message, canonical, lang)` → Yönetici her şeyi yapar, değilse her izin tek tek kontrol edilir

**Neden gerekliydi:** `komutlar/ban.js` → `permLevel: 0` yazılmış **ama** içinde `PermissionFlagsBits.BanMembers` kontrolü var. Eski kod bunu göremiyordu.

**Doğrulama çıktısı:**

| Komut | permLevel | Koddan bulunan gerçek izin |
|-------|-----------|----------------------------|
| `ban` | 0 | **Üyeleri Yasakla** ✅ düzeldi |
| `kick` | 2 | Üyeleri At / Mesajları Yönet |
| `hg-ayarla` | 0 | Sunucuyu Yönet |
| `eval` / `veri` | 5 | Yönetici (sahip) — AI asla çalıştıramaz |

`ai/executor.js` → `komut_calistir` yolunda `yetkiDenetle` çağrılıyor; yetki yoksa kullanıcının dilinde "**X izni gerekli**" cevabı + ret logu.

---

### 2.7 Beta tester hatası ✅

**Sorun:** Kullanıcıya çiğ bir "beta tester" hatası gidiyordu.

**Çözüm:** Kapı kapalıyken AI'ya komut kataloğu **hiç gönderilmiyor** (model kelime uyduramıyor). Kullanıcıya kendi dilinde düzgün mesaj:

> 🧪 **AI ile komut çalıştırma şu an kapalı beta aşamasında.**
> Sunucu sahibinden beta listesine eklenmeni isteyip tekrar dene. Bu arada komutları normal şekilde kullanabilir (`r!yardım`) ya da bana `rise <soru>` ile soru sorabilirsin 🐰

İngilizce karşılığı da var.

---

### 2.8 `r!veri` komutu baştan yazıldı ✅

**İstek:** "veri komutunu daha detaylı yap, her türden veri görülsün, sahip görsün."

| Kullanım | İşlev |
|----------|-------|
| `r!veri` | Yardım menüsü + toplam anahtar sayısı |
| `r!veri gör <id>` | O ID'ye bağlı **tüm** kayıtlar — 18'lik sayfalar, ◀ ▶ butonları |
| `r!veri say` | Toplam anahtar, nesne/dizi/metin/sayı dağılımı, en büyük 15 grup |
| `r!veri kategori` | Tüm veri grupları (ekonomi, seviye, AI, otomasyon, ticket, koruma…) sayfalı |
| `r!veri ara <metin>` | Anahtar **veya** değer içinde arama (ilk 25 sonuç) |
| `r!veri kullanici <id>` | Cüzdan, banka, XP, seviye, premium, dil, onay, kara liste özet kartı |
| `r!veri sunucu <id>` | Sunucu ayarları özet kartı |
| `r!veri dosya [filtre]` | Tam dökümü `.txt` dosyası olarak gönderir (20.000 satır sınırı) |
| `r!veri sil <id>` | O ID'nin tüm verilerini siler (+ ayarlar.json premium temizliği + owner log) |

**Tarama mantığı:** `xxx_<id>`, `xxx.<id>`, `<id>_xxx`, `hatirlaticilar`/`betaTesterler`/`modlar` dizi üyeliği, kayıt nesnesindeki `ekleyen`/`ogreten` alanı.

**Güvenlik:** token/şifre/secret/key/webhook içeren değerler **hiçbir** çıktıda (embed, arama, dosya dökümü) gösterilmez → `<gizli>` yazılır.

**Grublandırma:** 25+ grup adı (`AI öğretilen`, `Ekonomi – cüzdan`, `Seviye`, `Premium`, `Hoşgeldin kanalı`, `Ticket`, `Koruma`, `Yedek`…).

---

## 3. Değişen / eklenen dosyalar

### Yeni
- `ai/river.js` — River AI client
- `ai/lang.js` — dil algılama
- `ai/bilgi-ek.js` — ek bilgi tabanı

### Yeniden yazıldı
- `ai/providers.js` — River-first zincir
- `ai/matcher.js` — BM25 + Türkçe kök + konu füzyonu
- `komutlar/veri.js` — detaylı veri tarayıcı

### Güncellendi
- `bot.js` — `hosgeldinKart()` yeniden yazıldı, partials genişletildi
- `util/eventLoader.js` — guildMember event'leri
- `events/guildMemberAdd.js` / `guildMemberRemove.js` — çakışmasız iş bölümü
- `ai/handler.js` — dil + onay kapısı, `cevap_en` seçimi
- `ai/executor.js` — gerçek izin denetimi, beta mesajı
- `ai/groq.js` — hile/Rubidium system prompt kuralları
- `cevaplar.json` — 158 kayıt + `hile` kategorisi
- `.env` — `RIVER_API_KEY=` (boş satır)
- `.env.example` — `RIVER_API_KEY=` + sağlayıcı sırası
- `AI_SETUP.md` — v3.0 dokümantasyonu

---

## 4. Kaldığın yerden devam — yapılacaklar

### 🔴 Senin yapman gerekenler

1. **River anahtarını ekle** → `.env` içindeki `RIVER_API_KEY=` satırına değeri yaz.
2. **Hoşgeldin kanalını ayarla** → `r!hg-ayarla #kanal`
3. Botu yeniden başlat (`node bot.js` veya `npm start`).

### 🟡 Sıradaki geliştirmeler

4. **River'ı `ai/handler.js` aksiyon yoluna bağla** — şu an aksiyon/komut çevirisi hâlâ `groq.js` üzerinden; River'ı `jsonMode` ile birincil yapmak gerekiyor.
5. **`ai/executor.js` TOOLS listesini genişlet** — yeni araçlar:
   - `slowmode` (yavaş mod)
   - `kanal_kilit` / `kanal_ac` (lock/unlock)
   - `takma_ad` (nickname)
   - `duyuru` (announce)
   - `kanal_olustur` / `kanal_sil`
   - `rol_olustur` / `rol_sil`
   - `ses_tasi` (voice move)
   - `unban`
   
   Her yeni araç `yetkiDenetle` ile aynı süzgeçten geçirilmeli.
6. **`cevaplar.json` İngilizce tamlığı** — birçok kayıtta `cevap_en` yok; EN kullanıcılar TR cevap alıyor. Eksikleri tamamla.
7. **Ölçüm/telemetri** — hangi yerel cevabın kaç kez kullanıldığı (`ai_qa_*_kullanim` zaten artıyor) → `r!veri ara ai_qa_` ile görülebilir; popüler sorular için panel yapılabilir.

---

## 5. Doğrulama özeti

| Test | Sonuç |
|------|-------|
| Tüm `.js` dosyaları `node --check` (ai, komutlar, events, util, dil, bot.js) | **0 hata** |
| `dil` modülü yükleme | ✅ 182 komut |
| `ai/providers` + `ai/river` yükleme | ✅ |
| Dil algılama | **10/10** |
| Yerel matcher | **10/10** |
| Hile sorguları | 38/39 (1 anlamsız metin) |
| Matcher eski harness | 21/22 (1 hatalı beklenti) |
| Giriş/çıkış simülasyonu | Kanal yok → 0, var → tam 1 mesaj ✅ |
| İzin denetimi (`ban`) | permLevel 0 → **Üyeleri Yasakla** ✅ |

**Test dosyaları:** `C:\Users\enesi\AppData\Local\Temp\opencode\rbcheck\`
- `bitis-test.js` — dil + matcher + veri + izin denetimi
- `matcher-test.js` — 22 vakalık matcher harness
- `hile-test.js` — 39 hile sorgusu
- `hg-test3.js` — giriş/çıkış kartı simülasyonu
- `lang-test.js` — dil algılama

---

## 6. Önemli notlar (tuzaklar)

- **River model adları uydurulmaz.** Sadece bunlar var: `DeepSeek-V4.1-Flash-1017`, `DeepSeek-V4.1-Flash`, `GLM-5.3-Flash`, `NVIDIA-Nemotron-3.5-Super-VL-120B-A12B-NVFP4`.
- **River 404** = model adı yanlış. 401/403 = anahtar yok/geçersiz. İkisinde de zincir otomatik yedeğe geçer.
- `db.fetch()` olmayan anahtarda `undefined` döner (hata değil).
- **`gçkanal_*` anahtarı DB'de hâlâ yok** → giriş/çıkış sessiz. `r!hg-ayarla` şart.
- Eski hoşgeldin arka plan görselleri Discord CDN'de **404** — uzak görsele güvenme, yerel gradyan kullanılıyor.
- `node-superfetch` hâlâ `package.json`'da ama `hosgeldinKart` artık kullanmıyor.
- `matcher.js` varsayılan export **sınıftır** (`SoruEslestirici`); `bul` için `new SoruEslestirici().bul(...)` gerekir.
- `.env` içindeki `FIREBASE_API_KEY` gerçek bir değer içeriyor — repoya gitmiyorsa sorun yok, ama paylaşırken dikkat.

---

## 7. Güvenlik düzeltmeleri — API uçları (2026)

Denetim raporundaki **açık uçlar kapatıldı**.

### 7.1 `_ticketIzinli` artık fail-closed 🔴 → ✅

`bot.js` — fonksiyon başı

**Eski (açık):**

```js
if (!TICKET_SECRET) { ...uyarı...; return true; }   // ← 22 uç kimliksiz açılıyordu
```

**Yeni:**

```js
if (!TICKET_SECRET) { ...console.error...; res.status(503).json({...}); return false; }
```

`TICKET_SECRET` ve `SESSION_SECRET` boşsa 22 yazma ucu (`friends/*`, `party/*`, `presence/*`,
`public/upload|delete|edit|mine`) artık **503** döner. Sır tanımlıysa sadece geçerli launcher
bileti geçer.

### 7.2 `/api/kullanici/:id` + `/api/dogrula/:id` kimlik istiyor 🔴 → ✅

Yeni yardımcı **`_idIzinli(req, res, discordId)`**: site sırrı (`x-bot-secret`) **veya**
kullanıcının **kendi** launcher bileti. Kimliksiz istek → **401**.

Eskiden Discord ID'sini bilen herkes bakiye, banka, XP, seviye, premium, petler,
pelerinler ve tag okuyabiliyordu. Artık okunamıyor.

> `_botAuth`'tan farkı: sır yoksa **404 değil 401** döner (uç "kapanmış" gibi görünmez).

### 7.3 `/api/config/:id` bilet istiyor 🟠 → ✅

- `?durum=approved` → o kullanıcının **tüm** config içeriklerini listeliyordu → artık `_idIzinli`
  (config sahibinin bileti veya site sırrı) gerekli.
- Tek config indirme (`/api/config/<configId>`) → config sahibinin bileti veya site sırrı gerekli.

### 7.4 `/api/public/config/:id` indirme korundu + hız sınırı 🟠 → ✅

Yeni **`_indirmeIzinli`**: site sırrı **veya herhangi bir geçerli launcher bileti**.
Ayrıca IP başına **dakikada 30 indirme** sınırı (`429`).

Public profile'lar tasarım gereği paylaşılabilir, bu yüzden "bilet sahibi olmak" yeterli —
ama kimliksiz toplu kazıma ve indirme sayacı şişirme engellendi.

### 7.5 `/api/presence/same` sızıntı + DoS sertleştirmesi 🟠 → ✅

| Eski | Yeni |
|------|------|
| Başkalarının `discordId`'si dönüyordu | Sadece `username` döner (kimlik yok) |
| Her istekte **tüm** `db.all()` taranıyordu | `presence_*` anlık görüntüsü **15 sn** önbellekli |
| — | `_presenceOnbellekTazele()` yazma/silme uçlarında çağrılıyor |

### 7.6 `/api/risebrawl-status` hata sızıntısı 🟡 → ✅

`db.all()` hata **mesajı** dışarı veriliyordu (dosya yolu / iç yapı sızabilir).
Artık sadece `live:false` döner. Ağır tarama **60 sn** önbellekli (`_rbStatusCache`).

### 7.7 Kasıtlı olarak açık bırakılan uçlar

| Uç | Neden açık |
|----|-----------|
| `/` | Bot ping (uptime kontrolü) |
| `/api/leaderboard/:kind` | Site ana sayfası sıralaması; sadece ad + puan |
| `/api/public/configs` | Public profil listesi (tasarım gereği) |
| `/api/stats` | Sunucu/üye/komut sayısı — kişisel veri yok |
| `/api/risebrawl-status` | Genel durum |
| `/api/site-status` | Bakım modu bayrağı |

### 7.8 Doğrulama

| Test | Sonuç |
|------|-------|
| `_ticketIzinli` (biletsiz / geçerli / başkasının / bozuk / süresi geçmiş / yanlış sır) | **6/6** |
| `_idIzinli` (kimliksiz / site sırrı / yanlış sır / kendi bileti / başkasının bileti) | **5/5** |
| Sır yokken fail-closed | **1/1** |
| Kaynak taraması (fail-open, ham `db.all()`, hata sızıntısı) | **TÜMÜ GEÇTİ** |
| `node --check bot.js` | ✅ |

Test dosyaları: `C:\Users\enesi\AppData\Local\Temp\opencode\rbcheck\`
- `auth-test.js` — 12 vakalık yetki testi
- `kaynak-kontrol.js` — kaynak kodu taraması

### 7.9 ⚠️ Sende yapılacaklar (bu düzeltmeler sonrası)

1. **`.env`'de `TICKET_SECRET` dolu olmalı** (Vercel'deki `TICKET_SECRET`/`SESSION_SECRET`
   ile **birebir aynı** değer). Boşsa `/api/friends/*`, `/api/party/*`, `/api/presence/*`,
   `/api/public/upload|delete|edit|mine` **503** döner — bu bilerek böyle.
2. **`BOT_API_SECRET` dolu olmalı** — boşsa `_botAuth`'lu tüm mağaza uçları **404** döner.
3. **Site tarafı güncellenmeli** — `/api/kullanici/:id` ve `/api/dogrula/:id` çağrıları artık
   `x-bot-secret` başlığı göndermek zorunda. Bu çağrılar sunucu tarafından yapılmalı;
   sır **asla** tarayıcıya konmamalı, site bir server route üzerinden proxy'lemeli.
4. **Launcher config indirme** — `/api/public/config/:id` ve `/api/config/:id` artık
   `Authorization: Bearer <bilet>` bekliyor.
5. Firestore `launcher_logins` kuralı (`allow read: if true`) — **bu repoda değil**,
   sitenin kendi deposunda düzeltilmeli.

---

## 9. Firestore kuralları + launcher sertleştirmesi (2026)

Proje: `C:\Users\enesi\Downloads\rb-fixed` (site + `firestore.rules`)

### 9.1 Raporun 2. bulgusu **doğrulandı** — ama ciddiyeti farklı çıktı

**Rapor diyordu:** `launcher_logins` → `allow read: if true` → tüm kodlar listelenebiliyor.

**Doğru:** evet, satır 299 öyleydi. Ama **iki ek açık** vardı ki raporda yoktu:

```firestore.rules (ESKİ)
allow read: if true;      // ← herkes her kodu okuyabilir
allow delete: if true;    // ← herkes BAŞKASININ girişini silebilir (DoS)
```

`allow delete: if true` **raporun hiç bahsetmediği** bir açık: saldırgan kurbanın
bekleyen kod dokümanını silebiliyordu → kurban launcher'a hiç giremiyordu.

**Ama raporun ima ettiği "kod ele geçirme" senaryosu ÇALIŞMIYOR.** Sebep:
`api/launcher.js` zaten `proof` alanını HMAC ile doğruluyor:

```js
// api/launcher.js:475-489 (DEĞİŞMEDİ)
const expected = HMAC(SESSION_SECRET, `device:${code}:${discordId}`);
if (!timingSafeEqual(expected, proof)) { sil; return { status: "rejected" }; }
```

Yani saldırgan kodu `done` yapsa bile `SESSION_SECRET` olmadan geçerli `proof`
üretemez → **accessToken alamaz**. Gerçek risk: kod listesinden hedef seçip o
kullanıcının cihaz akışını sabote etmek.

### 9.2 Yapılan düzeltmeler — `firestore.rules`

| # | Değişiklik | Eskiden | Şimdi |
|---|-----------|---------|-------|
| 1 | `launcher_logins` **read** | `if true` | `code` formatı + admin/bot/imzalı oturum |
| 2 | `launcher_logins` **delete** | `if true` | admin/bot/imzalı oturum |
| 3 | `launcher_logins` **createdAt** | opsiyonel → TTL'siz kalıyordu | `createdAt is timestamp` **zorunlu** |
| 4 | `launcher_logins` **id** | serbest string | `^[0-9]{15,20}$` doğrulanır |
| 5 | `categories` **stats** | `stats is map` yeterli | `keys().hasOnly([threads,posts,views,lastPostAt])` + int/aralık |
| 6 | `sameOrPlusOne` | yalnızca yeni değer `is int` | **eski** değer de `is int` |
| 7 | `threads.viewedBy` | sınırsız dizi | ≤5000 eleman, istek başına +1 |
| 8 | `isAdmin` | düz Discord ID `1310…` ölü girdi | kaldırıldı (e-posta eşleşmesi kalır) |

**Neden `read: if true` yerine "imzalı oturum":** iki site dosyası
(`api/launcher.js:412` ve `api/auth/discord/callback.js:77`) Firestore REST'i
**API key ile, kimliksiz** çağırıyor (`?key=FB_KEY`, Authorization yok).
`read: if false` yapsaydım **giriş akışı tamamen kırılırdı**. Bu yüzden:
- `list` (koleksiyon taraması) → artık **imkânsız** (kod toplama kapandı)
- tekil `get` → yalnızca admin/bot/imzalı Firebase kullanıcısı
- kod üretimi/sorgusu `api/launcher.js` içinde **IP başına sınırlandı**

### 9.3 Yapılan düzeltmeler — `api/launcher.js`

Yeni `deviceLimitAsildi()` + `istemciIp()`:

| Uç | Sınır |
|----|-------|
| `POST /api/launcher/device` (kod üret) | IP başına **10 dk'da 10** kod |
| `GET /api/launcher/device?code=` (sorgula) | IP başına **10 dk'da 60** sorgu |

Aşılırsa `429` + `Retry-After: 600`. Amaç: Firestore doküman şişmesi ve
kod listeleme denemelerinin maliyetini sınırlamak.

### 9.4 Doğrulama

| Test | Sonuç |
|------|-------|
| `firestore.rules` yapısal denetimi (22 kontrol) | **22/22** |
| `api/launcher.js` hız sınırı (20 kontrol) | **20/20** |
| `node --check api/launcher.js` | ✅ |
| Süslü parantez dengesi (yorumlar dahil/hariç) | ✅ |

Test dosyaları:
- `rules-denetle.js` — kural yapısal denetleyici
- `device-limit-test.js` — /device sınır testi

### 9.5 ⚠️ Sende yapılacaklar

1. **Kuralları YAYINLA** — Firebase Console → Firestore → Rules → yapıştır → Publish.
   Yayınlanmazsa hiçbir şey değişmez.
2. **`SESSION_SECRET` dolu olmalı** (≥16 karakter). Yeni `proof` doğrulaması buna bağlı;
   boşsa `deviceProof()` boş string döner ve giriş reddedilir.
3. **`isAdmin` kontrolü** — `oblLBCNGXEYF8plKq8KUr3m6o4f1` dışındaki statik UID'yi
   kaldırdım. İkinci admin hesabı varsa **Firebase Auth UID'sini** eklemek gerekir
   (düz Discord ID'si asla UID olmaz — eskisi ölü kuraldı).
4. **`users` koleksiyonundaki koruma satırları** hâlâ eski UID listesini kullanıyor
   (`!(doc in ['oblLBC…', '1310…'])`). Ölü girdi zararsız ama temizlenmeli.
5. **Firestore `list` iznini test et** — deploy sonrası:
   `GET /v1/projects/<PROJECT>/databases/(default)/documents/launcher_logins?key=<FB_KEY>`
   → **403 PERMISSION_DENIED** dönmeli. 200 dönerse kural yayınlanmamıştır.


- **Site:** `https://risebunny.vercel.app/risebunny`
- **Kısa link:** `https://dsc.gg/risebunny`
- **Destek sunucusu:** `https://discord.gg/mEfz5SfpbR`

---

## 10. Otomasyon kapatma + seviye mesaj ayarı (2026)

### 10.1 Otomasyona `kapat` / `aç` eklendi — `komutlar/otomasyon.js`

**Eski durum:** `kapat` alt komutu vardı ama:
- aynı `sub` dizisinde `"kapat"` **iki kez** yazılıydı (`sub === "kapat" || sub === "off" || sub === "kapat"`)
- kapatılmış otomasyonu **tekrar açmanın yolu yoktu** — `r!otomasyon aç` kurulum akışını
  yeniden başlatıyor, eğitim verileri duruyordu ama ayarlar (ticket kategorisi, modlog)
  sıfırlanıyordu
- kapatma/açma **kimin ne zaman** yaptığı kaydedilmiyordu
- kullanıcıya "tekrar nasıl açarım" söylenmiyordu

**Yeni davranış:**

| Komut | Sonuç |
|-------|-------|
| `r!otomasyon kapat` | `aktif=false`, **veri durur** (eğitim, kategori, modlog korunur) |
| `r!otomasyon aç` | Kayıt varsa **yerinde devam** (ayarlar korunur, kurulum yeniden çalışmaz) |
| `r!otomasyon aç` | Kayıt yoksa **kurulum akışı** başlar (eski davranış) |
| `r!otomasyon durum` | Aktif/duraklatılmış durumu gösterir |

Ek alanlar: `kapatanId`, `kapatmaTarihi`, `acanId`, `acmaTarihi`.
Kapatma yanıtına `acKullanim` ipucu eklendi (TR+EN).

**Neden `aç` bilinçli olarak `db.fetch()` kontrolüne bağlandı:**
`aç` komutu iki farklı iş yapıyor — kayıt varsa "devam ettir", yoksa "kurulum".
Tek blok olsaydı ve kayıt yokken de eşleşseydi kurulum **hiç başlamazdı**
(kullanıcı "otomasyon aktif değil" alır ama nasıl kuracağını öğrenemezdi).
Bu yüzden koşul: `(sub === "aç" || ...) && db.fetch(\`otomasyon_\${gid}\`)`.

### 10.2 🆕 `r!seviye-ayar` — `komutlar/seviye-ayar.js`

**Sorun:** `bot.js:2136` ve `2139`'da seviye mesajı doğrudan `msg.channel.send` ile
**mesajın atıldığı kanala** gidiyordu. Ayar yoktu, kapatma yoktu. Yoğun sunucularda
XP kazanan herkesin seviye bildirimi aynı kanala düşüyordu.

**Yeni komut:**

```
r!seviye-ayar                    → mevcut ayarı göster (embed)
r!seviye-ayar aç                 → mesajları aç
r!seviye-ayar kapat / sessiz     → mesajları TAMAMEN kapat
r!seviye-ayar kanal #kanal       → tüm mesajları tek kanala topla
r!seviye-ayar kanal sıfırla      → kanalı temizle, kaynak kanala dön
```

Aliaslar: `seviyeayar`, `level-settings`, `levelsettings`, `seviyemesaj`

**Yetki:** `ManageGuild` (Sunucuyu Yönet) — `permLevel: 0` ama gerçek izin `run`
içinde `PermissionFlagsBits.ManageGuild` olarak denetleniyor. `ai/executor.js`
`komutYetkisi()` bunu kaynak koddan okudu:
```
seviye-ayar yetki: {"ad":"Sunucuyu Yönet","izinler":["ManageGuild"],"kodIzni":true,...}
```

**Veri:** `db` anahtarı `seviye_ayar_<guildId>` = `{ mesaj: "acik"|"kapali", kanal: "id"|null }`

### 10.3 Kritik tasarım kararı — `seviyeHedefi()`

`bot.js` döngüsel bağımlılık kurmadan ayara erişsin diye `utils.js` üzerinden:

```js
// utils.js exports
seviyeHedefi: (guild, kaynakKanal) => require("./komutlar/seviye-ayar").seviyeHedefi(guild, kaynakKanal),
seviyeAyari:  (guildId) => require("./komutlar/seviye-ayar").ayarAl(guildId),
```

`seviyeHedefi(guild, kaynakKanal)` üç sonuç döndürür:

| Durum | `gonder` | `kanal` | `sebep` |
|-------|----------|---------|---------|
| Ayar yok (varsayılan) | `true` | kaynak kanal | `varsayilan` |
| Mesaj kapatıldı | `false` | `null` | `kapali` |
| Kanal ayarlandı | `true` | ayarlı kanal | `ayarli` |
| Ayarlı kanal silinmiş | `false` | `null` | `kanal-yok` |
| Kaynak kanal metin değil | `false` | `null` | `kaynak-yok` |

**Bilinçli karar — ayarlı kanal silinmişse kaynağa DÜŞMEZ.**
Sunucu sahibi "mesajlar sadece #seviye kanalına" dediyse, o kanal silindiğinde
mesajları her yere saçmak ayarı yok saymak olur. Sessizce durması daha doğru.

### 10.4 Seviye mesajı `bot.js` içindeki değişiklik

**Önce** (2 ayrı `msg.channel.send`, ayar yok):
```js
if (odul > 0) { db.add(`para_${uid}`, odul); await msg.channel.send({...}); }
else { await msg.channel.send({...}); }
```

**Sonra** (tek yol, kontrollü):
```js
if (odul > 0) db.add(`para_${uid}`, odul);   // ödül HER ZAMAN verilir
const seviyeHedef = U.seviyeHedefi ? U.seviyeHedefi(msg.guild, msg.channel) : { gonder: true, kanal: msg.channel };
if (seviyeHedef.gonder && seviyeHedef.kanal) {
  await seviyeHedef.kanal.send({ embeds: [...] }).catch(() => {});
}
```

**Önemli:** mesaj kapalı olsa bile **XP, para ödülü ve seviye rolü verilmesi
etkilenmez.** Sadece görsel bildirim gizlenir. Bu `r!seviye-ayar durum` embed'inin
altbilgisinde de yazıyor.

### 10.5 Doğrulama

| Test | Sonuç |
|------|-------|
| `seviye-ayar` mantık testi (`seviye-ayar-test.js`) | **24/24** |
| `otomasyon` kapat/aç akışı (`otomasyon-test.js`) | **18/18** |
| 183 komut dosyası yükleniyor | **182/183** (`_kart.js` yardımcı modül) |
| Tüm `.js` dosyaları `node --check` | **0 hata** |
| `komutYetkisi('seviye-ayar')` → `ManageGuild` | ✅ |
| `komutYetkisi('ban')` regresyon | ✅ `BanMembers` |

Test edilen sınır durumları: bozuk kayıt (`"bozuk-string"`), geçersiz `mesaj`
değeri, sayısal `kanal` ID'si, ses kanalı hedefi, `guild=null`, `kaynakKanal=null`,
sunucular arası izolasyon, yetkisiz kullanıcı, premium engeli.

### 10.6 ⚠️ Notlar

1. **Mevcut sunucular etkilenmez** — ayar kaydı olmayan sunucuda davranış
   **eskisi gibi** (mesajın atıldığı kanala gider). Kırılma yok.
2. **Kanal seçerken bot izni kontrol edilir** — o kanalda `SendMessages` yoksa
   komut ayarı **kaydetmez**, önce izni ister. Aksi halde ayar sessizce ölürdü.
3. `r!seviye-ayar kanal #x` yazınca, mesajlar kapalıysa **otomatik açılır**
   (kanal ayarlıyorsan mesaj görmek istiyorsun demektir).

---

## 11. Giriş rolü komutu — `r!girisrol` (2026)

Sunucuya yeni girene **otomatik rol** veren komut. Eski `r!otorol-ayarla`
yetmiyordu: tek rol, botlara da veriyordu, hiyerarşi kontrolü yoktu ve
verilemezse sessizce ölüyordu. Yeni komut bunların hepsini çözer.

### Alt komutlar

| Komut | Ne yapar |
|---|---|
| `r!girisrol ekle @rol [@rol2 ...]` | Rol(ler)i **sırayla** verilecek listeye ekler |
| `r!girisrol sil @rol` | Tek rolü listeden çıkarır || `r!girisrol sil --hepsi` | Listeyi tamamen temizler (sistem kapanır) |
| `r!girisrol liste` | Özet + **hiyerarşi uyarısı** |
| `r!girisrol kapat` / `aç` | Sistemi durdurur / devam ettirir (roller **korunur**) |
| `r!girisrol kanal #kanal` | Hoş geldin bildirimi kanalı |
| `r!girisrol kanal-sil` | Bildirimi kapatır (rol verilmeye devam eder) |
| `r!girisrol bot aç\|kapat` | Botlara da rol verilsin mi (varsayılan **hayır**) |
| `r!girisrol misafir aç\|kapat` | Hesabı yeni olanları atla (varsayılan **hayır**) |
| `r!girisrol rol aç\|kapat` | Eski `otorol` (kayıtsız) rolünü otomatik kaldır (varsayılan **açık**) |

Yetki: **Sunucuyu Yönet** (`ManageGuild`).

### Tasarım kararları

1. **`ManageGuild`, `Administrator` değil.** Rol dağıtan bir komut için
   Yönetici şartı gereksiz genişti; sunucu yöneten herkes kullanabilir.
2. **Hiyerarşi önden kontrol edilir.** Botun rolünden **yukarıda** olan,
   `@everyone` olan ve `managed` (entegrasyon) roller listeye **hiç eklenmez**,
   kullanıcıya "şu roller verilemez" diye raporlanır. `r!girisrol liste`
   ayrıca mevcut listede sorun varsa uyarır — Discord'un sessiz
   `Missing Permissions` hatası kullanıcıyı kör bırakıyordu.
3. **`member.roles.add(rol.id, ...)` — nesne değil.** İlk yazımda `rol`
   nesnesi geçiliyordu; discord.js bunu resolvable sayıp çalıştırıyor ama
   önbellek karşılaştırmalarında belirsizleşiyor. Test bunu yakaladı, ID'ye
   çevrildi (bkz. §12).
4. **Çift rol koruması.** `guildMemberAdd` dinleyicisi birden fazla yerde
   (`hosgeldinKart`, `otoRL`, `kayıthg`). `girisrol` açıksa üyeye hemen
   `member.__girisrolIslendi = true` işareti konur ve eski `otoRL` bloğu
   erken çıkar. İşaret **erken çıkışlardan önce** konur, yoksa bot/ yeni hesap
   yolunda iki rol birden verilirdi.
5. **Kanal seçerken izin kontrolü.** O kanalda `SendMessages` yoksa ayar
   **kaydedilmez**, önce izin istenir.
6. **Sessiz başarısızlık yok.** Hiçbir rol verilemezse `ownerLog`'a
   "muhtemel sebep: botun rolü aşağıda" satırıyla düşer.
7. **Geriye dönük uyum.** Ayar yoksa davranış **eskisi gibi** (eski `otoRL`
   bloğu çalışır). `girisrol_idler_*` eski tek-string kaydı diziye çevrilir.
8. **Ham rol ID kabul edilir.** Etiket şart değil: `r!girisrol ekle 123456789012345678`
   çalışır. ID `/^\d{15,25}$/` ile doğrulanır (rol ID'leri 17-19 hane).
   Kanal ve rol etiketleri de (`<@&123>`, `<#123>`) temizlenip sadece rakam
   kullanılır.
9. **Var olmayan ID sessizce yutulmaz.** Eski kod `if (!rol) continue;` diyordu;
   kullanıcı yanlış ID yazdığında "eklendi" sanıyordu. Artık
   `**Bulunamadı:** \`123...\`` satırıyla raporlanır, geçerli olanlar yine
   eklenir.

### DB anahtarları (hepsi sunucu bazlı)

| Anahtar | Tip | Anlamı |
|---|---|---|
| `girisrol_idler_<gid>` | `string[]` | Verilecek roller (sırayla) |
| `girisrol_acik_<gid>` | `0\|1` | Açık mı (yok = liste varsa açık) |
| `girisrol_kanal_<gid>` | `string` | Bildirim kanalı |
| `girisrol_bot_<gid>` | `0\|1` | Botlara rol ver |
| `girisrol_misafir_<gid>` | `0\|1` | Yeni hesabı atla |
| `girisrol_rolsil_<gid>` | `0\|1` | Eski kayıtsız rolünü kaldır |

Yeni hesap eşiği `GIRISROL_MISAFIR_GUN` env ile değişebilir (varsayılan 7).

### Yeni / değişen dosyalar (§11)

- `komutlar/girisrol.js` — **yeni**, ~470 satır. `ayarAl()`, `ayarYaz()`,
  `rolVer()`, `yeniHesapMi()` dışa açık (bot.js ve testler kullanıyor).
- `bot.js` — yeni `guildMemberAdd` dinleyicisi (satır ~2565), eski `otoRL`
  dinleyicisine `__girisrolIslendi` koruması (satır ~2632).
- `dil/tr.js`, `dil/en.js` — `girisrol` yardım kaydı.

### Doğrulama

`girisrol-test.js` — **48/48 geçti**. Kapsanan: yetki reddi, tek/çoklu rol
ekleme, sıra koruma, botun üstündeki rol reddi, `managed` rol reddi,
`@everyone` reddi, ham ID ile ekleme, silme, `--hepsi`, kapat/aç (roller
korunuyor mu), rol yokken aç reddi, üç bayrak + değersiz çağrıda durum
gösterme, kanal kaydı, izinsiz kanal reddi, `kanal-sil`, `rolVer()` atama,
zaten olan rolü tekrar eklememe, eski kayıtsız rolünü kaldırma (açık ve
kapalı), yeni hesap tespiti, bilinmeyen alt komut, yardım ekranı,
hiyerarşi uyarısı, eski string kaydının diziye çevrilmesi.

Komut yükleme: **183 komut**, `girisrol` kayıtlı, sözdizimi hatası yok.
`bot.js` / `girisrol.js` / `utils.js` / `dil/tr.js` / `dil/en.js` → `node --check` temiz.

`girisrol-id-test.js` — **21/21 geçti**. Ham ID yolu, mention kullanmadan:
tek/çoklu ID ile ekleme, sıra, var olmayan ID raporu, geçerli+geçersiz
karışık, botun üstündeki rol, `managed` rol, ID ile silme, listede olmayan
ID ile silme, kanal ID, aynı ID'yi iki kez yazma.

> **Testin yakaladığı gerçek hatalar:**
> 1. `member.roles.add(rol, ...)` nesne geçiyordu. Sahte üye önbelleği bunu
>    `[object Object]` yazınca "zaten olan rol tekrar eklenmez" testi patladı.
>    `rol.id` ile düzeltildi.
> 2. Var olmayan ID `if (!rol) continue;` ile sessizce yutuluyordu.
>    `**Bulunamadı:**` raporu eklendi.
>
> **Testin kendi hatası:** Sahte rol ID'leri 3 haneli (`501`) üretiliyordu;
> komut `/^\d{15,25}$/` ile doğruladığı için hepsi reddedildi. Gerçek Discord
> ID uzunluğuna çekildi. Komut doğruydu, test yanlıştı — bu ayrımı yapmadan
> "kodu düzeltmek" regex'i bozardı.

---

## 13. AI cevap kalitesi + web araştırması (2026)

Kullanıcı geri bildirimi (Discord'da canlı görülen hata):

> "its have local ai and temp is so low i will fix soon .d böyle bir sorun var
> istenilen cevabı versin ve sorulan soruları duruma göre internetten
> araştırabilsin"

Yani iki istek: (1) sorulan soruya **gerçekten istenen** cevabı versin,
(2) dış dünya sorularını **internetten araştırsın**. Üstüne: "sonucu ve cümleyi
AI okuyup değerlendirsin son sonucu ve kullanıcıya dönen cevabı gene AI verecek."

### 13.1 Teşhis — sahada görülen 4 hata

| # | Belirti | Kök neden |
|---|---------|-----------|
| 1 | "What's best hack client" → **hiçbir cevap yok** (bot susuyor) | `cevaplar.json`'da bu yazım yoktu; matcher `ESLESMEDI` döndü |
| 2 | "why Rubidium" → "Rubidium V4 için: dsc.gg/risebunny 🐰" (soruya cevap değil) | "neden" kalıbı yoktu, en yakın *indirme linki* kaydına düştü |
| 3 | "another client instead of Rubidium" → yine link cevabı | alternatif client kaydı hiç yoktu |
| 4 | "en iyi hile client ne" → cevap İngilizce sorulunca **Türkçe** geldi | `cevap_en` alanı Türkçeydi (kopyala-yapıştır hatası) |

Ek olarak: `chainAsk` **parametresiz** çağrılıyordu → `temperature 0.7`
(bilgi botu için fazla yaratıcı) ve `max_tokens 400` (listeli cevap yarıda
kesiliyordu). Kullanıcının "temp is so low" gözlemi tersine dönmüş: sorun
düşük sıcaklık değil, **yanlış yerel kayda düşmek** ve **kısa token** idi.

### 13.2 Yapılanlar

**a) `cevaplar.json` — 45 yeni varyant + 1 yeni kayıt**

- `en iyi hile nedir` → +15 ("what's best hack client", "best hack client"…)
- `rubidium vs vape` → +11 ("why rubidium", "rubidium neden", "rubidium neden en iyi"…)
- `rubidium v4 nedir` → +7 ("rubidium alternatifi", "alternative to rubidium"…)
- **Yeni kayıt:** `başka hile client var mı` (12 varyant) — launcher'ın
  desteklediği üç client'ı listeler (Rubidium V4 / Vape V4-V4.22 / Lunar Cosmetics).
  Mevcut kayıtlara sıkıştırmak yanlış cevap riski taşıyordu.

`cevap_en` alanı Türkçe olan 6 kayıt düzgün İngilizceye çevrildi
(`#34 vape`, `#41 rubidium`, `en iyi hile nedir`, `hangi hileler ücretsiz`,
`vape v4 ücretsiz nasıl alırım`, `rubidium vs vape`). Artık `cevap == cevap_en`
olan kayıt **0**.

> Kalan 10 "TR-EN" uyarısı yanlış pozitif: İngilizce cevabın içinde
> `(Turkish: r!çek)` gibi komut takma adı veriliyor — doğru davranış.

**b) `ai/matcher.js`**

- Eşik `0.42 → 0.60`. Ölçüm (15 doğru + 15 yanlış soruyla):
  0.42–0.65 arası **15/15 doğru geçiyor, 0/15 yanlış sızıyor**; 0.70'te 2 doğru
  kaçmaya başlıyor. 0.60 pay bırakıyor.
- `bilgi-ek` kayıtlarında `cevap_en` artık `e.cevap`'a ezilmiyor
  (`e.cevap_en || e.cevap`).

**c) `ai/handler.js` — sağlayıcı ayarları**

```js
const aiAyar = {
  temperature: Number(process.env.AI_SICAKLIK || 0.85),
  maxTokens:   Number(process.env.AI_MAX_TOKEN || 900),
};
```

Token 400 → 900 (listeli cevaplar kesilmesin). İkisi de env ile değiştirilebilir.

**Sıcaklık 0.85 (2026-10, kullanıcı isteği).** Önce 0.35'e çekilmişti; canlıda
cevaplar fazla tekdüze/ezber geldi. 0.85 daha doğal cümle kuruyor ama
uydurmaya kaçacak kadar yüksek değil (1.0+ dağılıyor). Önemli nokta: bu ayar
**sadece modelin serbest yazdığı cevapları** etkiliyor — yerel kayıt
(`cevaplar.json`) eşleşince cevap hiç modele gitmiyor, ayrıca web
değerlendirmesi bilerek soğuk (`WEB_AI_SICAKLIK 0.2`) kalıyor ki kaynak
sadakati bozulmasın.

Varsayılanlar üç yerde birlikte güncellendi (tutarsızlık olmasın):
`handler.js` `aiAyar`, `providers.js` üç `ayar.temperature ?? 0.85`,
`river.js` `sohbet({ temperature = 0.85 })`.

**d) `ai/web.js` — YENİ DOSYA (web araştırma + AI değerlendirmesi)**

Akış:

```
soru ──► arastirmaliMi()  ──hayır──► normal akış (3b)
              │ evet
              ▼
         toplama: Wikipedia TR ─► (zayıfsa) Wikipedia EN ─► (boşsa) başlık REST
              │
              ▼
         degerlendir()  ← AI (River ilk, jsonMode)
              │  model: "bu kaynaklar soruyu karşılıyor mu?" + CEVABI YAZAR
              ├── yeterli:true  ──► cevap doğrudan kullanıcıya (3a)
              └── yeterli:false ──► kaynaklar ATILIR, normal akış (3b)
```

Karar noktaları:

- **Neden AI'a soruyoruz, kelime eşleşmesine güvenmiyoruz?**
  `"türkiyenin başkenti neresi"` → Wikipedia `"Sefer Turan"` (bir gazeteci)
  döndürdü. Başlıkta "türkiye" yok ama skor yüksek. Kelime/başlık benzerliği
  **alaka ölçmez**. Artık kaynakları model okuyup seçiyor; hiçbiri
  karşılamıyorsa `yeterli:false` dönüyor ve bot kaynaksız cevap veriyor —
  **uydurma kaynak göstermiyor**.
- **Son cevabı da AI yazıyor.** `degerlendir()` aynı çağrıda cevabı üretiyor,
  `handler.js` ikinci kez modele sormuyor (gecikme + tutarsızlık olurdu).
- **`yeterli:false` ise kaynaklar prompt'a GİRMEZ.** İlk sürümde hepsi
  giriyordu; "Sefer Turan" normal cevaba da sızabiliyordu. Düzeltildi.
- **Botun kendi konuları araştırılmaz** (`IC_KONULAR`): rubidium, vape,
  launcher, premium, hile, bot, komut… Orada doğru kaynak bilgi tabanı;
  web yanlış bilgi getirir.
- **JSON ayrıştırma dayanıklı:** ```` ```json ```` çiti, önsöz metni,
  sondaki fazla virgül — hepsi tolere ediliyor. Bozuk JSON →
  güvenli `yeterli:false`.
- **`kullanilan` numaraları süzülür** (1..N dışındakiler atılır).
- **`yeterli:true` ama `cevap` boş → `false`** (boş mesaj gönderilmesin).

**e) `aramaSorgulari()` — sorgu sadeleştirme**

`"türkiyenin başkenti"` 3 sonuç döndürüyor ama hepsi alakasız. Bu yüzden
sırayla daha kısa sorgular denenir ve **başlık uyumuna** bakılır
(sorgunun kelimeleri madde başlığında geçiyor mu?):

```
"türkiyenin başkenti" → "türkiyenin" → "türkiye"
```

Ayrıca Türkçe iyelik/hâl ekleri kırpılır.

**f) Dayanıklılık**

- `_get()`: 429 / 5xx'te bekleyip tekrar dener (Wikipedia eşzamanlı
  isteklerde 429 dönüyor — testte görüldü).
- Zaman bütçesi: tek istek 4 sn, toplam 8 sn (`WEB_TIMEOUT_MS`,
  `WEB_TOTAL_MS`). Bütçe dolunca elde olanla dönülür — araştırma "bonus",
  engel değil.
- 10 dk önbellek (anahtar: konu + ai + dil). Discord'da aynı soru sık geliyor.

**g) DuckDuckGo kaldırıldı — çalışmıyordu**

Ölçüm:

| Kaynak | Sonuç |
|--------|-------|
| `html.duckduckgo.com` | HTTP **202** + boş sayfa (bot koruması) |
| `lite.duckduckgo.com` | HTTP **202** + boş sayfa |
| `api.duckduckgo.com` | HTTP 200 ama `AbstractText` **boş** |
| SearXNG (genel örnek) | HTTP **403** |
| **Wikipedia TR (arama + özet)** | **HTTP 200, çalışıyor** ✅ |
| **Wikipedia EN** | **HTTP 200, çalışıyor** ✅ |
| Brave (`BRAVE_API_KEY` varsa) | çalışır (anahtar opsiyonel) |

DDG parse kodu çalışsa bile **veri gelmiyordu** — "web araması yapıyor" gibi
görünen ama hep boş dönen ölü kod. Silindi, yerine yorum bırakıldı.

### 13.3 Testler

| Test | Sonuç |
|------|-------|
| `web-test.js` (canlı Wikipedia, 24 vaka) | **24/24** |
| `web-stres.js` (ardışık 6 konu, rate-limit) | **6/6**, ~220 ms ortalama |
| `web-ai-mock-test.js` (sahte model, 24 vaka) | **24/24** |
| `handler-web-test.js` (sahte Discord + sahte model, 7 vaka) | **7/7** |
| `sicaklik-test.js` (sıcaklık gerçekten 0.85 gidiyor mu, 7 vaka) | **7/7** |
| `girisrol-test.js` / `girisrol-id-test.js` | 48/48, 21/21 |
| `seviye-ayar-test.js` / `otomasyon-test.js` | 24/24, 18/18 |

`node --check` temiz: `handler.js`, `web.js`, `matcher.js`, `providers.js`,
`river.js`, `bot.js`, `utils.js`, `girisrol.js`, `seviye-ayar.js`, `otomasyon.js`.

`handler-web-test.js` doğrular:
1. AI kaynağı yeterli buldu → cevap **doğrudan** gider, sağlayıcı **çağrılmaz**.
2. AI yetersiz buldu → sağlayıcıya gidilir ve **"Sefer Turan" prompt'a girmez**.
3. Araştırma gerekmiyorsa normal akış bozulmaz.

### 13.4 Ortam değişkenleri (hepsi opsiyonel)

| Değişken | Varsayılan | Ne yapar |
|----------|-----------|----------|
| `AI_SICAKLIK` | `0.85` | Normal cevap sıcaklığı |
| `AI_MAX_TOKEN` | `900` | Normal cevap uzunluğu |
| `AI_ESIK` | `0.60` | Yerel eşleştirici eşiği |
| `WEB_TIMEOUT_MS` | `4000` | Tek web isteği zaman aşımı |
| `WEB_TOTAL_MS` | `8000` | Toplam araştırma bütçesi |
| `WEB_AI_SICAKLIK` | `0.2` | Değerlendirme modeli sıcaklığı |
| `WEB_AI_MAX_TOKEN` | `700` | Değerlendirme cevap uzunluğu |
| `BRAVE_API_KEY` | — | Varsa Brave Search de kullanılır |

### 13.5 Bilinen sınır

`.env` içindeki `RIVER_API_KEY` **boş**. Bu yüzden AI değerlendirmesi canlı
olarak çalıştırılamadı; akış sahte model ile (24 + 7 vaka) doğrulandı, web
toplama tarafı ise **gerçek ağla** (24 + 6 vaka) doğrulandı. Anahtar
girildiğinde `degerlendir()` devreye girer; girilmezse `webSonuc.yeterli`
hep `false` kalır ve bot eskisi gibi yedek sağlayıcılarla/devre dışı kalır.

---

## 12. Destek linkleri

- **Site:** `https://risebunny.vercel.app/risebunny`
- **Kısa link:** `https://dsc.gg/risebunny`
- **Destek sunucusu:** `https://discord.gg/mEfz5SfpbR`
