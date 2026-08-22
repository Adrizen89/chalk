/**
 * Génère les configurations d'hébergement depuis `headers.mjs`.
 *
 * Quatre cibles couvrent les hébergeurs envisagés (#2) : Apache pour
 * Hostinger, Netlify, Cloudflare Pages, et nginx pour un VPS.
 *
 * Le choix de l'hébergeur n'est pas tranché — c'est la question #2. Générer
 * les quatre coûte peu et évite que la décision bloque le reste.
 */

import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { CACHE_RULES, PASSTHROUGH_PATHS, SECURITY_HEADERS } from './headers.mjs'

const here = dirname(fileURLToPath(import.meta.url))
const out = join(here, 'generated')

const BANNER = 'Généré par deploy/generate.mjs — ne pas modifier à la main.'

function apache() {
  const security = Object.entries(SECURITY_HEADERS)
    .map(([name, value]) => `  Header always set ${name} "${value.replaceAll('"', '\\"')}"`)
    .join('\n')

  /** Chemin en motif Apache : les points sont littéraux, `/*` devient `/.*`. */
  const toPattern = (path) => {
    const glob = path.endsWith('/*')
    const literal = (glob ? path.slice(0, -2) : path).replaceAll('.', '\\.')
    return glob ? `^${literal}/` : `^${literal}$`
  }

  const cache = CACHE_RULES.map((rule) => {
    const pattern = toPattern(rule.path)
    return [
      `  # ${rule.why}`,
      `  <If "%{REQUEST_URI} =~ m#${pattern}#">`,
      `    Header always set Cache-Control "${rule.cacheControl}"`,
      '  </If>',
    ].join('\n')
  }).join('\n')

  return `# ${BANNER}
# Cible : Apache (Hostinger). À déposer à la racine du dossier public.

# §6 — HTTPS obligatoire.
RewriteEngine On
RewriteCond %{HTTPS} !=on
RewriteRule ^(.*)$ https://%{HTTP_HOST}%{REQUEST_URI} [L,R=301]

<IfModule mod_headers.c>
${security}

${cache}
</IfModule>

# Repli SPA : toute route inconnue sert index.html, que le service worker
# prend ensuite en charge hors ligne (§3.2).
RewriteCond %{REQUEST_FILENAME} !-f
RewriteCond %{REQUEST_FILENAME} !-d
RewriteRule ^ /index.html [L]

<IfModule mod_deflate.c>
  AddOutputFilterByType DEFLATE text/html text/css application/javascript application/json image/svg+xml
</IfModule>

AddType application/manifest+json .webmanifest
`
}

function cloudflareHeaders() {
  const global = Object.entries(SECURITY_HEADERS)
    .map(([name, value]) => `  ${name}: ${value}`)
    .join('\n')

  const perPath = CACHE_RULES.map(
    (rule) => `# ${rule.why}\n${rule.path}\n  Cache-Control: ${rule.cacheControl}`,
  ).join('\n\n')

  return `# ${BANNER}
# Cible : Cloudflare Pages et Netlify (fichier _headers).

/*
${global}

${perPath}
`
}

function cloudflareRedirects() {
  const passthrough = PASSTHROUGH_PATHS.map((path) => `${path}  ${path}  200`).join('\n')
  return `# ${BANNER}
# Repli SPA. Les fichiers servis tels quels passent avant.

${passthrough}
/*  /index.html  200
`
}

function netlify() {
  const headers = CACHE_RULES.map(
    (rule) => `# ${rule.why}
[[headers]]
  for = "${rule.path}"
  [headers.values]
    Cache-Control = "${rule.cacheControl}"`,
  ).join('\n\n')

  const global = Object.entries(SECURITY_HEADERS)
    .map(([name, value]) => `    "${name}" = "${value}"`)
    .join('\n')

  return `# ${BANNER}
# Cible : Netlify. À déposer à la racine du dépôt.

[build]
  command = "pnpm install --frozen-lockfile && pnpm build"
  publish = "apps/web/dist"

[[headers]]
  for = "/*"
  [headers.values]
${global}

${headers}

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
`
}

function nginx() {
  const security = Object.entries(SECURITY_HEADERS)
    .map(([name, value]) => `  add_header ${name} "${value}" always;`)
    .join('\n')

  const locations = CACHE_RULES.map((rule) => {
    const isGlob = rule.path.endsWith('/*')
    const matcher = isGlob ? `location ${rule.path.slice(0, -1)}` : `location = ${rule.path}`
    return `  # ${rule.why}
  ${matcher} {
    add_header Cache-Control "${rule.cacheControl}" always;
    try_files $uri =404;
  }`
  }).join('\n\n')

  return `# ${BANNER}
# Cible : nginx sur un VPS.

server {
  listen 443 ssl http2;
  server_name chalk.example;   # à remplacer

  root /var/www/chalk;
  index index.html;

${security}

  gzip on;
  gzip_types text/css application/javascript application/json image/svg+xml;

${locations}

  # Repli SPA (§3.2).
  location / {
    try_files $uri $uri/ /index.html;
  }
}

# §6 — HTTPS obligatoire.
server {
  listen 80;
  server_name chalk.example;
  return 301 https://$host$request_uri;
}
`
}

await mkdir(out, { recursive: true })

const files = {
  '.htaccess': apache(),
  _headers: cloudflareHeaders(),
  _redirects: cloudflareRedirects(),
  'netlify.toml': netlify(),
  'nginx.conf': nginx(),
}

for (const [name, content] of Object.entries(files)) {
  await writeFile(join(out, name), content)
  console.log(`écrit  deploy/generated/${name}`)
}
