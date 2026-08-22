/**
 * Mode de jeu Cricket — §4.2.
 *
 * « Nombres 15 à 20 + bull ; 3 marques pour fermer ; variantes *Cut-throat* et
 *   *sans points*. »
 *
 * Le Cricket est le mode qui impose la saisie fléchette par fléchette (§4.3) :
 * un total de volée ne dit pas quels nombres ont été marqués, ni avec quel
 * multiplicateur. `requiresDartDetail` est donc à `true`, et l'interface s'en
 * sert pour désactiver la saisie rapide.
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

export const MARKS_TO_CLOSE = 3

/** Cibles du Cricket standard : 15 à 20, plus le bull. */
export const CRICKET_TARGETS: readonly number[] = [15, 16, 17, 18, 19, 20, BULL]

/**
 * - `standard` : les points vont à celui qui marque sur un nombre qu'il a fermé
 *   et que l'adversaire n'a pas fermé. Le plus haut score gagne.
 * - `cutthroat` : les points vont **aux adversaires** qui n'ont pas fermé le
 *   nombre. Le plus **bas** score gagne — marquer devient une punition.
 * - `no-score` : aucun point, premier à tout fermer.
 */
export type CricketVariant = 'standard' | 'cutthroat' | 'no-score'

export interface CricketConfig {
  readonly variant: CricketVariant
  readonly targets: readonly number[]
}

export const CRICKET_DEFAULT_CONFIG: CricketConfig = {
  variant: 'standard',
  targets: CRICKET_TARGETS,
}

export interface CricketPlayerState {
  readonly id: PlayerId
  readonly name: string
  /** Marques par cible, de 0 à 3. Une cible absente vaut 0. */
  readonly marks: Readonly<Record<number, number>>
  readonly score: number
  readonly dartsThrown: number
}

export interface CricketState {
  readonly config: CricketConfig
  readonly players: readonly CricketPlayerState[]
  readonly activeIndex: number
  readonly turnDarts: readonly Dart[]
  readonly winnerId: PlayerId | null
}

export function marksOn(player: CricketPlayerState, target: number): number {
  return player.marks[target] ?? 0
}

export function hasClosed(player: CricketPlayerState, target: number): boolean {
  return marksOn(player, target) >= MARKS_TO_CLOSE
}

export function hasClosedEverything(player: CricketPlayerState, config: CricketConfig): boolean {
  return config.targets.every((target) => hasClosed(player, target))
}

/** Un nombre est mort quand tout le monde l'a fermé : il ne rapporte plus rien. */
export function isTargetDead(state: CricketState, target: number): boolean {
  return state.players.every((player) => hasClosed(player, target))
}

/**
 * Nombre de marques rapportées par une fléchette.
 * Simple = 1, double = 2, triple = 3. Le bull suit la même règle : 25 vaut une
 * marque, le double bull en vaut deux.
 */
function marksFor(dart: Dart): number {
  return dart.segment === 0 ? 0 : dart.multiplier
}

function nextActiveIndex(players: readonly CricketPlayerState[], fromIndex: number): number {
  return (fromIndex + 1) % players.length
}

/**
 * Condition de victoire — §4.2.
 *
 * Tout fermer ne suffit pas : il faut aussi être devant au score, sinon un
 * joueur pourrait fermer vite et perdre la partie qu'il vient de gagner.
 */
function computeWinner(state: CricketState): PlayerId | null {
  const { config, players } = state
  const finished = players.filter((player) => hasClosedEverything(player, config))
  if (finished.length === 0) return null

  if (config.variant === 'no-score') return finished[0]?.id ?? null

  for (const candidate of finished) {
    const others = players.filter((player) => player.id !== candidate.id)
    const gagne =
      config.variant === 'cutthroat'
        ? others.every((other) => candidate.score <= other.score)
        : others.every((other) => candidate.score >= other.score)
    if (gagne) return candidate.id
  }
  return null
}

function applyMarks(
  state: CricketState,
  playerIndex: number,
  target: number,
  marks: number,
): { players: CricketPlayerState[]; pointsScored: number } {
  const players = [...state.players]
  const player = players[playerIndex]
  if (!player || marks <= 0) return { players, pointsScored: 0 }

  const current = marksOn(player, target)
  const applied = Math.min(marks, MARKS_TO_CLOSE - current)
  const overflow = marks - applied

  players[playerIndex] = {
    ...player,
    marks: { ...player.marks, [target]: current + applied },
  }

  if (state.config.variant === 'no-score' || overflow === 0) {
    return { players, pointsScored: 0 }
  }

  // Les marques en trop marquent des points, sauf si le nombre est mort.
  const value = target * overflow
  const closedByAllOthers = players.every(
    (other, index) => index === playerIndex || hasClosed(other, target),
  )
  if (closedByAllOthers) return { players, pointsScored: 0 }

  if (state.config.variant === 'cutthroat') {
    // Les points vont aux adversaires qui n'ont pas fermé : c'est une punition.
    for (let index = 0; index < players.length; index += 1) {
      const other = players[index]
      if (!other || index === playerIndex || hasClosed(other, target)) continue
      players[index] = { ...other, score: other.score + value }
    }
    return { players, pointsScored: value }
  }

  const scorer = players[playerIndex]
  if (scorer) players[playerIndex] = { ...scorer, score: scorer.score + value }
  return { players, pointsScored: value }
}

export const cricketRule: GameRule<CricketConfig, CricketState> = {
  id: 'cricket',
  label: 'Cricket',
  // §4.3 : on ne déduit pas des marques d'un total de volée.
  requiresDartDetail: true,
  defaultConfig: CRICKET_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        marks: {},
        score: 0,
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
    const target = dart.segment

    let players = state.players.map((p, i) =>
      i === state.activeIndex ? { ...p, dartsThrown: p.dartsThrown + 1 } : p,
    )

    // Une fléchette hors cibles est lancée mais ne fait rien : le 12 ne compte
    // pas au Cricket standard.
    if (state.config.targets.includes(target)) {
      const marks = marksFor(dart)
      const result = applyMarks({ ...state, players }, state.activeIndex, target, marks)
      players = result.players
    }

    const afterMarks: CricketState = { ...state, players, turnDarts }
    const winnerId = computeWinner(afterMarks)

    if (winnerId !== null) {
      effects.push({ type: 'leg-won', playerId: winnerId })
      effects.push({ type: 'game-won', playerId: winnerId })
      return { state: { ...afterMarks, winnerId }, effects }
    }

    if (turnDarts.length === DARTS_PER_TURN) {
      effects.push({ type: 'turn-ended', playerId: player.id, total: 0 })
      return {
        state: {
          ...afterMarks,
          activeIndex: nextActiveIndex(players, state.activeIndex),
          turnDarts: [],
        },
        effects,
      }
    }

    return { state: afterMarks, effects }
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const active = state.players[state.activeIndex]
    const players: PlayerView[] = state.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      primary:
        state.config.variant === 'no-score'
          ? String(closedCount(player, state.config))
          : String(player.score),
      secondary: [
        {
          label: 'Fermés',
          value: `${closedCount(player, state.config)}/${state.config.targets.length}`,
        },
        { label: 'Fléchettes', value: String(player.dartsThrown) },
      ],
      isActive: index === state.activeIndex && state.winnerId === null,
      isFinished: hasClosedEverything(player, state.config),
      extra: {
        // Le tableau de marques : c'est l'affichage propre au Cricket.
        marks: Object.fromEntries(
          state.config.targets.map((target) => [
            target,
            { marks: marksOn(player, target), dead: isTargetDead(state, target) },
          ]),
        ),
      },
    }))

    return {
      ruleId: 'cricket',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
    }
  },
}

function closedCount(player: CricketPlayerState, config: CricketConfig): number {
  return config.targets.filter((target) => hasClosed(player, target)).length
}
