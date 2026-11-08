/*! firestore-db.js — croxydb uyumlu, Firestore (Admin SDK) destekli drop-in veritabanı.
 *
 * Neden var: Botun 120+ dosyası `require("croxydb")` çağırıp senkron API
 * kullanıyor (fetch/get/set/add/subtract/delete/all/has). Node'da require.cache
 * üzerinden croxydb'yi bu modülle değiştiriyoruz; böylece HİÇBİR komut dosyası
 * değişmeden tüm veri Firestore'a taşınır.
 *
 * Çalışma modeli:
 *   - Başlangıçta yerel `croxydb/croxydb.json` senkron okunur (anında okunabilir cache).
 *   - Arka planda Firestore `kv` koleksiyonundaki tüm dokümanlar çekilip cache'e
 *     merge edilir (Firestore kazanır; yeni yerel yazımlar korunur).
 *   - Tüm yazımlar: cache'e senkron yazılır + Firestore'a async kuyrukla (batch) gider
 *     + yerel JSON'a debounce ile yedeklenir.
 *   - Firebase kimliği yoksa bot yine çalışır (sadece yerel JSON modu).
 *
 * env değişkenleri (herhangi biri yeterli):
 *   FIREBASE_SERVICE_ACCOUNT        → service account JSON'u tek satır string olarak
 *   FIREBASE_SERVICE_ACCOUNT_PATH   → service account JSON dosya yolu
 *   GOOGLE_APPLICATION_CREDENTIALS  → service account JSON dosya yolu (ADC)
 *   FIREBASE_PROJECT_ID             → opsiyonel (JSON'dan da okunur)
 */
'use strict';

const fs = require('fs');
const path = require('path');

const COLLECTION = 'kv';
const LOCAL_DB = path.join(__dirname, 'croxydb', 'croxydb.json');
const FLUSH_MS = 1200;
const LOCAL_SAVE_MS = 3000;

let cache = {};
let adminDb = null;
let ready = false;
let hydrating = false;
const writeQueue = new Map();  // key -> value  (yazılacak)
const deleteQueue = new Set(); // key          (silinecek)
let flushTimer = null;
let localTimer = null;

/* ── yardımcılar ─────────────────────────────────────────────── */
function clone(v) {
  try { return JSON.parse(JSON.stringify(v)); } catch { return v; }
}

/* Firestore doküman ID'si '/' içeremez. Anahtarlarımızda yok ama yine de kaçış. */
function encKey(k) { return String(k).replace(/\//g, '%2F'); }
function decKey(id) { return String(id).replace(/%2F/g, '/'); }

/* JSON'a çevrilemeyen değerleri (undefined, function, NaN, Infinity) temizle. */
function normalize(v) {
  let out;
  try { out = JSON.parse(JSON.stringify(v)); } catch { out = null; }
  return out === undefined ? null : out;
}

/* ── yerel JSON okuma/yazma ──────────────────────────────────── */
function loadLocal() {
  try {
    const raw = fs.readFileSync(LOCAL_DB, 'utf8');
    const j = JSON.parse(raw);
    if (j && typeof j === 'object' && !Array.isArray(j)) return j;
  } catch { /* dosya yok ya da bozuk → boş cache */ }
  return {};
}

function scheduleLocalSave() {
  if (localTimer) return;
  localTimer = setTimeout(() => {
    localTimer = null;
    try {
      fs.mkdirSync(path.dirname(LOCAL_DB), { recursive: true });
      fs.writeFileSync(LOCAL_DB + '.tmp', JSON.stringify(cache, null, 2));
      fs.renameSync(LOCAL_DB + '.tmp', LOCAL_DB);
    } catch (e) { console.warn('[FDB] yerel yedek yazılamadı:', e.message); }
  }, LOCAL_SAVE_MS);
  if (localTimer.unref) localTimer.unref();
}

/* ── Firebase Admin başlatma ─────────────────────────────────── */
function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); }
    catch (e) { console.warn('[FDB] FIREBASE_SERVICE_ACCOUNT JSON parse hatası:', e.message); }
  }
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); }
    catch (e) { console.warn('[FDB] service account dosyası okunamadı (' + p + '):', e.message); }
  }
  /* env yoksa klasördeki bilinen adları otomatik dene (yerel çalıştırmada sıfır config) */
  const adaylar = ['firebase-service-account.json', 'service-account.json', 'serviceAccountKey.json', 'config/serviceAccountKey.json'];
  for (const a of adaylar) {
    const fp = path.join(__dirname, a);
    try { if (fs.existsSync(fp)) { console.log('[FDB] service account otomatik bulundu:', a); return JSON.parse(fs.readFileSync(fp, 'utf8')); } } catch {}
  }
  return null;
}

function initFirebase() {
  let admin;
  try { admin = require('firebase-admin'); }
  catch { console.warn('[FDB] firebase-admin kurulu değil → yerel JSON modu. (npm i firebase-admin)'); return null; }

  const sa = loadServiceAccount();
  try {
    if (!admin.apps.length) {
      if (sa && sa.project_id) {
        admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
      } else if (process.env.FIREBASE_PROJECT_ID) {
        // Uygulama Varsayılan Kimliği (ADC) — FIREBASE_SERVICE_ACCOUNT_PATH/GOOGLE_APPLICATION_CREDENTIALS ile
        admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
      } else {
        console.warn('[FDB] Firebase kimliği yok (FIREBASE_SERVICE_ACCOUNT / _PATH / GOOGLE_APPLICATION_CREDENTIALS) → yerel JSON modu.');
        return null;
      }
    }
    const db = admin.firestore();
    try { db.settings({ ignoreUndefinedProperties: true }); } catch {}
    return db;
  } catch (e) {
    console.warn('[FDB] Admin başlatılamadı:', e.message);
    return null;
  }
}

/* ── Firestore'dan tüm veriyi çek & cache'e merge et ─────────── */
async function hydrate() {
  if (!adminDb || hydrating) return;
  hydrating = true;
  try {
    const snap = await adminDb.collection(COLLECTION).get();
    let n = 0;
    snap.forEach(doc => {
      const key = decKey(doc.id);
      // Yerel olarak yeni değiştirilen anahtarları EZME.
      if (writeQueue.has(key) || deleteQueue.has(key)) return;
      cache[key] = doc.data().v;
      n++;
    });
    ready = true;
    console.log(`[FDB] Firestore hidrasyon ✓ (${n} kayıt, ${COLLECTION}/).`);
  } catch (e) {
    console.warn('[FDB] hidrasyon hatası (yerel cache ile devam):', e.message);
  } finally {
    hydrating = false;
  }
}

/* ── yazım kuyruğunu Firestore'a boşalt ──────────────────────── */
function scheduleFlush() {
  if (flushTimer || !adminDb) return;
  flushTimer = setTimeout(() => { flushTimer = null; flush().catch(() => {}); }, FLUSH_MS);
  if (flushTimer.unref) flushTimer.unref();
}

async function flush() {
  if (!adminDb) return;
  if (!writeQueue.size && !deleteQueue.size) return;

  const writes = Array.from(writeQueue.entries());
  const deletes = Array.from(deleteQueue);
  writeQueue.clear();
  deleteQueue.clear();

  // Firestore batch limiti 500 → 450'lik parçalara böl.
  const ops = [
    ...writes.map(([k, v]) => ({ type: 'set', k, v })),
    ...deletes.map(k => ({ type: 'del', k }))
  ];
  for (let i = 0; i < ops.length; i += 450) {
    const chunk = ops.slice(i, i + 450);
    try {
      const batch = adminDb.batch();
      for (const op of chunk) {
        const ref = adminDb.collection(COLLECTION).doc(encKey(op.k));
        if (op.type === 'set') batch.set(ref, { v: normalize(op.v), at: Date.now() });
        else batch.delete(ref);
      }
      await batch.commit();
    } catch (e) {
      console.warn('[FDB] batch yazılamadı, tekrar kuyruğa alınıyor:', e.message);
      // Kaybetmemek için geri koy.
      for (const op of chunk) {
        if (op.type === 'set') writeQueue.set(op.k, op.v);
        else deleteQueue.add(op.k);
      }
      // Sonsuz hızlı döngüyü önle.
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

/* ── croxydb uyumlu API ──────────────────────────────────────── */
function get(key) { return cache[key]; }
function set(key, value) {
  cache[key] = value;
  writeQueue.set(key, value);
  deleteQueue.delete(key);
  scheduleLocalSave();
  scheduleFlush();
  return value;
}
function has(key) { return Object.prototype.hasOwnProperty.call(cache, key); }
function del(key) {
  delete cache[key];
  deleteQueue.add(key);
  writeQueue.delete(key);
  scheduleLocalSave();
  scheduleFlush();
  return true;
}
function add(key, n) {
  const cur = Number(cache[key]) || 0;
  return set(key, cur + Number(n));
}
function subtract(key, n) { return add(key, -Number(n)); }
function all() { return cache; }
function push(key, value) {
  const arr = Array.isArray(cache[key]) ? cache[key] : [];
  arr.push(value);
  return set(key, arr);
}
function pull(key, value) {
  const arr = Array.isArray(cache[key]) ? cache[key] : [];
  return set(key, arr.filter(x => x !== value));
}
function ensure(key, value) { return has(key) ? cache[key] : set(key, value); }

/* ── kurulum: require.cache'e enjekte et ─────────────────────── */
function install() {
  const shim = module.exports;
  for (const name of ['croxydb', 'quick.db']) {
    try {
      const p = require.resolve(name);
      require.cache[p] = { id: p, filename: p, loaded: true, exports: shim };
    } catch { /* paket yoksa sorun değil */ }
  }
  return shim;
}

/* ── başlat ──────────────────────────────────────────────────── */
cache = loadLocal();
adminDb = initFirebase();
if (adminDb) {
  hydrate().catch(() => {});
} else {
  ready = true;
}

module.exports = {
  install,
  fetch: get, get, set, has, delete: del, del, add, subtract, sub: subtract,
  all, push, pull, ensure,
  // croxydb uyumluluk alanları (bazı dosyalar okuyabilir)
  allKeys: () => Object.keys(cache),
  isReady: () => ready,
  _firestore: () => adminDb,
  CroxyDB: function CroxyDB() { return module.exports; }
};
