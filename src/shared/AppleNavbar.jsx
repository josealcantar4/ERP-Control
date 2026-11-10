/**
 * Barra superior de navegación estilo iOS con selector de sede, estado de sincronización y acceso al menú de configuración.
 */

import React from 'react';
import { Menu, X, Wifi, WifiOff, Users, Bell } from 'lucide-react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export function AppleNavbar({
  currentUser,
  onNavigate,
  currentScreen,
  notificationCount = 0,
  onOpenNotifications,
  isNotificationsOpen = false,
  isSidebarOpen = false,
  onToggleSidebar
}) {
  const { isOnline } = useOnlineStatus();
  const isAdmin = currentUser?.username?.toLowerCase() === 'administrador' || currentUser?.roles?.includes('admin');

  return (
    <header className="sticky top-0 z-50 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 transition-colors">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
        
        <div
          onClick={() => onNavigate && onNavigate('dashboard')}
          className="flex items-center gap-3 cursor-pointer select-none"
        >
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-sky-500 to-teal-600 text-white flex items-center justify-center shadow-sm overflow-hidden shrink-0">
            <svg viewBox="0 0 512 512" fill="none" xmlns="http://www.w3.org/2000/svg" className="w-full h-full p-1.5">
              <path d="M224 128H288V224H384V288H288V384H224V288H128V224H224V128Z" fill="white" />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-slate-900 dark:text-slate-100 text-base tracking-tight">ERP Control</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {currentUser?.sede} &bull; {currentUser?.area}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-2.5">
          <button
            id="navbar-notification-bell-btn"
            type="button"
            onClick={onOpenNotifications}
            className={`p-2 rounded-2xl transition-all cursor-pointer relative ${
              isNotificationsOpen
                ? 'bg-amber-100 dark:bg-slate-800 text-amber-900 dark:text-amber-400 ring-2 ring-amber-400/60 shadow-inner'
                : notificationCount > 0
                ? 'bg-amber-50 dark:bg-slate-800 hover:bg-amber-100 dark:hover:bg-slate-700 text-amber-700 dark:text-amber-400'
                : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'
            }`}
            title={isNotificationsOpen ? 'Cerrar notificaciones' : 'Ver notificaciones'}
          >
            <Bell className="w-4 h-4" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-600 text-white text-[10px] font-extrabold flex items-center justify-center shadow-sm animate-scale-in">
                {notificationCount > 99 ? '99+' : notificationCount}
              </span>
            )}
          </button>

          {isAdmin && onNavigate && (
            <button
              onClick={() => onNavigate(currentScreen === 'admin' ? 'dashboard' : 'admin')}
              className={`p-2 rounded-2xl transition-all cursor-pointer ${
                currentScreen === 'admin'
                  ? 'bg-purple-600 text-white shadow-sm'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-purple-50 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 hover:text-purple-700 dark:hover:text-purple-400'
              }`}
              title="Gestión de Usuarios, Sedes y Áreas"
              aria-label="Gestión de Usuarios, Sedes y Áreas"
            >
              <Users className="w-4 h-4" />
            </button>
          )}

          <div
            className={`hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border ${
              isOnline
                ? 'bg-emerald-50 dark:bg-transparent text-emerald-700 dark:text-emerald-400 border-emerald-200/60 dark:border-emerald-500/30'
                : 'bg-amber-50 dark:bg-transparent text-amber-700 dark:text-amber-400 border-amber-200/60 dark:border-amber-500/30 animate-pulse'
            }`}
          >
            {isOnline ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
            <span>{isOnline ? 'Online' : 'Offline'}</span>
          </div>

          <div className="flex items-center gap-2 pl-1 sm:pl-2 border-l border-slate-200 dark:border-slate-800">
            <div className="text-right hidden md:block">
              <span className="block text-xs font-bold text-slate-800 dark:text-slate-200 leading-tight">
                {currentUser?.nombre}
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                @{currentUser?.username}
              </span>
            </div>

            <button
              type="button"
              onClick={onToggleSidebar}
              className={`w-9 h-9 rounded-2xl flex items-center justify-center transition-all cursor-pointer ${
                isSidebarOpen
                  ? 'bg-blue-600 text-white shadow-md shadow-blue-600/30'
                  : 'bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 active:scale-95'
              }`}
              title={isSidebarOpen ? 'Cerrar menú' : 'Abrir menú'}
              aria-label="Abrir menú de opciones"
            >
              {isSidebarOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
            </button>
          </div>
        </div>

      </div>
    </header>
  );
}
