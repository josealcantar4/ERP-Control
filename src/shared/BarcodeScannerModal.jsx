import React, { useEffect, useRef, useState } from 'react';
import { Html5Qrcode } from 'html5-qrcode';
import { X, AlertCircle, ScanBarcode } from 'lucide-react';

export function BarcodeScannerModal({ isOpen, onClose, onDetected }) {
  const [manualCode, setManualCode] = useState('');
  const [scannerError, setScannerError] = useState('');
  const [isStarting, setIsStarting] = useState(true);
  const scannerRef = useRef(null);
  const isStoppingRef = useRef(false);

  useEffect(() => {
    if (!isOpen) return;

    setIsStarting(true);
    setScannerError('');
    isStoppingRef.current = false;

    const html5QrCode = new Html5Qrcode('barcode-camera-view');
    scannerRef.current = html5QrCode;

    html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 15, qrbox: { width: 260, height: 130 }, aspectRatio: 1.333333 },
      (decodedText) => {
        if (isStoppingRef.current) return;
        isStoppingRef.current = true;
        if (navigator.vibrate) navigator.vibrate(50);
        html5QrCode.stop().then(() => onDetected(decodedText)).catch(() => onDetected(decodedText));
      },
      () => {}
    ).then(() => setIsStarting(false)).catch((err) => {
      setScannerError('No se pudo iniciar la cámara. Escribe el código de barras abajo.');
      setIsStarting(false);
    });

    return () => {
      isStoppingRef.current = true;
      if (scannerRef.current?.isScanning) {
        scannerRef.current.stop().catch(console.error);
      }
    };
  }, [isOpen, onDetected]);

  const handleManualSubmit = (e) => {
    e.preventDefault();
    if (!manualCode.trim()) return;
    onDetected(manualCode.trim());
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-md animate-fade-in">
      <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl overflow-hidden border border-slate-100 flex flex-col max-h-[90vh]">
        <div className="px-5 py-4 flex items-center justify-between border-b border-slate-100 bg-white">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center">
              <ScanBarcode className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">Escanear Medicamento</h3>
              <p className="text-[11px] text-slate-500">Apunta el código de barras</p>
            </div>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative bg-black flex-1 min-h-[260px] max-h-[320px] flex items-center justify-center overflow-hidden">
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

        <div className="p-4 bg-slate-50 border-t border-slate-100 space-y-3">
          {/* Label de texto agregado e indicado explícitamente */}
          <label className="block text-xs font-semibold text-slate-600 mb-1 leading-none">
            Escribe el código manualmente:
          </label>
          <form onSubmit={handleManualSubmit} className="flex gap-2">
            <input
              type="text" inputMode="numeric" placeholder="Escribe aquí el código..." value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 font-mono"
            />
            <button type="submit" className="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-xl shadow-sm transition-all cursor-pointer shrink-0">
              Buscar
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}