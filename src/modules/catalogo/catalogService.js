/**
 * Servicio para la descarga, indexación por lotes en IndexedDB, caché en memoria y búsqueda rápida del catálogo central de productos.
 */

import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch } from 'firebase/firestore';
import { db } from '../../config/firebase';
import * as XLSX from 'xlsx';

const DB_NAME = 'ERP_Catalog_DB';
const DB_VERSION = 1;
const STORE_BASE = 'catalogo_base_local';
const STORE_CLEAN = 'catalogo_limpio_local';

const DEFAULT_FILE_ID = '1BKAflq-3XwRVvRngQXxYXpSRBDPbcQom';
const STORAGE_KEY_FILE_ID = 'erp_catalog_file_id';
const STORAGE_KEY_SYNCED_ID = 'erp_catalog_synced_id';
const STORAGE_KEY_LAST_SYNC = 'erp_catalog_last_sync_date';
const STORAGE_KEY_TOTAL_RECORDS = 'erp_catalog_total_records';
const STORAGE_KEY_LAST_SIZE = 'erp_catalog_last_size';
const STORAGE_KEY_LAST_MODIFIED = 'erp_catalog_last_modified';
const STORAGE_KEY_LAST_UPLOAD_ID = 'erp_catalog_last_upload_id';
const STORAGE_KEY_LAST_FINGERPRINT = 'erp_catalog_last_fingerprint';
const STORAGE_KEY_EXCEL_ROWS = 'erp_catalog_excel_rows';
const STORAGE_KEY_DUPLICATES = 'erp_catalog_duplicates_count';
const STORAGE_KEY_CODE_VERSION = 'erp_catalog_code_version';
const CURRENT_CODE_VERSION = 'v5_cors_safe_fingerprint';

let memoryCache = null;

function bytesToHex(arr) {
  let hex = '';
  for (let i = 0; i < arr.length; i++) {
    hex += arr[i].toString(16).padStart(2, '0');
  }
  return hex;
}

function parseZipDateTime(bytes) {
  if (!bytes || bytes.length < 14) return null;
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B || bytes[2] !== 0x03 || bytes[3] !== 0x04) {
    return null;
  }
  const time = bytes[10] | (bytes[11] << 8);
  const date = bytes[12] | (bytes[13] << 8);

  const hours = (time >> 11) & 0x1F;
  const minutes = (time >> 5) & 0x3F;
  const seconds = (time & 0x1F) * 2;

  const year = ((date >> 9) & 0x7F) + 1980;
  const month = (date >> 5) & 0x0F;
  const day = date & 0x1F;

  if (year < 1980 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  return new Date(year, month - 1, day, hours, minutes, seconds);
}

function normalizeBarcode(raw) {
  if (raw === undefined || raw === null) return '';
  return String(raw).trim().replace(/\s+/g, '').replace(/\//g, '-');
}

function openDB() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e) => {
      const database = e.target.result;
      if (!database.objectStoreNames.contains(STORE_BASE)) {
        database.createObjectStore(STORE_BASE, { keyPath: 'codigo' });
      }
      if (!database.objectStoreNames.contains(STORE_CLEAN)) {
        database.createObjectStore(STORE_CLEAN, { keyPath: 'codigo' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function getLocalItem(storeName, key) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function getAllLocalItems(storeName) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

async function getLocalCount(storeName) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.count();
    request.onsuccess = () => resolve(request.result || 0);
    request.onerror = () => reject(request.error);
  });
}

async function saveLocalBatch(storeName, items) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readwrite');
    const store = tx.objectStore(storeName);
    items.forEach(item => store.put(item));
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function clearAndSaveBaseCatalog(items, onProgress) {
  const database = await openDB();

  await new Promise((resolve, reject) => {
    const tx = database.transaction(STORE_BASE, 'readwrite');
    const store = tx.objectStore(STORE_BASE);
    const req = store.clear();
    req.onsuccess = () => resolve();
    req.onerror = () => reject(req.error);
  });

  const BATCH_SIZE = 1000;
  const totalBatches = Math.ceil(items.length / BATCH_SIZE);

  for (let i = 0; i < items.length; i += BATCH_SIZE) {
    const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
    const chunk = items.slice(i, i + BATCH_SIZE);

    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_BASE, 'readwrite');
      const store = tx.objectStore(STORE_BASE);
      chunk.forEach(item => store.put(item));
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });

    const percent = Math.min(98, 70 + Math.round((currentBatch / totalBatches) * 28));
    if (onProgress) {
      onProgress({
        phase: 'saving',
        percent,
        currentBatch,
        totalBatches,
        totalRecords: items.length,
        message: `Guardando registros en memoria local: Lote ${currentBatch} de ${totalBatches}...`
      });
    }

    await new Promise(r => setTimeout(r, 10));
  }
}

async function purgeStaleCleanItem() {
  try {
    const database = await openDB();
    const tx = database.transaction(STORE_CLEAN, 'readwrite');
    const store = tx.objectStore(STORE_CLEAN);
    const req = store.get('1');
    req.onsuccess = () => {
      const item = req.result;
      if (item && item.descripcion && item.descripcion.includes('ATOMIZADOR')) {
        store.delete('1');
      }
    };
  } catch (_e) {}
}

export const catalogService = {
  getCatalogFileId() {
    return localStorage.getItem(STORAGE_KEY_FILE_ID) || DEFAULT_FILE_ID;
  },

  setCatalogFileId(newId) {
    if (!newId) return;
    const cleanId = newId.trim();
    localStorage.setItem(STORAGE_KEY_FILE_ID, cleanId);
    memoryCache = null;
  },

  getDownloadUrl() {
    const fileId = this.getCatalogFileId();

    if (fileId.startsWith('http://') || fileId.startsWith('https://')) {
      return fileId;
    }

    if (fileId.startsWith('2PACX-')) {
      return `https://docs.google.com/spreadsheets/d/e/${fileId}/pub?output=xlsx`;
    }

    return `https://docs.google.com/spreadsheets/d/${fileId}/export?format=xlsx`;
  },

  getMetadataUrl() {
    return this.getDownloadUrl();
  },

  getFallbackUrls() {
    const fileId = this.getCatalogFileId();
    if (fileId.startsWith('http://') || fileId.startsWith('https://') || fileId.startsWith('2PACX-')) {
      return [];
    }
    return [
      `https://docs.google.com/spreadsheets/d/e/${fileId}/pub?output=xlsx`
    ];
  },

  async getCatalogStatus() {
    let cleanCount = 0;
    try {
      const snap = await getDocs(collection(db, 'catalogo_limpio'));
      const firestoreItems = snap.docs
        .map(d => ({ codigo: d.id, ...d.data() }))
        .filter(it => it && it.codigo);
      cleanCount = firestoreItems.length;

      const database = await openDB();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_CLEAN, 'readwrite');
        const store = tx.objectStore(STORE_CLEAN);
        const clearReq = store.clear();
        clearReq.onsuccess = () => {
          firestoreItems.forEach(item => store.put(item));
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (_e) {
      cleanCount = await getLocalCount(STORE_CLEAN);
    }

    const localCount = await getLocalCount(STORE_BASE);
    const lastSync = localStorage.getItem(STORAGE_KEY_LAST_SYNC) || null;
    const lastModified = localStorage.getItem(STORAGE_KEY_LAST_MODIFIED) || null;
    const fileId = this.getCatalogFileId();
    const totalExcelRows = parseInt(localStorage.getItem(STORAGE_KEY_EXCEL_ROWS) || '0', 10);
    const duplicateCount = parseInt(localStorage.getItem(STORAGE_KEY_DUPLICATES) || '0', 10);

    return {
      localCount,
      cleanCount,
      totalCount: localCount,
      lastSync,
      lastModified,
      fileId,
      totalExcelRows,
      duplicateCount
    };
  },

  async getLocalBaseCount() {
    return await getLocalCount(STORE_BASE);
  },

  subscribeCatalogVersion(callback) {
    try {
      return onSnapshot(doc(db, 'catalogo_meta', 'version'), (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.data());
        }
      }, (err) => {
        console.warn('Error escuchando versión central del catálogo:', err);
      });
    } catch (e) {
      console.warn('Error iniciando suscripción de versión:', e);
      return () => {};
    }
  },

  async checkServerCatalogVersion() {
    try {
      const localCount = await getLocalCount(STORE_BASE);
      const currentConfiguredId = this.getCatalogFileId();
      const lastSyncedId = localStorage.getItem(STORAGE_KEY_SYNCED_ID);
      const lastFingerprint = localStorage.getItem(STORAGE_KEY_LAST_FINGERPRINT);
      const lastModified = localStorage.getItem(STORAGE_KEY_LAST_MODIFIED);
      const codeVersion = localStorage.getItem(STORAGE_KEY_CODE_VERSION);

      if (localCount === 0 || currentConfiguredId !== lastSyncedId || codeVersion !== CURRENT_CODE_VERSION) {
        return {
          upToDate: false,
          reason: codeVersion !== CURRENT_CODE_VERSION ? 'version_upgrade' : 'empty_or_new_id',
          localCount
        };
      }

      const checkUrl = this.getDownloadUrl();
      let response = null;

      try {
        response = await fetch(checkUrl, { cache: 'no-store' });
      } catch (_err) {
        return { upToDate: true, error: _err.message, offline: true, localCount };
      }

      if (response && response.ok) {
        let currentFingerprint = '';
        let currentModifiedDate = null;

        if (response.body && typeof response.body.getReader === 'function') {
          const reader = response.body.getReader();
          try {
            const { value } = await reader.read();
            if (value && value.length >= 26) {
              currentFingerprint = bytesToHex(value.slice(0, 32));
              currentModifiedDate = parseZipDateTime(value);
            }
          } finally {
            await reader.cancel();
          }
        }

        if (currentFingerprint) {
          const serverIso = currentModifiedDate ? currentModifiedDate.toISOString() : null;

          if (serverIso && lastModified && serverIso !== lastModified) {
            return {
              upToDate: false,
              reason: 'file_version_modified',
              localCount,
              currentModified: serverIso,
              lastModified
            };
          }

          if (lastFingerprint && currentFingerprint !== lastFingerprint) {
            return {
              upToDate: false,
              reason: 'file_fingerprint_changed',
              localCount,
              currentFingerprint,
              lastFingerprint,
              currentModified: serverIso
            };
          }

          if (!lastFingerprint || !lastModified) {
            return {
              upToDate: false,
              reason: 'missing_baseline',
              localCount,
              currentModified: serverIso
            };
          }
        }
      }

      return {
        upToDate: true,
        localCount,
        reason: 'up_to_date'
      };
    } catch (error) {
      const localCount = await getLocalCount(STORE_BASE);
      return { upToDate: true, error: error.message, offline: true, localCount };
    }
  },

  async syncCatalogFromServer(onProgress) {
    memoryCache = null; 

    if (onProgress) {
      onProgress({
        phase: 'connecting',
        percent: 5,
        message: 'Conectando con el Servidor Central...'
      });
    }

    const primaryUrl = this.getDownloadUrl();
    const fallbacks = this.getFallbackUrls();
    const allUrls = [primaryUrl, ...fallbacks];

    let response = null;
    let usedUrl = '';

    for (const url of allUrls) {
      try {
        if (onProgress) {
          onProgress({
            phase: 'downloading',
            percent: 15,
            message: 'Descargando catálogo actualizado desde el Servidor Central...'
          });
        }
        const res = await fetch(url, { method: 'GET' });
        if (res.ok) {
          response = res;
          usedUrl = url;
          break;
        }
      } catch (e) {
        console.warn(`Intento de descarga falló con ${url}:`, e);
      }
    }

    if (!response || !response.ok) {
      throw new Error(`No se pudo descargar el archivo del Servidor Central (${response?.status || 'Error de red'})`);
    }

    const serverContentLength = response.headers.get('content-length') || '';
    const totalBytes = serverContentLength ? parseInt(serverContentLength, 10) : 0;

    let arrayBuffer;

    if (response.body && typeof response.body.getReader === 'function') {
      const reader = response.body.getReader();
      const chunks = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;

        const downloadPercent = totalBytes > 0
          ? Math.min(60, 15 + Math.round((receivedBytes / totalBytes) * 45))
          : Math.min(60, 15 + Math.round((receivedBytes / 4800000) * 45));

        if (onProgress) {
          const mbReceived = (receivedBytes / (1024 * 1024)).toFixed(1);
          const totalText = totalBytes > 0 ? ` / ${(totalBytes / (1024 * 1024)).toFixed(1)} MB` : '';
          onProgress({
            phase: 'downloading',
            percent: downloadPercent,
            message: `Descargando catálogo actualizado (${mbReceived} MB${totalText})...`
          });
        }
      }

      const combined = new Uint8Array(receivedBytes);
      let offset = 0;
      for (const chunk of chunks) {
        combined.set(chunk, offset);
        offset += chunk.length;
      }
      arrayBuffer = combined.buffer;
    } else {
      arrayBuffer = await response.arrayBuffer();
    }

    const headerBytes = new Uint8Array(arrayBuffer.slice(0, 32));
    const finalFingerprint = bytesToHex(headerBytes);
    const finalModifiedDate = parseZipDateTime(headerBytes);
    const finalModifiedIso = finalModifiedDate ? finalModifiedDate.toISOString() : new Date().toISOString();

    if (onProgress) {
      onProgress({
        phase: 'parsing',
        percent: 65,
        message: 'Estructurando y optimizando registros del catálogo...'
      });
    }

    await new Promise(r => setTimeout(r, 60));

    const workbook = XLSX.read(arrayBuffer, { type: 'array' });
    const firstSheetName = workbook.SheetNames[0];
    const worksheet = workbook.Sheets[firstSheetName];
    const rawRows = XLSX.utils.sheet_to_json(worksheet, { header: 1 });

    const validItems = [];
    const seenCodes = new Set();
    let duplicateCount = 0;

    const startRow = (rawRows[0] && typeof rawRows[0][0] === 'string' && /c[oó]digo/i.test(rawRows[0][0])) ? 1 : 0;
    const totalExcelDataRows = Math.max(0, rawRows.length - startRow);

    for (let i = startRow; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawCode = row[0];
      const rawDesc = row[1];
      if (rawCode === undefined || rawCode === null || !rawDesc) continue;

      const cellAddress = XLSX.utils.encode_cell({ c: 0, r: i });
      const cell = worksheet ? worksheet[cellAddress] : null;

      let codeStr = '';
      if (cell) {
        if (cell.t === 's') {
          codeStr = String(cell.v ?? '');
        } else if (cell.w && !cell.w.includes('E') && !cell.w.includes('e') && !cell.w.includes(',')) {
          codeStr = String(cell.w).trim();
        } else if (cell.v !== undefined && cell.v !== null) {
          codeStr = String(cell.v).trim();
        }
      } else {
        codeStr = String(rawCode).trim();
      }

      const cleanCode = normalizeBarcode(codeStr);
      if (!cleanCode) continue;

      const cleanDesc = String(rawDesc).trim().toUpperCase();

      if (cleanCode && cleanDesc) {
        if (seenCodes.has(cleanCode)) {
          duplicateCount++;
        } else {
          seenCodes.add(cleanCode);
          validItems.push({
            codigo: cleanCode,
            descripcion: cleanDesc
          });
        }
      }
    }

    await clearAndSaveBaseCatalog(validItems, onProgress);

    const finalSize = String(arrayBuffer.byteLength);
    localStorage.setItem(STORAGE_KEY_SYNCED_ID, this.getCatalogFileId());
    localStorage.setItem(STORAGE_KEY_LAST_SYNC, new Date().toISOString());
    localStorage.setItem(STORAGE_KEY_TOTAL_RECORDS, String(validItems.length));
    localStorage.setItem(STORAGE_KEY_LAST_SIZE, finalSize);
    localStorage.setItem(STORAGE_KEY_LAST_MODIFIED, finalModifiedIso);
    localStorage.setItem(STORAGE_KEY_LAST_FINGERPRINT, finalFingerprint);
    localStorage.setItem(STORAGE_KEY_EXCEL_ROWS, String(totalExcelDataRows));
    localStorage.setItem(STORAGE_KEY_DUPLICATES, String(duplicateCount));
    localStorage.setItem(STORAGE_KEY_CODE_VERSION, CURRENT_CODE_VERSION);

    try {
      await setDoc(doc(db, 'catalogo_meta', 'version'), {
        fileId: this.getCatalogFileId(),
        fingerprint: finalFingerprint,
        lastModified: finalModifiedIso,
        lastSize: finalSize,
        lastSync: new Date().toISOString(),
        totalRecords: validItems.length,
        versionId: `${finalFingerprint}_${finalSize}`
      }, { merge: true });
    } catch (_pubErr) {
      console.warn('No fue posible publicar versión central en Firestore:', _pubErr);
    }

    if (onProgress) {
      onProgress({
        phase: 'done',
        percent: 100,
        totalRecords: validItems.length,
        totalExcelRows: totalExcelDataRows,
        duplicateCount,
        message: `Sincronización completada con éxito (${validItems.length.toLocaleString()} productos disponibles).`
      });
    }

    return {
      success: true,
      totalRecords: validItems.length,
      totalExcelRows: totalExcelDataRows,
      duplicateCount
    };
  },

  async findByBarcode(rawBarcode) {
    const cleanBarcode = normalizeBarcode(rawBarcode);
    if (!cleanBarcode) return null;

    const localLimpio = await getLocalItem(STORE_CLEAN, cleanBarcode);
    if (localLimpio) {
      if (!(localLimpio.codigo === '1' && String(localLimpio.descripcion).includes('ATOMIZADOR'))) {
        return localLimpio;
      }
    }

    const localBase = await getLocalItem(STORE_BASE, cleanBarcode);
    if (localBase) return localBase;

    try {
      const limpioRef = doc(db, 'catalogo_limpio', cleanBarcode);
      const limpioSnap = await getDoc(limpioRef);
      if (limpioSnap.exists()) {
        const data = limpioSnap.data();
        if (!(cleanBarcode === '1' && String(data.descripcion).includes('ATOMIZADOR'))) {
          await saveLocalBatch(STORE_CLEAN, [data]);
          return data;
        }
      }
    } catch (_e) {}

    return null;
  },

  async saveToCleanCatalog(barcode, descripcion) {
    const cleanBarcode = normalizeBarcode(barcode);
    if (!cleanBarcode || !descripcion) return null;

    const now = new Date().toISOString();
    const existing = await getLocalItem(STORE_CLEAN, cleanBarcode);

    const cleanItem = {
      codigo: cleanBarcode,
      descripcion: String(descripcion).trim().toUpperCase(),
      createdAt: existing?.createdAt || now,
      updatedAt: now
    };

    try {
      const limpioRef = doc(db, 'catalogo_limpio', cleanBarcode);
      await setDoc(limpioRef, cleanItem, { merge: true });
    } catch (e) {
      console.warn('Error guardando en Firestore catalogo_limpio:', e);
    }

    await saveLocalBatch(STORE_CLEAN, [cleanItem]);
    memoryCache = null;
    return cleanItem;
  },

  async saveBatchToCleanCatalog(items) {
    if (!Array.isArray(items) || items.length === 0) return [];
    const now = new Date().toISOString();
    const cleanList = [];
    const seen = new Set();

    for (const it of items) {
      if (!it) continue;
      const cleanBarcode = normalizeBarcode(it.codigo);
      const desc = String(it.descripcion || '').trim().toUpperCase();
      if (cleanBarcode && desc && !seen.has(cleanBarcode)) {
        seen.add(cleanBarcode);
        cleanList.push({
          codigo: cleanBarcode,
          descripcion: desc,
          updatedAt: now
        });
      }
    }

    if (cleanList.length === 0) return [];

    try {
      await saveLocalBatch(STORE_CLEAN, cleanList);
    } catch (e) {
      console.warn('Error guardando lote en IndexedDB:', e);
    }
    memoryCache = null;

    try {
      const batchSize = 400;
      for (let i = 0; i < cleanList.length; i += batchSize) {
        const chunk = cleanList.slice(i, i + batchSize);
        const batch = writeBatch(db);
        chunk.forEach(item => {
          const docRef = doc(db, 'catalogo_limpio', item.codigo);
          batch.set(docRef, item, { merge: true });
        });
        batch.commit().catch(err => {
          console.warn('Error guardando lote en Firestore catalogo_limpio (offline):', err);
        });
      }
    } catch (e) {
      console.warn('Error preparando lote en Firestore catalogo_limpio:', e);
    }

    return cleanList;
  },

  async syncFromOperationsHistory() {
    try {
      const snap = await getDocs(collection(db, 'solicitudes'));
      const allItems = [];
      snap.docs.forEach(d => {
        const data = d.data();
        if (Array.isArray(data.items)) {
          data.items.forEach(it => {
            if (it && it.codigo && it.descripcion) {
              allItems.push({ codigo: it.codigo, descripcion: it.descripcion });
            }
          });
        }
      });

      if (allItems.length > 0) {
        await this.saveBatchToCleanCatalog(allItems);
      }
      return await this.getCatalogStatus();
    } catch (err) {
      console.warn('Error al sincronizar catalogo_limpio desde historial de operaciones:', err);
      return null;
    }
  },

  async updateCleanCatalogItem(barcode, newDesc) {
    const cleanBarcode = normalizeBarcode(barcode);
    if (!cleanBarcode || !newDesc?.trim()) return;

    const cleanItem = {
      codigo: cleanBarcode,
      descripcion: String(newDesc).trim().toUpperCase(),
      updatedAt: new Date().toISOString()
    };

    try {
      const limpioRef = doc(db, 'catalogo_limpio', cleanBarcode);
      await setDoc(limpioRef, cleanItem, { merge: true });
    } catch (e) {
      console.warn('Error actualizando en Firestore catalogo_limpio:', e);
    }

    await saveLocalBatch(STORE_CLEAN, [cleanItem]);
    memoryCache = null;
    return cleanItem;
  },

  async deleteFromCleanCatalog(barcode) {
    const cleanBarcode = normalizeBarcode(barcode);
    if (!cleanBarcode) return;

    try {
      const limpioRef = doc(db, 'catalogo_limpio', cleanBarcode);
      await deleteDoc(limpioRef);
    } catch (e) {
      console.warn('Error eliminando de Firestore catalogo_limpio:', e);
    }

    const database = await openDB();
    await new Promise((resolve, reject) => {
      const tx = database.transaction(STORE_CLEAN, 'readwrite');
      const store = tx.objectStore(STORE_CLEAN);
      store.delete(cleanBarcode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
    memoryCache = null;
    return true;
  },

  async getCleanCatalogItems() {
    try {
      const snap = await getDocs(collection(db, 'catalogo_limpio'));
      const items = snap.docs
        .map(d => ({ codigo: d.id, ...d.data() }))
        .filter(it => it && it.codigo);

      const database = await openDB();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_CLEAN, 'readwrite');
        const store = tx.objectStore(STORE_CLEAN);
        const clearReq = store.clear();
        clearReq.onsuccess = () => {
          items.forEach(item => store.put(item));
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      return items.sort((a, b) => (a.codigo || '').localeCompare(b.codigo || ''));
    } catch (e) {
      return await getAllLocalItems(STORE_CLEAN);
    }
  },

  async syncCleanCatalogFromFirestore() {
    try {
      const snap = await getDocs(collection(db, 'catalogo_limpio'));
      const items = snap.docs
        .map(d => ({ codigo: d.id, ...d.data() }))
        .filter(it => it && it.codigo);

      const database = await openDB();
      await new Promise((resolve, reject) => {
        const tx = database.transaction(STORE_CLEAN, 'readwrite');
        const store = tx.objectStore(STORE_CLEAN);
        const clearReq = store.clear();
        clearReq.onsuccess = () => {
          items.forEach(item => store.put(item));
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });

      memoryCache = null;
      return items.length;
    } catch (err) {
      console.warn('Sincronización de catalogo_limpio desde Firebase no disponible:', err);
      return await getLocalCount(STORE_CLEAN);
    }
  },

  subscribeCleanCatalog(onUpdate) {
    try {
      return onSnapshot(
        collection(db, 'catalogo_limpio'),
        async (snap) => {
          const items = snap.docs
            .map(d => ({ codigo: d.id, ...d.data() }))
            .filter(it => it && it.codigo);

          const database = await openDB();
          await new Promise((resolve, reject) => {
            const tx = database.transaction(STORE_CLEAN, 'readwrite');
            const store = tx.objectStore(STORE_CLEAN);
            const clearReq = store.clear();
            clearReq.onsuccess = () => {
              items.forEach(item => store.put(item));
            };
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });

          memoryCache = null;
          if (onUpdate) onUpdate(items);
        },
        (err) => {
          console.warn('Fallback suscripción catalogo_limpio:', err);
        }
      );
    } catch (e) {
      console.warn('Error suscribiendo a catalogo_limpio en Firebase:', e);
      return () => {};
    }
  },

  async searchMedicines(query) {
    try {
      const rawTrimmed = String(query || '').trim();
      if (!rawTrimmed) return [];

      const q = rawTrimmed.toLowerCase();
      const cleanSearchCode = normalizeBarcode(rawTrimmed);
      const isNumeric = /^\d+$/.test(cleanSearchCode);

      if (!isNumeric && q.length < 2) return [];

      let exactMatch = null;
      if (cleanSearchCode) {
        exactMatch = await this.findByBarcode(cleanSearchCode);
      }

      if (!memoryCache) {
        const cleanItems = await getAllLocalItems(STORE_CLEAN);
        const baseItems = await getAllLocalItems(STORE_BASE);

        const itemMap = new Map();
        baseItems.forEach(item => {
          if (item && item.codigo !== undefined && item.codigo !== null) {
            itemMap.set(String(item.codigo), item);
          }
        });
        cleanItems.forEach(item => {
          if (item && item.codigo !== undefined && item.codigo !== null) {
            if (String(item.codigo) === '1' && String(item.descripcion).includes('ATOMIZADOR')) return;
            itemMap.set(String(item.codigo), item);
          }
        });

        memoryCache = Array.from(itemMap.values());
      }

      const searchCod = cleanSearchCode.toLowerCase();

      let results = memoryCache.filter(med => {
        const desc = med.descripcion ? String(med.descripcion).toLowerCase() : '';
        const cod = med.codigo ? String(med.codigo).toLowerCase() : '';

        if (desc.includes(q)) return true;

        if (searchCod) {
          if (cod.startsWith(searchCod)) return true;
        }

        return false;
      });

      results.sort((a, b) => {
        const aCod = String(a.codigo || '').toLowerCase();
        const bCod = String(b.codigo || '').toLowerCase();

        if (aCod === searchCod && bCod !== searchCod) return -1;
        if (bCod === searchCod && aCod !== searchCod) return 1;

        const aStarts = aCod.startsWith(searchCod);
        const bStarts = bCod.startsWith(searchCod);
        if (aStarts && !bStarts) return -1;
        if (!aStarts && bStarts) return 1;

        if (aStarts && bStarts && aCod.length !== bCod.length) {
          return aCod.length - bCod.length;
        }

        const aDesc = String(a.descripcion || '').toLowerCase();
        const bDesc = String(b.descripcion || '').toLowerCase();
        if (aDesc === q && bDesc !== q) return -1;
        if (bDesc === q && aDesc !== q) return 1;

        const aDescStarts = aDesc.startsWith(q);
        const bDescStarts = bDesc.startsWith(q);
        if (aDescStarts && !bDescStarts) return -1;
        if (!aDescStarts && bDescStarts) return 1;

        return 0;
      });

      if (exactMatch) {
        results = results.filter(r => String(r.codigo) !== String(exactMatch.codigo));
        results.unshift(exactMatch);
      }

      return results.slice(0, 30);
    } catch (error) {
      console.error('Error ejecutando searchMedicines localmente:', error);
      return [];
    }
  }
};
