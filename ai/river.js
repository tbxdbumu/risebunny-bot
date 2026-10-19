/**
 * River.ai Sağlayıcısı — OpenAI uyumlu (chat/completions)
 *
 * Key SADECE ortam değişkeninden okunur: RIVER_API_KEY
 *   .env → RIVER_API_KEY=rv_...
 *
 * Özellikler:
 *  - Basamaklı model zinciri: asıl model çalışmazsa yedek modellere geçer.
 *  - 404 / 401 / 403 / 429 / 5xx / ağ hatası / boş cevap → sıradaki denemeye düşer.
 *  - JSON modu (response_format) desteği — "rise <istek>" yönlendiricisi için.
 *  - Sağlık durumu hafızası: 404 alan model 5 dk boyunca atlanır (gereksiz gecikme olmasın).
 *  - getir() ucu: canlı sağlayıcı listesi (/v1/models) — ücretsiz sorgu, başka API anahtarı gerekmez.
 *
 * DİKKAT (doğrulanmış): River, tanımsız model adına DOĞRUDAN 404 döner
 *   {"error":{"code":"model_not_found", ...}}
 * Bu yüzden model adları burada sabittir; kod içinde uydurma model denenmez.
 */

const BASE_URL = (process.env.RIVER_BASE_URL || "https://api.river.ai/v1").replace(/\/+$/, "");
const MAX_TOKEN = Number(process.env.RIVER_MAX_TOKENS || 700);
const TIMEOUT_MS = Number(process.env.RIVER_TIMEOUT_MS || 25000);

/** Kullanılan modeller — sırayla denenir (ilk sağlam olan cevap verir). */
const MODELLER = process.env.RIVER_MODEL
  ? [process.env.RIVER_MODEL]
  : ["deepseek-ai/DeepSeek-V4.1-Flash-1017", "deepseek-ai/DeepSeek-V4.1-Flash"];
const MODEL = MODELLER[0];

/** model → { ok, at } — hata veren model kısa süre atlanır. */
const saglik = new Map();
const SAGLIK_TTL = 2 * 60 * 1000;

function _anahtar() {
  return String(process.env.RIVER_API_KEY || "").trim();
}

function anahtarVar() {
  return _anahtar().length > 0;
}

function _denenebilir(model) {
  const k = saglik.get(model);
  if (!k) return true;
  if (k.ok) return true;
  return Date.now() - k.at > SAGLIK_TTL;
}

async function _fetch(url, opts) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    return await fetch(url, { ...opts, signal: ctl.signal });
  } finally {
    clearTimeout(t);
  }
}

/**
 * Tek bir modelle sohbet tamamlaması.
 * @returns {Promise<{ok:boolean, cevap?:string, status?:number, error?:string, model?:string, json?:any}>}
 */
async function sohbet({
  system = "",
  soru,
  messages = null,
  jsonMode = false,
  maxTokens = MAX_TOKEN,
  temperature = 0.7,
  model = null,
} = {}) {
  if (!anahtarVar()) return { ok: false, status: 401, error: "RIVER_API_KEY tanımlı değil" };

  const mesajlar = messages && messages.length
    ? messages
    : [
        ...(system ? [{ role: "system", content: String(system) }] : []),
        { role: "user", content: String(soru ?? "") },
      ];

  const sirali = model ? [model] : MODELLER;
  let sonHata = { status: 0, error: "denenemedi" };

  for (const m of sirali) {
    if (!_denenebilir(m)) {
      sonHata = { status: 404, error: `${m} yakın zamanda başarısız` };
      continue;
    }
    try {
      const res = await _fetch(`${BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${_anahtar()}`,
        },
        body: JSON.stringify({
          model: m,
          messages: mesajlar,
          max_tokens: Math.max(16, Math.min(4096, Number(maxTokens) || MAX_TOKEN)),
          temperature,
          ...(jsonMode ? { response_format: { type: "json_object" } } : {}),
        }),
      });

      const veri = await res.json().catch(() => ({}));

      if (!res.ok) {
        saglik.set(m, { ok: false, at: Date.now() });
        const kod = veri?.error?.code || "";
        const mesaj = veri?.error?.message || `HTTP ${res.status}`;
        sonHata = { status: res.status, error: `${m}: ${mesaj}${kod ? ` (${kod})` : ""}` };
        console.warn(`[River] ${m} → ${res.status} ${kod || ""} — sıradaki model deneniyor`);
        // 401/403 anahtar sorunu → model denemek anlamsız, çık.
        if (res.status === 401 || res.status === 403) break;
        continue;
      }

      const secim = veri?.choices?.[0]?.message;
      const cevap = String(secim?.content ?? "").trim();

      if (!cevap) {
        saglik.set(m, { ok: false, at: Date.now() });
        sonHata = { status: 500, error: `${m}: boş cevap` };
        continue;
      }

      saglik.set(m, { ok: true, at: Date.now() });
      let json = null;
      if (jsonMode) {
        try { json = JSON.parse(cevap); } catch { json = _jsonCikar(cevap); }
      }
      return { ok: true, cevap, model: m, status: res.status, json, usage: veri?.usage };
    } catch (e) {
      const iptal = e?.name === "AbortError";
      sonHata = { status: 0, error: `${m}: ${iptal ? "zaman aşımı" : e?.message || e}` };
      console.warn(`[River] ${m} istek hatası: ${iptal ? "zaman aşımı" : e?.message || e}`);
      if (iptal) break;      // toplam süre sınırı — model değiştirip aynı gecikmeyi yaşama
      continue;
    }
  }

  return { ok: false, ...sonHata };
}

function _jsonCikar(metin) {
  const s = String(metin || "");
  const m = s.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try { return JSON.parse(m[0]); } catch { return null; }
}

/**
 * Canlı model listesi (ücretsiz /models ucu). Sağlayıcı erişilebilir mi sorusuna da yanıt olur.
 * @returns {Promise<{ok:boolean, modeller:string[], status:number, error?:string}>}
 */
async function modelleriGetir() {
  if (!anahtarVar()) return { ok: false, modeller: [], status: 401, error: "RIVER_API_KEY tanımlı değil" };
  try {
    const res = await _fetch(`${BASE_URL}/models`, { headers: { Authorization: `Bearer ${_anahtar()}` } });
    const veri = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, modeller: [], status: res.status, error: veri?.error?.message || `HTTP ${res.status}` };
    const modeller = (veri?.data || []).map(x => x?.id).filter(Boolean);
    return { ok: true, modeller, status: res.status };
  } catch (e) {
    return { ok: false, modeller: [], status: 0, error: e?.message || String(e) };
  }
}

/** Sağlık durumunu sıfırla (bağlantı değişti / yeni key girildi). */
function sagligiSifirla() {
  saglik.clear();
}

/** Sağlayıcı özeti (teşhis/log için). */
function durum() {
  return {
    ada: "river",
    anahtar: anahtarVar() ? "var" : "yok",
    base: BASE_URL,
    modeller: MODELLER,
    saglik: Object.fromEntries([...saglik.entries()].map(([k, v]) => [k, v.ok ? "ok" : "hata"])),
  };
}

module.exports = {
  ad: "river",
  anahtarVar,
  anahtarDegiskeni: "RIVER_API_KEY",
  sohbet,
  modelleriGetir,
  sagligiSifirla,
  durum,
  MODEL,
  MODELLER,
  BASE_URL,
};
