/*! migrate-to-firestore.js — Mevcut bot verisini Firestore `kv` koleksiyonuna taşır.
 *
 * Kullanım:
 *   node migrate-to-firestore.js [yedek.json]
 *
 * Kaynaklar (ikisi de okunur, TAM YEDEK ÖNCELİKLİ):
 *   1) Tam yedek JSON (varsayılan: ./risebunny-yedek*.json ya da argümanla verilen yol)
 *      → { __risebunny:{...}, data:{ key:value, ... } }
 *   2) Yerel croxydb: ./croxydb/croxydb.json  → { key:value, ... }
 *
 * Kimlik (bot ile aynı): FIREBASE_SERVICE_ACCOUNT | FIREBASE_SERVICE_ACCOUNT_PATH |
 *   GOOGLE_APPLICATION_CREDENTIALS (+ FIREBASE_PROJECT_ID opsiyonel).
 *
 * Çalıştırma örn (Windows):
 *   set FIREBASE_SERVICE_ACCOUNT_PATH=C:\path\to\serviceAccount.json
 *   node migrate-to-firestore.js "C:\Users\enesi\Downloads\risebunny-tam-yedek-1791990267250.json"
 */
'use strict';

require("dotenv").config();

const fs = require('fs');
const path = require('path');

const COLLECTION = 'kv';
const BATCH = 450;

function loadServiceAccount() {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    try { return JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT); } catch (e) { console.warn('FIREBASE_SERVICE_ACCOUNT parse hatası:', e.message); }
  }
  const p = process.env.FIREBASE_SERVICE_ACCOUNT_PATH || process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (p) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (e) { console.warn('Service account okunamadı:', e.message); }
  }
  return null;
}

function readJson(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch { return null; }
}

function encKey(k) { return String(k).replace(/\//g, '%2F'); }
function normalize(v) { try { const o = JSON.parse(JSON.stringify(v)); return o === undefined ? null : o; } catch { return null; } }

async function main() {
  const backupArg = process.argv[2];

  // 1) Tam yedek
  let backup = {};
  const backupPath = backupArg || findBackup();
  if (backupPath) {
    const j = readJson(backupPath);
    if (j && j.data && typeof j.data === 'object') {
      backup = j.data;
      console.log(`[Migrate] Tam yedek okundu: ${backupPath} (${Object.keys(backup).length} kayıt)`);
    } else {
      console.warn(`[Migrate] Yedek formatı beklenmedik: ${backupPath}`);
    }
  } else {
    console.warn('[Migrate] Tam yedek bulunamadı (argümanla yol ver).');
  }

  // 2) Yerel croxydb
  let local = {};
  const localPath = path.join(__dirname, 'croxydb', 'croxydb.json');
  const lj = readJson(localPath);
  if (lj && typeof lj === 'object') {
    local = lj;
    console.log(`[Migrate] Yerel croxydb okundu: ${localPath} (${Object.keys(local).length} kayıt)`);
  }

  // Birleştir — tam yedek ÖNCELİKLİ (üzerine yazar)
  const merged = Object.assign({}, local, backup);
  const keys = Object.keys(merged);
  console.log(`[Migrate] Birleşik toplam: ${keys.length} anahtar.`);

  if (!keys.length) { console.error('[Migrate] Taşınacak veri yok. Çıkılıyor.'); process.exit(1); }

  // Firebase Admin
  let admin;
  try { admin = require('firebase-admin'); }
  catch { console.error('[Migrate] firebase-admin kurulu değil. Önce: npm i firebase-admin'); process.exit(1); }

  const sa = loadServiceAccount();
  if (!admin.apps.length) {
    if (sa && sa.project_id) admin.initializeApp({ credential: admin.credential.cert(sa), projectId: sa.project_id });
    else if (process.env.FIREBASE_PROJECT_ID) admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
    else { console.error('[Migrate] Firebase kimliği yok. FIREBASE_SERVICE_ACCOUNT_PATH ayarla.'); process.exit(1); }
  }
  const db = admin.firestore();
  try { db.settings({ ignoreUndefinedProperties: true }); } catch {}

  // Batch yaz
  let done = 0;
  for (let i = 0; i < keys.length; i += BATCH) {
    const chunk = keys.slice(i, i + BATCH);
    const batch = db.batch();
    for (const k of chunk) {
      const ref = db.collection(COLLECTION).doc(encKey(k));
      batch.set(ref, { v: normalize(merged[k]), at: Date.now() });
    }
    await batch.commit();
    done += chunk.length;
    process.stdout.write(`\r[Migrate] Yazıldı: ${done}/${keys.length}`);
  }
  console.log(`\n[Migrate] ✓ Tamamlandı. ${done} kayıt ${COLLECTION} koleksiyonuna taşındı.`);
  process.exit(0);
}

function findBackup() {
  // ./ içinde ve Downloads'ta yedek ara
  const candidates = [];
  try {
    for (const f of fs.readdirSync(__dirname)) {
      if (/yedek|backup/i.test(f) && f.endsWith('.json')) candidates.push(path.join(__dirname, f));
    }
  } catch {}
  const dl = path.join(process.env.USERPROFILE || '', 'Downloads');
  try {
    for (const f of fs.readdirSync(dl)) {
      if (/risebunny.*yedek|risebunny.*backup/i.test(f) && f.endsWith('.json')) candidates.push(path.join(dl, f));
    }
  } catch {}
  return candidates[0] || null;
}

main().catch(e => { console.error('[Migrate] HATA:', e.message); process.exit(1); });
