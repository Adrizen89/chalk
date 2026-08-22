import { fileURLToPath, URL } from 'node:url'
import tailwindcss from '@tailwindcss/vite'
import vue from '@vitejs/plugin-vue'
import type { Plugin } from 'vite'
import { defineConfig } from 'vite'
import { VitePWA } from 'vite-plugin-pwa'
// Mêmes en-têtes qu'en production : c'est le seul moyen de vérifier avant
// déploiement que la politique de sécurité ne casse pas l'application (#77).
import { CACHE_RULES, SECURITY_HEADERS } from '../../deploy/headers.mjs'

/**
 * Chemin de base du déploiement.
 *
 * `/` pour un domaine dédié — le cas prévu. Une autre valeur permet de servir
 * l'application depuis un sous-répertoire, mais il faut alors que le manifeste,
 * le `scope` du service worker et les liens des icônes suivent : c'est
 * pourquoi tout en dérive plutôt que d'être écrit en dur.
 */
const base = process.env.VITE_BASE ?? '/'

/**
 * Applique en aperçu local les règles de cache de la production.
 *
 * Sans cela, `pnpm preview` sert `sw.js` avec les valeurs par défaut de Vite,
 * et la répétition avant mise en ligne ne prouve rien sur le point le plus
 * risqué du déploiement (#77). `scripts/verify-deployment.sh` peut ainsi être
 * éprouvé en local avant d'être lancé sur le domaine réel.
 */
function productionCacheHeaders(): Plugin {
  const matches = (rule: (typeof CACHE_RULES)[number], url: string) =>
    rule.path.endsWith('/*') ? url.startsWith(rule.path.slice(0, -1)) : url === rule.path

  return {
    name: 'chalk:production-cache-headers',
    configurePreviewServer(server) {
      server.middlewares.use((request, response, next) => {
        const url = (request.url ?? '/').split('?')[0] ?? '/'
        const rule = CACHE_RULES.find((candidate) => matches(candidate, url))
        if (rule) response.setHeader('Cache-Control', rule.cacheControl)
        next()
      })
    },
  }
}

export default defineConfig({
  base,
  plugins: [
    vue(),
    tailwindcss(),
    productionCacheHeaders(),
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
        start_url: base,
        scope: base,
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
          { src: `${base}icons/icon-192.png`, sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: `${base}icons/icon-512.png`, sizes: '512x512', type: 'image/png', purpose: 'any' },
          {
            src: `${base}icons/icon-maskable-512.png`,
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
        navigateFallback: `${base}index.html`,
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
  preview: {
    host: true,
    headers: SECURITY_HEADERS,
  },
})
