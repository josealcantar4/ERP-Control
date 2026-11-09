/**
 * Servicio para la reproducción y configuración personalizada de sonidos de éxito, selección y alertas en la interfaz.
 */

const SOUNDS_SETTINGS_KEY = 'erp_sounds_settings';

export const soundSettingsService = {
  getSettings() {
    try {
      const raw = localStorage.getItem(SOUNDS_SETTINGS_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        return {
          enabled: parsed.enabled !== undefined ? Boolean(parsed.enabled) : true,
          exito: parsed.exito !== undefined ? Boolean(parsed.exito) : true,
          seleccionado: parsed.seleccionado !== undefined ? Boolean(parsed.seleccionado) : true
        };
      }
    } catch {}

    return {
      enabled: true,
      exito: true,
      seleccionado: true
    };
  },

  setSettings(newSettings) {
    try {
      const current = this.getSettings();
      const updated = {
        ...current,
        ...newSettings
      };
      localStorage.setItem(SOUNDS_SETTINGS_KEY, JSON.stringify(updated));
      window.dispatchEvent(new CustomEvent('erp_sounds_settings_changed', { detail: updated }));
      return updated;
    } catch (e) {
      console.warn('Error al guardar configuración de sonidos:', e);
      return newSettings;
    }
  },

  canPlaySuccess() {
    const s = this.getSettings();
    return s.enabled ? true : Boolean(s.exito);
  },

  canPlayCheck() {
    const s = this.getSettings();
    return s.enabled ? true : Boolean(s.seleccionado);
  }
};
