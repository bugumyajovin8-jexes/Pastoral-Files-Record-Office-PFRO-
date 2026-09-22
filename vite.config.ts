import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  const env = loadEnv(mode, '.', '');
  return {
    plugins: [
      react(),
      tailwindcss(),
      // The app had no manifest and no service worker, so no browser would ever
      // offer to install it — Chrome only fires `beforeinstallprompt` for a site
      // with a manifest carrying 192px and 512px icons. That event is what the
      // one-tap Install button (src/components/InstallPrompt.tsx) is built on.
      VitePWA({
        registerType: 'autoUpdate',
        injectRegister: 'auto',
        workbox: {
          // The app shell only. Supabase is a different origin and has no
          // runtime route here, so every read and write still goes to the
          // network — a pastor must never be shown a cached ledger as current.
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
          navigateFallback: 'index.html',
        },
        manifest: {
          id: '/',
          name: 'PFRO — Pastoral Files Record Office',
          short_name: 'PFRO',
          description: 'Usimamizi wa kanisa: washiriki, michango na ripoti.',
          lang: 'sw',
          start_url: '/',
          scope: '/',
          display: 'standalone',
          theme_color: '#F8FAFC',
          background_color: '#F6F8FB',
          icons: [
            { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
            { src: 'icons/icon-512-maskable.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
          ],
        },
      }),
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify: file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
