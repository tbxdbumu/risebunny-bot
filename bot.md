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

## 14. Eşleştirici v3 — "tutarlı değil" hatasının kökü (2026-10)

Kullanıcı canlıda 4 soru gönderdi ve hepsi bozuk geldi:

| Soru | Gelen cevap | Doğrusu |
|------|-------------|---------|
| `rise wikipedia ne işe yarar` | "🏠 İnsanlara yardım edip onları eğlendirir..." | Wikipedia tanımı |
| `rise açık kaynak nedir` | (boş / AI) | açık kaynak tanımı |
| `rise saat kaçarmı hahha` | "Saat kaçmazki hasbxuanxqunausx" | saat |
| `rise hile nedir` | "🏆 En iyi hile: Rubidium V4" | hile tanımı |

Bunların hiçbiri rastgele değil — dördü de **aynı 3 kök hatadan** çıkıyor.
Tek tek yama yapmak yerine kökü düzelttim.

### 14.1 Kök hata #1 — Kapsam paydası çöp kelimelerle doluyordu

`kelimeKapsami()` "kullanıcının kaç kelimesi tuttu / kaç kelime yazdı" oranı
kullanıyor. Payda, `DURAK` (bilgi taşımayan kelime listesi) çıkarıldıktan
sonra kalan kelimeler. O listede `ise`, `yarar`, `rise`, `hakkinda` **yoktu**:

```
"wikipedia ne işe yarar"    → payda [wikipedia, ise, yarar] → kapsam 0.50
"rise premium ne işe yarar" → payda [rise, premium, ise, yarar] → 0.66
"saat kaçarmı hahha"        → "hahha" paydada → tek bilgi kelimesi 0.33
```

Yani kullanıcı ne kadar doğal yazarsa kapsam o kadar düşüyordu. Bot "resmi
cümle" bekliyordu.

**Düzeltme:** `ise`, `yarar`, `fayda`, `rise`, `risebunny`, `hakkinda`,
`bilgi`, `anlat`, `soyle`, `hocam`, `hahha`/`haha`/`xd`/`lol`… DURAK'a eklendi.

> `rise` neden? Çünkü `rise` tetikleyici kelime. `rise vape ne işe yarar`
> yazan kullanıcı "vape" hakkında soruyor; "rise" ayrı bir kavram değil.
> Bu yüzden "vape nedir" kaydı artık bulunuyor (öncesi 0.40, eşiğin altı).

### 14.2 Kök hata #2 — Tek kelime kalınca eşik bedava geçiliyordu

"Soru kelimeleri" (nedir, ne, kim) çıkarılınca geriye tek kelime kalırsa
kapsam **1.00** oluyor. `hile nedir` → `[hile]` → kapsam 1.00 → skor 0.76 →
`en iyi hile nedir` cevabı.

**Düzeltme:** tek kelime kaldığında, dokümanın ana sorusundaki bilgi
kelimelerinin ne kadarının kullanıcıda olduğuna bakılır. Kullanıcı 2 kelimelik
sorunun 1 kelimesini yazdıysa (oran 0.50) skor `0.45 + 0.55 × oran` ile
çarpılır. `hile` ↔ `en iyi hile` → 0.76 → 0.44 (eşiğin altı) → AI devralır.

### 14.3 Kök hata #3 — Türkçe ekler ayrı kelime sanılıyordu

```
"saat kaçarmı hahha" → sorguda [saat, kacarmi], dokümanda [saat]
                     → kapsam 0.50 → skor 0.31 → bot SUSUYOR
```

`kok()` ek kırpması için kelimenin en az 3 harf bırakmasını istiyor;
"kacarmi" kırpılmadığı için "kaç" ile ayrı kelime sayıldı. Oysa aynı kelimenin
ekli hâli.

**Düzeltme — iskelet eşleşmesi:** kelimelerin ünsüz iskeleti çıkarılır
(`kok()` + ünlüleri at). "kaç" → `kc`, "kaçarmı" → `kcrm`. Uzun taraf kısanın
devamıysa (ek yığılması) eşleşir.

**Sıkı kural (ilk denemem yanlıştı):** ilk sürüm sadece "kısa, uzunun başı"
diyordu ve şunları tutuyordu:
- `yapabilirsin` (ypblrs) ↔ `yapabilirsiniz` (ypblrsnz) → **tek/çoğul birleşti**
- `hava` (hv) ↔ `have` (hv) → **"bugun hava nasil" İngilizce "have" ile eşleşti**

Doğrusu: uzun taraf **en az 2 karakter EK** almalı; kısa iskelet 6+ harfse
**en az 3** (tekil/çoğul farkı reddedilir). En fazla 8.

### 14.4 Kök hata #4 (yapısal) — Cevap metni eşleşme yüzeyi sayılıyordu

`indeksOlustur()` doküman köklerini **sorulardan** kuruyordu — kod doğruydu.
Ama `dok.kokler` adı "dokümanın tüm kelimeleri" gibi okunuyordu ve iki ayrı
riski gizliyordu:

1. Cevap metnindeki kelimeler gelecekte kolayca eşleşme yüzeyine sızabilir
   (ör. `cf nedir` kaydının cevabında geçen kelimeler).
2. Kapsam hesabı ile IDF hesabı aynı kümeden besleniyordu; ikisini ayırmak
   imkânsızdı.

**Düzeltme:** `soruKokleri` adında **ayrı** bir küme eklendi ve kapsam/IDF
onun üzerinden yapılıyor. `kokler` geriye dönük uyumluluk için duruyor.

### 14.5 Eksik kavram kayıtları

Düzeltmelerden sonra bile `wikipedia ne işe yarar`, `açık kaynak nedir` ve
`hile nedir` **katalogda yoktu**. Üç yeni kayıt eklendi (`cevaplar.json`
159 → 163):

- `[hile] hile nedir` (12 varyant) — hile tanımı + Rubidium/Vape gerçeği
- `[genel] wikipedia ne işe yarar` (8 varyant)
- `[genel] açık kaynak nedir` (8 varyant)
- `[genel] yapay zeka nedir` (10 varyant)

Ayrıca DB'deki öğrenilmiş kayıtlara (`ai_qa_`) 20 varyant eklendi:
`hangi ai modelisin` ve `what ur model` — "senin ai modelin ne" yazınca
"sahibin kim" cevabı dönüyordu.

> **Önemli ayrım:** İlk 4 hata **kod** hatasıydı, sonrakiler **veri**
> eksiğiydi. Veri eklemek kodu düzeltmez, kod düzeltmek veriyi yaratmaz.
> İkisi ayrı ayrı yapıldı ki "hile nedir" yine "en iyi hile"ye kaymasın.

### 14.6 Ölçüm

Kullanıcının 4 sorusu:

| Soru | Önce | Sonra |
|------|------|-------|
| `wikipedia ne işe yarar` | 0.32 (yanlış) | **0.685 → Wikipedia tanımı** |
| `açık kaynak nedir` | 0 → boş | **1.000 → açık kaynak tanımı** |
| `saat kaçarmı hahha` | 0.21 → susuyor | **1.000 → saat** |
| `hile nedir` | 0.76 → "en iyi hile" | **0.839 → hile tanımı** |

Tam katalog regresyonu (163 kayıt, 2499 soru kalıbı):

| Ölçüm | Değer |
|-------|-------|
| Doğru cevap | **%95.3** (2382/2499) |
| Yanlış | 47 — tamamı kardeş kayıt (aynı konu, ayrı dosya) |
| Boş | 70 (yabancı soru → AI devralır, doğru davranış) |

Tek kelime toleransı (`iskelet-risk.js`):

```
"kayıtlar nasıl"        → kayıt nasıl yapılır ✅
"premiumlar ne işe yarar" → premiun ne işe yarar ✅   (hem ek hem yazım hatası)
"vape'ler nedir"        → vape nedir ✅
"saatler kaç"           → saat kaç ✅
"hilеler ücretsiz mi"   → hangi hileler ücretsiz ✅
"kuponlar nasıl kullanılır" → kupon nasıl kullanılır ✅
```

Yabancı 26 sorunun 5'i eşleşti, **5'i de doğru cevap** (sahibin onayladığı
`owner_saved` kayıtları: hava durumu "bilmiyorum" cevabı, HTML örneği…).

### 14.7 Bu turda dokunulmayan

`senin ai modelin ne` gibi sorular "sahibin kim" ile yarışıyordu; DB'ye
varyant eklendi, düzeldi. `bot musun` gibi çok kısa sorular hâlâ komşu kayda
(`bot kim`) gidebiliyor — ikisi de aynı cevabı veriyor, zararsız.

---

---

## 15. Tutarlılık turu (v5) — tek doğruluk kaynağı + katalog küçültme

Kullanıcı şikâyeti: "cevaplar tutarlı değil, marka övgüsü var, local AI'da olan
cevapları azalt, her alanda AI ağırlıklı olsun".

### 15.1 Ölçülen kök nedenler (tahmin değil, ölçüm)

| # | Köken | Kanıt |
|---|---|---|
| 1 | `ai/handler.js:584` sayaç hatası | `db.add("ai_qa_<id>_kullanim", 1)` → croxydb bunu AYRI anahtar yazıyor. **827/827 kayıtta `kullanim` hep 0** |
| 2 | Aynı hatanın ikinci etkisi | `builtin` kayıtlarında taban anahtar olmadığı için **14 kayıt metni tamamen kayboldu** (yetim sayaç) |
| 3 | `ai/matcher.js` DB önceliği | DB kayıtları `oncelik: 0.08` alıyordu → düzeltilmiş `cevaplar.json` kaydını **gölgeliyordu**. "Vape için ücretsiz erişim sağlamıyorum" metni buradan geliyordu |
| 4 | `ai/bilgi-ek.js` ikinci kaynak | Vape "**ücretsiz**" ve "🏆 Rubidium V4" övgüsü burada. `cevaplar.json`'daki tüm düzeltmeleri boşa çıkarıyordu |
| 5 | `ai/groq.js` ezber prompt | "Doğrudan şu cevabı ver: En iyi hile: Rubidium V4..." → model **her** hile sorusuna aynı reklamı basıyordu |
| 6 | `cevap_en` hiç yok | **0/827 DB kaydında `cevap_en`**. `value.cevap_en \|\| value.cevap` yüzünden İngilizce kullanıcı **Türkçe cevap** alıyordu |
| 7 | `hile nedir` yanlış kayda | 0.65 skorla **ekonomi / yazı-tura** cevabı dönüyordu |
| 8 | Mükerrer kayıtlar | 872 DB kaydı / 279 benzersiz soru → **219 mükerrer**, 150'si farklı cevap taşıyor |

### 15.2 Yapılanlar

**Yeni: `ai/hile.js` — tek doğruluk kaynağı**

Hile bilgisi 4 ayrı yerde duruyordu (`cevaplar.json`, `groq.js` prompt,
`matcher.js` eşanlamlıları, `web.js`). Artık tek dosya: `URUNLER`,
`platformSor()`, `mobilCevabi()`, `erisimMetni()`, `urunListesi()`,
`promptBlogu()`. Değiştirmek gerekirse **sadece bu dosya** değişir.

**Onaylanmış gerçekler (kullanıcı):**

- Rubidium V4 → **PC + mobil** (PojavLauncher / Java emülatörü üzerinden)
- Vape V4 / V4.22 → **sadece PC**
- Lunar Client Cosmetics → **sadece PC**
- Premium → **parayla satılmaz**, bot komutlarıyla kazanılır
- "En iyi hile" → **AI + internet araştırması** karar verir, bot ilan etmez

**`ai/groq.js`** — prompt'tan "Doğrudan şu cevabı ver" ezber blokları silindi.
Yerine `hile.promptBlogu(lang, platform)` geliyor: gerçekler + "birini ezberden
en iyi ilan ETME" kuralı. Mobil soruda yalnız mobilde çalışan önerilir.

**`ai/handler.js`** — sayaç kaydın KENDİ alanına yazılıyor. Ayrıca hedef dil
eşleştirmeye önceden veriliyor.

**`ai/matcher.js`**

- DB ve ek kayıtların `oncelik` bonusu kaldırıldı (gölgeleme bitti)
- `bul(soru, {dil})`: EN ise `cevap_en`'i olmayan kayıt **aday olamaz**
- `esik` 0.60 → **0.70**. Gerekçe ölçüm: "hile nedir" 0.65 ile alakasız
  ekonomi kaydına düşüyordu; 0.70 bunu kapatıyor, karşılığında yalnız **1 doğru
  cevap** AI'a gidiyor (yanlış sayısı artmıyor)

**`ai/web.js`**

- `IC_KONULAR`'dan `vape|rubidium|lunar|hile|cheat` çıkarıldı → bu sorular
  **artık internete çıkabiliyor** (kullanıcı isteği)
- `DIS_KONU_IPUCU` TR/EN paritesine getirildi ("saat kaç" ile "what time is it"
  artık aynı kararı veriyor)

**`ai/bilgi-ek.js`** — Vape "ücretsiz" ve "🏆 Rubidium" övgüsü düzeltildi;
üç seçenek eşit, platform gerçeğiyle listeleniyor.

**`cevaplar.json`** — çelişen kayıtlar tek gerçeğe çekildi (#33/#34/#156 Vape,
#41/#125/#142 Rubidium + mobil bilgisi, #154–#159 hile kayıtları yeniden yazıldı).

**Katalog küçültme (onaylı): 163 → 156 (7 kayıt silindi)**

- Genel kültür (AI + web daha iyi): `wikipedia`, `açık kaynak`, `yapay zeka`
- Hile (artık `hile.js` + prompt veriyor): `en iyi hile`, `hile ücretsiz`,
  `başka client`, `hile nedir`
- **Korundu:** koruma kapatma, ticket kapatma, config oy limiti (botun kendi
  mekaniği — AI uydurmamalı)

Zayıf dilli ama **değerli** 6 kayıt silinmedi, metni düzeltildi:
#61, #64, #69, #132, #139, #140 ("kaynakta … belirtiliyor" → net anlatım).

### 15.3 Doğrulama

| Test | Sonuç |
|---|---|
| `celiski-denetle.js` (ürün bazlı) | **0 çelişki** (Rubidium ücretsiz=2 premium=0 · Vape ücretsiz=0 premium=3) |
| `web-karar-test.js` | **41/41** sınıflandırma, **15/15** TR/EN parite |
| `dil-parite.js` | **0/18 uyumsuz** |
| `v4-taban.js` (14 canlı soru) | hepsi doğru · `hile nedir` artık AI'a |
| `test/bot-driver.cjs` | geçti (EXIT=0) |
| `test/bot-runtime-test.cjs` | **21/21** |

### 15.4 Bilinen sınırlar

- `RIVER_API_KEY` hâlâ boş → AI çağrıları yapılandırılmamış döner. Yerel
  kayıtlar bu yüzden silinmedi; anahtar girilince AI devreye girer.
- DB'de 219 mükerrer soru ve 45 yetim sayaç kaydı duruyor. Bunlar **temizlenmedi**
  (veri kaybı riski). `oncelik` bonusu kalktığı için artık gölgeleme yapmıyorlar.
- `esik` 0.70: katalog dışı bazı doğru cevaplar AI'a gidiyor. Kullanıcı isteği
  bu yönde olduğu için bilinçli takas.

---

## 16. Davet takibi, presence, intent temizliği ve slash komutlar (v6)

Bu turda dört ayrı bozukluk düzeltildi. Hiçbiri "iyileştirme" değil —
**ölçülmüş çalışmayan özelliklerdi.**

### 16.1 Davet sistemi tamamen ölüydü

**Ölçüm:** `invites.<id>` anahtarı **üç yerde okunuyordu** ama bu anahtara
**yazan tek satır kod yoktu**:

| Yer | Ne okuyordu |
|---|---|
| `komutlar/rütbe-davetlerim.js` | `invites.<id>` → her zaman 0 |
| `komutlar/rütbe-top.js` | `invites_<guildId>` → **hiç yazılmayan başka bir anahtar** |
| `komutlar/çekiliş-şart.js` | `invites.<id>` → şart hiç sağlanamıyordu |

Üstüne iki ayrı hata vardı:

- `rütbe-bonus.js:26` içinde `global.onUpdateInvite(...)` çağrılıyordu. Bu
  fonksiyon **hiçbir yerde tanımlı değildi** → her `r!bonus-ekle` çağrısı
  `TypeError` ile çöküyordu.
- `GuildInvites` intent'i istenmiyordu, `inviteCreate`/`inviteDelete`
  dinlenmiyordu. Yani davet farkı hesaplanamıyordu.

**Çözüm — `ai/davet.js` (tek kaynak):**

- `GuildInvites` intent'i eklendi (**ayrıcalıklı değil**, portalda toggle
  gerekmez).
- Sunucu başına davet önbelleği: `kod → { uses, inviter }`.
- `clientReady`'de tüm sunucuların davetleri yüklenir (yoksa ilk katılımlarda
  `0 - 0` farkı çıkar ve kimse kaydedilmez).
- `inviteCreate`/`inviteDelete` önbelleği canlı tutar.
- `guildMemberAdd` → taze liste ile önbellek karşılaştırılır, **artan** davet
  kullanılan davettir.
- `guildMemberRemove` → `leave` sayacı artar (`davet_eden_<guild>_<üye>`
  anahtarı üzerinden).

**Veri biçimi** (`invites.<id>`):

```
{ total, regular, bonus, fake, leave, inviter }
```

- `fake`: 7 günden yeni hesaplar `total`'a **sayılmaz**, ayrı sayılır.
- Toplam formülü **her yerde aynı**: `total + bonus`
  (`r!davetlerim`, `r!davet-top`, `çekiliş-şart`, `giveawayEnded`).

**Yan bulgu:** `croxydb.all()` nokta içeren anahtarları **iç içe nesne**
döndürür — `db.set("invites.555", x)` sonrası `all()["invites.555"]` **yoktur**,
`all().invites["555"]` vardır. `sirala()` ve `sofraSifirla()` buna göre yazıldı.

**Düzeltilen dosyalar:** `ai/davet.js` (yeni), `bot.js`, `rütbe-davetlerim.js`,
`rütbe-top.js`, `rütbe-bonus.js`, `rütbe-davetleri-sıfırla.js`,
`rütbe-davetkanal.js`, `rütbe-davetkanalsıfırla.js`, `çekiliş-şart.js`.

`rütbe-davetkanal.js` eskiden `settings.Channel` yazıyordu (tüm sunucular aynı
anahtarı eziyordu, okuyanı da yoktu) → artık `davetkanal_<guildId>` ve
katılımda bildirim gönderiliyor.

### 16.2 `r!say` her zaman 0 gösteriyordu

İki ayrı hata üst üste:

1. `m.user.presence?.status` okunuyordu. discord.js v14'te presence
   **`member.presence`** alanındadır; `user.presence` diye alan yoktur.
2. `GuildPresences` intent'i hiç istenmiyordu → alan adı düzeltilse bile
   alan hiç dolmazdı.

**Çözüm:** `member.presence` kullanılıyor; presence verisi yoksa **0 uydurmak
yerine "bilinmiyor"** yazıyor. `GuildPresences` bilinçli olarak **istenmiyor**:
10.000+ kullanıcı eşiğinde gereksiz ayrıcalıklı intent istemek inceleme
riskidir ve `r!say`'in tek fonksiyonu için gerekçe değil.

### 16.3 Intent temizliği — GERİ ALINDI (bkz. 16.6)

~~Ölü intent'ler kaldırıldı: `GuildVoiceStates`, `GuildMessageReactions`,
`DirectMessages`~~ → **Bu bir hataydı, 16.6'da geri alındı.**

Kalan intent'ler (`GuildInvites` dahil) yerinde. Ayrıcalıklı intent'ler:
`GuildMembers` (üye/rol işlemleri şart), `MessageContent` (prefix komutlar
şart). `GuildPresences` bilinçli olarak **istenmiyor** — `r!say` presence
yoksa "bilinmiyor" der, `r!kullanıcıbilgi` zaten zarif düşer.

### 16.4 Slash komutlar — kod tarafı hiç yoktu

**Ölçüm:** Discord'da 8 komut görünüyordu ama kodda `SlashCommandBuilder`,
`client.application.commands.set` ve `isChatInputCommand()` **hiç yoktu**.
`events/interactionCreate.js` yalnızca buton/select/modal işliyordu. Yani 8
komutun 8'i de "Bu komut yüklenemedi" veriyordu.

**Çözüm — `ai/slash.js` (tek kaynak):**

| Slash | Delege edildiği prefix komutu |
|---|---|
| `/daily` | `komutlar/gunluk.js` (`r!günlük`) |
| `/help` | `komutlar/yardım.js` (`r!yardım`) |
| `/language` | `komutlar/dil.js` (`r!dil`) |
| `/level` | `komutlar/seviye.js` (`r!seviye`) |
| `/ping` | `komutlar/ping.js` (`r!ping`) |
| `/stats` | `komutlar/istatistik.js` (`r!istatistik`) |
| `/balance` | `komutlar/param.js` (`r!param`) |
| `/profile` | özel işleyici (`profil_<id>` kaydını gösterir) |

- **İş mantığı tekrarlanmıyor:** slash komutları mevcut `run()` fonksiyonlarına
  delege eder. Davet, para, XP, soft-ban gibi yan etkiler prefix ile birebir
  aynıdır.
- Prefix komutları `message` beklediği için ince bir "sahte message" kurulur;
  `message.channel.send/reply` çıktısı etkileşime yönlenir.
- `clientReady`'de `client.application.commands.set(...)` çağrılır. `.set()`
  eski kayıtların **üzerine yazar** → karşılığı olmayan stale komutlar temizlenir.
- Görünen ad/açıklama TR + EN yerelleştirmeli.
- Onay kapısı slash'te de geçerli (`ai/slash.js` içinde, butonlarla aynı kural).
- Bilinmeyen bir slash komutu gelirse sessizce düşmez: "Bilinmeyen komut" der.

**Not:** `/profile` için prefix karşılığı yoktu. `profil_<id>` anahtarını
`ai/handler.js` yazıyor. Kayıt yoksa uydurmuyor, "kayıtlı profil yok" diyor.

### 16.5 Bu turun doğrulaması

| Test | Sonuç |
|---|---|
| `davet-test.cjs` (yeni) | **30/30** |
| `slash-test.cjs` (yeni) | **35/35** |
| `test/bot-runtime-test.cjs` | **21/21** |
| `test/bot-driver.cjs` | EXIT=0, hata yok |
| `celiski-denetle.js` | **0 çelişki** |
| `web-karar-test.js` | 41/41, parite 15/15 |
| `dil-parite.js` | 0/18 uyumsuz |
| `node --check` (12 dosya) | hepsi OK |

---

## 16.6 Intent kaldırma hatası ve düzeltmesi (16.3'ün geri alınması)

**Olay:** 16.3'te `GuildMessageReactions`, `GuildVoiceStates` ve
`DirectMessages` intent'leri "ölü" sayılıp kaldırıldı. Bot Render'da
açılışta çöktü:

```
Error: Client is missing the "GuildMessageReactions" intent.
    at new GiveawaysManager (node_modules/discord-giveaways/src/Manager.js:41:19)
    at Object.<anonymous> (/opt/render/project/src/bot.js:3011:27)
==> No open ports detected, continuing to scan...
```

**Kök neden — YANLIŞ ÇIKARIM.** İntentleri kaldırmadan önce repoda
`client.on("messageReactionAdd", ...)` arandı ve **0 sonuç** bulundu. Bundan
"bu olay hiç kullanılmıyor" sonucu çıkarıldı. Bu yanlıştı: dinleyici kendi
kodumuzda değil, **kütüphanenin içinde** olabilir.

`discord-giveaways` tam olarak bunu yapıyor — `GiveawaysManager` yapıcı
fonksiyonu intent'i kontrol edip fırlatıyor:

```js
if (!new Discord.IntentsBitField(client.options.intents).has(
      Discord.IntentsBitField.Flags.GuildMessageReactions)) {
  throw new Error('Client is missing the "GuildMessageReactions" intent.');
}
```

**Kural (bu dosyaya kalıcı olarak yazıldı):** Bir intent'i kaldırmadan önce
yalnızca kendi `client.on(...)` çağrılarına değil, **`node_modules` içinde o
intent'i zorunlu tutan kütüphane olup olmadığına** da bakılmalı. `node --check`
bu sınıf hatayı yakalamaz; hata modül yüklenirken, çalışma zamanında çıkar.

**Düzeltme:** Üç intent de geri konuldu. `GuildVoiceStates` ve
`DirectMessages` ayrıcalıklı **değildir** (portalda toggle gerekmez) ve ek
maliyeti yoktur; ileride eklenecek bir kütüphane için açık kalmaları doğru.

**Yeni test — `intent-calistirma-test.cjs`:**

Bu test `bot.js`'i **gerçekten yükler** (salt `--check` değil), yakalanan
intent bitfield'ını doğrular ve `GiveawaysManager`'ı gerçekten kurar. Ayrıca
**negatif kontrol** içerir: intent olmadan kurulumun fırlattığını da doğrular,
böylece testin gerçekten bir şey ölçtüğü kanıtlanır.

> Not: Test proje kökünden çalıştırılmalı — `bot.js` göreli yol
> (`./komutlar/`) kullanıyor.

**16.6 doğrulaması:**

| Test | Sonuç |
|---|---|
| `intent-calistirma-test.cjs` (yeni) | **11/11** |
| `test/bot-runtime-test.cjs` | **21/21** |
| `test/bot-driver.cjs` | EXIT=0 |
| `davet-test.cjs` | **30/30** |
| `slash-test.cjs` | **35/35** |

---

## 12. Destek linkleri

- **Site:** `https://risebunny.vercel.app/risebunny`
- **Kısa link:** `https://dsc.gg/risebunny`
- **Destek sunucusu:** `https://discord.gg/mEfz5SfpbR`
