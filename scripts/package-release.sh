#!/usr/bin/env bash
#
# Prépare une archive prête à téléverser à la main sur Hostinger — #77.
#
# Le hPanel sait recevoir une archive ZIP et l'extraire sur place. C'est le
# chemin manuel le plus sûr : le `.htaccess` voyage à l'intérieur de l'archive
# et ne peut pas être oublié, contrairement à un glisser-déposer FileZilla où
# les fichiers cachés passent facilement à la trappe.
#
# Sans `.htaccess`, il n'y a ni repli SPA, ni en-têtes de sécurité, et surtout
# pas de `no-store` sur `sw.js` — donc des utilisateurs figés sur une vieille
# version, sans recours.

set -euo pipefail
cd "$(dirname "$0")/.."

DIST="apps/web/dist"
STAMP="$(date +%Y%m%d-%H%M)"
ARCHIVE="chalk-${STAMP}.zip"

echo "→ Construction"
pnpm install --frozen-lockfile
pnpm build

echo "→ Configuration d'hébergement"
pnpm generate:deploy >/dev/null
cp deploy/generated/.htaccess "${DIST}/.htaccess"

echo "→ Archive"
rm -f "${ARCHIVE}"
# `-r` avec un chemin relatif depuis dist pour que l'archive n'ait pas de
# dossier racine : le contenu doit atterrir directement dans public_html/.
(cd "${DIST}" && zip -qr "../../../${ARCHIVE}" . -x '.DS_Store')

echo
echo "Archive prête : ${ARCHIVE}  ($(du -h "${ARCHIVE}" | cut -f1))"
echo
echo "Contenu à la racine de l'archive :"
unzip -l "${ARCHIVE}" | awk 'NR>3 && $4 !~ /\// {print "  " $4}' | grep -v '^\s*$' | head -12
echo
echo "À faire dans le hPanel Hostinger :"
echo "  1. Fichiers → Gestionnaire de fichiers → public_html/"
echo "  2. Sauvegarder puis vider le dossier s'il contient un site existant"
echo "  3. Téléverser ${ARCHIVE}, puis « Extraire »"
echo "  4. Supprimer l'archive une fois extraite"
echo "  5. Vérifier : ./scripts/verify-deployment.sh VOTRE-DOMAINE"
