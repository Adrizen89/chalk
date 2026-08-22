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
  joueur.

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

## État d'avancement

Lot 0 et lot 1 en cours. Le moteur couvre les quatre modes prioritaires,
l'application permet de jouer une partie complète dans les deux modes de
saisie, elle s'installe sur téléphone en fonctionnant hors ligne, et une partie
interrompue se reprend à l'état exact.

Prochaines étapes du lot 1 : legs et sets (#28), carnet de joueurs complet
(#33), puis le test terrain de 20 parties (#78) avant d'attaquer le lot 2.

Voir les [issues ouvertes](https://github.com/Adrizen89/chalk/issues).
