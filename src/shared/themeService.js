/**
 * Servicio para la gestión y alternancia del tema visual (claro, oscuro y según el sistema) compatible con Tailwind CSS v4.
 */

const THEME_STORAGE_KEY = 'erp_theme';

let mediaQueryListenerAttached = false;

function normalizeTheme(theme) {
  if (!theme) return 'sistema';
  const t = String(theme).toLowerCase().trim();
  if (t === 'claro' || t === 'light') return 'claro';
  if (t === 'oscuro' || t === 'dark') return 'oscuro';
  return 'sistema';
}

export const themeService = {
  getStoredTheme() {
    try {
      const saved = localStorage.getItem(THEME_STORAGE_KEY);
      return normalizeTheme(saved);
    } catch {
      return 'sistema';
    }
  },

  setStoredTheme(theme) {
    const normalized = normalizeTheme(theme);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, normalized);
    } catch (e) {
      console.warn('Error al guardar tema en localStorage:', e);
    }
    this.applyTheme(normalized);
    window.dispatchEvent(new CustomEvent('erp_theme_changed', { detail: { theme: normalized } }));
    return normalized;
  },

  applyTheme(theme) {
    const normalized = normalizeTheme(theme || this.getStoredTheme());
    const prefersDark = typeof window !== 'undefined' && window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = normalized === 'oscuro' || (normalized === 'sistema' && prefersDark);

    if (typeof document !== 'undefined') {
      const root = document.documentElement;
      const body = document.body;

      if (isDark) {
        root.classList.add('dark');
        if (body) body.classList.add('dark');
        root.style.colorScheme = 'dark';
        root.style.backgroundColor = '#0f172a';
        if (body) body.style.backgroundColor = '#0f172a';
      } else {
        root.classList.remove('dark');
        if (body) body.classList.remove('dark');
        root.style.colorScheme = 'light';
        root.style.backgroundColor = '#f8fafc';
        if (body) body.style.backgroundColor = '#f8fafc';
      }

      const metaThemeColor = document.querySelector('meta[name="theme-color"]');
      if (metaThemeColor) {
        metaThemeColor.setAttribute('content', isDark ? '#0f172a' : '#ffffff');
      }

      const metaColorScheme = document.querySelector('meta[name="color-scheme"]');
      if (metaColorScheme) {
        metaColorScheme.setAttribute('content', isDark ? 'dark' : 'light');
      }

      const metaAppleStatusBar = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
      if (metaAppleStatusBar) {
        metaAppleStatusBar.setAttribute('content', isDark ? 'black-translucent' : 'default');
      }
    }

    this.ensureSystemListener();
    return normalized;
  },

  ensureSystemListener() {
    if (mediaQueryListenerAttached || typeof window === 'undefined' || !window.matchMedia) return;
    try {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      const handleChange = () => {
        const current = this.getStoredTheme();
        if (current === 'sistema') {
          this.applyTheme('sistema');
        }
      };

      if (mediaQuery.addEventListener) {
        mediaQuery.addEventListener('change', handleChange);
      } else if (mediaQuery.addListener) {
        mediaQuery.addListener(handleChange);
      }
      mediaQueryListenerAttached = true;
    } catch (e) {
      console.warn('No se pudo enlazar escucha de color-scheme del sistema:', e);
    }
  }
};
