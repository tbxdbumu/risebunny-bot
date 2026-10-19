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

## 10. Destek linkleri

- **Site:** `https://risebunny.vercel.app/risebunny`
- **Kısa link:** `https://dsc.gg/risebunny`
- **Destek sunucusu:** `https://discord.gg/mEfz5SfpbR`
