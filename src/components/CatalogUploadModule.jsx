import React, { useState } from 'react';
import { ArrowLeft, UploadCloud, FileText, CheckCircle2, AlertCircle, Loader2, Layers } from 'lucide-react';
import { catalogService } from '../services/catalogService';

export function CatalogUploadModule({ onBack }) {
  const [file, setFile] = useState(null);
  const [hasHeader, setHasHeader] = useState(true);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState({
    percent: 0,
    currentBatch: 0,
    totalBatches: 0,
    message: ''
  });
  const [result, setResult] = useState(null);

  const handleFileChange = (e) => {
    const selected = e.target.files[0];
    if (selected && selected.name.endsWith('.csv')) {
      setFile(selected);
      setResult(null);
      setProgress({ percent: 0, currentBatch: 0, totalBatches: 0, message: '' });
    } else {
      alert("Por favor selecciona un archivo .csv delimitado por comas.");
    }
  };

  const processCSV = async () => {
    if (!file) return;
    setLoading(true);
    setResult(null);
    setProgress({ percent: 5, currentBatch: 0, totalBatches: 0, message: 'Leyendo archivo CSV...' });

    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target.result;
      let lines = text.split('\n');

      if (hasHeader && lines.length > 0) {
        lines = lines.slice(1);
      }

      const parsedItems = [];
      const seenInCsv = new Set();

      lines.forEach(line => {
        const firstComma = line.indexOf(',');
        if (firstComma === -1) return;

        const codigoOriginal = line.substring(0, firstComma);
        let descripcion = line.substring(firstComma + 1).trim();

        const cleanCodigo = codigoOriginal.replace(/^0+/, '').replace(/\s+/g, '');

        if (descripcion.startsWith('"') && descripcion.endsWith('"')) {
          descripcion = descripcion.substring(1, descripcion.length - 1);
        }

        if (cleanCodigo && descripcion && !seenInCsv.has(cleanCodigo)) {
          seenInCsv.add(cleanCodigo);
          parsedItems.push({ codigo: cleanCodigo, descripcion });
        }
      });

      try {
        const stats = await catalogService.uploadRawCatalog(parsedItems, (status) => {
          setProgress(status);
        });
        setResult({ success: true, ...stats });
      } catch (err) {
        setResult({ success: false, message: err.message });
      } finally {
        setLoading(false);
      }
    };
    reader.readAsText(file);
  };

  return (
    <div className="max-w-xl mx-auto space-y-6 pb-20">
      <button
        onClick={onBack}
        disabled={loading}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm transition-all cursor-pointer disabled:opacity-50"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        <span>Volver al Dashboard</span>
      </button>

      <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm p-8 text-center space-y-5">
        <div className="w-16 h-16 bg-orange-50 text-orange-600 rounded-3xl mx-auto flex items-center justify-center">
          <UploadCloud className="w-8 h-8" />
        </div>
        
        <div>
          <h2 className="text-xl font-extrabold text-slate-900">Cargar Catálogo Base</h2>
          <p className="text-sm text-slate-500 mt-2">
            Sube tu catálogo en <strong>.CSV</strong> delimitado por comas.<br/>
            <strong>Columna A:</strong> EAN / Código de Barras &bull; <strong>Columna B:</strong> Descripción
          </p>
        </div>

        {/* Zona de selección de archivo */}
        <div className="border-2 border-dashed border-slate-200 rounded-2xl p-6 bg-slate-50 relative hover:bg-slate-100 transition-colors">
          <input 
            type="file" 
            accept=".csv"
            disabled={loading}
            onChange={handleFileChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
          />
          {file ? (
            <div className="flex flex-col items-center gap-2 text-slate-700">
              <FileText className="w-8 h-8 text-blue-500" />
              <span className="font-semibold text-sm">{file.name}</span>
              <span className="text-xs text-slate-400">({(file.size / 1024).toFixed(1)} KB)</span>
            </div>
          ) : (
            <div className="text-slate-500 text-sm font-medium">
              Haz clic aquí para seleccionar el archivo .csv
            </div>
          )}
        </div>

        {/* Opciones de Encabezado */}
        <div 
          className="flex items-center justify-center gap-3 p-3 bg-slate-50 rounded-2xl border border-slate-200/60 text-xs font-semibold text-slate-700 cursor-pointer select-none"
          onClick={() => !loading && setHasHeader(!hasHeader)}
        >
          <input
            type="checkbox"
            checked={hasHeader}
            disabled={loading}
            onChange={(e) => setHasHeader(e.target.checked)}
            className="w-4 h-4 text-orange-600 rounded border-slate-300 focus:ring-orange-500 cursor-pointer"
          />
          <span>El archivo contiene encabezados en la primera fila (ej. EAN, Descripción)</span>
        </div>

        {/* Botón de Procesar */}
        {!loading && (
          <button
            onClick={processCSV}
            disabled={!file}
            className="w-full py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white font-bold rounded-2xl transition-all cursor-pointer"
          >
            Analizar y Cargar Catálogo
          </button>
        )}

        {/* Tarjeta interactiva de Carga / Progreso */}
        {loading && (
          <div className="p-5 bg-slate-50 border border-slate-200 rounded-2xl space-y-3 text-left">
            <div className="flex items-center justify-between text-xs font-bold text-slate-700">
              <div className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 text-orange-600 animate-spin" />
                <span>Procesando archivo...</span>
              </div>
              <span className="font-mono text-orange-600">{progress.percent}%</span>
            </div>

            {/* Barra de progreso visual */}
            <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
              <div 
                className="bg-orange-500 h-full rounded-full transition-all duration-300"
                style={{ width: `${progress.percent}%` }}
              ></div>
            </div>

            {/* Subtítulo dinámico de lotes */}
            <div className="flex items-center justify-between text-[11px] text-slate-500 pt-1">
              <span className="truncate pr-2">{progress.message}</span>
              {progress.totalBatches > 0 && (
                <span className="inline-flex items-center gap-1 font-mono font-bold bg-orange-100 text-orange-800 px-2 py-0.5 rounded-md shrink-0">
                  <Layers className="w-3 h-3" />
                  Lote {progress.currentBatch} de {progress.totalBatches}
                </span>
              )}
            </div>
          </div>
        )}

        {/* Resumen Final */}
        {result?.success && (
          <div className="p-4 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-2xl space-y-2 text-left text-xs">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-900">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Carga Completada con Éxito</span>
            </div>
            <div className="grid grid-cols-3 gap-2 pt-1 text-center font-mono">
              <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                <span className="block text-slate-400 text-[10px]">LEÍDOS</span>
                <strong className="text-slate-800 text-sm">{result.totalParsed}</strong>
              </div>
              <div className="bg-emerald-100 p-2 rounded-xl border border-emerald-200">
                <span className="block text-emerald-700 text-[10px]">NUEVOS</span>
                <strong className="text-emerald-900 text-sm">+{result.newUploaded}</strong>
              </div>
              <div className="bg-white/80 p-2 rounded-xl border border-emerald-100">
                <span className="block text-slate-400 text-[10px]">EXISTÍAN</span>
                <strong className="text-slate-500 text-sm">{result.duplicatesIgnored}</strong>
              </div>
            </div>
          </div>
        )}
        
        {result?.success === false && (
          <div className="p-4 bg-red-50 text-red-700 rounded-2xl flex items-center gap-3 text-sm font-semibold text-left">
            <AlertCircle className="w-6 h-6 shrink-0" />
            <p>Error durante la carga: {result.message}</p>
          </div>
        )}
      </div>
    </div>
  );
}