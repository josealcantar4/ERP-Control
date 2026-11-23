/**
 * Modal para registrar y editar códigos de barras alternos / relacionados
 * asignados a productos del catálogo maestro.
 * Permite vincular múltiples códigos alternos a un mismo producto maestro
 * con validación en tiempo real para evitar duplicados o colisiones de catálogo.
 */

import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  Link2,
  Search,
  Camera,
  Check,
  AlertCircle,
  Tag,
  FileText,
  RotateCcw,
  Info,
  Plus,
  Trash2
} from 'lucide-react';
import { useModalAnimation } from '../../hooks';
import { playSuccessSound, MarqueeText, FloatingInput, MarqueeSearchInput } from '../../shared';
import { BarcodeScannerModal } from '../../shared/BarcodeScannerModal';
import { catalogService, normalizeBarcode } from './catalogService';

export function RelatedCodeModal({
  isOpen,
  item = null,
  currentUser: _currentUser = null,
  onClose,
  onSave
}) {
  const isEditing = Boolean(item && !item.isAddingToExistingMaster);

  // Estados del formulario
  const [selectedMaster, setSelectedMaster] = useState(null);
  const [masterQuery, setMasterQuery] = useState('');
  const [masterResults, setMasterResults] = useState([]);
  const [isSearchingMaster, setIsSearchingMaster] = useState(false);

  // Lista de códigos de barras a relacionar en esta sesión
  const [codigosList, setCodigosList] = useState([]);
  const [codigoInput, setCodigoInput] = useState('');
  const [inputValidation, setInputValidation] = useState(null);

  // Códigos ya registrados previamente para este producto maestro
  const [existingMasterCodes, setExistingMasterCodes] = useState([]);

  const [notas, setNotas] = useState('');
  const [errorMsg, setErrorMsg] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  const {
    shouldRender,
    cardRef,
    handleClose,
    handleBackdropClick,
    backdropClass,
    cardClass,
    cardStyle
  } = useModalAnimation({
    isOpen,
    onClose,
    preventClose: isScannerOpen || isSubmitting
  });

  const searchTimerRef = useRef(null);
  const validationTimerRef = useRef(null);

  // Inicializar estado al abrir modal o cambiar item
  useEffect(() => {
    if (isOpen) {
      setErrorMsg('');
      setIsSubmitting(false);
      setIsScannerOpen(false);
      setCodigoInput('');
      setInputValidation(null);

      if (item) {
        const masterCode = item.codigoMaestro || item.codigo;
        setSelectedMaster({
          codigo: masterCode,
          descripcion: item.descripcion || ''
        });
        setNotas(item.notas || '');
        setMasterQuery('');
        setMasterResults([]);

        // Si es edición de un código específico
        if (item.codigo && !item.isAddingToExistingMaster) {
          setCodigosList([item.codigo]);
        } else {
          setCodigosList([]);
        }

        // Cargar otros códigos existentes para este maestro
        catalogService.getRelatedCodesForMaster(masterCode).then(list => {
          setExistingMasterCodes(list || []);
        }).catch(() => setExistingMasterCodes([]));
      } else {
        setSelectedMaster(null);
        setMasterQuery('');
        setMasterResults([]);
        setCodigosList([]);
        setExistingMasterCodes([]);
        setNotas('');
      }
    }
  }, [isOpen, item]);

  // Búsqueda en catálogo maestro
  useEffect(() => {
    if (!isOpen || isEditing || selectedMaster) return;

    const trimmed = masterQuery.trim();
    if (!trimmed || trimmed.length < 2) {
      setMasterResults([]);
      setIsSearchingMaster(false);
      return;
    }

    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);

    searchTimerRef.current = setTimeout(async () => {
      try {
        setIsSearchingMaster(true);
        const results = await catalogService.searchMedicines(trimmed);
        setMasterResults(results.slice(0, 8));
      } catch (err) {
        console.warn('Error buscando producto maestro:', err);
        setMasterResults([]);
      } finally {
        setIsSearchingMaster(false);
      }
    }, 250);

    return () => {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    };
  }, [masterQuery, isOpen, isEditing, selectedMaster]);

  // Validación reactiva del input de código
  useEffect(() => {
    const raw = codigoInput.trim();
    if (!raw) {
      setInputValidation(null);
      return;
    }

    const clean = normalizeBarcode(raw);
    if (!clean) {
      setInputValidation({ valid: false, error: 'Código no válido.' });
      return;
    }

    // Verificar si ya está en la lista actual de códigos a relacionar
    if (codigosList.includes(clean)) {
      setInputValidation({ valid: false, error: `El código "${clean}" ya fue añadido a la lista actual.` });
      return;
    }

    if (validationTimerRef.current) clearTimeout(validationTimerRef.current);

    validationTimerRef.current = setTimeout(async () => {
      const res = await catalogService.validateRelatedCode(
        clean,
        selectedMaster?.codigo,
        isEditing ? item?.codigo : null
      );
      if (!res.valid) {
        setInputValidation({ valid: false, error: res.error });
      } else {
        setInputValidation({ valid: true });
      }
    }, 200);

    return () => {
      if (validationTimerRef.current) clearTimeout(validationTimerRef.current);
    };
  }, [codigoInput, codigosList, selectedMaster, isEditing, item]);

  if (!shouldRender) return null;

  const handleSelectMaster = async (med) => {
    const isRel = Boolean(med.esRelacionado && med.codigoMaestro);
    const masterCode = isRel ? med.codigoMaestro : med.codigo;
    const masterDesc = med.descripcion;

    setSelectedMaster({
      codigo: masterCode,
      descripcion: masterDesc,
      wasDerivedFromRelated: isRel ? med.codigoRelacionado : null
    });
    setMasterResults([]);
    setMasterQuery('');
    setErrorMsg('');

    try {
      const existing = await catalogService.getRelatedCodesForMaster(masterCode);
      setExistingMasterCodes(existing || []);
    } catch (_) {
      setExistingMasterCodes([]);
    }
  };

  const handleResetMaster = () => {
    if (isEditing) return;
    setSelectedMaster(null);
    setMasterResults([]);
    setMasterQuery('');
    setCodigosList([]);
    setExistingMasterCodes([]);
    setCodigoInput('');
    setInputValidation(null);
  };

  const handleAddCodigo = async (raw) => {
    const clean = normalizeBarcode(raw || codigoInput);
    if (!clean) return;

    if (!selectedMaster) {
      setErrorMsg('Primero selecciona el producto maestro al que deseas vincular este código.');
      return;
    }

    if (codigosList.includes(clean)) {
      setErrorMsg(`El código "${clean}" ya está en la lista para relacionar.`);
      return;
    }

    const val = await catalogService.validateRelatedCode(
      clean,
      selectedMaster.codigo,
      isEditing ? item?.codigo : null
    );

    if (!val.valid) {
      setErrorMsg(val.error);
      return;
    }

    setCodigosList(prev => [...prev, clean]);
    setCodigoInput('');
    setInputValidation(null);
    setErrorMsg('');
    playSuccessSound();
  };

  const handleRemoveCodigo = (clean) => {
    setCodigosList(prev => prev.filter(c => c !== clean));
  };

  const handleBarcodeScanned = async (scanned) => {
    const raw = typeof scanned === 'object' && scanned?.codigo ? scanned.codigo : scanned;
    const clean = normalizeBarcode(raw);
    if (!clean) return;

    if (!selectedMaster) {
      setCodigoInput(clean);
      setIsScannerOpen(false);
      return;
    }

    if (codigosList.includes(clean)) {
      setErrorMsg(`El código escaneado "${clean}" ya está en la lista.`);
      setIsScannerOpen(false);
      return;
    }

    const val = await catalogService.validateRelatedCode(
      clean,
      selectedMaster.codigo,
      isEditing ? item?.codigo : null
    );

    if (!val.valid) {
      setCodigoInput(clean);
      setInputValidation({ valid: false, error: val.error });
      setErrorMsg(val.error);
      setIsScannerOpen(false);
      return;
    }

    // Agregar directamente a la lista si es válido
    setCodigosList(prev => [...prev, clean]);
    setCodigoInput('');
    setInputValidation(null);
    setErrorMsg('');
    playSuccessSound();
    setIsScannerOpen(false);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMsg('');

    if (!selectedMaster || !selectedMaster.codigo) {
      setErrorMsg('Debes buscar y seleccionar un producto del catálogo maestro.');
      return;
    }

    // Si hay un código pendiente escrito en el input, validarlo e incluirlo
    let finalCodigos = [...codigosList];
    const pendingCode = normalizeBarcode(codigoInput);
    if (pendingCode && !finalCodigos.includes(pendingCode)) {
      const val = await catalogService.validateRelatedCode(
        pendingCode,
        selectedMaster.codigo,
        isEditing ? item?.codigo : null
      );
      if (!val.valid) {
        setErrorMsg(val.error);
        return;
      }
      finalCodigos.push(pendingCode);
    }

    if (finalCodigos.length === 0) {
      setErrorMsg('Ingresa o escanea al menos un código de barras a relacionar.');
      return;
    }

    try {
      setIsSubmitting(true);
      await onSave({
        codigos: finalCodigos,
        codigo: finalCodigos[0], // Compatibilidad con vistas previas
        codigoMaestro: normalizeBarcode(selectedMaster.codigo),
        descripcion: selectedMaster.descripcion,
        notas: (notas || '').trim()
      });
      playSuccessSound();
      onClose();
    } catch (err) {
      console.error('Error guardando código relacionado:', err);
      setErrorMsg(err.message || 'No se pudo guardar la relación de códigos.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const modalContent = (
    <div
      onClick={(e) => handleBackdropClick(e, !isSubmitting && !isScannerOpen)}
      className={`fixed inset-0 z-[120] bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-3 sm:p-6 select-none overflow-y-auto overscroll-contain ${backdropClass}`}
    >
      <div
        ref={cardRef}
        style={cardStyle}
        className={`bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl border border-slate-200/90 dark:border-slate-800 max-h-[calc(100dvh-1.5rem)] sm:max-h-[90dvh] flex flex-col overflow-hidden my-auto overscroll-contain ${cardClass}`}
      >
        {/* Cabecera */}
        <div className="px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shadow-xs">
              <Link2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                <span>{isEditing ? 'Editar Código Relacionado' : 'Relacionar Códigos a Producto'}</span>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                  Relacionado
                </span>
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Vincula uno o más códigos de barras alternos a un producto maestro oficial
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            disabled={isSubmitting}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Formulario contenedor flex-1 */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0 overflow-hidden">
          {/* Cuerpo Desplazable del Formulario */}
          <div className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0 overscroll-contain">
          {errorMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900 text-red-700 dark:text-red-300 rounded-2xl flex items-center gap-2 text-xs animate-fade-in">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 1. Selección de Producto Maestro */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              1. Producto del Catálogo Maestro <span className="text-red-500">*</span>
            </label>

            {selectedMaster ? (
              <div className="space-y-2">
                <div className="p-3.5 bg-indigo-50/70 dark:bg-indigo-950/40 rounded-2xl border border-indigo-200/80 dark:border-indigo-800/80 flex items-start justify-between gap-3 animate-fade-in">
                  <div className="min-w-0 flex-1 space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px] font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 shadow-2xs">
                        <Tag className="w-3 h-3 text-indigo-500" />
                        {selectedMaster.codigo}
                      </span>
                      <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 bg-emerald-100 dark:bg-emerald-950/80 px-2 py-0.5 rounded-full">
                        Maestro
                      </span>
                      {selectedMaster.wasDerivedFromRelated && (
                        <span className="text-[10px] font-medium text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/80 px-2 py-0.5 rounded-full">
                          Vía alterno: {selectedMaster.wasDerivedFromRelated}
                        </span>
                      )}
                    </div>
                    <div className="text-xs font-bold text-slate-900 dark:text-white leading-snug">
                      <MarqueeText text={selectedMaster.descripcion} />
                    </div>
                  </div>

                  {!isEditing && (
                    <button
                      type="button"
                      onClick={handleResetMaster}
                      disabled={isSubmitting}
                      className="p-1.5 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 rounded-xl transition-colors cursor-pointer shrink-0"
                      title="Seleccionar otro producto"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                  )}
                </div>

                {/* Lista de códigos ya relacionados previamente a este producto maestro */}
                {existingMasterCodes.length > 0 && (
                  <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/70 dark:border-slate-800 space-y-2 animate-fade-in">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                        <Link2 className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Códigos ya vinculados a este producto ({existingMasterCodes.length}):</span>
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto">
                      {existingMasterCodes.map((c) => (
                        <span
                          key={c.codigo}
                          className="inline-flex items-center gap-1 font-mono text-[10px] font-bold px-2 py-0.5 rounded-lg bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shadow-2xs"
                        >
                          <Tag className="w-2.5 h-2.5 text-indigo-500" />
                          <span>{c.codigo}</span>
                          {c.notas && (
                            <span className="font-sans font-normal text-slate-400 text-[9px] max-w-[120px] truncate">
                              ({c.notas})
                            </span>
                          )}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-2">
                <MarqueeSearchInput
                  label="Buscar producto en catálogo maestro"
                  value={masterQuery}
                  onChange={(e) => setMasterQuery(e.target.value)}
                  placeholder="Escribe el nombre o código maestro..."
                  disabled={isSubmitting}
                  icon={Search}
                  loading={isSearchingMaster}
                  onClear={() => setMasterQuery('')}
                />

                {masterResults.length > 0 && (
                  <div className="max-h-48 overflow-y-auto space-y-1.5 p-2 bg-slate-50 dark:bg-slate-800/90 rounded-2xl border border-slate-200/80 dark:border-slate-700 shadow-inner">
                    {masterResults.map((med) => (
                      <button
                        key={med.codigo}
                        type="button"
                        onClick={() => handleSelectMaster(med)}
                        className="w-full text-left p-2 rounded-xl hover:bg-white dark:hover:bg-slate-700/80 border border-transparent hover:border-slate-200 dark:hover:border-slate-600 transition-all flex items-center justify-between gap-2 group cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-mono text-[10px] font-bold text-indigo-600 dark:text-indigo-400">
                              {med.codigo}
                            </span>
                            {med.esRelacionado && (
                              <span className="text-[9px] font-bold text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-950/80 px-1.5 py-0.2 rounded">
                                Ya relacionado
                              </span>
                            )}
                          </div>
                          <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 block truncate">
                            {med.descripcion}
                          </span>
                        </div>
                        <Check className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                <p className="text-[11px] text-slate-400 dark:text-slate-500 pl-1">
                  Escribe al menos 2 caracteres o el código maestro para buscar el producto de destino.
                </p>
              </div>
            )}
          </div>

          {/* 2. Códigos de Barras a Relacionar (permite múltiples) */}
          <div className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
                2. Códigos de Barras a Relacionar <span className="text-red-500">*</span>
              </label>
              {codigosList.length > 0 && (
                <span className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                  {codigosList.length} {codigosList.length === 1 ? 'código en lista' : 'códigos en lista'}
                </span>
              )}
            </div>

            {/* Chips de códigos añadidos a la lista */}
            {codigosList.length > 0 && (
              <div className="p-3 bg-indigo-50/50 dark:bg-indigo-950/30 rounded-2xl border border-indigo-200/60 dark:border-indigo-800/60 space-y-2">
                <span className="text-[10px] uppercase font-bold text-indigo-700 dark:text-indigo-300 tracking-wider block">
                  Códigos que se vincularán al producto:
                </span>
                <div className="flex flex-wrap gap-2">
                  {codigosList.map((code) => (
                    <span
                      key={code}
                      className="inline-flex items-center gap-1.5 font-mono text-xs font-bold px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 shadow-2xs animate-fade-in"
                    >
                      <Tag className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                      <span>{code}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveCodigo(code)}
                        className="w-4 h-4 rounded-full hover:bg-red-100 dark:hover:bg-red-950/80 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer ml-0.5"
                        title="Quitar código de la lista"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Fila de ingreso de código: Input + Botón Añadir + Botón Cámara */}
            <div className="flex items-center gap-2">
              <div className="flex-1">
                <FloatingInput
                  label={codigosList.length > 0 ? "Añadir otro código alterno" : "Código de barras a relacionar *"}
                  value={codigoInput}
                  onChange={(e) => {
                    setCodigoInput(e.target.value);
                    setErrorMsg('');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddCodigo(codigoInput);
                    }
                  }}
                  placeholder="Ej. 7501234567890 (escribe o escanea)"
                  disabled={isSubmitting}
                  icon={Tag}
                  className="font-mono font-bold"
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddCodigo(codigoInput)}
                disabled={isSubmitting || !codigoInput.trim() || Boolean(inputValidation && !inputValidation.valid)}
                className="inline-flex items-center gap-1 px-3.5 py-3 bg-indigo-50 dark:bg-indigo-950/60 hover:bg-indigo-100 dark:hover:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/80 dark:border-indigo-800 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-2xs active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                title="Añadir a la lista"
              >
                <Plus className="w-4 h-4" />
                <span className="hidden sm:inline">Añadir</span>
              </button>

              <button
                type="button"
                onClick={() => setIsScannerOpen(true)}
                disabled={isSubmitting}
                className="inline-flex items-center gap-1.5 px-3.5 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-xs active:scale-95 disabled:opacity-50 shrink-0"
                title="Escanear con la cámara del dispositivo"
              >
                <Camera className="w-4 h-4" />
                <span className="hidden sm:inline">Escanear</span>
              </button>
            </div>

            {/* Validación en vivo de lo que se escribe */}
            {inputValidation && !inputValidation.valid && (
              <div className="p-2.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-200/80 dark:border-amber-800/80 text-amber-800 dark:text-amber-300 rounded-xl flex items-center gap-2 text-[11px] animate-fade-in">
                <AlertCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                <span>{inputValidation.error}</span>
              </div>
            )}

            <p className="text-[11px] text-slate-400 dark:text-slate-500 pl-1">
              Puedes agregar varios códigos distintos para el mismo producto. Escribe y presiona Enter o escanea con la cámara.
            </p>
          </div>

          {/* 3. Motivo o Notas Opcionales */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 dark:text-slate-300">
              3. Motivo o Referencia (Opcional)
            </label>
            <FloatingInput
              label="Motivo o referencia (Opcional)"
              value={notas}
              onChange={(e) => setNotas(e.target.value)}
              placeholder="Ej. Nueva presentación de fabricante, código POS..."
              disabled={isSubmitting}
              icon={FileText}
            />
          </div>

          {/* Resumen explicativo */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200/60 dark:border-slate-800 flex items-start gap-2.5 text-[11px] text-slate-500 dark:text-slate-400">
            <Info className="w-4 h-4 text-indigo-500 shrink-0 mt-0.5" />
            <div className="leading-relaxed">
              Al guardar, cuando un operador escanee cualquiera de estos códigos alternos se localizará automáticamente el producto oficial con la etiqueta <span className="font-bold text-indigo-600 dark:text-indigo-400">"Relacionado"</span> tanto en modo online como offline.
            </div>
          </div>

          </div>

          {/* Pie FIJO (Sticky Footer con botones siempre visibles) */}
          <div className="px-6 py-4 bg-slate-50/90 dark:bg-slate-900/95 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-2 shrink-0 backdrop-blur-xs">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2.5 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold rounded-2xl border border-slate-200/80 dark:border-slate-700 transition-all cursor-pointer disabled:opacity-50 shadow-2xs"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !selectedMaster || (codigosList.length === 0 && !codigoInput.trim())}
              className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Guardando...</span>
              ) : (
                <>
                  <Check className="w-4 h-4" />
                  <span>
                    {isEditing
                      ? 'Actualizar Relación'
                      : codigosList.length > 1
                      ? `Guardar ${codigosList.length} Códigos`
                      : 'Guardar Relación'}
                  </span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );

  return (
    <>
      {createPortal(modalContent, document.body)}

      {/* Escáner de Cámara secundario */}
      {isScannerOpen && (
        <BarcodeScannerModal
          isOpen={isScannerOpen}
          zIndexClass="z-[150]"
          onClose={() => setIsScannerOpen(false)}
          onDetected={handleBarcodeScanned}
        />
      )}
    </>
  );
}
