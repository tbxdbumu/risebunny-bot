# RiseBunny — Panel ↔ Hesap Sistemi

Bu klasördeki iki dosya **Minecraft projesinden bağımsızdır**. `rb2-main`
içinde yaşasalar da ekonomi, pelerin, pet, mağaza uçlarının hiçbirine
dokunmazlar. Taşınacakları zaman enjekte edilen `db` ve `client` yeterlidir.

```
panel-kopru.js    → bot tarafı: /api/panel/* ve /api/public/avatar-owner/:hash
panel-bridge.js   → mod tarafı: panelin WebView köprüsü (mesaj protokolü)
```

Site tarafı (`rb-fixed`, Vercel):

```
api/panel/index.js   → /api/panel/{link,session,avatar,disconnect,logout,config}
lib/_launcher.js     → bilet, cihaz kodu, avatar proxy'si (launcher.js ile ortak)
panel.html           → risebunny-panel.html + hesap sekmesi
```

## Akış

```
Panel ──POST /api/panel/link {create:true}──▶ Vercel ──▶ Firestore launcher_logins/<KOD>
  │                                                              ▲
  │  kod gösterilir, tarayıcı siteye açılır                       │ callback yazar
  ▼                                                              │ (status=done, proof)
Discord OAuth ──▶ /api/auth/discord/callback ─────────────────────┘
  │
Panel ──GET /api/panel/link?code=KOD (2.5 sn)──▶ Vercel
        proof doğrulanınca: {status:"done", token, id, username, avatarUrl}
  │
Panel ──GET /api/panel/session (Bearer token)──▶ Vercel ──x-bot-secret──▶ bot
        {account:{id,username,avatarUrl}, premium:{active,daysLeft,role,staff}}
```

`token` 30 gün geçerli HMAC bilettir; premium/ban kararı **her istekte**
bottan yeniden okunur. Biletin ömrü yetkiyi genişletmez.

Panel siteyle aynı kökende açıldığında (`/risebunny`) oturum çerezi de
kullanılabilir: `/api/panel/session` çerezden kimliği çözer ve cevapta taze
`token` döner; panel onu localStorage'a yazar.

## Mod tarafı (panel-bridge.js)

```js
const createPanelBridge = require("./panel-bridge.js");

const bridge = createPanelBridge({
  // WebView'de window.RiseBunnyNative.send(rawString) → aşağıdaki fonksiyon
  transport: {
    send: raw => webview.evaluate(`window.RiseBunny.receiveNative(${JSON.stringify(raw)})`),
  },
  hooks: {
    // panelin beklediği üç pompa
    setPremium: json => webview.evaluate(`window.RiseBunny.setPremium(${JSON.stringify(json)})`),
    setAccount: json => webview.evaluate(`window.RiseBunny.setAccount(${JSON.stringify(json)})`),
    receiveNativeStatus: json => webview.evaluate(`window.RiseBunny.receiveNativeStatus(${JSON.stringify(json)})`),

    // modül yaşam döngüsü
    enable: ({ module, settings }) => modules.start(module, settings),
    disable: ({ module }) => modules.stop(module),
    settings: ({ module, values }) => modules.update(module, values),
    panic: () => modules.stopAll(),

    // kimlik
    createDeviceCode: () => api.post("/api/panel/link", { create: true }),
    readDeviceCredential: code => api.get(`/api/panel/link?code=${code}`),
    fetchAccount: token => api.get("/api/panel/session", { Authorization: `Bearer ${token}` }),
    setPanelToken: token => store.set("panel.token", token),
  },
});

// WebView köprüsü
window.RiseBunnyNative = { send: raw => bridge.fromPanel(raw) };

// Panel hazır olduğunda ilk paketler
bridge.attach();
```

Her 2.5 saniyede gelen telemetri için `bridge.pushStatus({ fps, ping, hook })`.

### Premium kapısı

Paneldeki kilit süs değildir: `enable` mesajı `AutoDodge` / `AutoAim` için
`bridge.isPremiumActive()` yanlışsa `{ ok:false, error:"premium" }` döner ve
ilgili hook hiç çağrılmaz. Giriş düşünce (logout, bilet geçersiz) açık olan
premium modüller kendiliğinden kapatılır — `syncPremiumModules()`.

## AutoDodge — BSRE portu (`autododge-bsre.js`)

BSRE'nin AutoDodge modülü `BSRE-modules-source` içindeki yedi doğrudan
fonksiyondan oluşur. `autododge-bsre.js` o fonksiyonların davranışını düz
JavaScript'te yeniden kurar; VM yorumlayıcısına ihtiyaç yoktur.

| BSRE fonksiyonu | Dosyadaki karşılığı |
| --- | --- |
| `update__9cdebe51b4173456` | `update()` — modül kapısı + geri dönüş |
| `updateTouches__fe3dfb0c535bff43` | `updateTouches()` — 8 maddelik karar akışı |
| `getDamage__93bc4f2a1f164499` | `stillDamageAt()` |
| `getDynamicDamage__9f7f4eb6bb728899` | `pathDamage(angle, …)` |
| `getPathDamage__d65a89009a961e44` | `pathDamage` + arena dalı |
| `getPathDamageBounded__7d06d20742aded15` | `MAX_PATH_TICKS = 40` sınırı |
| `checkSweptCollision__7b14b1912d56a4ae` | `checkSweptCollision()` |

Karar akışı BSRE ile birebir: `GoingBackToOriginalDodge` → modül kapalı →
aynı tick → joystick yok → hasar yok (`ReturnDelay`) → yön kilidi
(`ChangeDelay`) → en iyi yol mevcut hasardan iyiyse joystick kaydır.

Varsayılanlar bytecode'dan (+0x47a5…+0x47c0): `Reaction [0,0]`,
`Chance 100`, `Safety 2`, `ReturnDelay 100`, `ChangeDelay 0`,
`MinDistance 0`, `EXTRA_RADIUS 50`, `IGNORE_EXTRA_RADIUS ['MinigunDudeProjectile']`.

### Panel ↔ modül

```
Panel ("Auto Dodge" kartı)
   enable  {module:"AutoDodge", settings:{reactionMin, changeDelay, …}}
        │
        ▼
panel-bridge.js — premium kapısı → loadAutoDodge()
        │
        ▼
autododge-bsre.js — panelToBsre() panel anahtarlarını BSRE alanlarına çevirir
        │
        ▼
oyun tick'i → bridge.update() → autoDodge.update()
```

`bridge.update()` panelde kapalıyken **hiçbir şey yapmaz**; `disable` ayrıca
`chance: 0` yazar (ikinci emniyet). `settings` mesajı modülü yeniden kurmaz,
aynı örneği `setSettings()` ile yerinde günceller — joystick kesilmez.

Bağımlılıklar `hooks.autoDodgeDeps()` ile gelir; köprü hiçbir oyun global'ini
bilmez. Enjekte edilen alanlar: `BattleCache`, `joystickState`, `touchStorage`,
`touchController`, `inputActions`, `BattleView`, `SkillController`,
`mathBindings`, `predictionWorker`, `predictionState`, isteğe bağlı
`fixMoveAngle`.

### BSRE'den bilinçli sapmalar

1. **`safety` birim düzeltmesi.** BSRE `Safety` (varsayılan 2) dokunma solma
   payıdır; BSRE portu bunu dünya yarıçapına ekleme hatasından kaçınır. Bu
   dosyada `Safety`, `MAX_PATH_TICKS + safety` kare kadar ileriyi
   değerlendirir. Yarıçap olarak eklenirse 2 ↔ 200 birimlik farkla kaçış
   yönü bozulur (ölçüldü).
2. **Maç girişinde zamanlayıcı temizliği.** `DodgeChangeTimeout` /
   `DodgeReturnTimeout` / `LastJoystickAngle` maç dışında sıfırlanır.
   BSRE'de `BattleCache` sıfırlanmadığı için bu kilit savaştan savaşa
   taşınıyordu; yeni maçın ilk saniyesinde dodge yanlışlıkla engelleniyordu.
3. **Tarama `preferred`ten başlamaz.** BSRE tam çember tarar. Tercih edilen
   açıdan başlayınca ilk açı hep kazanıyor, joystick kendi yönünü
   "iyileştirme" sayıp her tick yeniden animasyon üretiyordu (salınım).

Bu üç madde dışında hasar, çarpışma, grup ve geri dönüş mantığı BSRE ile
aynıdır.

## Bot uçları

| Uç | Yetki | Döner |
| --- | --- | --- |
| `GET /api/panel/session/:id` | `x-bot-secret` | hesap kartı + premium + seri |
| `POST /api/panel/disconnect` | `x-bot-secret` | `{ok}` |
| `GET /api/panel/avatars?limit=` | `x-bot-secret` | `{items:[{discordId, avatarHash}]}` |
| `GET /api/public/avatar-owner/:hash` | açık | `{discordId}` |

`avatar-owner` bilinçli olarak açık: hash Discord kimliğini içermez, cevap
yalnızca hash ile kartın `.avatar` adresi arasındaki eşlemeyi verir. Panel
avatarı `/api/panel/avatar?h=<hash>` üzerinden alır; **kimlik ağ üzerinde
hiçbir zaman görünmez**, yalnızca resim baytları akar.

## Ortam değişkenleri (Vercel)

```
SITE_URL=https://risebunny.vercel.app
SESSION_SECRET=<16+ karakter>     # çerez imzası ve bilet yedeği
TICKET_SECRET=<16+ karakter>      # bilet + cihaz kanıtı (imza üreten/doğrulayan aynı)
BOT_API_URL=https://<bot-host>
BOT_API_SECRET=<bot ile aynı>
ADMIN_DISCORD_IDS=<virgülle>
FIREBASE_API_KEY / FIREBASE_PROJECT_ID
```

`TICKET_SECRET` **callback'in imzaladığı** ve `launcher`ın doğruladığı sırdır;
iki taraf aynı değişkeni okur. Değiştirilirse tüm eski biletler geçersiz olur
(kullanıcılar bir kez daha Discord girişi yapar).

## Doğrulama

```powershell
node --check api/panel/index.js
node --check lib/_launcher.js
node --check panel-kopru.js
node --check panel-bridge.js
```

Davranış testleri (`%TEMP%\opencode\`):

- `test-launcher.mjs` — bilet imzası, sahte imza ret, süre aşımı, kanıt bağı
- `test-kopru5.cjs` — bot uçları: oturum kartı, avatar-owner, disconnect
- `test-bridge.cjs` — panel↔mod protokolü, premium kapısı, logout/panic
