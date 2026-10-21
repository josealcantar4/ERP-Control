import React, { useState, useEffect } from 'react';
import { Download } from 'lucide-react';
import { ModalDialog } from './ModalDialog';

export function PWAInstallPrompt() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [showInfoModal, setShowInfoModal] = useState(false);

  useEffect(() => {
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches ||
      window.navigator.standalone === true;

    if (isStandalone) {
      setIsInstalled(true);
      return;
    }

    const handler = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };

    window.addEventListener('beforeinstallprompt', handler);

    window.addEventListener('appinstalled', () => {
      setIsInstalled(true);
      setDeferredPrompt(null);
    });

    return () => {
      window.removeEventListener('beforeinstallprompt', handler);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) {
      setShowInfoModal(true);
      return;
    }

    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstalled(true);
    }
    setDeferredPrompt(null);
  };

  if (isInstalled) {
    return null;
  }

  return (
    <>
      <button
        onClick={handleInstallClick}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 text-xs font-semibold rounded-full border border-blue-200/60 shadow-sm transition-all active:scale-95 cursor-pointer"
        title="Instalar ERP Control en este dispositivo"
      >
        <Download className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Instalar App</span>
      </button>

      {/* Pop-up dialog instead of native browser alert */}
      <ModalDialog
        isOpen={showInfoModal}
        type="alert"
        title="Instalar ERP Control"
        message="Para instalar la aplicación en este dispositivo, selecciona 'Agregar a la pantalla principal' o 'Instalar aplicación' desde el menú de opciones de tu navegador."
        confirmText="Entendido"
        onConfirm={() => setShowInfoModal(false)}
      />
    </>
  );
}
