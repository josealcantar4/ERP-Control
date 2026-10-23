import React, { useState, useEffect, useMemo } from 'react';
import {
  ArrowLeft,
  Plus,
  Search,
  X,
  Package,
  Calendar,
  User,
  Building2,
  Tag,
  AlertTriangle,
  Clock,
  CheckCircle2,
  Trash2,
  Edit2,
  UserPlus,
  RefreshCw,
  Layers,
  Check
} from 'lucide-react';
import { materialService } from './materialService';
import { organizationService } from '../usuarios/organizationService';
import { MaterialFormModal } from './MaterialFormModal';
import { MaterialTypesModal } from './MaterialTypesModal';
import { MaterialPersonalModal } from './MaterialPersonalModal';
import { ModalDialog } from '../../shared/ModalDialog';

export function MaterialModule({ currentUser, onBack, onRefresh }) {
  const [materiales, setMateriales] = useState(() => materialService.getLocalMateriales());
  const [tipos, setTipos] = useState(() => materialService.getLocalTipos());
  const [personalList, setPersonalList] = useState(() => materialService.getLocalPersonal());
  const [areasList, setAreasList] = useState([]);

  // Modals state
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [isTypesModalOpen, setIsTypesModalOpen] = useState(false);
  const [isPersonalModalOpen, setIsPersonalModalOpen] = useState(false);

  // Search and Filter states
  const [searchQuery, setSearchQuery] = useState('');
  const [filterTipo, setFilterTipo] = useState('');
  const [filterEstado, setFilterEstado] = useState('todos'); // 'todos' | 'activo' | 'vencido' | 'reemplazado'

  // Confirm dialog state
  const [dialog, setDialog] = useState({
    isOpen: false,
    type: 'alert',
    title: '',
    message: '',
    variant: 'primary',
    confirmText: 'Aceptar',
    cancelText: 'Cancelar',
    onConfirm: () => {},
    onCancel: () => {}
  });

  const closeDialog = () => setDialog(prev => ({ ...prev, isOpen: false }));

  // 1. Suscripciones en tiempo real
  useEffect(() => {
    const unsubMat = materialService.subscribeMateriales(setMateriales);
    const unsubTipos = materialService.subscribeTipos(setTipos);
    const unsubPersonal = materialService.subscribePersonal(setPersonalList);
    const unsubAreas = organizationService.subscribeAreas(setAreasList);

    return () => {
      if (unsubMat) unsubMat();
      if (unsubTipos) unsubTipos();
      if (unsubPersonal) unsubPersonal();
      if (unsubAreas) unsubAreas();
    };
  }, []);

  // 2. Notificaciones calculadas para estadísticas
  const notifications = useMemo(() => {
    return materialService.calculateNotifications(materiales);
  }, [materiales]);

  const vencidasCount = notifications.filter(n => n.tipo === 'vencida').length;
  const proximasCount = notifications.filter(n => n.tipo === 'proxima').length;
  const activosCount = materiales.filter(m => m.estado === 'activo').length;

  // 3. Filtrado de materiales
  const filteredMateriales = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return materiales.filter((item) => {
      // Filtro por texto
      if (q) {
        const desc = (item.descripcion || '').toLowerCase();
        const pers = (item.personal || '').toLowerCase();
        const area = (item.area || '').toLowerCase();
        const tipo = (item.tipoControl || '').toLowerCase();
        const notas = (item.notas || '').toLowerCase();

        const matchText = desc.includes(q) || pers.includes(q) || area.includes(q) || tipo.includes(q) || notas.includes(q);
        if (!matchText) return false;
      }

      // Filtro por tipo de control
      if (filterTipo && item.tipoControl !== filterTipo) {
        return false;
      }

      // Filtro por estado
      if (filterEstado !== 'todos') {
        if (filterEstado === 'activo') {
          return item.estado === 'activo';
        }
        if (filterEstado === 'reemplazado') {
          return item.estado === 'reemplazado' || item.estado === 'devuelto';
        }
        if (filterEstado === 'vencido') {
          if (!item.requiereReemplazo || !item.fechaReemplazo || item.estado !== 'activo') return false;
          const [y, m, d] = item.fechaReemplazo.split('-').map(Number);
          const repDate = new Date(y, m - 1, d);
          return repDate < today;
        }
      }

      return true;
    });
  }, [materiales, searchQuery, filterTipo, filterEstado]);

  // Manejadores CRUD
  const handleOpenCreate = () => {
    setEditingItem(null);
    setIsFormModalOpen(true);
  };

  const handleOpenEdit = (item) => {
    setEditingItem(item);
    setIsFormModalOpen(true);
  };

  const handleSaveMaterial = async (formData) => {
    if (editingItem) {
      await materialService.updateMaterial(editingItem.id, formData, currentUser);
    } else {
      await materialService.createMaterial(formData, currentUser);
    }
  };

  const handleDeleteMaterial = (item) => {
    setDialog({
      isOpen: true,
      type: 'confirm',
      variant: 'danger',
      title: '¿Eliminar registro de material?',
      message: `¿Estás seguro de que deseas eliminar la entrega de "${item.descripcion}" asignada a ${item.personal}?\nEsta acción no se puede deshacer.`,
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        try {
          await materialService.deleteMaterial(item.id);
        } catch (e) {
          console.error(e);
        }
      },
      onCancel: closeDialog
    });
  };

  const handleToggleEstado = async (item) => {
    const nextStatus = item.estado === 'activo' ? 'reemplazado' : 'activo';
    await materialService.markAsStatus(item.id, nextStatus);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-5 pb-20 select-none animate-fade-in font-sans">
      
      {/* 1. ENCABEZADO SUPERIOR */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900 bg-white px-3.5 py-2 rounded-full border border-slate-200/80 shadow-sm transition-all cursor-pointer w-fit"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al Inicio</span>
        </button>

        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setIsTypesModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-2xl border border-slate-200/80 shadow-sm transition-all cursor-pointer"
          >
            <Tag className="w-3.5 h-3.5 text-blue-600" />
            <span>Tipos de Control ({tipos.length})</span>
          </button>

          <button
            onClick={() => setIsPersonalModalOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-2xl border border-slate-200/80 shadow-sm transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
            <span>Personal ({personalList.length})</span>
          </button>

          <button
            onClick={handleOpenCreate}
            className="inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-2xl shadow-sm shadow-blue-500/20 transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4 stroke-[2.5]" />
            <span>Registrar Entrega</span>
          </button>
        </div>
      </div>

      {/* 2. TÍTULO Y TARJETAS RESUMEN DE CONTROL */}
      <div className="space-y-1">
        <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
          Módulo de Control &bull; Asignación Interna
        </span>
        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Registro de Material y Herramientas Brindadas
        </h1>
        <p className="text-xs text-slate-500">
          Control de papelería, cómputo, herramientas y equipo asignado al personal con alertas de reemplazo.
        </p>
      </div>

      {/* MÉTRICAS / ESTADÍSTICAS ESTILO IOS */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Total Entregas</span>
          <p className="text-2xl font-extrabold text-slate-900 font-mono">{materiales.length}</p>
          <span className="text-[11px] text-slate-500">Registros en el sistema</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-emerald-600 tracking-wider">Activos en Uso</span>
          <p className="text-2xl font-extrabold text-emerald-600 font-mono">{activosCount}</p>
          <span className="text-[11px] text-slate-500">Material en servicio</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-amber-600 tracking-wider">Próximo Reemplazo</span>
          <p className="text-2xl font-extrabold text-amber-600 font-mono">{proximasCount}</p>
          <span className="text-[11px] text-slate-500">Próximos 7 días</span>
        </div>

        <div className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm space-y-1">
          <span className="text-[10px] uppercase font-bold text-red-600 tracking-wider">Reemplazos Vencidos</span>
          <p className="text-2xl font-extrabold text-red-600 font-mono">{vencidasCount}</p>
          <span className="text-[11px] text-slate-500">Requieren atención</span>
        </div>
      </div>

      {/* 3. BARRA DE BÚSQUEDA Y FILTROS */}
      <div className="bg-white p-3.5 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col sm:flex-row gap-2.5 items-center justify-between">
        
        {/* BUSCADOR */}
        <div className="relative flex-1 w-full">
          <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Buscar por material, persona, área o tipo..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-9 py-2 text-xs text-slate-900 focus:outline-none focus:bg-white focus:border-blue-500 transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
              title="Limpiar búsqueda"
            >
              <X className="w-3 h-3" />
            </button>
          )}
        </div>

        {/* SELECT TIPO DE CONTROL */}
        <select
          value={filterTipo}
          onChange={(e) => setFilterTipo(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 shrink-0 w-full sm:w-auto"
        >
          <option value="">Todos los tipos</option>
          {tipos.map((t) => (
            <option key={t.id} value={t.nombre}>{t.nombre}</option>
          ))}
        </select>

        {/* SELECT ESTADO */}
        <select
          value={filterEstado}
          onChange={(e) => setFilterEstado(e.target.value)}
          className="bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2 text-xs text-slate-700 focus:outline-none focus:bg-white focus:border-blue-500 shrink-0 w-full sm:w-auto"
        >
          <option value="todos">Todos los estados</option>
          <option value="activo">Solo Activos</option>
          <option value="vencido">Reemplazo Vencido</option>
          <option value="reemplazado">Reemplazados / Devueltos</option>
        </select>
      </div>

      {/* 4. LISTADO DE MATERIALES BRINDADOS */}
      <div className="space-y-3">
        {filteredMateriales.length === 0 ? (
          <div className="bg-white rounded-3xl p-10 border border-slate-200/80 shadow-sm text-center space-y-3">
            <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
              <Package className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">No se encontraron entregas de material</h3>
              <p className="text-xs text-slate-400 max-w-sm mx-auto mt-1">
                {searchQuery || filterTipo || filterEstado !== 'todos'
                  ? 'No hay registros que coincidan con los filtros de búsqueda aplicados.'
                  : 'Aún no se ha registrado ninguna entrega de herramientas o material a colaboradores.'}
              </p>
            </div>
            {!searchQuery && !filterTipo && filterEstado === 'todos' && (
              <button
                onClick={handleOpenCreate}
                className="mt-2 inline-flex items-center gap-1.5 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-xs font-bold rounded-2xl shadow-sm transition-all cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Registrar Primera Entrega</span>
              </button>
            )}
          </div>
        ) : (
          filteredMateriales.map((item) => {
            const isReplaced = item.estado === 'reemplazado';
            const isDevuelto = item.estado === 'devuelto';
            const isActivo = item.estado === 'activo';

            // Comprobar si está vencido o próximo
            let isOverdue = false;
            let isSoon = false;
            let diffDays = null;

            if (item.requiereReemplazo && item.fechaReemplazo && isActivo) {
              const today = new Date();
              today.setHours(0, 0, 0, 0);
              const [y, m, d] = item.fechaReemplazo.split('-').map(Number);
              const repDate = new Date(y, m - 1, d);
              diffDays = Math.round((repDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
              if (diffDays < 0) isOverdue = true;
              else if (diffDays <= 7) isSoon = true;
            }

            return (
              <div
                key={item.id}
                className="bg-white rounded-3xl p-4 sm:p-5 border border-slate-200/80 shadow-sm hover:border-slate-300 hover:shadow-md transition-all space-y-3"
              >
                {/* ENCABEZADO DE LA TARJETA */}
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-blue-50 text-blue-700 border border-blue-200 uppercase tracking-wider">
                        {item.tipoControl}
                      </span>

                      {/* PILL DE ESTADO */}
                      {isReplaced && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-slate-500" />
                          Reemplazado
                        </span>
                      )}
                      {isDevuelto && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          Devuelto al almacén
                        </span>
                      )}
                      {isActivo && !isOverdue && !isSoon && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Activo en uso
                        </span>
                      )}
                      {isOverdue && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-red-100 text-red-800 border border-red-200 flex items-center gap-1 animate-pulse">
                          <AlertTriangle className="w-3 h-3 text-red-600" />
                          Venció hace {Math.abs(diffDays)} {Math.abs(diffDays) === 1 ? 'día' : 'días'}
                        </span>
                      )}
                      {isSoon && (
                        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-amber-600" />
                          Vence en {diffDays} {diffDays === 1 ? 'día' : 'días'}
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-extrabold text-slate-900 leading-snug">
                      {item.descripcion}
                    </h3>
                  </div>

                  {/* CANTIDAD ENTREGADA */}
                  <div className="shrink-0 text-right">
                    <span className="font-mono font-bold text-xs bg-slate-100 px-3 py-1.5 rounded-2xl text-slate-800 border border-slate-200/60 inline-block">
                      {item.cantidad} {item.cantidad === 1 ? 'pieza' : 'piezas'}
                    </span>
                  </div>
                </div>

                {/* DETALLES DE ASIGNACIÓN: PERSONA, ÁREA Y FECHAS */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 p-3 bg-slate-50/80 rounded-2xl border border-slate-100 text-xs text-slate-600">
                  <div className="flex items-center gap-2">
                    <User className="w-4 h-4 text-indigo-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Asignado a:</span>
                      <strong className="text-slate-800">{item.personal}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Área:</span>
                      <strong className="text-slate-800">{item.area}</strong>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-slate-400 shrink-0" />
                    <div>
                      <span className="text-[10px] text-slate-400 block font-semibold">Entregado:</span>
                      <span className="font-mono font-semibold text-slate-700">{item.fechaEntrega}</span>
                    </div>
                  </div>
                </div>

                {/* FECHA DE REEMPLAZO PROGRAMADA SI EXISTE */}
                {item.requiereReemplazo && item.fechaReemplazo && (
                  <div className={`p-2.5 rounded-xl border flex items-center justify-between text-xs gap-2 ${
                    isOverdue
                      ? 'bg-red-50 text-red-900 border-red-200 font-semibold'
                      : isSoon
                      ? 'bg-amber-50 text-amber-900 border-amber-200 font-semibold'
                      : 'bg-slate-50 text-slate-700 border-slate-200'
                  }`}>
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Fecha programada de reemplazo: <strong>{item.fechaReemplazo}</strong></span>
                    </div>

                    {isActivo && (
                      <button
                        type="button"
                        onClick={() => handleToggleEstado(item)}
                        className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-lg text-[11px] font-bold transition-colors cursor-pointer flex items-center gap-1 shadow-2xs shrink-0"
                      >
                        <Check className="w-3 h-3" />
                        <span>Completar Reemplazo</span>
                      </button>
                    )}
                  </div>
                )}

                {/* NOTAS ADICIONALES */}
                {item.notas && (
                  <p className="text-xs text-slate-500 italic px-1">
                    Nota: "{item.notas}"
                  </p>
                )}

                {/* ACCIONES DE EDICIÓN Y BORRADO */}
                <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-2">
                  <div className="text-[10px] text-slate-400">
                    Registrado por: @{item.createdBy}
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => handleOpenEdit(item)}
                      className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-600 hover:text-blue-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      <span>Editar</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => handleDeleteMaterial(item)}
                      className="w-8 h-8 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer"
                      title="Eliminar registro"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

              </div>
            );
          })
        )}
      </div>

      {/* MODAL 1: FORMULARIO DE REGISTRO / EDICIÓN */}
      <MaterialFormModal
        isOpen={isFormModalOpen}
        editingItem={editingItem}
        tipos={tipos}
        personalList={personalList}
        areasList={areasList}
        onClose={() => setIsFormModalOpen(false)}
        onSave={handleSaveMaterial}
        onOpenManageTipos={() => {
          setIsFormModalOpen(false);
          setIsTypesModalOpen(true);
        }}
        onOpenManagePersonal={() => {
          setIsFormModalOpen(false);
          setIsPersonalModalOpen(true);
        }}
      />

      {/* MODAL 2: GESTIÓN DE TIPOS DE CONTROL */}
      <MaterialTypesModal
        isOpen={isTypesModalOpen}
        tipos={tipos}
        onClose={() => setIsTypesModalOpen(false)}
        onAddTipo={materialService.createTipo.bind(materialService)}
        onDeleteTipo={materialService.deleteTipo.bind(materialService)}
      />

      {/* MODAL 3: GESTIÓN DE PERSONAL */}
      <MaterialPersonalModal
        isOpen={isPersonalModalOpen}
        personalList={personalList}
        areasList={areasList}
        onClose={() => setIsPersonalModalOpen(false)}
        onAddPersonal={materialService.createPersonal.bind(materialService)}
        onDeletePersonal={materialService.deletePersonal.bind(materialService)}
      />

      {/* MODAL 4: DIÁLOGO DE CONFIRMACIÓN */}
      <ModalDialog
        isOpen={dialog.isOpen}
        type={dialog.type}
        title={dialog.title}
        message={dialog.message}
        variant={dialog.variant}
        confirmText={dialog.confirmText}
        cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm}
        onCancel={dialog.onCancel}
      />

    </div>
  );
}
