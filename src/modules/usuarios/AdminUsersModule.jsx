import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  ArrowLeft,
  Users,
  Building2,
  Layers,
  Plus,
  Trash2,
  Edit2,
  Key,
  Shield,
  Check,
  X,
  Search,
  CheckCircle2,
  AlertCircle,
  Loader2,
  UserX,
  Eye,
  EyeOff,
  Info,
  Tag
} from 'lucide-react';
import { userService } from './userService';
import { organizationService } from './organizationService';
import { ModalDialog } from '../../shared/ModalDialog';
import { transitionView } from '../../shared';
import { useBodyScrollLock } from '../../hooks';

export function AdminUsersModule({ currentUser, onBack, onRefresh }) {
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('erp_admin_active_tab') || 'usuarios';
  });

  const TAB_ORDER = ['usuarios', 'sedes', 'areas'];
  const handleSwitchTab = (newTab) => {
    if (newTab === activeTab) return;
    const oldIdx = TAB_ORDER.indexOf(activeTab);
    const newIdx = TAB_ORDER.indexOf(newTab);
    const direction = newIdx >= oldIdx ? 'forward' : 'back';
    transitionView(() => {
      setActiveTab(newTab);
    }, { direction });
  };
  const [isProcessing, setIsProcessing] = useState(false);
  
  // Data states
  const [usersList, setUsersList] = useState([]);
  const [sedesList, setSedesList] = useState([]);
  const [areasList, setAreasList] = useState([]);
  const [searchUser, setSearchUser] = useState('');

  // Modals for CRUD (Users)
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userForm, setUserForm] = useState({
    username: '', password: '', confirmPassword: '', nombre: '', sede: '', area: '', roles: ['solicitar'], excluirDestinatario: false
  });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [formError, setFormError] = useState('');

  // Modals for CRUD (Sedes)
  const [isSedeModalOpen, setIsSedeModalOpen] = useState(false);
  const [editingSede, setEditingSede] = useState(null);
  const [sedeForm, setSedeForm] = useState({ nombre: '', tipo: 'Sucursal', areas: [] });
  const [selectedAreaToAdd, setSelectedAreaToAdd] = useState('');

  // Modals for CRUD (Areas)
  const [isAreaModalOpen, setIsAreaModalOpen] = useState(false);
  const [editingArea, setEditingArea] = useState(null);
  const [areaForm, setAreaForm] = useState({ nombre: '', excluirTransferencias: false });

  // Bloquear scroll de fondo cuando cualquiera de los modales de administración esté abierto
  useBodyScrollLock(isUserModalOpen || isSedeModalOpen || isAreaModalOpen);

  // Pop-up dialog state
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

  useEffect(() => {
    const unsubUsers = userService.subscribeUsers((list) => setUsersList(list));
    const unsubSedes = organizationService.subscribeSedes((list) => setSedesList(list));
    const unsubAreas = organizationService.subscribeAreas((list) => setAreasList(list));

    const handleRefreshedUsers = (e) => {
      if (e.detail && Array.isArray(e.detail)) {
        setUsersList(e.detail);
      }
    };
    window.addEventListener('erp_users_refreshed', handleRefreshedUsers);

    return () => {
      if (typeof unsubUsers === 'function') unsubUsers();
      if (typeof unsubSedes === 'function') unsubSedes();
      if (typeof unsubAreas === 'function') unsubAreas();
      window.removeEventListener('erp_users_refreshed', handleRefreshedUsers);
    };
  }, []);
  
  useEffect(() => {
    localStorage.setItem('erp_admin_active_tab', activeTab);
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [activeTab]);

  // --- MÉTODOS DE USUARIOS ---
  const handleOpenCreateUser = () => {
    setEditingUser(null);
    setUserForm({
      username: '',
      password: '',
      confirmPassword: '',
      nombre: '',
      sede: '',
      area: '',
      roles: ['solicitar'],
      excluirDestinatario: false
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError('');
    setIsUserModalOpen(true);
  };

  const handleOpenEditUser = (user) => {
    setEditingUser(user);
    const sedeObj = sedesList.find(s => s.nombre === user.sede);
    const sedeAreas = sedeObj?.areas || [];

    setUserForm({
      username: user.username,
      password: user.password || '',
      confirmPassword: user.password || '',
      nombre: user.nombre,
      sede: user.sede || '',
      area: (sedeAreas.length > 0 ? (user.area || '') : ''),
      roles: user.roles || ['solicitar'],
      excluirDestinatario: Boolean(user.excluirDestinatario)
    });
    setShowPassword(false);
    setShowConfirmPassword(false);
    setFormError('');
    setIsUserModalOpen(true);
  };

  const handleSedeChange = (sedeNombre) => {
    if (!sedeNombre) {
      setUserForm(prev => ({ ...prev, sede: '', area: '' }));
      return;
    }
    const sedeObj = sedesList.find(s => s.nombre === sedeNombre);
    const sedeAreas = sedeObj?.areas || [];

    setUserForm(prev => ({
      ...prev,
      sede: sedeNombre,
      area: sedeAreas.includes(prev.area) ? prev.area : ''
    }));
  };

  const toggleRole = (role) => {
    let currentRoles = [...userForm.roles];
    if (currentRoles.includes(role)) {
      if (currentRoles.length === 1) {
        setFormError('El usuario debe conservar al menos un rol asignado.');
        return;
      }
      currentRoles = currentRoles.filter(r => r !== role);
    } else {
      currentRoles.push(role);
    }
    setFormError('');
    setUserForm({ ...userForm, roles: currentRoles });
  };

  const handleSaveUser = async (e) => {
    e.preventDefault();
    setFormError('');

    if (!userForm.sede) {
      setFormError('Por favor selecciona una sede para el usuario.');
      return;
    }

    const selectedSedeObj = sedesList.find(s => s.nombre === userForm.sede);
    const sedeAreas = selectedSedeObj?.areas || [];

    if (sedeAreas.length > 0 && !userForm.area) {
      setFormError(`La sede "${userForm.sede}" requiere que selecciones una sub-área.`);
      return;
    }

    if (userForm.password !== userForm.confirmPassword) {
      setFormError('Las contraseñas no coinciden. Por favor verifica.');
      return;
    }

    setIsProcessing(true);
    const finalArea = sedeAreas.length > 0 ? userForm.area.trim() : '';
    const selectedAreaObj = areasList.find(a => a.nombre?.toLowerCase() === finalArea.toLowerCase());
    const isAreaExcluded = Boolean(selectedAreaObj?.excluirTransferencias);
    const finalExcluirDestinatario = isAreaExcluded ? true : Boolean(userForm.excluirDestinatario);

    const payload = {
      username: userForm.username,
      password: userForm.password,
      nombre: userForm.nombre,
      sede: userForm.sede,
      area: finalArea,
      roles: userForm.roles,
      excluirDestinatario: finalExcluirDestinatario
    };

    try {
      if (editingUser) {
        await userService.updateUser(editingUser.id || editingUser.username, payload);
        setDialog({ isOpen: true, type: 'alert', title: 'Actualizado', message: `Usuario guardado.`, variant: 'success', onConfirm: closeDialog });
      } else {
        await userService.createUser(payload);
        setDialog({ isOpen: true, type: 'alert', title: 'Creado', message: `Usuario registrado.`, variant: 'success', onConfirm: closeDialog });
      }
      setIsUserModalOpen(false);
    } catch (err) {
      setFormError(err.message || 'Error al guardar el usuario.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteUser = (user) => {
    if (user.username.toLowerCase() === 'administrador') {
      setDialog({ isOpen: true, type: 'alert', title: 'Acción no permitida', message: 'El Administrador principal no se puede eliminar.', variant: 'danger', onConfirm: closeDialog });
      return;
    }
    setDialog({
      isOpen: true, type: 'confirm', title: 'Eliminar Usuario',
      message: `¿Eliminar permanentemente a "${user.nombre}"?`, variant: 'danger',
      onConfirm: async () => {
        closeDialog();
        setIsProcessing(true);
        try {
          await userService.deleteUser(user.id || user.username);
          // NOTA: Eliminamos setUsersList manual
        } catch (err) {
          setDialog({ isOpen: true, type: 'alert', title: 'Error', message: err.message, variant: 'danger', onConfirm: closeDialog });
        } finally {
          setIsProcessing(false);
        }
      },
      onCancel: closeDialog
    });
  };

  // --- MÉTODOS DE SEDES ---
  const handleOpenCreateSede = () => {
    setEditingSede(null);
    setSedeForm({ nombre: '', tipo: 'Sucursal', areas: [] });
    setSelectedAreaToAdd('');
    setIsSedeModalOpen(true);
  };

  const handleOpenEditSede = (sede) => {
    setEditingSede(sede);
    setSedeForm({
      nombre: sede.nombre,
      tipo: sede.tipo || 'Sucursal',
      areas: Array.isArray(sede.areas) ? [...sede.areas] : []
    });
    setSelectedAreaToAdd('');
    setIsSedeModalOpen(true);
  };

  const handleAddAreaToSedeForm = (areaName = null) => {
    const clean = (areaName || selectedAreaToAdd || '').trim();
    if (!clean) return;
    if (sedeForm.areas.includes(clean)) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Área duplicada',
        message: `El área "${clean}" ya está asociada a esta sede.`,
        variant: 'primary',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }
    setSedeForm(prev => ({ ...prev, areas: [...prev.areas, clean] }));
    setSelectedAreaToAdd('');
  };

  const handleRemoveAreaFromSedeForm = (areaToRemove) => {
    setSedeForm(prev => ({
      ...prev,
      areas: prev.areas.filter(a => a !== areaToRemove)
    }));
  };

  const handleSaveSede = async (e) => {
    e.preventDefault();
    if (!sedeForm.nombre.trim()) return;
    if (!sedeForm.tipo) {
      setDialog({
        isOpen: true,
        type: 'alert',
        title: 'Tipo Requerido',
        message: 'Por favor selecciona el tipo de sede (Sucursal o Matriz).',
        variant: 'primary',
        confirmText: 'Entendido',
        onConfirm: closeDialog
      });
      return;
    }
    setIsProcessing(true);

    try {
      if (editingSede) {
        await organizationService.updateSede(editingSede.id, sedeForm.nombre, sedeForm.tipo, sedeForm.areas);
      } else {
        await organizationService.createSede(sedeForm.nombre, sedeForm.tipo, sedeForm.areas);
      }
      setIsSedeModalOpen(false);
    } catch (err) {
      setDialog({ isOpen: true, type: 'alert', title: 'Error', message: err.message, variant: 'danger', onConfirm: closeDialog });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteSede = (sede) => {
    const assignedUsers = usersList.filter(
      u => (u.sede || '').toLowerCase() === (sede.nombre || '').toLowerCase()
    );

    const warnMsg = assignedUsers.length > 0
      ? `ATENCIÓN: Hay ${assignedUsers.length} usuario(s) asignados a esta sede (${assignedUsers.map(u => u.nombre).slice(0, 3).join(', ')}${assignedUsers.length > 3 ? '...' : ''}).\n\n¿Deseas eliminar la sede "${sede.nombre}" de todos modos?`
      : `¿Deseas eliminar permanentemente la sede "${sede.nombre}"?`;

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: '¿Eliminar Sede?',
      message: warnMsg,
      variant: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        setIsProcessing(true);
        try {
          await organizationService.deleteSede(sede.id);
        } catch (err) {
          setDialog({ isOpen: true, type: 'alert', title: 'Error', message: err.message, variant: 'danger', onConfirm: closeDialog });
        } finally {
          setIsProcessing(false);
        }
      },
      onCancel: closeDialog
    });
  };

  // --- MÉTODOS DE ÁREAS ---
  const handleOpenCreateArea = () => {
    setEditingArea(null);
    setAreaForm({ nombre: '', excluirTransferencias: false });
    setIsAreaModalOpen(true);
  };

  const handleOpenEditArea = (area) => {
    setEditingArea(area);
    setAreaForm({
      nombre: area.nombre,
      excluirTransferencias: Boolean(area.excluirTransferencias)
    });
    setIsAreaModalOpen(true);
  };

  const handleSaveArea = async (e) => {
    e.preventDefault();
    if (!areaForm.nombre.trim()) return;
    setIsProcessing(true);

    try {
      if (editingArea) {
        await organizationService.updateArea(editingArea.id, areaForm.nombre, areaForm.excluirTransferencias);
      } else {
        await organizationService.createArea(areaForm.nombre, areaForm.excluirTransferencias);
      }
      setIsAreaModalOpen(false);
    } catch (err) {
      setDialog({ isOpen: true, type: 'alert', title: 'Error', message: err.message, variant: 'danger', onConfirm: closeDialog });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleDeleteArea = (area) => {
    const assignedUsers = usersList.filter(
      u => (u.area || '').toLowerCase() === (area.nombre || '').toLowerCase()
    );

    const warnMsg = assignedUsers.length > 0
      ? `ATENCIÓN: Hay ${assignedUsers.length} usuario(s) asignados a esta área (${assignedUsers.map(u => u.nombre).slice(0, 3).join(', ')}${assignedUsers.length > 3 ? '...' : ''}).\n\n¿Deseas eliminar el área "${area.nombre}" de todos modos?`
      : `¿Deseas eliminar permanentemente el área "${area.nombre}"?`;

    setDialog({
      isOpen: true,
      type: 'confirm',
      title: '¿Eliminar Área?',
      message: warnMsg,
      variant: 'danger',
      confirmText: 'Sí, eliminar',
      cancelText: 'Cancelar',
      onConfirm: async () => {
        closeDialog();
        setIsProcessing(true);
        try {
          await organizationService.deleteArea(area.id);
        } catch (err) {
          setDialog({ isOpen: true, type: 'alert', title: 'Error', message: err.message, variant: 'danger', onConfirm: closeDialog });
        } finally {
          setIsProcessing(false);
        }
      },
      onCancel: closeDialog
    });
  };

  const filteredUsers = usersList.filter(u =>
    u.nombre?.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.username?.toLowerCase().includes(searchUser.toLowerCase()) ||
    u.sede?.toLowerCase().includes(searchUser.toLowerCase())
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 pb-20 relative">
      
      {/* PANTALLA DE CARGA GLOBAL */}
      {isProcessing && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/30 backdrop-blur-sm animate-fade-in">
          <div className="bg-white p-6 rounded-3xl shadow-2xl flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-600 animate-spin" />
            <span className="text-sm font-bold text-slate-800">Procesando...</span>
          </div>
        </div>,
        document.body
      )}

      {/* Top Header */}
      <div className="flex items-center justify-between vt-module-header">
        <button
          onClick={onBack}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900 bg-white px-3 py-1.5 rounded-full border border-slate-200/80 shadow-sm transition-all active:scale-95 cursor-pointer"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Volver al Dashboard</span>
        </button>

        {/* Tab Switcher */}
        <div className="bg-slate-200/70 p-0.5 rounded-full flex text-xs font-medium">
          <button onClick={() => handleSwitchTab('usuarios')} className={`px-3 py-1 rounded-full transition-all cursor-pointer ${activeTab === 'usuarios' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>
            Usuarios ({usersList.length})
          </button>
          <button onClick={() => handleSwitchTab('sedes')} className={`px-3 py-1 rounded-full transition-all cursor-pointer ${activeTab === 'sedes' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>
            Sedes ({sedesList.length})
          </button>
          <button onClick={() => handleSwitchTab('areas')} className={`px-3 py-1 rounded-full transition-all cursor-pointer ${activeTab === 'areas' ? 'bg-white text-slate-900 shadow-sm font-semibold' : 'text-slate-500 hover:text-slate-800'}`}>
            Áreas ({areasList.length})
          </button>
        </div>
      </div>

      {/* TAB 1: USUARIOS */}
      {activeTab === 'usuarios' && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm">
            <div className="relative flex-1">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Buscar por nombre, usuario o sede..."
                value={searchUser}
                onChange={(e) => setSearchUser(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-10 pr-9 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500"
              />
              {searchUser && (
                <button
                  type="button"
                  onClick={() => setSearchUser('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 rounded-full bg-slate-200/80 hover:bg-slate-300 text-slate-500 hover:text-slate-800 flex items-center justify-center transition-colors cursor-pointer"
                  title="Limpiar búsqueda"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
            <button onClick={handleOpenCreateUser} className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-2xl shadow-sm transition-all cursor-pointer shrink-0">
              <Plus className="w-4 h-4" />
              <span>Nuevo Usuario</span>
            </button>
          </div>

          <div className="bg-white rounded-3xl border border-slate-200/80 shadow-sm overflow-hidden divide-y divide-slate-100">
            {filteredUsers.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">No hay usuarios registrados.</div>
            ) : (
              filteredUsers.map((user) => {
                const isAdmin = user.username.toLowerCase() === 'administrador';
                const isAdministrativo = String(user.area || '').trim().toLowerCase() === 'administrativo';
                const isExcluded = Boolean(user.excluirDestinatario);

                return (
                  <div key={user.id || user.username} className="p-4 sm:p-5 flex items-center justify-between gap-4 hover:bg-slate-50/50 transition-colors">
                    <div className="space-y-1 min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h4 className="text-sm font-bold text-slate-900 truncate">{user.nombre}</h4>
                        <span className="font-mono text-[11px] text-slate-400">@{user.username}</span>
                        {isAdmin && <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-50 text-purple-700 border border-purple-200">Principal</span>}
                        {(isAdministrativo || isExcluded) && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200 flex items-center gap-1">
                            <UserX className="w-3 h-3" />
                            Excluido de envíos
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                        <span>{user.sede || 'Sin sede'}</span><span>&bull;</span><span>{user.area || 'Sin área'}</span>
                      </div>
                      <div className="flex items-center gap-1 pt-1 flex-wrap">
                        {user.roles?.includes('solicitar') && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700">Solicitar</span>}
                        {user.roles?.includes('despachar') && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700">Despachar</span>}
                        {user.roles?.includes('material') && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-amber-50 text-amber-700">Material</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button onClick={() => handleOpenEditUser(user)} className="px-3 py-1.5 bg-slate-100 hover:bg-blue-50 text-slate-700 hover:text-blue-700 rounded-xl text-xs font-semibold flex items-center gap-1 transition-colors cursor-pointer" title="Modificar">
                        <Edit2 className="w-3.5 h-3.5" /><span className="hidden sm:inline">Modificar</span>
                      </button>
                      {!isAdmin && (
                        <button onClick={() => handleDeleteUser(user)} className="w-8 h-8 rounded-xl bg-slate-100 hover:bg-red-50 text-slate-400 hover:text-red-600 flex items-center justify-center transition-colors cursor-pointer" title="Eliminar">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* TAB 2: SEDES */}
      {activeTab === 'sedes' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Sucursales y Matriz</h3>
              <p className="text-xs text-slate-400">Puntos de operación y distribución</p>
            </div>
            <button onClick={handleOpenCreateSede} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-2xl shadow-sm transition-all cursor-pointer">
              <Plus className="w-4 h-4" /><span>Nueva Sede</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {sedesList.map((sede) => {
              const areas = Array.isArray(sede.areas) ? sede.areas : [];
              return (
                <div key={sede.id} className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex flex-col justify-between gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                        <Building2 className="w-4 h-4" />
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{sede.nombre}</h4>
                        <span className="text-[10px] text-slate-400 font-medium">{sede.tipo || 'Sucursal'}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button onClick={() => handleOpenEditSede(sede)} className="w-8 h-8 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-colors cursor-pointer" title="Editar">
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={() => handleDeleteSede(sede)} className="w-8 h-8 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer" title="Eliminar">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Badges de Áreas de la Sede */}
                  <div className="pt-2 border-t border-slate-100 flex flex-wrap items-center gap-1.5">
                    {areas.length > 0 ? (
                      <>
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Áreas ({areas.length}):</span>
                        {areas.map((ar, idx) => (
                          <span key={idx} className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-slate-100 text-slate-700 text-[11px] font-medium border border-slate-200/60">
                            <Layers className="w-2.5 h-2.5 text-blue-500" />
                            {ar}
                          </span>
                        ))}
                      </>
                    ) : (
                      <span className="text-[11px] text-slate-400 italic flex items-center gap-1">
                        <Info className="w-3 h-3 text-slate-300" /> Sede directa (sin sub-áreas)
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: ÁREAS */}
      {activeTab === 'areas' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Áreas y Departamentos</h3>
              <p className="text-xs text-slate-400">Patente, Genérico, Piso, Naturista, etc.</p>
            </div>
            <button onClick={handleOpenCreateArea} className="inline-flex items-center gap-1.5 px-4 py-2.5 bg-blue-600 hover:bg-blue-500 text-white text-xs font-semibold rounded-2xl shadow-sm transition-all cursor-pointer">
              <Plus className="w-4 h-4" /><span>Nueva Área</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {areasList.map((area) => (
              <div key={area.id} className="bg-white p-4 rounded-3xl border border-slate-200/80 shadow-sm flex items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className={`w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 ${
                    area.excluirTransferencias ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'
                  }`}>
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="text-sm font-bold text-slate-900 truncate">{area.nombre}</h4>
                      {area.excluirTransferencias ? (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          Excluida de transferencias
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          Pide y despacha
                        </span>
                      )}
                    </div>
                    <span className="text-[10px] text-slate-400">
                      {area.excluirTransferencias
                        ? 'No participa en solicitudes ni despachos'
                        : 'Área operativa para medicamentos'}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button onClick={() => handleOpenEditArea(area)} className="w-8 h-8 rounded-xl text-slate-400 hover:text-blue-600 hover:bg-blue-50 flex items-center justify-center transition-colors cursor-pointer" title="Editar">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                  <button onClick={() => handleDeleteArea(area)} className="w-8 h-8 rounded-xl text-slate-400 hover:text-red-600 hover:bg-red-50 flex items-center justify-center transition-colors cursor-pointer" title="Eliminar">
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODAL: USUARIO */}
      {isUserModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto overscroll-contain">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden p-6 space-y-4 max-h-[90dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">{editingUser ? `Modificar a @${editingUser.username}` : 'Registrar Nuevo Usuario'}</h3>
              <button onClick={() => setIsUserModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 hover:text-slate-800 flex items-center justify-center cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            {formError && (
              <div className="p-3 bg-red-50 border border-red-200 rounded-2xl text-xs text-red-600 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" /><span>{formError}</span>
              </div>
            )}
            <form onSubmit={handleSaveUser} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">Nombre Completo *</label>
                <input type="text" required placeholder="Ej. Juan Pérez" value={userForm.nombre} onChange={(e) => setUserForm({ ...userForm, nombre: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">Username *</label>
                <input type="text" required disabled={Boolean(editingUser)} placeholder="Ej. juan.patente" value={userForm.username} onChange={(e) => setUserForm({ ...userForm, username: e.target.value })} className={`w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-blue-500 ${editingUser ? 'opacity-60 cursor-not-allowed' : ''}`} />
              </div>
              
              <div>
                <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">{editingUser ? 'Modificar Contraseña' : 'Contraseña *'}</label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    placeholder="Mínimo 3 caracteres"
                    value={userForm.password}
                    onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-10 py-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">Confirmar Contraseña *</label>
                <div className="relative">
                  <Key className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    required
                    placeholder="Repite la contraseña"
                    value={userForm.confirmPassword}
                    onChange={(e) => setUserForm({ ...userForm, confirmPassword: e.target.value })}
                    className="w-full bg-slate-50 border border-slate-200 rounded-2xl pl-9 pr-10 py-2.5 text-slate-900 font-mono focus:outline-none focus:border-blue-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                  >
                    {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {(() => {
                const selectedSedeObj = sedesList.find(s => s.nombre === userForm.sede);
                const sedeAreas = selectedSedeObj?.areas || [];
                const hasAreas = sedeAreas.length > 0;

                return (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">Sede *</label>
                      <select
                        value={userForm.sede}
                        onChange={(e) => handleSedeChange(e.target.value)}
                        className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-slate-900 focus:outline-none focus:border-blue-500"
                      >
                        <option value="">-- Seleccionar Sede --</option>
                        {sedesList.map((s) => (
                          <option key={s.id} value={s.nombre}>
                            {s.nombre} ({s.tipo || 'Sucursal'})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                          Área {hasAreas ? '*' : ''}
                        </label>
                        {!hasAreas && userForm.sede && (
                          <span className="text-[10px] text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded-full">
                            Sede directa
                          </span>
                        )}
                      </div>
                      {hasAreas ? (
                        <select
                          required
                          value={userForm.area}
                          onChange={(e) => {
                            const val = e.target.value;
                            const areaObj = areasList.find(item => item.nombre?.toLowerCase() === val.toLowerCase());
                            setUserForm(prev => ({
                              ...prev,
                              area: val,
                              excluirDestinatario: areaObj?.excluirTransferencias ? true : prev.excluirDestinatario
                            }));
                          }}
                          className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3 py-2.5 text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                        >
                          <option value="">-- Seleccionar Área --</option>
                          {sedeAreas.map((a, idx) => {
                            const areaObj = areasList.find(item => item.nombre?.toLowerCase() === a.toLowerCase());
                            const isExcluded = Boolean(areaObj?.excluirTransferencias);
                            return (
                              <option key={idx} value={a}>
                                {a} {isExcluded ? '(Excluida de transferencias)' : ''}
                              </option>
                            );
                          })}
                        </select>
                      ) : (
                        <div className="w-full bg-slate-100/80 border border-slate-200 rounded-2xl px-3 py-2.5 text-slate-500 text-xs flex items-center gap-1.5">
                          <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>Esta sede no requiere sub-área</span>
                        </div>
                      )}
                      {hasAreas && (
                        <p className="text-[10px] text-slate-400 mt-1">
                          Selecciona el área de operación de este usuario en {userForm.sede}.
                        </p>
                      )}
                    </div>
                  </div>
                );
              })()}

              <div>
                <label className="block text-slate-600 font-semibold mb-1.5 uppercase tracking-wider text-[11px]">Roles Permitidos *</label>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div onClick={() => toggleRole('solicitar')} className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${userForm.roles.includes('solicitar') ? 'bg-blue-50/70 border-blue-400 text-blue-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    <span className="font-semibold text-xs">Solicitar Pedido</span>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${userForm.roles.includes('solicitar') ? 'bg-blue-600 text-white' : 'border border-slate-300'}`}>
                      {userForm.roles.includes('solicitar') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                  <div onClick={() => toggleRole('despachar')} className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${userForm.roles.includes('despachar') ? 'bg-emerald-50/70 border-emerald-400 text-emerald-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    <span className="font-semibold text-xs">Despachar Pedido</span>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${userForm.roles.includes('despachar') ? 'bg-emerald-600 text-white' : 'border border-slate-300'}`}>
                      {userForm.roles.includes('despachar') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                  <div onClick={() => toggleRole('material')} className={`p-3 rounded-2xl border flex items-center justify-between cursor-pointer transition-all ${userForm.roles.includes('material') ? 'bg-amber-50/70 border-amber-400 text-amber-900' : 'bg-slate-50 border-slate-200 text-slate-600'}`}>
                    <span className="font-semibold text-xs">Material Brindado</span>
                    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${userForm.roles.includes('material') ? 'bg-amber-600 text-white' : 'border border-slate-300'}`}>
                      {userForm.roles.includes('material') && <Check className="w-3 h-3 stroke-[3]" />}
                    </div>
                  </div>
                </div>
              </div>

              <div 
                onClick={() => setUserForm({ ...userForm, excluirDestinatario: !userForm.excluirDestinatario })}
                className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={userForm.excluirDestinatario}
                  onChange={(e) => setUserForm({ ...userForm, excluirDestinatario: e.target.checked })}
                  className="w-4 h-4 mt-0.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-bold text-slate-800">Excluir como destinatario</span>
                  <span className="block text-[11px] text-slate-500 leading-tight mt-0.5">
                    No aparecerá en la lista de opciones para recibir solicitudes de transferencias.
                  </span>
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end gap-2">
                <button type="button" onClick={() => setIsUserModalOpen(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 font-semibold rounded-2xl cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl shadow-sm transition-all cursor-pointer">
                  {editingUser ? 'Guardar Cambios' : 'Registrar'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: SEDE */}
      {isSedeModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto overscroll-contain">
          <div className="bg-white rounded-3xl w-full max-w-md shadow-2xl border border-slate-100 p-6 space-y-4 max-h-[90dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">{editingSede ? 'Modificar Sede' : 'Agregar Sede'}</h3>
              <button onClick={() => setIsSedeModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveSede} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">Nombre de la Sede *</label>
                <input type="text" required placeholder="Ej. Sucursal San Jorge o Matriz Centro" value={sedeForm.nombre} onChange={(e) => setSedeForm({ ...sedeForm, nombre: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-blue-500" />
              </div>
              <div>
                <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">Tipo *</label>
                <select value={sedeForm.tipo} onChange={(e) => setSedeForm({ ...sedeForm, tipo: e.target.value })} className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-blue-500">
                  <option value="">-- Seleccionar Tipo --</option>
                  <option value="Sucursal">Sucursal</option>
                  <option value="Matriz">Matriz / Bodega Central</option>
                </select>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    Sub-Áreas Asociadas a la Sede
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">
                    {sedeForm.areas.length} {sedeForm.areas.length === 1 ? 'área asignada' : 'áreas asignadas'}
                  </span>
                </div>

                {areasList.length === 0 ? (
                  <div className="p-3 bg-amber-50 border border-amber-200/70 rounded-2xl text-[11px] text-amber-800 space-y-1">
                    <p className="font-bold flex items-center gap-1">
                      <AlertCircle className="w-3.5 h-3.5" />
                      No hay áreas registradas en el catálogo.
                    </p>
                    <p className="text-[10px] text-amber-700 leading-tight">
                      Para asociar sub-áreas a esta sede, primero debes crearlas en la pestaña <strong>Áreas</strong>.
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={selectedAreaToAdd}
                      onChange={(e) => setSelectedAreaToAdd(e.target.value)}
                      className="flex-1 bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-xs text-slate-900 focus:outline-none focus:border-blue-500 font-medium"
                    >
                      <option value="">-- Seleccionar área creada previamente --</option>
                      {areasList
                        .filter(a => !sedeForm.areas.includes(a.nombre))
                        .map((a) => (
                          <option key={a.id} value={a.nombre}>
                            {a.nombre} {a.excluirTransferencias ? '(Excluida de transferencias)' : ''}
                          </option>
                        ))}
                    </select>
                    <button
                      type="button"
                      disabled={!selectedAreaToAdd}
                      onClick={() => handleAddAreaToSedeForm()}
                      className="px-4 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-2xl font-semibold text-xs transition-all cursor-pointer shrink-0 shadow-sm"
                    >
                      + Asociar
                    </button>
                  </div>
                )}

                {/* Lista de chips de áreas asignadas */}
                <div className="bg-slate-50 p-2.5 rounded-2xl border border-slate-200/80 min-h-[50px] flex flex-wrap items-center gap-1.5">
                  {sedeForm.areas.length === 0 ? (
                    <span className="text-[11px] text-slate-400 italic px-1">
                      Sin sub-áreas asociadas. Esta sede operará como punto directo (no requerirá seleccionar área al pedir o despachar).
                    </span>
                  ) : (
                    sedeForm.areas.map((ar, idx) => {
                      const areaObj = areasList.find(a => a.nombre === ar);
                      const isExcluded = Boolean(areaObj?.excluirTransferencias);
                      return (
                        <span
                          key={idx}
                          className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-xs font-medium border shadow-2xs ${
                            isExcluded
                              ? 'bg-amber-50/80 text-amber-900 border-amber-200'
                              : 'bg-white text-slate-800 border-slate-200'
                          }`}
                        >
                          <Layers className={`w-3 h-3 ${isExcluded ? 'text-amber-500' : 'text-blue-500'}`} />
                          <span>{ar}</span>
                          {isExcluded && (
                            <span className="text-[9px] font-bold text-amber-700 bg-amber-100/70 px-1.5 py-0.2 rounded">
                              No transferible
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => handleRemoveAreaFromSedeForm(ar)}
                            className="w-4 h-4 rounded-full hover:bg-red-50 hover:text-red-600 text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
                            title="Quitar área de esta sede"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </span>
                      );
                    })
                  )}
                </div>
                <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                  Las áreas asociadas provienen del catálogo de Áreas. Si una sede tiene sub-áreas, se requerirá seleccionarla al solicitar o despachar.
                </p>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsSedeModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 font-semibold rounded-2xl cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl cursor-pointer shadow-sm">
                  {editingSede ? 'Actualizar Sede' : 'Guardar Sede'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* MODAL: ÁREA */}
      {isAreaModalOpen && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in overflow-y-auto overscroll-contain">
          <div className="bg-white rounded-3xl w-full max-w-sm shadow-2xl border border-slate-100 p-6 space-y-4 max-h-[90dvh] overflow-y-auto my-auto overscroll-contain">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">{editingArea ? 'Modificar Área' : 'Agregar Área'}</h3>
              <button onClick={() => setIsAreaModalOpen(false)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 flex items-center justify-center cursor-pointer"><X className="w-4 h-4" /></button>
            </div>
            <form onSubmit={handleSaveArea} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-slate-600 font-semibold mb-1 uppercase tracking-wider text-[11px]">Nombre del Área *</label>
                <input
                  type="text"
                  required
                  placeholder="Ej. Farmacia, Almacén Patente o Dirección General"
                  value={areaForm.nombre}
                  onChange={(e) => setAreaForm({ ...areaForm, nombre: e.target.value })}
                  className="w-full bg-slate-50 border border-slate-200 rounded-2xl px-3.5 py-2.5 text-slate-900 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div 
                onClick={() => setAreaForm({ ...areaForm, excluirTransferencias: !areaForm.excluirTransferencias })}
                className="flex items-start gap-3 p-3 bg-slate-50 border border-slate-200/80 rounded-2xl cursor-pointer select-none hover:bg-slate-100/80 transition-colors"
              >
                <input
                  type="checkbox"
                  checked={areaForm.excluirTransferencias}
                  onChange={(e) => setAreaForm({ ...areaForm, excluirTransferencias: e.target.checked })}
                  className="w-4 h-4 mt-0.5 text-blue-600 rounded border-slate-300 focus:ring-blue-500 cursor-pointer"
                />
                <div>
                  <span className="block text-xs font-bold text-slate-800">
                    Excluir de transferencias y pedidos
                  </span>
                  <span className="block text-[11px] text-slate-500 leading-tight mt-0.5">
                    Esta área no participará para pedir ni despachar productos (ej. Administrativo, Contabilidad, Dirección). No aparecerá como destino de transferencias ni cajas.
                  </span>
                </div>
              </div>

              <div className="pt-2 flex justify-end gap-2 border-t border-slate-100">
                <button type="button" onClick={() => setIsAreaModalOpen(false)} className="px-4 py-2 bg-slate-100 text-slate-600 font-semibold rounded-2xl cursor-pointer">Cancelar</button>
                <button type="submit" className="px-5 py-2 bg-blue-600 hover:bg-blue-500 text-white font-semibold rounded-2xl cursor-pointer shadow-sm">
                  {editingArea ? 'Actualizar' : 'Guardar Área'}
                </button>
              </div>
            </form>
          </div>
        </div>,
        document.body
      )}

      {/* Pop-up dialog */}
      <ModalDialog
        isOpen={dialog.isOpen} type={dialog.type} title={dialog.title} message={dialog.message}
        variant={dialog.variant} confirmText={dialog.confirmText} cancelText={dialog.cancelText}
        onConfirm={dialog.onConfirm} onCancel={dialog.onCancel}
      />
    </div>
  );
}