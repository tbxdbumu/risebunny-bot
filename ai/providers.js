/**
 * Multi-Provider AI Zinciri
 *
 * SIRA (sabit mantık):  River → Groq → NVIDIA NIM → Gemini → Cerebras → OpenRouter
 *  - River HER ZAMAN ilk sorulur (RIVER_API_KEY varsa).
 *  - River 404 / 401 / 429 / 5xx / timeout / boş cevap dönerse sıradaki sağlayıcıya geçilir.
 *  - River başarılıysa diğerlerine HİÇ gidilmez.
 *  - Diğer sağlayıcılar arasında round-robin yalnızca "başarılı olanın bir sonrakinden
 *    başlama" mantığı için vardır; River her çağrıda ilk sırada kalır.
 */

const river = require("./river");

const NVIDIA_MODELS = ["openai/gpt-oss-120b", "meta/llama-3.1-70b-instruct"];
const GEMINI_MODELS = ["gemini-2.5-flash", "gemini-2.0-flash"];
const OPENROUTER_MODELS = ["openai/gpt-oss-120b", "meta-llama/llama-3.3-70b-instruct:free"];

/** River dışındaki yedekler (sadece key tanımlıysa denenir). */
const YEDEKLER = [
  { name: "groq", key: "GROQ_API_KEY", url: "https://api.groq.com/openai/v1/chat/completions", model: "openai/gpt-oss-120b", type: "openai" },
  { name: "nvidia", key: "NVIDIA_API_KEY", url: "https://integrate.api.nvidia.com/v1/chat/completions", models: NVIDIA_MODELS, modelIndex: 0, type: "openai" },
  { name: "gemini", key: "GEMINI_API_KEY", url: "https://generativelanguage.googleapis.com/v1beta/models", models: GEMINI_MODELS, modelIndex: 0, type: "gemini" },
  { name: "cerebras", key: "CEREBRAS_API_KEY", url: "https://api.cerebras.ai/v1/chat/completions", model: "gpt-oss-120b", type: "openai" },
  { name: "openrouter", key: "OPENROUTER_API_KEY", url: "https://openrouter.ai/api/v1/chat/completions", models: OPENROUTER_MODELS, modelIndex: 0, type: "openai" },
];

/** River'a kaç kez sorulacağı. 404/5xx/timeout'ta model değiştirmeden 1 kez daha denenir. */
const RIVER_DENEME = Number(process.env.RIVER_RETRY || 2);

let startIndex = 0;

function _kisalt(s, n) {
  s = String(s || "");
  return s.length > n ? s.slice(0, n) + "\n\n[Not: sistem promptu kısaltıldı]" : s;
}

async function callOpenAI(p, systemPrompt, soru, apiKey, ayar = {}) {
  const res = await fetch(p.url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: p.model,
      messages: [
        ...(systemPrompt ? [{ role: "system", content: _kisalt(systemPrompt, 12000) }] : []),
        { role: "user", content: soru },
      ],
      max_tokens: ayar.maxTokens || 400,
      temperature: ayar.temperature ?? 0.85,
      ...(ayar.jsonMode ? { response_format: { type: "json_object" } } : {}),
    }),
    signal: AbortSignal.timeout(ayar.timeout || 15000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: data.error?.message || `HTTP ${res.status}` };
  const cevap = data.choices?.[0]?.message?.content?.trim();
  if (!cevap) return { ok: false, status: 500, error: "empty" };
  return { ok: true, cevap };
}

async function callGemini(p, systemPrompt, soru, apiKey, ayar = {}) {
  const models = p.models || ["gemini-2.5-flash"];
  let lastErr = "no-model", lastStatus = 0;

  for (let i = 0; i < models.length; i++) {
    const model = models[(p.modelIndex + i) % models.length];
    const url = `${p.url}/${model}:generateContent?key=${apiKey}`;
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          system_instruction: systemPrompt ? { parts: [{ text: _kisalt(systemPrompt, 12000) }] } : undefined,
          contents: [{ parts: [{ text: soru }] }],
          generationConfig: { maxOutputTokens: ayar.maxTokens || 400, temperature: ayar.temperature ?? 0.85 },
        }),
        signal: AbortSignal.timeout(ayar.timeout || 15000),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        lastErr = data.error?.message || `HTTP ${res.status}`;
        lastStatus = res.status;
        console.warn(`[AI:${p.name}] ${model} → ${res.status}, sıradakine geçiliyor...`);
        continue;
      }
      const cevap = data.candidates?.[0]?.content?.parts?.map(x => x.text || "").join("").trim();
      if (!cevap) { lastErr = "empty"; lastStatus = 500; continue; }
      p.modelIndex = (models.indexOf(model) + 1) % models.length;
      return { ok: true, cevap, model };
    } catch (e) {
      lastErr = e.message; lastStatus = 0;
      continue;
    }
  }
  return { ok: false, status: lastStatus, error: lastErr };
}

async function callCokluModel(p, systemPrompt, soru, apiKey, ayar = {}) {
  const models = p.models || [];
  let lastErr = "no-model", lastStatus = 0;

  for (let i = 0; i < models.length; i++) {
    const model = models[(p.modelIndex + i) % models.length];
    try {
      const r = await callOpenAI({ ...p, model }, systemPrompt, soru, apiKey, ayar);
      if (!r.ok) { lastErr = r.error; lastStatus = r.status; continue; }
      p.modelIndex = (models.indexOf(model) + 1) % models.length;
      return { ...r, model };
    } catch (e) {
      lastErr = e.message; lastStatus = 0;
      continue;
    }
  }
  return { ok: false, status: lastStatus, error: lastErr };
}

/**
 * Ana çağrı: River → yedekler.
 * @param {string} systemPrompt
 * @param {string} soru
 * @param {string} lang "tr" | "en"
 * @param {object} ayar { jsonMode, maxTokens, temperature, timeout, riverModel, sadeceRiver }
 * @returns {Promise<{success:boolean, cevap?:string, provider?:string, json?:any, error?:string, statusCode?:number, riverleri?:object[]}>}
 */
async function chainAsk(systemPrompt, soru, lang = "tr", ayar = {}) {
  const isTr = lang !== "en";
  const denemeler = [];   // { provider, status, error }

  /* ── 1) RIVER (her zaman ilk) ─────────────────────────────── */
  if (river.anahtarVar()) {
    for (let i = 0; i < Math.max(1, RIVER_DENEME); i++) {
      const r = await river.sohbet({
        system: systemPrompt,
        soru,
        jsonMode: !!ayar.jsonMode,
        maxTokens: ayar.maxTokens || 400,
        temperature: ayar.temperature ?? 0.85,
      });
      if (r.ok) {
        return { success: true, cevap: r.cevap, provider: `river/${r.model}`, json: r.json || null };
      }
      denemeler.push({ provider: "river", status: r.status, error: r.error });
      console.warn(`[River] deneme ${i + 1}/${RIVER_DENEME} başarısız: ${r.status} ${r.error}`);
      // anahtar / model hatası → tekrar denemek anlamsız, doğrudan yedeğe geç
      if (r.status === 401 || r.status === 403 || r.status === 404) break;
    }
  } else {
    denemeler.push({ provider: "river", status: 0, error: "RIVER_API_KEY yok" });
  }

  if (ayar.sadeceRiver) {
    const son = denemeler[denemeler.length - 1] || {};
    return {
      success: false,
      statusCode: son.status || 0,
      error: isTr ? "River AI şu an yanıt veremedi. 🐰" : "River AI could not respond. 🐰",
      provider: "river",
      riverleri: denemeler,
    };
  }

  /* ── 2) Yedek sağlayıcılar ────────────────────────────────── */
  const order = YEDEKLER.map((_, i) => YEDEKLER[(startIndex + i) % YEDEKLER.length]);
  let lastErr = null, lastStatus = 0, tried = [];

  for (const p of order) {
    const key = process.env[p.key];
    if (!key) continue;
    tried.push(p.name);
    try {
      let r;
      if (p.type === "gemini") r = await callGemini(p, systemPrompt, soru, key, ayar);
      else if (p.models) r = await callCokluModel(p, systemPrompt, soru, key, ayar);
      else r = await callOpenAI(p, systemPrompt, soru, key, ayar);

      if (r.ok) {
        startIndex = (YEDEKLER.indexOf(p) + 1) % YEDEKLER.length;
        return { success: true, cevap: r.cevap, provider: p.name + (r.model ? `/${r.model}` : ""), json: null };
      }
      lastErr = r.error;
      lastStatus = r.status;
      denemeler.push({ provider: p.name, status: r.status, error: r.error });
      console.warn(`[AI:${p.name}] hata ${r.status}: ${r.error}`);
    } catch (e) {
      lastErr = e.message;
      lastStatus = 0;
      denemeler.push({ provider: p.name, status: 0, error: e.message });
      console.warn(`[AI:${p.name}] istek hatası:`, e.message);
    }
  }

  startIndex = 0;
  const msg = !tried.length
    ? (isTr ? "AI servisleri yapılandırılmamış (API key yok)." : "AI services not configured (no API key).")
    : (isTr ? "Şu an yanıt veremiyorum, lütfen birazdan tekrar dene. 🐰" : "An error occurred, try again later. 🐰");

  return { success: false, error: msg, statusCode: lastStatus, groqError: lastErr, riverleri: denemeler };
}

/** Teşhis: hangi sağlayıcılar ayarlı + River canlı model listesi. */
async function tanila() {
  const r = await river.modelleriGetir();
  return {
    river: { ...river.durum(), canliModeller: r.ok ? r.modeller : null, canliHata: r.ok ? null : r.error, canliStatus: r.status },
    yedekler: YEDEKLER.map(p => ({ ad: p.name, anahtar: process.env[p.key] ? "var" : "yok" })),
  };
}

module.exports = {
  chainAsk,
  tanila,
  river,
  PROVIDERS: YEDEKLER,
  RIVER_DENEME,
};
