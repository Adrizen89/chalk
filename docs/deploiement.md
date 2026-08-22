# Déploiement

> Livrable du §8 : « Documentation d'installation et de déploiement ».
> Issue [#77](https://github.com/Adrizen89/chalk/issues/77).

Chalk est aujourd'hui une application **entièrement statique** : aucun serveur
applicatif, aucune base de données. Le déploiement se résume à publier le
contenu de `apps/web/dist` derrière du HTTPS, avec les bons en-têtes.

Le serveur arrivera au lot 2 (comptes, synchronisation) et ce document sera
complété à ce moment-là.

---

## 1. Hébergeur retenu : Hostinger

Décision de l'issue [#2](https://github.com/Adrizen89/chalk/issues/2). Hostinger
est l'hébergement déjà en place, avec des datacentres dans l'UE — ce qui règle
d'avance la contrainte RGPD du §6 pour le serveur du lot 2.

Deux contraintes du cahier des charges cadrent la mise en ligne :

- **HTTPS obligatoire** (§6). Sans lui, pas de service worker, donc pas de mode
  hors ligne, donc pas d'installation sur l'écran d'accueil. Hostinger fournit
  un certificat Let's Encrypt gratuit, à activer dans le hPanel s'il ne l'est
  pas déjà.
- **Données dans l'UE** (§6, RGPD). Sans conséquence tant que l'application est
  statique et que tout reste sur l'appareil, mais la contrainte s'appliquera
  pleinement au serveur du lot 2.

Les configurations Netlify, Cloudflare et nginx restent générées : changer
d'hébergeur plus tard ne demanderait aucun travail supplémentaire.

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

### Option A — Script local (le plus direct)

```bash
cp .env.deploy.example .env.deploy   # puis renseigner ses valeurs
./scripts/deploy-hostinger.sh        # simulation : rien n'est publié
./scripts/deploy-hostinger.sh --go   # publication réelle
```

Le script construit, ajoute le `.htaccess`, envoie par `rsync` sur SFTP, puis
vérifie les en-têtes de `sw.js`. **Il tourne en simulation par défaut** : il
faut `--go` pour écrire quoi que ce soit.

L'authentification passe par une **clé SSH**, jamais par un mot de passe. Pour
en déposer une :

```bash
ssh-keygen -t ed25519 -C "chalk-deploy"
ssh-copy-id -p 65002 uXXXXXXXXX@srv-XXX.hstgr.io
```

Valeurs Hostinger habituelles : port **65002**, utilisateur `uXXXXXXXXX`,
serveur `srv-XXX.hstgr.io`, destination `public_html/`. Elles se lisent dans le
hPanel, section _Fichiers → Comptes FTP_.

### Option B — GitHub Actions

Chaque poussée sur `main` produit un artefact `chalk-dist`, `.htaccess`
compris, téléchargeable depuis l'onglet Actions.

Pour publier depuis GitHub, lancer le workflow _Build de déploiement_
manuellement en cochant **Publier sur Hostinger**. Secrets à configurer dans
_Settings → Secrets and variables → Actions_ :

| Secret              | Valeur                                |
| ------------------- | ------------------------------------- |
| `HOSTINGER_HOST`    | `srv-XXX.hstgr.io`                    |
| `HOSTINGER_USER`    | `uXXXXXXXXX`                          |
| `HOSTINGER_SSH_KEY` | clé privée dédiée au déploiement      |
| `HOSTINGER_PORT`    | facultatif, `65002` par défaut        |
| `HOSTINGER_PATH`    | facultatif, `public_html/` par défaut |

Et une variable `CHALK_DOMAIN` pour que le workflow vérifie les en-têtes après
publication.

La publication est volontairement **manuelle** : mettre en ligne est visible par
les joueurs, cela mérite un geste explicite. Pour la rendre automatique à chaque
poussée sur `main`, remplacer la condition du job `publish` par
`if: github.ref == 'refs/heads/main'`.

### Option C — FileZilla

Glisser le contenu de `apps/web/dist` (fichiers cachés compris, dont
`.htaccess`) dans `public_html/`. Le plus simple pour une première mise en
ligne, le moins pratique ensuite.

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

### Le piège spécifique à Hostinger

La configuration `.htaccess` habituelle des projets ADBDigital comprend un bloc
`mod_expires` de ce genre :

```apache
ExpiresByType application/javascript "access plus 1 month"
```

**Ne pas l'ajouter ici.** `mod_expires` pose un `Cache-Control: max-age` sur
tous les fichiers JavaScript — `sw.js` compris. Un mois de cache sur le service
worker signifie un mois d'utilisateurs bloqués sur une version périmée.

Le `.htaccess` généré n'utilise volontairement **pas** `mod_expires` : il pose
des `Cache-Control` explicites, chemin par chemin. Les fichiers hachés de
`/assets/` sont mis en cache un an, ce qui donne le même bénéfice sans le
risque.

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

## 7. Avant la première mise en ligne

- [ ] SSL activé dans le hPanel Hostinger (Let's Encrypt, gratuit)
- [ ] `public_html/` vide, ou sauvegardé s'il contient un site existant
- [ ] Nom de domaine pointé sur l'hébergement
- [ ] Clé SSH déposée, connexion testée : `ssh -p 65002 uXXXXXXXXX@srv-XXX.hstgr.io`
- [ ] `mod_headers` actif (il l'est par défaut chez Hostinger)

## 8. Vérifications après mise en ligne

- [ ] `https://` force la redirection depuis `http://`
- [ ] `curl -sI .../sw.js` renvoie bien `no-store`
- [ ] L'application s'installe sur Android (bannière) et sur iOS (Partager → Sur l'écran d'accueil)
- [ ] Ouverture depuis l'écran d'accueil : aucun écran blanc, le splash s'affiche
- [ ] Mode avion : l'application s'ouvre et une partie locale se joue de bout en bout
- [ ] Une partie interrompue est proposée à la reprise
- [ ] Aucune violation de la politique de sécurité dans la console
- [ ] Chargement initial sous 3 s en 4G (§6) — à mesurer sur un vrai téléphone

## 9. Retour arrière

Le build est un dossier de fichiers statiques : revenir en arrière consiste à
republier l'artefact précédent, disponible dans les artefacts GitHub Actions
pendant trente jours.

Attention : les utilisateurs ayant déjà reçu la nouvelle version la garderont
jusqu'à ce que le service worker constate le retour arrière — quelques minutes,
puisque `sw.js` n'est pas mis en cache.
