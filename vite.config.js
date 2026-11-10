/**
 * Configuración del empaquetador Vite con integración de React, Tailwind CSS v4 y soporte de Progressive Web App (PWA).
 */

import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  define: {
    __APP_BUILD_TIME__: JSON.stringify(new Date().toISOString())
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: (id) => {
          if (id.includes('node_modules')) {
            if (id.includes('firebase')) return 'vendor-firebase';
            if (id.includes('xlsx')) return 'vendor-xlsx';
            if (id.includes('html5-qrcode')) return 'vendor-scanner';
            if (id.includes('lucide-react')) return 'vendor-icons';
            if (id.includes('react') || id.includes('scheduler')) return 'vendor-react';
            return 'vendor-common';
          }
        }
      }
    }
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'maskable-icon-512x512.png', 'notification.mp3', 'check.mp3', 'order-success.mp3', 'sw-push-listener.js', 'notification-badge-96x96.png'],
      manifest: {
        id: '/erp-control',
        name: 'ERP Control',
        short_name: 'ERP Control',
        description: 'ERP Control - Sistema de Gestión Farmacéutica',
        theme_color: '#ffffff',
        background_color: '#f8fafc',
        display: 'standalone',
        orientation: 'any',
        start_url: '/',
        scope: '/',
        categories: ['business', 'productivity'],
        icons: [
          {
            src: '/pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/maskable-icon-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any'
          }
        ]
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2,mp3}'],
        importScripts: ['sw-push-listener.js'],
        navigateFallback: 'index.html'
      },
      devOptions: {
        enabled: true
      }
    })
  ]
});
