/**
 * Mode de jeu Around the Clock — §4.2.
 *
 * « 1 à 20 puis bull ; variantes simple / double / triple obligatoire. »
 *
 * Le module Entraînement le réutilise tel quel pour l'exercice « Around the
 * Clock chronométré » (§4.5) : la règle ne connaît pas le chronomètre, elle
 * compte les fléchettes. C'est à l'exercice d'ajouter le temps.
 */

import type { Dart } from '../dart.js'
import { BULL, DARTS_PER_TURN, formatDart, isPhysicallyPossible } from '../dart.js'
import type {
  DartValidation,
  GameEffect,
  GameRule,
  GameView,
  PlayerId,
  PlayerView,
} from '../rule.js'
import { DART_ACCEPTED, rejectDart } from '../rule.js'

/** Parcours : 1 à 20, puis le bull. */
export const AROUND_THE_CLOCK_SEQUENCE: readonly number[] = [
  ...Array.from({ length: 20 }, (_, i) => i + 1),
  BULL,
]

/**
 * - `any` : n'importe quel touché sur le numéro fait avancer (variante simple).
 * - `double` / `triple` : seul ce multiplicateur fait avancer.
 */
export type AroundTheClockMode = 'any' | 'double' | 'triple'

export interface AroundTheClockConfig {
  readonly mode: AroundTheClockMode
  /** Le bull conclut le parcours. Certains le retirent pour aller plus vite. */
  readonly includeBull: boolean
}

export const AROUND_THE_CLOCK_DEFAULT_CONFIG: AroundTheClockConfig = {
  mode: 'any',
  includeBull: true,
}

export interface AroundTheClockPlayerState {
  readonly id: PlayerId
  readonly name: string
  /** Index dans la séquence. Égal à la longueur de la séquence quand c'est fini. */
  readonly progress: number
  readonly dartsThrown: number
}

export interface AroundTheClockState {
  readonly config: AroundTheClockConfig
  readonly sequence: readonly number[]
  readonly players: readonly AroundTheClockPlayerState[]
  readonly activeIndex: number
  readonly turnDarts: readonly Dart[]
  readonly winnerId: PlayerId | null
}

function sequenceFor(config: AroundTheClockConfig): readonly number[] {
  return config.includeBull
    ? AROUND_THE_CLOCK_SEQUENCE
    : AROUND_THE_CLOCK_SEQUENCE.filter((target) => target !== BULL)
}

/** Cible courante d'un joueur, ou `null` s'il a terminé. */
export function currentTarget(
  state: AroundTheClockState,
  player: AroundTheClockPlayerState,
): number | null {
  return state.sequence[player.progress] ?? null
}

export function hasFinished(
  state: AroundTheClockState,
  player: AroundTheClockPlayerState,
): boolean {
  return player.progress >= state.sequence.length
}

/**
 * La fléchette fait-elle avancer ?
 *
 * Le bull n'a pas de triple : en mode « triple obligatoire », on accepte le
 * double bull pour conclure, sans quoi le parcours serait infinissable.
 */
function advances(dart: Dart, target: number, mode: AroundTheClockMode): boolean {
  if (dart.segment !== target || dart.segment === 0) return false
  switch (mode) {
    case 'any':
      return true
    case 'double':
      return dart.multiplier === 2
    case 'triple':
      return target === BULL ? dart.multiplier === 2 : dart.multiplier === 3
  }
}

function nextActiveIndex(
  state: AroundTheClockState,
  players: readonly AroundTheClockPlayerState[],
  fromIndex: number,
): number {
  for (let step = 1; step <= players.length; step += 1) {
    const index = (fromIndex + step) % players.length
    const candidate = players[index]
    if (candidate && !hasFinished(state, candidate)) return index
  }
  return fromIndex
}

export const aroundTheClockRule: GameRule<AroundTheClockConfig, AroundTheClockState> = {
  id: 'around-the-clock',
  label: 'Around the Clock',
  requiresDartDetail: true,
  defaultConfig: AROUND_THE_CLOCK_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      sequence: sequenceFor(config),
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        progress: 0,
        dartsThrown: 0,
      })),
      activeIndex: 0,
      turnDarts: [],
      winnerId: null,
    }
  },

  validateDart(state, dart): DartValidation {
    if (state.winnerId !== null) return rejectDart('La partie est terminée.')
    if (state.turnDarts.length >= DARTS_PER_TURN) return rejectDart('La volée est déjà complète.')
    if (!isPhysicallyPossible(dart)) {
      return rejectDart(`${formatDart(dart)} n’existe pas sur une cible.`)
    }
    return DART_ACCEPTED
  },

  applyDart(state, dart) {
    const player = state.players[state.activeIndex]
    if (!player || state.winnerId !== null) return { state, effects: [] }

    const effects: GameEffect[] = []
    const turnDarts = [...state.turnDarts, dart]
    const target = currentTarget(state, player)
    const progresse = target !== null && advances(dart, target, state.config.mode)

    const players = state.players.map((p, index) =>
      index === state.activeIndex
        ? { ...p, dartsThrown: p.dartsThrown + 1, progress: p.progress + (progresse ? 1 : 0) }
        : p,
    )

    const afterThrow: AroundTheClockState = { ...state, players, turnDarts }
    const updated = players[state.activeIndex]

    if (updated && hasFinished(afterThrow, updated)) {
      effects.push({ type: 'leg-won', playerId: updated.id })
      effects.push({ type: 'game-won', playerId: updated.id })
      return { state: { ...afterThrow, winnerId: updated.id }, effects }
    }

    if (turnDarts.length === DARTS_PER_TURN) {
      effects.push({ type: 'turn-ended', playerId: player.id, total: 0 })
      return {
        state: {
          ...afterThrow,
          activeIndex: nextActiveIndex(afterThrow, players, state.activeIndex),
          turnDarts: [],
        },
        effects,
      }
    }

    return { state: afterThrow, effects }
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const active = state.players[state.activeIndex]
    const players: PlayerView[] = state.players.map((player, index) => {
      const target = currentTarget(state, player)
      return {
        playerId: player.id,
        name: player.name,
        primary: target === null ? 'Fini' : target === BULL ? 'BULL' : String(target),
        secondary: [
          { label: 'Progression', value: `${player.progress}/${state.sequence.length}` },
          { label: 'Fléchettes', value: String(player.dartsThrown) },
        ],
        isActive: index === state.activeIndex && state.winnerId === null,
        isFinished: hasFinished(state, player),
        extra: { target, progress: player.progress },
      }
    })

    return {
      ruleId: 'around-the-clock',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
    }
  },
}
