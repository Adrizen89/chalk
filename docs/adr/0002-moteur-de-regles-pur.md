# ADR 0002 — Un moteur de règles pur, piloté par un journal d'entrées

- **Statut** : accepté
- **Date** : 2026-08-22
- **Issue** : [#17](https://github.com/Adrizen89/chalk/issues/17)
- **Réf. CDC** : §4.2 (exigence structurante), §4.3, §3.3, §4.4

## Contexte

Le §4.2 pose une exigence structurante :

> L'architecture doit permettre d'ajouter un nouveau mode de jeu sans réécrire le
> moteur. Prévoir une abstraction « règle de jeu » (état, validation d'une volée,
> condition de victoire, affichage). Le propriétaire du projet ajoutera des règles
> maison par la suite.

Trois autres exigences du CDC contraignent la même pièce de code :

- **Undo multi-niveaux** : annuler la dernière fléchette, la dernière volée, ou
  revenir plusieurs coups en arrière (§4.3).
- **Correction d'une volée déjà validée** par l'hôte, avec recalcul de l'aval (§4.3).
- **Reprise d'une partie interrompue** à l'état exact (§4.4), et **synchronisation
  multi-appareil** avec résolution de conflits (§3.3, §9.4).

## Décision

### 1. Le moteur est pur

`packages/core` n'a aucune dépendance : ni UI, ni réseau, ni stockage. Une règle
est un objet implémentant `GameRule<TConfig, TState>` : création d'état,
validation d'une fléchette, application immuable, condition de victoire, et une
projection `view()` vers un affichage générique.

Conséquence directe : le même moteur tourne dans le navigateur hors ligne (§3.1)
et côté serveur pour revalider une partie reçue du multi-appareil (§3.3), sans
duplication de règles.

### 2. L'état est immuable, la session tient un journal d'entrées

`applyDart` ne mute rien et retourne un nouvel état. La `GameSession` conserve la
suite des entrées et l'état obtenu après chacune.

**Annuler**, c'est revenir à un état antérieur. **Corriger**, c'est rejouer le
journal modifié. Aucune règle n'a besoin d'écrire une opération inverse — ce qui
serait impossible à garder juste au fil des règles maison à venir.

L'alternative — un état mutable et une pile d'annulations par règle — a été
écartée : elle reporte sur chaque nouvelle règle la charge de rester correcte
sur l'undo, exactement ce que le §4.2 demande d'éviter.

### 3. Le journal est l'unité de synchronisation

Une suite d'entrées horodatées se réconcilie beaucoup mieux qu'un état mutable.
Ce choix prépare la stratégie de résolution de conflits ([#4](https://github.com/Adrizen89/chalk/issues/4))
sans la préempter.

### 4. L'affichage passe par une projection générique

`view()` retourne une `GameView` : lignes de score, joueur actif, fléchettes de la
volée, message non bloquant. L'écran de partie ne connaît aucune règle — c'est ce
qui permet à un seul écran de servir X01, Cricket, Killer et Around the Clock, et
aux règles maison de s'afficher sans toucher à l'interface.

### 5. Les effets sont explicites

`applyDart` retourne des effets (`bust`, `turn-ended`, `leg-won`, `game-won`,
`milestone`). L'interface n'a pas à deviner ce qui vient de se passer pour
déclencher un retour visuel (§5), un son ou une vibration (§4.9 : « annonce des
180, fin de leg »), ou incrémenter une statistique (§4.7).

## Conséquences

- Ajouter un mode de jeu = un module implémentant `GameRule`. Aucune modification
  du moteur ni de l'écran de partie.
- La sérialisation d'une partie est celle de son journal : compacte, rejouable,
  et directement utilisable pour IndexedDB (§3.4) comme pour la reprise (§4.4).
- Coût : chaque application de fléchette alloue un nouvel état. Négligeable à
  l'échelle d'une partie (quelques centaines de fléchettes), et le seuil des
  100 ms du §6 est tenu très largement.
- La `GameSession` garde un état par entrée. Une partie longue en mémoire reste
  de l'ordre de la centaine d'objets — sans commune mesure avec le budget.
