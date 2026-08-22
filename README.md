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
packages/core   Moteur de règles — TypeScript pur, zéro dépendance
apps/web        Application Vue 3 + Vite + Tailwind
docs/adr        Décisions d'architecture
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

## État d'avancement

Lot 0 et lot 1 en cours. Le moteur couvre les quatre modes prioritaires, et
l'application permet de jouer une partie complète dans les deux modes de saisie.

Prochaines étapes du lot 1 : PWA installable et service worker (#10–#16),
persistance IndexedDB et reprise de partie (#18, #31), legs et sets (#28).

Voir les [issues ouvertes](https://github.com/Adrizen89/chalk/issues).
