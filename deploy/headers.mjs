/**
 * En-têtes HTTP de production — source unique.
 *
 * Trois choses se jouent ici, et se ratent facilement :
 *
 *  1. **Le cycle de vie du service worker** (§3.2, #77). Si `sw.js` est mis en
 *     cache par le CDN ou le navigateur, les utilisateurs restent bloqués sur
 *     une ancienne version — parfois pour des jours, et sans recours puisque
 *     l'application n'est sur aucun store d'où l'on pourrait pousser un
 *     correctif. C'est le risque de déploiement numéro un du projet.
 *  2. **La sécurité** (§6) : HTTPS obligatoire, et des en-têtes qui ferment les
 *     portes que l'on n'utilise pas.
 *  3. **La performance** (§6) : les fichiers au nom haché sont immuables et
 *     doivent être mis en cache un an.
 *
 * `generate.mjs` produit depuis ce fichier les configurations Apache, Netlify,
 * Cloudflare et nginx. Ne pas les modifier à la main : elles seraient écrasées,
 * et surtout elles divergeraient les unes des autres.
 */

/**
 * Politique de sécurité du contenu.
 *
 * L'application est entièrement autonome : aucun script, style, police ou image
 * externe. La politique peut donc être stricte.
 *
 * `'unsafe-inline'` sur les styles est nécessaire : Vue applique les liaisons
 * `:style` sous forme d'attributs `style`, que la politique traite comme du
 * style en ligne. `script-src` reste sans exception.
 */
export const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ')

/** En-têtes appliqués à toutes les réponses. */
export const SECURITY_HEADERS = {
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
  // §6 : HTTPS obligatoire. Deux ans, sous-domaines compris.
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  // L'application ne demande ni caméra, ni micro, ni position : on le déclare.
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
}

const NO_STORE = 'no-cache, no-store, must-revalidate'
const IMMUTABLE = 'public, max-age=31536000, immutable'

/**
 * Règles de cache par chemin, de la plus spécifique à la plus générale.
 *
 * `sw.js` et `index.html` ne doivent **jamais** être mis en cache : ce sont eux
 * qui portent la version de l'application.
 */
export const CACHE_RULES = [
  {
    path: '/sw.js',
    cacheControl: NO_STORE,
    why: 'Porte la version. Mis en cache, il fige les utilisateurs sur une vieille version.',
  },
  {
    path: '/index.html',
    cacheControl: NO_STORE,
    why: 'Référence les fichiers hachés de la version courante.',
  },
  {
    path: '/manifest.webmanifest',
    cacheControl: 'public, max-age=3600',
    why: "Change rarement, mais doit pouvoir évoluer sans attendre l'expiration.",
  },
  {
    path: '/assets/*',
    cacheControl: IMMUTABLE,
    why: 'Noms hachés : un contenu différent produit un nom différent.',
  },
  {
    path: '/icons/*',
    cacheControl: 'public, max-age=604800',
    why: 'Stables, mais sans hachage dans le nom.',
  },
  {
    path: '/splash/*',
    cacheControl: 'public, max-age=604800',
    why: 'Lus par iOS au lancement, jamais par le service worker.',
  },
]

/** Fichiers servis tels quels, hors du repli SPA. */
export const PASSTHROUGH_PATHS = [
  '/sw.js',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/workbox-*.js',
]
