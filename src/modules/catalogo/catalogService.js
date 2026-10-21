import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../../config/firebase';
import * as XLSX from 'xlsx';

const DB_NAME = 'ERP_Catalog_DB';
const DB_VERSION = 1;
const STORE_BASE = 'catalogo_base_local';
const STORE_CLEAN = 'catalogo_limpio_local';

const DEFAULT_FILE_ID = '1BKAflq-3XwRVvRngQXxYXpSRBDPbcQom';
const STORAGE_KEY_FILE_ID = 'erp_catalog_file_id';
const STORAGE_KEY_SYNCED_ID = 'erp_catalog_synced_id'; // NUEVA CLAVE PARA EVITAR BUCLES
const STORAGE_KEY_LAST_SYNC = 'erp_catalog_last_sync_date';
const STORAGE_KEY_TOTAL_RECORDS = 'erp_catalog_total_records';
const STORAGE_KEY_LAST_SIZE = 'erp_catalog_last_size'; // AÑADIDO PARA VALIDAR CAMBIOS EN EL MISMO ID

let memoryCache = null;

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

  async getCatalogStatus() {
    const localCount = await getLocalCount(STORE_BASE);
    const cleanCount = await getLocalCount(STORE_CLEAN);
    const lastSync = localStorage.getItem(STORAGE_KEY_LAST_SYNC) || null;
    const fileId = this.getCatalogFileId();

    return {
      localCount,
      cleanCount,
      totalCount: localCount,
      lastSync,
      fileId
    };
  },


  // 1. VERIFICACIÓN OPTIMIZADA: REVISA ID Y TAMAÑO DEL ARCHIVO
  async checkServerCatalogVersion() {
    try {
      const localCount = await getLocalCount(STORE_BASE);
      const currentConfiguredId = this.getCatalogFileId();
      const lastSyncedId = localStorage.getItem(STORAGE_KEY_SYNCED_ID);
      const lastSize = localStorage.getItem(STORAGE_KEY_LAST_SIZE);

      if (localCount === 0 || currentConfiguredId !== lastSyncedId) {
        return {
          upToDate: false,
          reason: 'empty_or_new_id',
          localCount
        };
      }

      const downloadUrl = this.getDownloadUrl();
      const response = await fetch(downloadUrl, { method: 'HEAD' });
      
      if (response.ok) {
        const currentSize = response.headers.get('content-length');
        
        // Si el tamaño existe y es diferente al guardado, hay una nueva versión
        if (currentSize && currentSize !== lastSize) {
           return {
            upToDate: false,
            reason: 'file_modified',
            localCount
          };
        }
      }

      // Si el ID es el mismo, hay datos y el tamaño no cambió, está actualizado
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

  // 2. DESCARGA Y SINCRONIZACIÓN COMPLETA POR LOTES
  async syncCatalogFromServer(onProgress) {
    memoryCache = null; 

    if (onProgress) {
      onProgress({
        phase: 'connecting',
        percent: 5,
        message: 'Conectando con el Servidor Central...'
      });
    }

    const downloadUrl = this.getDownloadUrl();

    if (onProgress) {
      onProgress({
        phase: 'downloading',
        percent: 15,
        message: 'Descargando catálogo actualizado desde el Servidor Central...'
      });
    }

    const response = await fetch(downloadUrl, { method: 'GET' });
    if (!response.ok) {
      throw new Error(`No se pudo descargar el archivo del Servidor Central (${response.status})`);
    }

    const serverContentLength = response.headers.get('content-length') || '';
    const totalBytes = serverContentLength ? parseInt(serverContentLength, 10) : 0;

    let arrayBuffer;

    if (response.body && typeof response.body.getReader === 'function' && totalBytes > 0) {
      const reader = response.body.getReader();
      const chunks = [];
      let receivedBytes = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.length;

        const downloadPercent = Math.min(60, 15 + Math.round((receivedBytes / totalBytes) * 45));
        if (onProgress) {
          const mbReceived = (receivedBytes / (1024 * 1024)).toFixed(1);
          const mbTotal = (totalBytes / (1024 * 1024)).toFixed(1);
          onProgress({
            phase: 'downloading',
            percent: downloadPercent,
            message: `Descargando catálogo actualizado (${mbReceived} MB / ${mbTotal} MB)...`
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

    const startRow = (rawRows[0] && typeof rawRows[0][0] === 'string' && /c[oó]digo/i.test(rawRows[0][0])) ? 1 : 0;

    for (let i = startRow; i < rawRows.length; i++) {
      const row = rawRows[i];
      if (!row || row.length === 0) continue;

      const rawCode = row[0];
      const rawDesc = row[1];
      if (rawCode === undefined || rawCode === null || !rawDesc) continue;

      let cleanCode = String(rawCode).trim().replace(/^0+/, '').replace(/\s+/g, '').replace(/\//g, '-');
      if (!cleanCode) {
        cleanCode = '0';
      }

      const cleanDesc = String(rawDesc).trim().toUpperCase();

      if (cleanCode && cleanDesc && !seenCodes.has(cleanCode)) {
        seenCodes.add(cleanCode);
        validItems.push({
          codigo: cleanCode,
          descripcion: cleanDesc
        });
      }
    }

    await clearAndSaveBaseCatalog(validItems, onProgress);

    // GUARDAMOS EL ID ACTUAL COMO "YA SINCRONIZADO" PARA EVITAR EL BUCLE FUTURO Y EL TAMAÑO
    localStorage.setItem(STORAGE_KEY_SYNCED_ID, this.getCatalogFileId());
    localStorage.setItem(STORAGE_KEY_LAST_SYNC, new Date().toISOString());
    localStorage.setItem(STORAGE_KEY_TOTAL_RECORDS, String(validItems.length));
    localStorage.setItem(STORAGE_KEY_LAST_SIZE, serverContentLength || '0');

    if (onProgress) {
      onProgress({
        phase: 'done',
        percent: 100,
        totalRecords: validItems.length,
        message: `Sincronización completada con éxito (${validItems.length.toLocaleString()} medicamentos disponibles).`
      });
    }

    return {
      success: true,
      totalRecords: validItems.length
    };
  },

  async findByBarcode(rawBarcode) {
    if (!rawBarcode) return null;
    let cleanBarcode = String(rawBarcode).trim().replace(/^0+/, '').replace(/\s+/g, '').replace(/\//g, '-');
    if (!cleanBarcode) cleanBarcode = '0';

    const localLimpio = await getLocalItem(STORE_CLEAN, cleanBarcode);
    if (localLimpio) return localLimpio;

    try {
      const limpioRef = doc(db, 'catalogo_limpio', cleanBarcode);
      const limpioSnap = await getDoc(limpioRef);
      if (limpioSnap.exists()) {
        const data = limpioSnap.data();
        await saveLocalBatch(STORE_CLEAN, [data]);
        return data;
      }
    } catch (_e) {}

    const localBase = await getLocalItem(STORE_BASE, cleanBarcode);
    if (localBase) {
      await this.saveToCleanCatalog(cleanBarcode, localBase.descripcion);
      return localBase;
    }

    return null;
  },

  async saveToCleanCatalog(barcode, descripcion) {
    if (!barcode || !descripcion) return;
    let cleanBarcode = String(barcode).trim().replace(/^0+/, '').replace(/\s+/g, '').replace(/\//g, '-');
    if (!cleanBarcode) cleanBarcode = '0';

    const cleanItem = {
      codigo: cleanBarcode,
      descripcion: String(descripcion).trim().toUpperCase()
    };

    await saveLocalBatch(STORE_CLEAN, [cleanItem]);
    memoryCache = null;

    try {
      const limpioRef = doc(db, 'catalogo_limpio', cleanBarcode);
      await setDoc(limpioRef, cleanItem);
    } catch (e) {
      console.warn('Guardado localmente. Pendiente de sincronización en red:', e);
    }
  },

  async searchMedicines(query) {
    try {
      const q = String(query || '').toLowerCase().trim();
      if (!q || q.length < 2) return [];

      const isNumeric = /^\d+$/.test(q);
      let exactMatch = null;
      if (isNumeric) {
        exactMatch = await this.findByBarcode(q);
      }

      if (!memoryCache) {
        const cleanItems = await getAllLocalItems(STORE_CLEAN);
        const baseItems = await getAllLocalItems(STORE_BASE);

        const itemMap = new Map();
        baseItems.forEach(item => {
          if (item && item.codigo) itemMap.set(item.codigo, item);
        });
        cleanItems.forEach(item => {
          if (item && item.codigo) itemMap.set(item.codigo, item);
        });

        memoryCache = Array.from(itemMap.values());
      }

      let results = memoryCache.filter(med => {
        const desc = med.descripcion ? String(med.descripcion).toLowerCase() : '';
        const cod = med.codigo ? String(med.codigo).toLowerCase() : '';
        return desc.includes(q) || cod.includes(q);
      });

      if (exactMatch) {
        results = results.filter(r => r.codigo !== exactMatch.codigo);
        results.unshift(exactMatch);
      }

      return results.slice(0, 30);
    } catch (error) {
      console.error('Error ejecutando searchMedicines localmente:', error);
      return [];
    }
  }
};