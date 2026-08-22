#!/usr/bin/env bash
#
# Vérifie une mise en ligne — #77.
#
# À lancer après chaque publication manuelle. Contrôle ce qui casse en silence :
# un `.htaccess` oublié ne produit aucune erreur visible, l'application a l'air
# de fonctionner, et les utilisateurs se retrouvent figés sur une vieille
# version des semaines plus tard.
#
#   ./scripts/verify-deployment.sh chalk.exemple.fr
#
# Pour éprouver le script sur l'aperçu local, qui n'a pas de HTTPS :
#   CHALK_SCHEME=http ./scripts/verify-deployment.sh localhost:4173

set -uo pipefail

DOMAIN="${1:-}"
if [[ -z "$DOMAIN" ]]; then
  echo "Usage : $0 <domaine>   (ex. chalk.exemple.fr)" >&2
  exit 64
fi

DOMAIN="${DOMAIN#https://}"
DOMAIN="${DOMAIN#http://}"
DOMAIN="${DOMAIN%/}"
SCHEME="${CHALK_SCHEME:-https}"

failures=0
checks=0

ok()   { printf '  \033[32m✓\033[0m %s\n' "$1"; }
ko()   { printf '  \033[31m✗\033[0m %s\n' "$1"; failures=$((failures + 1)); }
warn() { printf '  \033[33m!\033[0m %s\n' "$1"; }

header() { curl -sI --max-time 10 "${SCHEME}://${DOMAIN}$1" | tr -d '\r'; }

check() {
  checks=$((checks + 1))
  local label="$1" actual="$2" expected="$3"
  if [[ "$actual" == *"$expected"* ]]; then ok "$label"; else ko "$label — reçu : ${actual:-rien}"; fi
}

echo "Vérification de ${SCHEME}://${DOMAIN}"
echo

echo "Accès et sécurité (§6)"
if [[ "$SCHEME" == "https" ]]; then
  redirect=$(curl -sI --max-time 10 "http://${DOMAIN}/" | tr -d '\r' | grep -i '^location:' || true)
  check "HTTP redirige vers HTTPS" "$redirect" "https://"
else
  warn "Redirection HTTPS non vérifiée (mode ${SCHEME})"
fi

root=$(header /)
check "La page répond" "$root" "200"
check "En-tête de sécurité du contenu présent" "$root" "Content-Security-Policy"
check "HSTS présent" "$root" "Strict-Transport-Security"
check "nosniff présent" "$root" "X-Content-Type-Options"

echo
echo "Cycle de vie du service worker (§3.2) — le point critique"
sw=$(header /sw.js)
check "sw.js accessible" "$sw" "200"
sw_cache=$(echo "$sw" | grep -i '^cache-control:' || true)
if [[ "$sw_cache" == *"no-store"* ]]; then
  ok "sw.js en no-store"
else
  ko "sw.js DOIT être en no-store — reçu : ${sw_cache:-aucun Cache-Control}"
  echo "     Le .htaccess est probablement absent de public_html/."
  echo "     C'est un fichier caché : FileZilla ne l'envoie pas par défaut."
fi
checks=$((checks + 1))

index_cache=$(header / | grep -i '^cache-control:' || true)
if [[ "$index_cache" == *"no-store"* || "$index_cache" == *"no-cache"* ]]; then
  ok "index.html non mis en cache"
else
  ko "index.html devrait être en no-store — reçu : ${index_cache:-aucun Cache-Control}"
fi
checks=$((checks + 1))

echo
echo "Installation sur téléphone (§3.2)"
check "manifest.webmanifest accessible" "$(header /manifest.webmanifest)" "200"
check "Icône 192 accessible" "$(header /icons/icon-192.png)" "200"
check "apple-touch-icon accessible" "$(header /icons/apple-touch-icon-180.png)" "200"
check "Écran de démarrage iOS accessible" "$(header /splash/splash-390x844@3x.png)" "200"

echo
echo "Repli SPA"
check "Une route inconnue sert l'application" "$(header /une-route-qui-nexiste-pas)" "200"

echo
if [[ $failures -eq 0 ]]; then
  printf '\033[32m%s vérifications, aucune erreur.\033[0m\n' "$checks"
  echo
  echo "Restent à vérifier à la main, sur un vrai téléphone :"
  echo "  · installation sur l'écran d'accueil (Android : bannière ; iOS : Partager)"
  echo "  · ouverture depuis l'écran d'accueil sans écran blanc"
  echo "  · mode avion : une partie locale se joue de bout en bout"
  exit 0
fi

printf '\033[31m%s erreur(s) sur %s vérifications.\033[0m\n' "$failures" "$checks"
exit 1
