import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Html5Qrcode } from 'html5-qrcode';
import { X, AlertCircle, ScanBarcode, Search, Loader2 } from 'lucide-react';
import { catalogService } from '../modules/catalogo';
import { useBodyScrollLock } from '../hooks';

export function BarcodeScannerModal({ isOpen, onClose, onDetected }) {
  useBodyScrollLock(isOpen);

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSearching, setIsSearching] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);
  const [scannerError, setScannerError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef(null);

  const resetAll = () => {
    setSearchQuery('');
    setSearchResults([]);
    setHasSearched(false);
    setIsSearching(false);
    setScannerError('');
  };

  useEffect(() => {
    if (!isOpen) {
      resetAll();
      return;
    }

    resetAll();
    setIsStarting(true);
    let isCancelled = false;
    let html5QrCode = null;

    try {
      html5QrCode = new Html5Qrcode('barcode-camera-view');
      scannerRef.current = html5QrCode;
    } catch (_e) {
      setScannerError('No se pudo inicializar la cámara.');
      setIsStarting(false);
      return;
    }

    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: { width: 260, height: 130 }, aspectRatio: 1.333333 },
      (decodedText) => {
        if (isCancelled) return;
        isCancelled = true;
        resetAll();
        if (navigator.vibrate) navigator.vibrate(50);
        try {
          if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop()
              .then(() => onDetected(decodedText))
              .catch(() => onDetected(decodedText));
          } else {
            onDetected(decodedText);
          }
        } catch (_err) {
          onDetected(decodedText);
        }
      },
      () => {}
    ).then(() => {
      if (isCancelled) {
        try {
          if (html5QrCode && html5QrCode.isScanning) {
            html5QrCode.stop().catch(() => {});
          }
        } catch (_err) {}
      } else {
        setIsStarting(false);
      }
    }).catch((_err) => {
      if (!isCancelled) {
        setScannerError('No se pudo iniciar la cámara. Puedes escribir el código o nombre abajo.');
        setIsStarting(false);
      }
    });

    return () => {
      isCancelled = true;
      resetAll();
      try {
        if (html5QrCode && html5QrCode.isScanning) {
          html5QrCode.stop().catch(() => {});
        }
      } catch (_err) {
        // Safe: ignore synchronous transition errors from html5-qrcode
      }
      scannerRef.current = null;
    };
  }, [isOpen, onDetected]);

  const handleClose = () => {
    resetAll();
    onClose();
  };

  const handleSelectItem = (item) => {
    resetAll();
    onDetected(item.codigo, item);
  };

  const handleSelectNewCode = (code) => {
    const clean = String(code || '').trim();
    resetAll();
    onDetected(clean);
  };

  const handleExecuteSearch = async (e) => {
    if (e) e.preventDefault();
    const query = searchQuery.trim();
    if (!query) {
      setSearchResults([]);
      setHasSearched(false);
      return;
    }

    setIsSearching(true);
    setHasSearched(true);

    try {
      // 1. Si coincide exactamente con un código de producto (ej. "01", "001", "1", EAN-13), auto-seleccionar
      const exactItem = await catalogService.findByBarcode(query);
      if (exactItem) {
        handleSelectItem(exactItem);
        return;
      }

      // 2. Si no es un código exacto único, buscar coincidencias por nombre o código en el catálogo
      const results = await catalogService.searchMedicines(query);
      setSearchResults(results || []);
    } catch (err) {
      console.error('Error buscando producto en scanner modal:', err);
      setSearchResults([]);
    } finally {
      setIsSearching(false);
    }
  };

  if (!isOpen) return null;

  const modalContent = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in select-none overflow-y-auto overscroll-contain">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[92vh] my-auto overscroll-contain">
        
        {/* ENCABEZADO */}
        <div className="px-5 py-3.5 flex items-center justify-between border-b border-slate-100 bg-white shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <ScanBarcode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Escanear o Buscar</h3>
              <p className="text-[11px] text-slate-500">Apunta el código o escribe nombre/código</p>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* CUERPO DEL MODAL (CÁMARA + BÚSQUEDA) */}
        <div className="flex-1 overflow-y-auto flex flex-col">
          
          {/* VISTA DE CÁMARA */}
          <div className="relative bg-black min-h-[190px] max-h-[250px] flex items-center justify-center overflow-hidden shrink-0">
            <div id="barcode-camera-view" className="w-full h-full object-cover"></div>
            {isStarting && !scannerError && (
              <div className="absolute inset-0 bg-slate-900/80 flex flex-col items-center justify-center text-white text-xs gap-2">
                <div className="w-7 h-7 border-2 border-blue-400 border-t-transparent rounded-full animate-spin"></div>
                <span>Iniciando cámara...</span>
              </div>
            )}
            {scannerError && (
              <div className="absolute inset-0 bg-slate-900/90 p-6 flex flex-col items-center justify-center text-center text-white gap-2">
                <AlertCircle className="w-8 h-8 text-amber-400" />
                <p className="text-xs text-slate-300 max-w-xs">{scannerError}</p>
              </div>
            )}
          </div>

          {/* SECCIÓN DE BÚSQUEDA MANUAL (POR CÓDIGO O NOMBRE) */}
          <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3 flex-1 flex flex-col justify-start">
            <label className="block text-xs font-semibold text-slate-700 leading-none">
              Buscar por código o nombre del producto:
            </label>

            <form onSubmit={handleExecuteSearch} className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Escribe el código o descripción del producto..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-white border border-slate-200 rounded-xl pl-9 pr-9 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-sans"
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearchQuery('');
                      setSearchResults([]);
                      setHasSearched(false);
                    }}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isSearching}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-300 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer shrink-0 flex items-center gap-1.5"
              >
                {isSearching ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <span>Buscar</span>
                )}
              </button>
            </form>

            {/* LISTA DE RESULTADOS */}
            {searchResults.length > 0 && (
              <div className="max-h-48 overflow-y-auto divide-y divide-slate-100 border border-slate-200 bg-white rounded-2xl shadow-sm">
                {searchResults.map((med) => (
                  <div
                    key={med.codigo}
                    onClick={() => handleSelectItem(med)}
                    className="p-3 text-xs hover:bg-blue-50 cursor-pointer text-slate-800 flex justify-between items-center transition-colors gap-2"
                  >
                    <span className="font-semibold truncate pr-2">{med.descripcion}</span>
                    <span className="text-[10px] font-mono text-slate-500 shrink-0 bg-slate-50 px-2 py-0.5 rounded-md border border-slate-200">
                      {med.codigo}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* AVISO DE NO ENCONTRADO CON OPCIÓN DE REGISTRAR */}
            {hasSearched && searchResults.length === 0 && !isSearching && (
              <div className="p-3 bg-amber-50 rounded-2xl border border-amber-200/80 text-center text-xs text-amber-900 space-y-1.5">
                <p className="font-semibold">No se encontraron productos</p>
                <p className="text-[11px] text-amber-700">
                  ¿Deseas agregar "{searchQuery}" como producto nuevo?
                </p>
                <button
                  type="button"
                  onClick={() => handleSelectNewCode(searchQuery)}
                  className="mt-1 px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-semibold cursor-pointer shadow-sm transition-colors"
                >
                  Registrar con este código
                </button>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );

  return typeof document !== 'undefined' ? createPortal(modalContent, document.body) : modalContent;
}
