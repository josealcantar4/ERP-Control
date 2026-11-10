/**
 * Menú lateral desplegable tipo push que contiene configuración de usuario, sonidos, selector de tema e instalación de PWA.
 */

import React, { useState, useEffect, useCallback } from 'react';
import {
  X,
  Volume2,
  VolumeX,
  Sun,
  Moon,
  Monitor,
  Download,
  CheckCircle2,
  LogOut,
  Info,
  ChevronDown,
  Sparkles,
  Smartphone,
  Bell,
  Camera,
  Shield,
  AlertCircle
} from 'lucide-react';
import { AboutModal } from './AboutModal';
import { ModalDialog } from './ModalDialog';
import { useBodyScrollLock } from '../hooks';
import { playSuccessSound } from '../modules/transferencias';

function IOSSwitch({ checked, onChange, disabled = false, size = 'md' }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        if (!disabled) onChange(!checked);
      }}
      className={`relative inline-flex shrink-0 cursor-pointer rounded-full transition-colors duration-200 ease-in-out focus:outline-none ${
        disabled ? 'opacity-50 cursor-not-allowed' : ''
      } ${
        checked ? 'bg-blue-600 dark:bg-blue-500' : 'bg-slate-300 dark:bg-slate-700'
      } ${size === 'sm' ? 'h-5 w-9' : 'h-6 w-11'}`}
    >
      <span
        className={`pointer-events-none inline-block rounded-full bg-white shadow-md transform ring-0 transition duration-200 ease-in-out ${
          size === 'sm'
            ? checked
              ? 'translate-x-4 h-4 w-4 mt-0.5 ml-0.5'
              : 'translate-x-0.5 h-4 w-4 mt-0.5'
            : checked
            ? 'translate-x-5 h-5 w-5 mt-0.5 ml-0.5'
            : 'translate-x-0.5 h-5 w-5 mt-0.5'
        }`}
      />
    </button>
  );
}

export function AppSidebar({
  isOpen,
  onClose,
  currentUser,
  onLogout,
  preferences,
  onUpdatePreferences
}) {
  useBodyScrollLock(isOpen);

  const [isAboutOpen, setIsAboutOpen] = useState(false);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isAppInstalled, setIsAppInstalled] = useState(false);
  const [showInstallHelpModal, setShowInstallHelpModal] = useState(false);

  const [notificationStatus, setNotificationStatus] = useState(() => {
    return (typeof window !== 'undefined' && 'Notification' in window) ? Notification.permission : 'unsupported';
  });
  const [cameraStatus, setCameraStatus] = useState('prompt');
  const [permissionHelpDialog, setPermissionHelpDialog] = useState({
    isOpen: false,
    title: '',
    message: ''
  });

  const updatePermissionsState = useCallback(async () => {
    if (typeof window !== 'undefined' && 'Notification' in window) {
      setNotificationStatus(Notification.permission);
    }
    if (typeof navigator !== 'undefined' && navigator.permissions?.query) {
      try {
        const cam = await navigator.permissions.query({ name: 'camera' });
        setCameraStatus(cam.state);
        cam.onchange = () => {
          setCameraStatus(cam.state);
        };
      } catch (_e) {}
    }
  }, []);

  useEffect(() => {
    if (isOpen) {
      updatePermissionsState();
    }
  }, [isOpen, updatePermissionsState]);

  const handleShowDeniedHelp = (type) => {
    if (type === 'notificaciones') {
      setPermissionHelpDialog({
        isOpen: true,
        title: 'Permiso de Notificaciones Bloqueado',
        message: 'El navegador tiene bloqueado el permiso de notificaciones para ERP Control.\n\nPara activarlo:\n1. Toca el ícono de candado o ajustes junto a la barra de direcciones.\n2. Busca "Notificaciones" y cámbialo a "Permitir".\n3. Recarga la aplicación.'
      });
    } else {
      setPermissionHelpDialog({
        isOpen: true,
        title: 'Permiso de Cámara Bloqueado',
        message: 'El navegador tiene bloqueado el acceso a la cámara para el escáner de códigos de barra.\n\nPara activarlo:\n1. Toca el ícono de candado o ajustes junto a la barra de direcciones.\n2. Busca "Cámara" y cámbialo a "Permitir".\n3. Recarga la aplicación.'
      });
    }
  };

  const handleRequestNotificationPermission = async () => {
    if (typeof window === 'undefined' || !('Notification' in window)) {
      setPermissionHelpDialog({
        isOpen: true,
        title: 'Notificaciones No Compatibles',
        message: 'Tu navegador no cuenta con soporte para Notificaciones del sistema.'
      });
      return;
    }
    try {
      const res = await Notification.requestPermission();
      setNotificationStatus(res);
      if (res === 'granted') {
        playSuccessSound();
      } else if (res === 'denied') {
        handleShowDeniedHelp('notificaciones');
      }
    } catch (e) {
      console.warn('Error requesting notifications:', e);
    }
  };

  const handleRequestCameraPermission = async () => {
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setPermissionHelpDialog({
        isOpen: true,
        title: 'Cámara No Compatible',
        message: 'Tu dispositivo o navegador actual no soporta acceso directo a la cámara web.'
      });
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' }
      });
      stream.getTracks().forEach(t => t.stop());
      setCameraStatus('granted');
      playSuccessSound();
    } catch (err) {
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setCameraStatus('denied');
        handleShowDeniedHelp('camara');
      }
    }
  };

  useEffect(() => {
    const isStandalone =
      (typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) ||
      (typeof window !== 'undefined' && window.navigator && window.navigator.standalone === true);

    if (isStandalone) {
      setIsAppInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => {
      setIsAppInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  const handleInstallApp = async () => {
    if (isAppInstalled) return;

    if (!deferredPrompt) {
      setShowInstallHelpModal(true);
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsAppInstalled(true);
    }
    setDeferredPrompt(null);
  };

  const currentTheme = preferences?.theme || 'sistema';
  const sounds = preferences?.sounds || { enabled: true, exito: true, seleccionado: true };

  const handleToggleSoundMaster = (newEnabled) => {
    onUpdatePreferences({
      sounds: {
        ...sounds,
        enabled: newEnabled
      }
    });
  };

  const handleToggleExito = (newExito) => {
    onUpdatePreferences({
      sounds: {
        ...sounds,
        exito: newExito
      }
    });
  };

  const handleToggleSeleccionado = (newSeleccionado) => {
    onUpdatePreferences({
      sounds: {
        ...sounds,
        seleccionado: newSeleccionado
      }
    });
  };

  const handleThemeChange = (e) => {
    const newTheme = e.target.value;
    onUpdatePreferences({ theme: newTheme });
  };

  return (
    <>
      <div
        onClick={onClose}
        onTouchMove={(e) => e.preventDefault()}
        onWheel={(e) => e.preventDefault()}
        aria-hidden="true"
        className={`fixed inset-0 bg-slate-900/50 dark:bg-black/70 z-[80] transition-opacity duration-300 select-none touch-none overscroll-contain ${
          isOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
      />

      <aside
        aria-label="Menú lateral de ajustes y opciones"
        className={`fixed top-0 right-0 bottom-0 w-72 sm:w-80 bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-800 shadow-2xl z-[90] flex flex-col transition-transform duration-300 ease-out transform select-none overscroll-contain ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="h-16 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-900 dark:text-slate-100 text-base tracking-tight">
              Menú
            </span>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition-colors cursor-pointer"
            title="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain divide-y divide-slate-100 dark:divide-slate-800">
          <div className="p-4 bg-slate-50/50 dark:bg-slate-800/30">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-sky-500 text-white flex items-center justify-center font-bold text-base shadow-sm shrink-0">
                {(currentUser?.nombre || currentUser?.username || 'U').charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm leading-snug break-words">
                  {currentUser?.nombre || currentUser?.username}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 font-normal break-words mt-0.5">
                  @{currentUser?.username}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 font-medium break-words mt-0.5">
                  {currentUser?.sede} &bull; {currentUser?.area}
                </p>
              </div>
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div
                  className={`w-8 h-8 rounded-xl flex items-center justify-center transition-colors shrink-0 ${
                    sounds.enabled
                      ? 'bg-blue-100 dark:bg-slate-800 text-blue-600 dark:text-blue-400'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}
                >
                  {sounds.enabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
                </div>
                <div>
                  <span className="block text-xs font-bold text-slate-800 dark:text-slate-200">
                    Sonidos
                  </span>
                  <span className="block text-[11px] text-slate-400 dark:text-slate-500 font-normal">
                    {sounds.enabled ? 'Activados' : 'Desactivados (Personalizar)'}
                  </span>
                </div>
              </div>

              <IOSSwitch checked={sounds.enabled} onChange={handleToggleSoundMaster} size="md" />
            </div>

            {!sounds.enabled && (
              <div className="pl-3 sm:pl-4 pt-1 space-y-2.5 border-l-2 border-blue-200 dark:border-blue-900/60 ml-4 animate-fade-in">
                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Éxito
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                      Solicitud, despacho y recepción
                    </span>
                  </div>
                  <IOSSwitch checked={sounds.exito} onChange={handleToggleExito} size="sm" />
                </div>

                <div className="flex items-center justify-between py-1">
                  <div>
                    <span className="block text-xs font-semibold text-slate-700 dark:text-slate-300">
                      Seleccionado
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500">
                      Toques, checks y conteo
                    </span>
                  </div>
                  <IOSSwitch checked={sounds.seleccionado} onChange={handleToggleSeleccionado} size="sm" />
                </div>
              </div>
            )}
          </div>

          <div className="p-4 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                {currentTheme === 'oscuro' ? (
                  <Moon className="w-4 h-4 text-indigo-500" />
                ) : currentTheme === 'claro' ? (
                  <Sun className="w-4 h-4 text-amber-500" />
                ) : (
                  <Monitor className="w-4 h-4 text-blue-500" />
                )}
                <span>Tema</span>
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium capitalize">
                {currentTheme === 'sistema' ? 'Según sistema' : currentTheme}
              </span>
            </div>

            <div className="relative">
              <select
                value={currentTheme}
                onChange={handleThemeChange}
                className="w-full text-xs font-semibold py-2.5 pl-3 pr-8 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200/80 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 appearance-none cursor-pointer transition-colors"
              >
                <option value="claro">Claro</option>
                <option value="oscuro">Oscuro</option>
                <option value="sistema">Según sistema</option>
              </select>
              <ChevronDown className="w-4 h-4 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            </div>
          </div>

          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-2">
                <Shield className="w-4 h-4 text-blue-500" />
                <span>Permisos del Sistema</span>
              </span>
              <span className="text-[11px] text-slate-400 dark:text-slate-500 font-medium">
                {notificationStatus === 'granted' && cameraStatus === 'granted' ? 'Todo activo' : 'Acceso'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="p-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    notificationStatus === 'granted'
                      ? 'bg-emerald-50 dark:bg-transparent text-emerald-600 dark:text-emerald-400 dark:border dark:border-emerald-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}>
                    <Bell className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                      Notificaciones
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 leading-snug mt-0.5 break-words">
                      {notificationStatus === 'granted'
                        ? 'Alertas en tiempo real activas'
                        : notificationStatus === 'denied'
                        ? 'Bloqueadas en el navegador'
                        : 'Avisos de transferencias y material'}
                    </span>
                  </div>
                </div>

                {notificationStatus === 'granted' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-xl bg-emerald-50/80 dark:bg-transparent dark:border dark:border-emerald-500/30 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Activo</span>
                  </span>
                ) : notificationStatus === 'denied' ? (
                  <button
                    type="button"
                    onClick={() => handleShowDeniedHelp('notificaciones')}
                    className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline px-2 py-1 rounded-xl shrink-0 cursor-pointer"
                  >
                    Desbloquear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestNotificationPermission}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                  >
                    Permitir
                  </button>
                )}
              </div>

              <div className="p-2.5 rounded-2xl bg-slate-50/80 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                    cameraStatus === 'granted'
                      ? 'bg-emerald-50 dark:bg-transparent text-emerald-600 dark:text-emerald-400 dark:border dark:border-emerald-500/30'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                  }`}>
                    <Camera className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <span className="block text-xs font-semibold text-slate-800 dark:text-slate-200 leading-snug">
                      Cámara y Escáner
                    </span>
                    <span className="block text-[10px] text-slate-400 dark:text-slate-500 leading-snug mt-0.5 break-words">
                      {cameraStatus === 'granted'
                        ? 'Escaneo de códigos de barra listo'
                        : cameraStatus === 'denied'
                        ? 'Bloqueada en el navegador'
                        : 'Lectura óptica de productos'}
                    </span>
                  </div>
                </div>

                {cameraStatus === 'granted' ? (
                  <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 px-2.5 py-1 rounded-xl bg-emerald-50/80 dark:bg-transparent dark:border dark:border-emerald-500/30 shrink-0">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Activa</span>
                  </span>
                ) : cameraStatus === 'denied' ? (
                  <button
                    type="button"
                    onClick={() => handleShowDeniedHelp('camara')}
                    className="text-[11px] font-bold text-amber-600 dark:text-amber-400 hover:underline px-2 py-1 rounded-xl shrink-0 cursor-pointer"
                  >
                    Desbloquear
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleRequestCameraPermission}
                    className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-xl shadow-xs transition-all active:scale-95 cursor-pointer shrink-0"
                  >
                    Permitir
                  </button>
                )}
              </div>
            </div>
          </div>

          <div className="p-4">
            <button
              type="button"
              onClick={handleInstallApp}
              disabled={isAppInstalled}
              className={`w-full py-2.5 px-3.5 rounded-2xl text-xs font-semibold flex items-center justify-between transition-all ${
                isAppInstalled
                  ? 'bg-slate-100 dark:bg-slate-800/60 text-slate-400 dark:text-slate-500 cursor-default'
                  : 'bg-blue-50 dark:bg-transparent hover:bg-blue-100 dark:hover:bg-slate-800 text-blue-700 dark:text-blue-400 border border-blue-200/60 dark:border-blue-500/30 active:scale-[0.98] cursor-pointer'
              }`}
            >
              <span className="inline-flex items-center gap-2">
                {isAppInstalled ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                <span>{isAppInstalled ? 'Aplicación instalada' : 'Instalar aplicación'}</span>
              </span>

              {!isAppInstalled && (
                <span className="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                  PWA
                </span>
              )}
            </button>
          </div>

          <div className="p-4">
            <button
              type="button"
              onClick={() => setShowLogoutConfirm(true)}
              className="w-full py-2.5 px-3.5 rounded-2xl text-xs font-semibold bg-red-50 dark:bg-transparent hover:bg-red-100 dark:hover:bg-slate-800 text-red-600 dark:text-red-400 border border-red-200/60 dark:border-red-500/30 flex items-center justify-between transition-all active:scale-[0.98] cursor-pointer"
            >
              <span className="inline-flex items-center gap-2">
                <LogOut className="w-4 h-4" />
                <span>Cerrar sesión</span>
              </span>
            </button>
          </div>
        </div>

        <div className="p-4 border-t border-slate-100 dark:border-slate-800 shrink-0 bg-white dark:bg-slate-900">
          <button
            type="button"
            onClick={() => setIsAboutOpen(true)}
            className="w-full py-2.5 px-3 rounded-2xl text-xs font-medium text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800/80 flex items-center justify-center gap-2 transition-colors cursor-pointer"
          >
            <Info className="w-4 h-4" />
            <span>Acerca de ERP Control</span>
          </button>
        </div>
      </aside>

      <AboutModal isOpen={isAboutOpen} onClose={() => setIsAboutOpen(false)} />

      <ModalDialog
        isOpen={showLogoutConfirm}
        type="confirm"
        title="Cerrar Sesión"
        message={`¿Estás seguro de que deseas salir y cerrar la sesión de @${currentUser?.username || 'usuario'}?`}
        confirmText="Sí, cerrar sesión"
        cancelText="Cancelar"
        variant="danger"
        onConfirm={() => {
          setShowLogoutConfirm(false);
          onClose();
          if (onLogout) onLogout();
        }}
        onCancel={() => setShowLogoutConfirm(false)}
        onClose={() => setShowLogoutConfirm(false)}
      />

      <ModalDialog
        isOpen={showInstallHelpModal}
        type="alert"
        title="Instalar ERP Control"
        message="Para instalar la aplicación en este dispositivo, selecciona 'Agregar a la pantalla principal' o 'Instalar aplicación' desde el menú de opciones o compartir de tu navegador."
        confirmText="Entendido"
        onConfirm={() => setShowInstallHelpModal(false)}
      />

      <ModalDialog
        isOpen={permissionHelpDialog.isOpen}
        type="alert"
        title={permissionHelpDialog.title}
        message={permissionHelpDialog.message}
        confirmText="Entendido"
        onConfirm={() => setPermissionHelpDialog(prev => ({ ...prev, isOpen: false }))}
      />
    </>
  );
}
