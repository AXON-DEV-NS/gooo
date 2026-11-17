import localBundledSurahs from 'virtual:local-quran';

const DB_NAME = 'jawoo_quran_db';
const DB_VERSION = 1;
const STORE_NAME = 'surahs';

const PRIMARY_SERVER = 'https://cdn.mp3quran.net/audio/mahmoud-husary/r2';
const FALLBACK_SERVERS = [
  'https://archive.org/download/ShaykhMahmoudKhalilAl-husaryMujawwad',
  'https://download.quranicaudio.com/quran/mahmood_khaleel_al-husaree_iza3a',
];

export function padSurahCode(num) {
  return String(Math.max(1, Math.min(114, Math.trunc(Number(num) || 1)))).padStart(3, '0');
}

export function getLocalBundledSurahSet() {
  return new Set(Array.isArray(localBundledSurahs) ? localBundledSurahs : []);
}

export function getSurahSourceUrls(surahNumber) {
  const code = padSurahCode(surahNumber);
  const localSet = getLocalBundledSurahSet();
  const urls = [];
  if (localSet.has(Number(surahNumber))) {
    urls.push(`./quran/husary-mujawwad/${code}.mp3`);
  }
  urls.push(`${PRIMARY_SERVER}/${code}.mp3`);
  for (const base of FALLBACK_SERVERS) {
    urls.push(`${base}/${code}.mp3`);
  }
  return urls;
}

export function isIndexedDbAvailable() {
  return typeof globalThis.indexedDB !== 'undefined';
}

function openQuranDb() {
  return new Promise((resolve, reject) => {
    if (!isIndexedDbAvailable()) {
      reject(new Error('IndexedDB غير مدعوم في هذا المتصفح'));
      return;
    }
    const req = globalThis.indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'surahNumber' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('تعذر فتح قاعدة بيانات القرآن المحلية'));
  });
}

export async function listDownloadedSurahsMeta() {
  if (!isIndexedDbAvailable()) {
    return { map: {}, count: 0, totalBytes: 0, supported: false };
  }
  let db;
  try {
    db = await openQuranDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.openCursor();
      const map = {};
      let totalBytes = 0;
      let count = 0;

      req.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          const val = cursor.value;
          const sizeBytes = Number(val?.sizeBytes || val?.blob?.size || 0);
          map[val.surahNumber] = {
            surahNumber: val.surahNumber,
            sizeBytes,
            downloadedAt: val.downloadedAt,
            source: val.source || 'IndexedDB',
          };
          totalBytes += sizeBytes;
          count += 1;
          cursor.continue();
        } else {
          resolve({ map, count, totalBytes, supported: true });
        }
      };
      req.onerror = () => reject(req.error);
    });
  } catch {
    return { map: {}, count: 0, totalBytes: 0, supported: false };
  } finally {
    db?.close();
  }
}

export async function getDownloadedSurahBlob(surahNumber) {
  if (!isIndexedDbAvailable()) return null;
  let db;
  try {
    db = await openQuranDb();
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const store = tx.objectStore(STORE_NAME);
      const req = store.get(Number(surahNumber));
      req.onsuccess = () => resolve(req.result?.blob || null);
      req.onerror = () => reject(req.error);
    });
  } catch {
    return null;
  } finally {
    db?.close();
  }
}

async function saveDownloadedSurahBlob(surahNumber, blob, source) {
  const db = await openQuranDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.put({
        surahNumber: Number(surahNumber),
        blob,
        sizeBytes: blob.size,
        downloadedAt: new Date().toISOString(),
        source,
      });
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function deleteDownloadedSurah(surahNumber) {
  if (!isIndexedDbAvailable()) return false;
  const db = await openQuranDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.delete(Number(surahNumber));
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function clearAllDownloadedSurahs() {
  if (!isIndexedDbAvailable()) return false;
  const db = await openQuranDb();
  try {
    return await new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      const store = tx.objectStore(STORE_NAME);
      const req = store.clear();
      req.onsuccess = () => resolve(true);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function estimateStorageSpace() {
  try {
    if (globalThis.navigator?.storage?.estimate) {
      const est = await globalThis.navigator.storage.estimate();
      const quota = Number(est.quota || 0);
      const usage = Number(est.usage || 0);
      return {
        supported: true,
        quotaBytes: quota,
        usageBytes: usage,
        freeBytes: Math.max(0, quota - usage),
      };
    }
  } catch {
    // يسقط للبديل غير المتاح
  }
  return { supported: false, quotaBytes: 0, usageBytes: 0, freeBytes: Infinity };
}

export function formatBytesAr(bytes) {
  const b = Number(bytes || 0);
  if (b < 1024 * 1024) return `${Math.max(0, Math.round(b / 1024))} ك.ب`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} م.ب`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} ج.ب`;
}

async function fetchSurahAudioBlob(surahNumber, signal) {
  const code = padSurahCode(surahNumber);
  const candidates = [`${PRIMARY_SERVER}/${code}.mp3`, ...FALLBACK_SERVERS.map((b) => `${b}/${code}.mp3`)];

  let lastErr = null;
  for (const url of candidates) {
    try {
      const res = await fetch(url, { signal, mode: 'cors' });
      if (!res.ok) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      const contentType = String(res.headers?.get?.('content-type') || '').toLowerCase();
      if (contentType.includes('text/html') || contentType.includes('application/json')) {
        lastErr = new Error('استجابة غير صوتية من الخادم');
        continue;
      }
      const blob = await res.blob();
      if (!blob || blob.size < 1024) {
        lastErr = new Error('حجم ملف الصوت غير صالح');
        continue;
      }
      return { blob, source: url };
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      lastErr = err;
    }
  }
  throw lastErr || new Error('تعذر تحميل السورة من جميع المصادر');
}

export async function downloadSurahsBatch(surahNumbers, { onProgress, signal } = {}) {
  if (!isIndexedDbAvailable()) {
    throw new Error('التخزين الداخلي (IndexedDB) غير مدعوم في متصفح هذا التلفاز.');
  }

  const list = Array.from(new Set(surahNumbers.map(Number).filter((n) => n >= 1 && n <= 114)));
  if (list.length === 0) return { completed: 0, errors: 0, bytesDownloaded: 0 };

  // فحص المساحة المتاحة قبل بدء التحميل الكثيف
  const space = await estimateStorageSpace();
  const minRequiredMb = list.length >= 100 ? 600 : Math.min(200, list.length * 4);
  if (space.supported && space.freeBytes < minRequiredMb * 1024 * 1024) {
    throw new Error(
      `المساحة المتاحة في المتصفح (${formatBytesAr(space.freeBytes)}) غير كافية لتحميل ${list.length} سورة بأمان.`
    );
  }

  const existing = await listDownloadedSurahsMeta();
  let completed = 0;
  let errors = 0;
  let bytesDownloaded = 0;

  for (const surahNum of list) {
    if (signal?.aborted) break;
    if (existing.map[surahNum]) {
      completed += 1;
      onProgress?.({ active: true, completed, total: list.length, currentSurah: surahNum, bytesDownloaded, errors });
      continue;
    }
    onProgress?.({ active: true, completed, total: list.length, currentSurah: surahNum, bytesDownloaded, errors });
    try {
      const { blob, source } = await fetchSurahAudioBlob(surahNum, signal);
      await saveDownloadedSurahBlob(surahNum, blob, source);
      bytesDownloaded += blob.size;
      completed += 1;
    } catch (err) {
      if (err?.name === 'AbortError') throw err;
      if (err?.name === 'QuotaExceededError') {
        throw new Error('امتلاء مساحة التخزين الداخلي في التلفاز (QuotaExceededError).');
      }
      errors += 1;
    }
    onProgress?.({ active: true, completed, total: list.length, currentSurah: surahNum, bytesDownloaded, errors });
  }

  return { completed, errors, bytesDownloaded };
}
