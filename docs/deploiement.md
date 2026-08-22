# Déploiement

> Livrable du §8 : « Documentation d'installation et de déploiement ».
> Issue [#77](https://github.com/Adrizen89/chalk/issues/77).

Chalk est aujourd'hui une application **entièrement statique** : aucun serveur
applicatif, aucune base de données. Le déploiement se résume à publier le
contenu de `apps/web/dist` derrière du HTTPS, avec les bons en-têtes.

Le serveur arrivera au lot 2 (comptes, synchronisation) et ce document sera
complété à ce moment-là.

---

## 1. Ce qui n'est pas encore tranché

L'hébergeur reste à choisir — c'est l'issue [#2](https://github.com/Adrizen89/chalk/issues/2),
et la décision appartient au propriétaire du projet. Deux contraintes du cahier
des charges la cadrent :

- **HTTPS obligatoire** (§6). Sans lui, pas de service worker, donc pas de mode
  hors ligne, donc pas d'installation sur l'écran d'accueil.
- **Hébergement des données dans l'UE** (§6, RGPD). Sans conséquence tant que
  l'application est statique et que tout reste sur l'appareil, mais la
  contrainte s'appliquera pleinement au serveur du lot 2. Autant choisir dès
  maintenant un hébergeur qui la respecte.

Les configurations des quatre cibles envisagées sont générées et versionnées :
choisir l'une d'elles ne demande aucun travail supplémentaire.

## 2. Construire

```bash
pnpm install --frozen-lockfile
pnpm build
```

Le résultat est dans `apps/web/dist`.

Pour servir l'application depuis un sous-répertoire plutôt qu'un domaine
dédié :

```bash
VITE_BASE=/chalk/ pnpm build
```

Le manifeste, le `scope` du service worker et les chemins des icônes suivent
automatiquement — ne jamais les modifier à la main.

## 3. Publier

### Depuis GitHub Actions

Chaque poussée sur `main` produit un artefact `chalk-dist`, `.htaccess`
compris, téléchargeable depuis l'onglet Actions. C'est le chemin le plus court
vers une mise en ligne par FTP.

### Configurations d'hébergement

Elles sont **générées** depuis `deploy/headers.mjs`, jamais écrites à la main :

```bash
pnpm generate:deploy
```

| Cible              | Fichier                                     | Où le déposer            |
| ------------------ | ------------------------------------------- | ------------------------ |
| Apache (Hostinger) | `deploy/generated/.htaccess`                | racine du dossier public |
| Netlify            | `deploy/generated/netlify.toml`             | racine du dépôt          |
| Cloudflare Pages   | `deploy/generated/_headers` et `_redirects` | racine du build          |
| nginx (VPS)        | `deploy/generated/nginx.conf`               | configuration du site    |

La CI échoue si un de ces fichiers est périmé par rapport à `headers.mjs`.

## 4. Le piège du service worker

**C'est le risque de déploiement numéro un du projet.**

L'application n'est ni sur l'App Store ni sur le Play Store. Il n'existe donc
aucun canal pour pousser un correctif à quelqu'un dont le navigateur sert une
version périmée. Si `sw.js` ou `index.html` sont mis en cache par le
navigateur ou par un CDN, les utilisateurs restent **bloqués** sur l'ancienne
version, potentiellement pour des jours.

Les configurations générées imposent donc :

| Ressource               | Cache                                 | Pourquoi                                                  |
| ----------------------- | ------------------------------------- | --------------------------------------------------------- |
| `/sw.js`                | `no-cache, no-store, must-revalidate` | porte la version de l'application                         |
| `/index.html`           | `no-cache, no-store, must-revalidate` | référence les fichiers hachés courants                    |
| `/assets/*`             | `immutable`, un an                    | nom haché : un contenu différent produit un nom différent |
| `/icons/*`, `/splash/*` | une semaine                           | stables, mais sans hachage                                |

**À vérifier après chaque changement d'hébergeur ou de CDN :**

```bash
curl -sI https://VOTRE-DOMAINE/sw.js | grep -i cache-control
```

La réponse doit contenir `no-store`. Si un CDN est devant, vérifier aussi qu'il
ne réécrit pas cet en-tête.

## 5. Mises à jour : ce que voit l'utilisateur

Le service worker est enregistré en mode `prompt` : une nouvelle version ne
s'applique **jamais** toute seule. Une bannière la propose, et elle reste
masquée tant qu'une partie est en cours — §5 interdit d'interrompre un leg.

Conséquence pratique : après un déploiement, les utilisateurs actuellement en
partie ne sont pas dérangés, et basculeront à la fin de leur partie ou à la
prochaine ouverture.

## 6. Sécurité (§6)

Les en-têtes appliqués sont définis dans `deploy/headers.mjs`. La politique de
sécurité du contenu est stricte — aucun script, style, police ou image externe
n'est autorisé, parce que l'application n'en charge aucun.

`'unsafe-inline'` sur `style-src` est la seule concession, imposée par les
liaisons `:style` de Vue, qui produisent des attributs `style`. `script-src`
n'a aucune exception.

**Vérifier avant de déployer** : `pnpm --filter @chalk/web preview` applique
exactement les mêmes en-têtes que la production. Une politique trop stricte se
voit immédiatement dans la console du navigateur, pas trois jours après la mise
en ligne.

## 7. Vérifications après mise en ligne

- [ ] `https://` force la redirection depuis `http://`
- [ ] `curl -sI .../sw.js` renvoie bien `no-store`
- [ ] L'application s'installe sur Android (bannière) et sur iOS (Partager → Sur l'écran d'accueil)
- [ ] Ouverture depuis l'écran d'accueil : aucun écran blanc, le splash s'affiche
- [ ] Mode avion : l'application s'ouvre et une partie locale se joue de bout en bout
- [ ] Une partie interrompue est proposée à la reprise
- [ ] Aucune violation de la politique de sécurité dans la console
- [ ] Chargement initial sous 3 s en 4G (§6) — à mesurer sur un vrai téléphone

## 8. Retour arrière

Le build est un dossier de fichiers statiques : revenir en arrière consiste à
republier l'artefact précédent, disponible dans les artefacts GitHub Actions
pendant trente jours.

Attention : les utilisateurs ayant déjà reçu la nouvelle version la garderont
jusqu'à ce que le service worker constate le retour arrière — quelques minutes,
puisque `sw.js` n'est pas mis en cache.
