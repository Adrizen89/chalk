/**
 * Abstraction « règle de jeu » — §4.2, exigence structurante.
 *
 *   « L'architecture doit permettre d'ajouter un nouveau mode de jeu sans
 *     réécrire le moteur. Prévoir une abstraction "règle de jeu" (état,
 *     validation d'une volée, condition de victoire, affichage). »
 *
 * Trois contraintes de conception en découlent, et elles ne sont pas
 * négociables si l'on veut que les lots 2 et 3 restent faisables :
 *
 *  1. **Pureté.** Aucune dépendance UI, réseau ou stockage. C'est ce qui permet
 *     de tester le moteur unitairement, de le rejouer côté serveur pour valider
 *     une partie reçue (§3.3), et de le faire tourner hors ligne (§3.1).
 *  2. **Immuabilité.** `applyDart` ne mute rien et retourne un nouvel état.
 *     C'est le prérequis de l'undo multi-niveaux (§4.3) et de la correction
 *     d'une volée déjà validée (§4.3).
 *  3. **Sérialisabilité.** Un état doit pouvoir être écrit en IndexedDB puis
 *     rechargé à l'identique (§3.4, §4.4 reprise de partie).
 */

import type { Dart } from './dart.js'

export type PlayerId = string

export interface PlayerRef {
  readonly id: PlayerId
  readonly name: string
}

export type DartValidation = { readonly ok: true } | { readonly ok: false; readonly reason: string }

export const DART_ACCEPTED: DartValidation = { ok: true }

export function rejectDart(reason: string): DartValidation {
  return { ok: false, reason }
}

/**
 * Conséquences observables de l'application d'une fléchette.
 *
 * L'interface s'en sert pour le retour visuel immédiat (§5), les sons et
 * vibrations (§4.9 : « annonce des 180, fin de leg »), et les statistiques
 * (§4.7 : nombre de 180, de 140+, de 100+).
 */
export type GameEffect =
  | { readonly type: 'bust'; readonly playerId: PlayerId; readonly restoredScore: number }
  | { readonly type: 'turn-ended'; readonly playerId: PlayerId; readonly total: number }
  | { readonly type: 'leg-won'; readonly playerId: PlayerId }
  | { readonly type: 'set-won'; readonly playerId: PlayerId }
  | { readonly type: 'game-won'; readonly playerId: PlayerId }
  | {
      readonly type: 'milestone'
      readonly playerId: PlayerId
      readonly label: '180' | '140+' | '100+'
    }

export interface ApplyResult<TState> {
  readonly state: TState
  readonly effects: readonly GameEffect[]
}

/** Une ligne de score dans l'écran de partie générique. */
export interface PlayerView {
  readonly playerId: PlayerId
  readonly name: string
  /** Valeur mise en avant, en très gros (§5 : lisible à 2–3 m). */
  readonly primary: string
  /** Informations secondaires : moyenne, fléchettes lancées, legs gagnés (§4.3). */
  readonly secondary: readonly { readonly label: string; readonly value: string }[]
  readonly isActive: boolean
  readonly isFinished: boolean
  /** Données propres au mode : marques du Cricket, vies du Killer… */
  readonly extra?: Readonly<Record<string, unknown>>
}

/**
 * Projection de l'état pour l'écran de partie.
 *
 * C'est ce qui permet à un seul écran de servir X01, Cricket, Killer et Around
 * the Clock : l'écran ne connaît pas les règles, il affiche une `GameView`.
 */
export interface GameView {
  readonly ruleId: string
  readonly players: readonly PlayerView[]
  readonly activePlayerId: PlayerId | null
  /** Fléchettes déjà lancées dans la volée en cours. */
  readonly turnDarts: readonly Dart[]
  readonly dartsRemainingInTurn: number
  readonly isFinished: boolean
  readonly winnerId: PlayerId | null
  /** Message court à afficher, non bloquant (§5 : aucune fenêtre modale). */
  readonly message?: string
}

export interface GameRule<TConfig, TState> {
  readonly id: string
  readonly label: string
  /**
   * Le mode exige-t-il la saisie fléchette par fléchette ?
   *
   * §4.3 : le Cricket ne peut pas se contenter d'un total de volée — on ne
   * déduit pas les marques d'un nombre. L'interface s'appuie là-dessus pour
   * désactiver la saisie rapide sur les modes concernés.
   */
  readonly requiresDartDetail: boolean
  readonly defaultConfig: TConfig

  createState(config: TConfig, players: readonly PlayerRef[]): TState

  /** Validation d'une fléchette dans l'état courant (§4.2). */
  validateDart(state: TState, dart: Dart): DartValidation

  /** Application immuable d'une fléchette. */
  applyDart(state: TState, dart: Dart): ApplyResult<TState>

  /**
   * Saisie par volée (§4.3, mode rapide). Absent des modes qui exigent le détail.
   * Le total a déjà été validé comme atteignable en 3 fléchettes.
   * `dartsUsed` sert à la volée gagnante, qui peut ne compter que 1 ou 2
   * fléchettes (§4.4) — sans quoi la statistique « meilleur leg » est fausse.
   */
  applyTurnTotal?(state: TState, total: number, dartsUsed?: number): ApplyResult<TState>

  /** Condition de victoire (§4.2). */
  getWinner(state: TState): PlayerId | null

  /** Affichage (§4.2). */
  view(state: TState): GameView
}

/**
 * Règle dont on ne connaît pas les paramètres de type — le cas d'un conteneur
 * générique : registre des modes, session d'une partie en cours, composant
 * d'affichage. Les `any` sont ici volontaires et confinés à cet alias.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyGameRule = GameRule<any, any>

/** Aide au typage : dérive le type d'état d'une règle. */
export type StateOf<R> = R extends GameRule<infer _Config, infer S> ? S : never
/** Aide au typage : dérive le type de configuration d'une règle. */
export type ConfigOf<R> = R extends GameRule<infer C, infer _State> ? C : never
