import { doc, getDoc, setDoc, writeBatch, collection } from 'firebase/firestore';
import { db } from '../config/firebase';

const DB_NAME = 'ERP_Catalog_DB';
const DB_VERSION = 1;
const STORE_BASE = 'catalogo_base_local';
const STORE_CLEAN = 'catalogo_limpio_local';

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

async function getLocalCodesMap(storeName) {
  const database = await openDB();
  return new Promise((resolve, reject) => {
    const tx = database.transaction(storeName, 'readonly');
    const store = tx.objectStore(storeName);
    const request = store.getAllKeys();
    request.onsuccess = () => resolve(new Set(request.result));
    request.onerror = () => reject(request.error);
  });
}

// Nueva función auxiliar para obtener todos los valores de un store para poder buscar en ellos
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

export const catalogService = {

  // 1. FILTRADO LOCAL Y SUBIDA POR LOTES CON NOTIFICACIÓN DE PROGRESO
  async uploadRawCatalog(parsedItems, onProgress) {
    if (onProgress) {
      onProgress({
        phase: 'local',
        percent: 15,
        message: 'Verificando duplicados en la base de datos local (IndexedDB)...'
      });
    }

    const existingCodes = await getLocalCodesMap(STORE_BASE);
    const newItems = parsedItems.filter(item => !existingCodes.has(item.codigo));

    if (newItems.length === 0) {
      if (onProgress) {
        onProgress({ phase: 'done', percent: 100, message: 'Todos los productos ya existen en la base.' });
      }
      return {
        totalParsed: parsedItems.length,
        newUploaded: 0,
        duplicatesIgnored: parsedItems.length
      };
    }

    if (onProgress) {
      onProgress({
        phase: 'saving_local',
        percent: 30,
        message: `Guardando ${newItems.length} productos nuevos en almacenamiento local...`
      });
    }
    await saveLocalBatch(STORE_BASE, newItems);

    const BATCH_SIZE = 350; 
    const totalBatches = Math.ceil(newItems.length / BATCH_SIZE);

    for (let i = 0; i < newItems.length; i += BATCH_SIZE) {
      const currentBatch = Math.floor(i / BATCH_SIZE) + 1;
      const chunk = newItems.slice(i, i + BATCH_SIZE);

      const batchPercent = Math.round(30 + (currentBatch / totalBatches) * 65);

      if (onProgress) {
        onProgress({
          phase: 'uploading',
          currentBatch,
          totalBatches,
          percent: batchPercent,
          message: `Enviando paquete a Firebase: Lote ${currentBatch} de ${totalBatches} (${chunk.length} productos)...`
        });
      }

      const batch = writeBatch(db);
      chunk.forEach(item => {
        const docRef = doc(collection(db, 'catalogo_base'), item.codigo);
        batch.set(docRef, item);
      });
      await batch.commit();
    }

    if (onProgress) {
      onProgress({ phase: 'done', percent: 100, message: 'Proceso finalizado con éxito.' });
    }

    return {
      totalParsed: parsedItems.length,
      newUploaded: newItems.length,
      duplicatesIgnored: parsedItems.length - newItems.length
    };
  },

  // 2. BÚSQUEDA INTELIGENTE CON CACHÉ LOCAL INDEXEDDB
  async findByBarcode(rawBarcode) {
    const cleanBarcode = rawBarcode.replace(/^0+/, '').replace(/\s+/g, '');

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
    } catch (e) {
      console.warn('Modo Offline: consulta limpia local:', e);
    }

    const localBase = await getLocalItem(STORE_BASE, cleanBarcode);
    if (localBase) {
      await this.saveToCleanCatalog(cleanBarcode, localBase.descripcion);
      return localBase;
    }

    try {
      const baseRef = doc(db, 'catalogo_base', cleanBarcode);
      const baseSnap = await getDoc(baseRef);
      if (baseSnap.exists()) {
        const data = baseSnap.data();
        await saveLocalBatch(STORE_BASE, [data]);
        await this.saveToCleanCatalog(cleanBarcode, data.descripcion);
        return data;
      }
    } catch (e) {
      console.warn('Modo Offline: consulta base local:', e);
    }

    return null;
  },

  // 3. GUARDAR PRODUCTO EN CATÁLOGO LIMPIO
  async saveToCleanCatalog(barcode, descripcion) {
    const cleanBarcode = barcode.replace(/^0+/, '').replace(/\s+/g, '');
    const cleanItem = {
      codigo: cleanBarcode,
      descripcion: descripcion.trim().toUpperCase()
    };

    await saveLocalBatch(STORE_CLEAN, [cleanItem]);

    try {
      const limpioRef = doc(db, 'catalogo_limpio', cleanBarcode);
      await setDoc(limpioRef, cleanItem);
    } catch (e) {
      console.warn('Guardado localmente. Pendiente de sincro:', e);
    }
  },

 // 4. BÚSQUEDA DE MEDICAMENTOS POR TEXTO O EAN (BUSCADOR EXTRAS)
  async searchMedicines(query) {
    try {
      const q = query.toLowerCase().trim();
      if (!q || q.length < 2) return [];

      // ESTRATEGIA 1: Si es un número (EAN/Código), buscar coincidencia exacta primero
      // Esto aprovecha findByBarcode que SÍ consulta a Firebase si no está local
      const isNumeric = /^\d+$/.test(q);
      let exactMatch = null;
      if (isNumeric) {
        exactMatch = await this.findByBarcode(q);
      }

      // ESTRATEGIA 2: Búsqueda general en la caché local
      let cleanItems = await getAllLocalItems(STORE_CLEAN);
      const baseItems = await getAllLocalItems(STORE_BASE);
      
      // Unimos ambos catálogos asegurando que no haya duplicados
      const itemMap = new Map();
      baseItems.forEach(item => itemMap.set(item.codigo, item));
      cleanItems.forEach(item => itemMap.set(item.codigo, item)); // Limpio sobrescribe al base
      
      const allItems = Array.from(itemMap.values());

      // Filtrado SEGURO: Convertimos a String para evitar errores si vienen como Números desde Excel
      let results = allItems.filter(med => {
        const desc = med.descripcion ? String(med.descripcion).toLowerCase() : '';
        const cod = med.codigo ? String(med.codigo).toLowerCase() : '';
        return desc.includes(q) || cod.includes(q);
      });

      // Si encontramos un match exacto en Firebase, lo ponemos en la posición #1
      if (exactMatch) {
        // Lo quitamos de la lista general por si estaba duplicado
        results = results.filter(r => r.codigo !== exactMatch.codigo);
        results.unshift(exactMatch); // Lo insertamos al inicio
      }

      // Limitar a los mejores 30 resultados para que la UI no se ponga lenta
      return results.slice(0, 30);

    } catch (error) {
      console.error("Error ejecutando searchMedicines localmente:", error);
      return [];
    }
  }
};