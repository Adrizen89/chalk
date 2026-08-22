# Chalk

Marqueur de points numérique pour les fléchettes — le nom fait référence à la
craie du tableau de score traditionnel.

Application web progressive (PWA), utilisable sur mobile, tablette et ordinateur.
Objectif : **lancer une partie en moins de 15 secondes** et saisir les scores sans
réfléchir. Principe directeur : _l'application doit se faire oublier pendant la
partie_.

Le périmètre complet est découpé en issues :
[les 5 milestones](https://github.com/Adrizen89/chalk/milestones) suivent les lots
du cahier des charges. Chaque issue cite le paragraphe dont elle vient.

## Démarrage

Prérequis : Node ≥ 20.18 et pnpm 10.

```bash
pnpm install
pnpm dev         # lance l'application sur http://localhost:5173
```

```bash
pnpm test        # suite complète
pnpm typecheck
pnpm lint
pnpm build
```

Le serveur de développement écoute sur toutes les interfaces : on peut ouvrir
l'application depuis un vrai téléphone sur le même réseau, ce qui est la seule
façon honnête de vérifier les contraintes d'ergonomie (lisibilité à distance,
usage à une main, taille des cibles tactiles).

## Structure

```
deploy               Configurations d'hébergement, générées
packages/core        Moteur de règles — TypeScript pur, zéro dépendance
apps/web             Application Vue 3 + Vite + Tailwind, PWA installable
apps/web/src/db      Persistance locale (IndexedDB via Dexie)
apps/web/assets      Sources vectorielles des icônes
apps/web/scripts     Génération des icônes et des écrans de démarrage
docs/adr             Décisions d'architecture
```

### `packages/core`

Le moteur ne dépend ni de l'UI, ni du réseau, ni du stockage. Il tourne dans le
navigateur hors ligne et pourra être rejoué côté serveur pour revalider les
parties reçues du multi-appareil.

Il contient aujourd'hui :

- l'abstraction **« règle de jeu »** (`GameRule`), qui permet d'ajouter un mode
  sans toucher au moteur ni à l'écran de partie ;
- la **session de jeu** (`GameSession`) : journal d'entrées, undo multi-niveaux,
  correction d'une volée validée, instantané sérialisable ;
- les quatre **modes de jeu prioritaires** du lot 1 :
  | Mode                 | Couverture                                                                                      |
  | -------------------- | ----------------------------------------------------------------------------------------------- |
  | **X01**              | 301/501/701/1001 et score libre, straight/double in, double/master/straight out, bust, handicap |
  | **Cricket**          | 15 à 20 + bull, 3 marques pour fermer, variantes _Cut-throat_ et _sans points_                  |
  | **Killer**           | tirage ou attribution manuelle des numéros, statut killer, retrait de vies, vies paramétrables  |
  | **Around the Clock** | 1 à 20 puis bull, variantes simple / double / triple obligatoire                                |
- le **solveur de sorties** : table de checkouts résolue, pas recopiée, adaptée au
  mode de sortie, au nombre de fléchettes restantes et aux doubles préférés du
  joueur ;
- les **legs et les sets**, sous forme de règle enveloppante ;
- le **calcul des statistiques**, par rejeu du journal ;
- l'abstraction **« exercice »** et les huit exercices d'entraînement.

### Le match est lui-même une règle de jeu

Plutôt que d'apprendre les legs et les sets à chaque mode — ce qui les
dupliquerait quatre fois aujourd'hui et une fois de plus à chaque règle maison
— `createMatchRule(base)` enveloppe une règle dans une règle qui en enchaîne
les manches.

Tout ce qui vaut pour une règle vaut donc pour un match, gratuitement : l'undo
multi-niveaux, la reprise après fermeture et la persistance fonctionnent sans
une ligne de plus, parce que le journal reste une suite de fléchettes rejouée
de bout en bout.

Une suite de tests de contrat s'applique à **toutes** les règles du registre —
sérialisation, immuabilité, undo, rejeu depuis instantané. Un mode ajouté plus
tard en hérite automatiquement.

Pour ajouter un mode de jeu : écrire un module implémentant `GameRule`, puis
l'ajouter au registre dans `src/games/index.ts`. Rien d'autre à toucher — ni le
moteur, ni l'écran de partie. Voir
[`docs/adr/0002-moteur-de-regles-pur.md`](docs/adr/0002-moteur-de-regles-pur.md).

### `apps/web`

Application Vue 3, thème sombre par défaut. L'écran de partie n'a aucune
connaissance des règles : il affiche la `GameView` projetée par le moteur, ce
qui lui permet de servir les quatre modes avec le même code. Les modes qui ont
un affichage propre — le tableau de marques du Cricket — le branchent via
`view.players[].extra`.

Les contraintes du §5 sont encodées dans le design system plutôt que
re-décidées écran par écran : palier typographique « score » lisible à 2–3 m,
cibles tactiles d'au moins 48 px, zones d'action dans la moitié basse de
l'écran, aucune fenêtre modale pendant une partie, safe areas gérées.

Deux thèmes, sombre par défaut. **Les contrastes des deux palettes sont
vérifiés au ratio WCAG AA** (§6) : aucune paire texte/fond ne descend sous
4,5:1. Le thème s'applique avant le premier rendu, depuis un miroir synchrone
en `localStorage` — un chargement IndexedDB asynchrone produirait un flash de
thème au démarrage.

### Persistance

Tout ce que Chalk sait vit d'abord en IndexedDB. Ce n'est pas un cache du
serveur : le §3.1 exige que le mode local soit pleinement fonctionnel hors
ligne, donc la base locale est la source de vérité et le serveur (lot 2) en
sera la copie.

Ce qu'on enregistre d'une partie, ce n'est pas son état mais son **journal
d'entrées** — compact, rejouable, et bien plus facile à réconcilier qu'un état
mutable, ce qui prépare la synchronisation multi-appareil.

L'écriture a lieu **à chaque entrée validée**, jamais à la sortie propre : une
batterie qui se vide ne laisse pas le temps de sortir proprement. Elle n'est
pas attendue, pour rester sous les 100 ms de latence de saisie du §6.

Une partie interrompue est proposée à la reprise sur l'accueil, et reprend à
l'état exact — scores, joueur actif, volée en cours, et jusqu'à la possibilité
d'annuler.

### Entraînement

Même principe que les modes de jeu, et pour la même raison : le §4.5 demande
que l'utilisateur puisse **créer ses propres exercices**. Un exercice
personnalisé est une définition de **données**, exécutée par les mêmes
implémentations que les exercices intégrés — aucun code n'est produit à la
volée, rien n'est interprété. C'est aussi ce qui rend le partage par lien sûr :
ce qui circule est une structure revalidée à l'import.

Cinq des huit exercices intégrés s'expriment entièrement en données. C'est le
signe que l'abstraction est au bon niveau : si un exercice maison demandait du
code, elle serait trop étroite.

« Around the Clock chronométré » et « Leg solo » réutilisent directement les
modes de jeu correspondants, via un adaptateur. Le chronomètre reste à
l'interface : la règle compte les fléchettes, elle ne connaît pas le temps.

### Statistiques

Tout est recalculé **depuis le journal d'entrées**, jamais compté au vol pendant
la partie. Deux raisons : une volée annulée ou corrigée doit disparaître des
statistiques, et le moteur doit rester seul dépositaire des règles — le calcul
rejoue et observe, il ne réimplémente ni les busts ni les fins de leg.

Conséquence utile : les statistiques ne font pas confiance au vainqueur
enregistré. Une partie dont le journal ne descend pas à zéro n'est pas comptée
comme gagnée, quoi que dise l'enregistrement.

Le résultat par partie est calculé une fois, à la fin, puis conservé —
l'agrégation n'est plus qu'une somme (§4.7 : « l'affichage ne recalcule pas
l'intégralité de l'historique »).

### PWA

L'application s'installe sur l'écran d'accueil et se comporte comme une
application native : `display: standalone`, jeu d'icônes complet, écrans de
démarrage iOS, et service worker qui précache la coquille — **elle s'ouvre et
se joue sans réseau**.

Elle n'est ni sur l'App Store ni sur le Play Store. C'est un choix assumé — pas
de commission, pas de validation d'Apple, mises à jour instantanées — mais il
implique que l'installation passe par un lien à partager. D'où l'invitation
explicite : le prompt natif sur Android, la marche à suivre sur iOS Safari où
l'API n'existe pas.

Les mises à jour ne s'appliquent jamais toutes seules : une bannière les
propose, et elle reste masquée tant qu'une partie est en cours.

Toutes les images dérivent d'un seul SVG :

```bash
pnpm --filter @chalk/web generate:assets
```

Les PNG produits sont versionnés — la CI n'a pas à dépendre de `sharp` pour
construire l'application.

## Déploiement

L'application est entièrement statique : publier `apps/web/dist` derrière du
HTTPS suffit. L'hébergement retenu est **Hostinger** (issue #2).

La publication se fait à la main : aucun déploiement automatique n'est câblé.

```bash
pnpm package:release              # archive prête pour le hPanel, .htaccess compris
pnpm verify:deployment MON-DOMAINE  # 12 contrôles après mise en ligne
```

Les configurations Apache, Netlify, Cloudflare et nginx sont **générées** depuis
une source unique (`deploy/headers.mjs`) pour qu'elles ne puissent pas diverger,
et la CI échoue si elles sont périmées.

Le point sensible est le cycle de vie du service worker : `sw.js` mis en cache
fige les utilisateurs sur une ancienne version, sans recours puisqu'il n'y a
pas de store d'où pousser un correctif. Voir
[`docs/deploiement.md`](docs/deploiement.md).

## État d'avancement

Lot 0 et lot 1 en cours. Le moteur couvre les quatre modes prioritaires,
l'application permet de jouer une partie complète dans les deux modes de
saisie, elle s'installe sur téléphone en fonctionnant hors ligne, et une partie
interrompue se reprend à l'état exact, et les matchs se jouent en legs et en
sets.

Le lot 2 est entamé par sa partie locale : historique et statistiques (#42,
#43, #44), qui ne dépendent d'aucun serveur.

Prochaine étape du lot 1 : le **test terrain de 20 parties** (#78), que le
cahier des charges pose en jalon bloquant avant le lot 2 — « le retour d'usage
sur les 20 premières parties fera probablement bouger des choix d'interface ».

Voir les [issues ouvertes](https://github.com/Adrizen89/chalk/issues).
