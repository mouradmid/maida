import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    // PWA : l'app s'installe sur tablette et se recharge même sans réseau
    // (les données hors ligne, elles, sont gérées dans src/lib/horsLigne.ts).
    VitePWA({
      registerType: 'autoUpdate',
      manifest: {
        name: 'Maïda — Caisse restaurant',
        short_name: 'Maïda',
        description: 'Le point de vente pensé pour la restauration algérienne.',
        lang: 'fr',
        theme_color: '#0e5a4a',
        background_color: '#ece7da',
        display: 'standalone',
        start_url: '/caisse',
        icons: [
          { src: '/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Jamais de fallback HTML pour les appels API : une coupure doit
        // remonter comme une erreur réseau, pas comme une page.
        navigateFallbackDenylist: [/^\/api\//, /^\/health$/],
        // woff2 ne fait PAS partie des extensions préchargées par défaut.
        // Sans cette ligne, les polices rapatriées ne seraient pas en cache
        // et la coupure réseau les ferait disparaître — soit exactement le
        // problème qu'on venait de corriger en quittant le CDN.
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
      },
    }),
  ],
  server: {
    proxy: {
      // L'API monte tout sous /api : on transmet tel quel.
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
      },
    },
  },
});
