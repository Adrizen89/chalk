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
pnpm test        # suite complète
pnpm typecheck
pnpm lint
```

## Structure

```
packages/core   Moteur de règles — TypeScript pur, zéro dépendance
apps/web        Application Vue 3 (à venir)
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
- le mode **X01** (301/501/701/1001 et score libre, straight/double in,
  double/master/straight out, bust) ;
- le **solveur de sorties** : table de checkouts résolue, pas recopiée, adaptée au
  mode de sortie, au nombre de fléchettes restantes et aux doubles préférés du
  joueur.

Pour ajouter un mode de jeu, voir [`docs/adr/0002-moteur-de-regles-pur.md`](docs/adr/0002-moteur-de-regles-pur.md).

## État d'avancement

Lot 0 et début du lot 1. Voir les [issues ouvertes](https://github.com/Adrizen89/chalk/issues).
