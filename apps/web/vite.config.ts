import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    VitePWA({
      // §5 : une mise à jour ne doit jamais interrompre une partie en cours.
      // En mode « prompt », c'est l'application qui décide du moment, pas le
      // navigateur — la bannière est masquée tant qu'une partie est ouverte.
      registerType: 'prompt',
      // Pas de `includeAssets` : `globPatterns` couvre déjà les icônes, et
      // cumuler les deux les inscrivait deux fois au manifeste de précache.
      manifest: {
        name: 'Chalk — Marqueur de points aux fléchettes',
        short_name: 'Chalk',
        description:
          'Marqueur de points aux fléchettes : X01, Cricket, Killer, Around the Clock. Fonctionne hors ligne.',
        lang: 'fr',
        dir: 'ltr',
        start_url: '/',
        scope: '/',
        // §3.2 : aucune barre d'adresse ni barre de navigation visible.
        display: 'standalone',
        /*
         * §3.2 demande « portrait par défaut, paysage supporté sur tablette ».
         * Le manifeste ne sait pas exprimer cette nuance : `portrait` verrouille
         * l'orientation partout, y compris sur tablette, ce qui contredit
         * l'exigence. On laisse donc l'orientation libre et c'est la mise en
         * page qui s'adapte — l'écran de partie a une disposition paysage.
         */
        orientation: 'any',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        categories: ['games', 'sports', 'utilities'],
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: '/icons/icon-maskable-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // §3.2 : ouverture instantanée, même sans réseau. La coquille complète
        // est précachée.
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: [
          // Les écrans de démarrage iOS sont lus par le système au lancement,
          // avant que le service worker n'existe : les précacher ne servirait
          // qu'à gonfler le cache de 650 Ko pour rien.
          '**/splash/**',
          // Les icônes du manifeste sont déjà inscrites au précache par le
          // plugin. Sans cette exclusion, elles y figurent deux fois.
          '**/icons/icon-*.png',
        ],
        navigateFallback: '/index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: {
        // Permet de vérifier le comportement hors ligne sans passer par un build.
        enabled: true,
        type: 'module',
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // §5 : on teste sur un vrai téléphone, pas seulement sur le poste de dev.
    host: true,
  },
})
