# RiseBunny → Firestore Taşıma & Canlı Sayılar Rehberi

Bu doküman 3 projeyi kapsar: **Bot** (`rb2-main`), **Site** (`rb-main`), **Launcher** (`VapeV4.21`).

---

## 0. Ne yapıldı (özet)

- Botun verisi artık yerel JSON (`croxydb/croxydb.json`) yerine **Cloud Firestore**'da.
- **Tek dosya bile değişmeden** taşındı: `firestore-db.js` adlı shim, `require.cache` üzerinden
  `croxydb`'nin yerini alır; botun 500+ `db.fetch/set/add/...` çağrısı aynen çalışır.
- Erişim yöntemi: **Firebase Admin SDK (Service Account)** — kuralları bypass eder, sunucu tarafı tam yetki.
- Güvenlik: `kv` koleksiyonu public kurallara **tamamen kapalı** (dışarıdan okunamaz/çekilemez/yazılamaz).
- Site "Canlı Sayılar" artık **gerçek** veri (top.gg + bot API + gerçek komut/kategori sayısı); veri yoksa uydurma sayı yerine `—` + "○ veri yok" gösterir.
- **Launcher'da hiçbir şey değişmedi** (Firestore'a doğrudan dokunmuyor, sadece site API'sini kullanıyor).

---

## 1. Firebase değerlerini NEREDEN bulacaksın

Firebase Console: <https://console.firebase.google.com> → proje: **`gen-lang-client-0590499912`**

| Ne | Console yolu | Örnek değer |
|----|--------------|-------------|
| **Web API Key** | ⚙️ Project settings → General → "Your apps" → Web app → SDK setup → `apiKey` | `AIzaSyAq5...` |
| **Project ID** | ⚙️ Project settings → General → "Your projects" | `gen-lang-client-0590499912` |
| **Auth domain / appId / ...** | Aynı "SDK setup and configuration" kutusu | — |
| **Service Account JSON** (bot için ŞART) | ⚙️ Project settings → **Service accounts** → "Generate new private key" → inen `.json` | `firebase-service-account.json` |
| **Bot auth kullanıcısı** (leaderboard REST için) | Authentication → Sign-in method → **Email/Password** aktif; Users → Add user | `bot@discord.risebunny.local` + şifre |

> Firestore veritabanını aç: Console → Build → **Firestore Database** → "Create database" → **Production mode** (kuralarla). Koleksiyon adı otomatik oluşur: `kv`.

---

## 2. Env dosyaları

### 2a. Bot — `rb2-main/.env` (örnek: `.env.example`)
```env
# Firestore (VERİTABANI) — service account JSON dosyasının yolu
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
FIREBASE_PROJECT_ID=gen-lang-client-0590499912

# Leaderboard REST senkronu (eski yöntem, hâlâ kullanılıyor)
FIREBASE_API_KEY=AIzaSyAq5Nafl9aI2TabzGsj5J9ij6lNwyfTguM
FIREBASE_BOT_EMAIL=bot@discord.risebunny.local
FIREBASE_BOT_SIFRE=<az önce koyduğun şifre>

# Kimlik & güvenlik
DISCORD_BOT_TOKEN=<discord bot token>
MAIN_GUILD_ID=<uygulama id>
BOT_API_SECRET=<openssl rand -hex 32>   # site ile AYNI olmalı
SESSION_SECRET=<openssl rand -hex 32>
TICKET_SECRET=<openssl rand -hex 32>

# top.gg (canlı sayılar için)
TOPGG_BOT_ID=1540401487581020252
TOPGG_TOKEN=<top.gg bot api token>
```
> `service account` JSON'unu **asla commit'leme / paylaşma.** `.gitignore` zaten ekledi.

### 2b. Site — Vercel env (`rb-main/.env.example` birebir aynı anahtarlarla)
```env
FIREBASE_API_KEY=AIzaSyAq5Nafl9aI2TabzGsj5J9ij6lNwyfTguM
FIREBASE_PROJECT_ID=gen-lang-client-0590499912
SITE_URL=https://risebunny.vercel.app
DISCORD_CLIENT_ID=...
DISCORD_CLIENT_SECRET=...
BOT_API_URL=https://<botun-public-url>      # ⬅ CANLI SAYILAR İÇİN ŞART
BOT_API_SECRET=<botla aynı sır>
TOPGG_BOT_ID=1540401487581020252
TOPGG_TOKEN=<top.gg token>
SESSION_SECRET=...  TICKET_SECRET=...
```
> İstemci Firebase config'i (`js/firebase-config.js`) zaten gömülü ve **gizli değildir** — değiştirmene gerek yok.

### 2c. Launcher
**Değişiklik yok.** Launcher sadece `https://.../api/launcher/*` ve kendi `/api/v1/*` API'sini çağırıyor; veritabanına doğrudan bağlanmıyor.

---

## 3. Mevcut verileri Firestore'a taşıma (tek seferlik)

```bash
cd rb2-main
# 1) service account JSON'u proje klasörüne koy (firebase-service-account.json)
# 2) taşıma betiği (tam yedek + yerel croxydb birleşir, YEDEK ÖNCELİKLİ):
FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json \
  node migrate-to-firestore.js "C:\Users\enesi\Downloads\risebunny-tam-yedek-1791990267250.json"
```
Windows PowerShell için:
```powershell
$env:FIREBASE_SERVICE_ACCOUNT_PATH="./firebase-service-account.json"
node migrate-to-firestore.js "C:\Users\enesi\Downloads\risebunny-tam-yedek-1791990267250.json"
```
Betik 4236 (yedek) + 767 (yerel) anahtarı birleştirip Firestore `kv` koleksiyonuna yazar.
Çıktı: `[Migrate] ✓ Tamamlandı. N kayıt kv koleksiyonuna taşındı.`

> Botu ilk çalıştırışında `firestore-db.js` tüm `kv` kayıtlarını belleğe çeker (hydrate) ve
> bundan sonra her yazımı Firestore'a batch'ler. Yerel `croxydb.json` yedek olarak güncel kalır.

---

## 4. Firestore kurallarını yayınlama

`rb-main/firestore.rules` (v4) güncellendi. Yayınla:
- **Firebase Console → Firestore → Rules** → içeriği yapıştır → **Publish**, ya da
- `firebase deploy --only firestore:rules` (firebase CLI kuruluysa).

Öne çıkanlar:
- `match /kv/{doc} { allow read, write: if false; }` → **bot verisi dışarıdan erişilemez** (Admin SDK bypass eder).
- `launcher_logins` cihaz akışı açıldı (eskiden catch-all yüzünden kapalıydı → login bozuktu).
- `launcher_users` yalnızca admin/bot (scrape koruması).
- `users` public-read korunuyor: kayıtta kullanıcı adı sorgusu için gerekli (aksi halde site bozulur).

---

## 5. Kod değişiklikleri (ne, nerede, neden)

| Dosya | Değişiklik |
|-------|-----------|
| `rb2-main/firestore-db.js` | **YENİ** — croxydb uyumlu Firestore shim (Admin SDK + write-through + hydrate + yerel yedek). |
| `rb2-main/migrate-to-firestore.js` | **YENİ** — tek seferlik veri taşıma betiği. |
| `rb2-main/bot.js` (tepe) | `require("./firestore-db").install()` — croxydb/quick.db'yi shim ile değiştirir. |
| `rb2-main/bot.js` (`/api/stats`) | Gerçek `commands` + `categories` sayısı eklendi. |
| `rb2-main/utils.js` (premium sweeper) | Dosya okuma yerine `db.all()` kullanır (artık verinin kaynağı shim/Firestore). |
| `rb2-main/package.json` | `firebase-admin` bağımlılığı + `npm run migrate` script'i. |
| `rb2-main/.env.example`, `.gitignore` | Env şablonu + service account'u gizle. |
| `rb-main/api/public.js` (`/stats`) | top.gg + bot API birleştirilir; `commands/categories` geçer; `live` bayrağı. |
| `rb-main/js/risebunny.js` | Canlı sayılar: komut/kategori gerçek; uydurma drift kaldırıldı; veri yoksa `—`/`○ veri yok`. |
| `rb-main/risebunny.html` | Stat kartlarında sabit 162/17 → dinamik placeholder. |
| `rb-main/firestore.rules` | v4: `kv` kapalı, launcher koleksiyonları. |
| `VapeV4.21/*` | **Dokunulmadı** (gerek yok). |

---

## 6. Çalıştırma sırası (kontrol listesi)

1. Firestore DB'yi **Production mode**'da aç.
2. Service account JSON üret → `rb2-main/firebase-service-account.json`.
3. Authentication → Email/Password aktif + `bot@discord.risebunny.local` kullanıcısı.
4. `rb2-main/.env`'i doldur (bkz. §2a).
5. `npm install` (firebase-admin) → `node migrate-to-firestore.js <yedek>` ile veriyi taşı.
6. `firestore.rules`'u Publish et.
7. Botu başlat: `npm start` → logda `[FDB] Firestore hidrasyon ✓ (N kayıt)` gör.
8. Siteyi Vercel env'leri (§2b — özellikle `BOT_API_URL`, `TOPGG_TOKEN`) ile yeniden deploy et.
9. Sitede "Canlı Sayılar" → `● canlı` + gerçek sayılar.

---

## 7. Notlar / sınırlar

- **Yazımlar asenkron batch'tir** (~1.2 sn). Anlık tutarlılık için kritik değil; bot tek örnek çalışır.
- Bot kapandıysa bekleyen yazımlar yerel `croxydb.json`'a da yedeklendiği için kaybolmaz; sonraki açılışta Firestore'a gider.
- Birden fazla bot örneği koşarsan cache'ler ayrışabilir — şu an tek örnek varsayımıyla tasarlandı.
- `users` koleksiyonu public-read: e-mail/discordId gibi alanları korumak istersen ayrı `launcher_access` gibi dar bir koleksiyona taşıma gerekir (ileride, ayrı iş).
