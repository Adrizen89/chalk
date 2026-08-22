#!/usr/bin/env bash
#
# Déploiement de Chalk sur Hostinger — #77.
#
# Envoie le build vers `public_html/` par rsync sur SFTP. Par défaut en
# **simulation** : rien n'est écrit tant que `--go` n'est pas passé.
#
# Configuration attendue dans l'environnement (ou dans un fichier .env.deploy
# non versionné, chargé automatiquement) :
#
#   HOSTINGER_HOST    srv-XXX.hstgr.io
#   HOSTINGER_USER    uXXXXXXXXX
#   HOSTINGER_PORT    65002        (valeur par défaut chez Hostinger)
#   HOSTINGER_PATH    public_html/ (valeur par défaut)
#
# L'authentification passe par une clé SSH. Aucun mot de passe n'est lu, écrit
# ni demandé par ce script.

set -euo pipefail

cd "$(dirname "$0")/.."

DRY_RUN=1
[[ "${1:-}" == "--go" ]] && DRY_RUN=0

if [[ -f .env.deploy ]]; then
  # shellcheck disable=SC1091
  set -a && source .env.deploy && set +a
fi

: "${HOSTINGER_HOST:?Renseignez HOSTINGER_HOST (ex. srv-123.hstgr.io)}"
: "${HOSTINGER_USER:?Renseignez HOSTINGER_USER (ex. u123456789)}"
PORT="${HOSTINGER_PORT:-65002}"
REMOTE_PATH="${HOSTINGER_PATH:-public_html/}"

echo "→ Construction"
pnpm install --frozen-lockfile
pnpm build

echo "→ Ajout de la configuration Apache"
pnpm generate:deploy >/dev/null
cp deploy/generated/.htaccess apps/web/dist/.htaccess

# `--delete` retire les anciens fichiers hachés. rsync transfère avant de
# supprimer : un client qui charge la page pendant l'envoi reçoit une version
# cohérente. Le service worker, lui, a déjà tout en cache (§3.2).
RSYNC_FLAGS=(--archive --compress --delete --human-readable --progress)
[[ $DRY_RUN -eq 1 ]] && RSYNC_FLAGS+=(--dry-run)

echo "→ Envoi vers ${HOSTINGER_USER}@${HOSTINGER_HOST}:${REMOTE_PATH}"
[[ $DRY_RUN -eq 1 ]] && echo "  (simulation — relancez avec --go pour publier)"

rsync "${RSYNC_FLAGS[@]}" \
  -e "ssh -p ${PORT}" \
  apps/web/dist/ \
  "${HOSTINGER_USER}@${HOSTINGER_HOST}:${REMOTE_PATH}"

if [[ $DRY_RUN -eq 1 ]]; then
  echo "→ Simulation terminée. Rien n'a été publié."
  exit 0
fi

echo "→ Vérification du cache du service worker"
DOMAIN="${HOSTINGER_DOMAIN:-}"
if [[ -n "$DOMAIN" ]]; then
  # Le point de contrôle le plus important : sw.js mis en cache fige les
  # utilisateurs sur une ancienne version, sans recours (aucun store).
  CACHE_HEADER=$(curl -sI "https://${DOMAIN}/sw.js" | tr -d '\r' | grep -i '^cache-control:' || true)
  echo "  ${CACHE_HEADER:-aucun en-tête Cache-Control reçu}"
  if [[ "$CACHE_HEADER" != *"no-store"* ]]; then
    echo "  ⚠ sw.js devrait être en no-store. Vérifiez que mod_headers est actif" >&2
    echo "    et qu'aucune règle mod_expires ne l'écrase." >&2
  fi
else
  echo "  (renseignez HOSTINGER_DOMAIN pour vérifier automatiquement)"
fi

echo "→ Publié."
