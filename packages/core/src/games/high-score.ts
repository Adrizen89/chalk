/**
 * Mode de jeu High Score — §4.2.
 *
 * « Maximum de points en N manches. »
 *
 * Le plus simple des modes, et le seul des cinq secondaires qui se contente de
 * la saisie par volée : rien n'a besoin du détail par fléchette.
 */

import type { Dart } from '../dart.js'
import {
  DARTS_PER_TURN,
  dartValue,
  formatDart,
  isPhysicallyPossible,
  isReachableTurnTotal,
} from '../dart.js'
import type {
  ApplyResult,
  DartValidation,
  GameEffect,
  GameRule,
  GameView,
  PlayerId,
  PlayerView,
} from '../rule.js'
import { DART_ACCEPTED, rejectDart } from '../rule.js'

export interface HighScoreConfig {
  readonly rounds: number
}

export const HIGH_SCORE_DEFAULT_CONFIG: HighScoreConfig = { rounds: 10 }

export interface HighScorePlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly score: number
  readonly dartsThrown: number
  readonly roundsPlayed: number
  readonly bestTurn: number
}

export interface HighScoreState {
  readonly config: HighScoreConfig
  readonly players: readonly HighScorePlayerState[]
  readonly activeIndex: number
  readonly turnDarts: readonly Dart[]
  readonly turnTotal: number
  readonly winnerId: PlayerId | null
}

function settle(
  state: HighScoreState,
  total: number,
  dartsUsed: number,
): ApplyResult<HighScoreState> {
  const player = state.players[state.activeIndex]
  if (!player) return { state, effects: [] }

  const effects: GameEffect[] = []
  const players = state.players.map((entry, index) =>
    index === state.activeIndex
      ? {
          ...entry,
          score: entry.score + total,
          dartsThrown: entry.dartsThrown + dartsUsed,
          roundsPlayed: entry.roundsPlayed + 1,
          bestTurn: Math.max(entry.bestTurn, total),
        }
      : entry,
  )

  if (total === 180) effects.push({ type: 'milestone', playerId: player.id, label: '180' })
  else if (total >= 140) effects.push({ type: 'milestone', playerId: player.id, label: '140+' })
  else if (total >= 100) effects.push({ type: 'milestone', playerId: player.id, label: '100+' })
  effects.push({ type: 'turn-ended', playerId: player.id, total })

  // La partie s'arrête quand tout le monde a joué le même nombre de manches :
  // sinon le dernier joueur aurait une manche de moins.
  const everyoneDone = players.every((entry) => entry.roundsPlayed >= state.config.rounds)
  if (everyoneDone) {
    const best = players.reduce((a, b) => (b.score > a.score ? b : a))
    effects.push({ type: 'leg-won', playerId: best.id })
    effects.push({ type: 'game-won', playerId: best.id })
    return { state: { ...state, players, turnDarts: [], turnTotal: 0, winnerId: best.id }, effects }
  }

  return {
    state: {
      ...state,
      players,
      activeIndex: (state.activeIndex + 1) % players.length,
      turnDarts: [],
      turnTotal: 0,
    },
    effects,
  }
}

export const highScoreRule: GameRule<HighScoreConfig, HighScoreState> = {
  id: 'high-score',
  label: 'High Score',
  // Le total d'une volée suffit : rien ici ne dépend du segment touché.
  requiresDartDetail: false,
  defaultConfig: HIGH_SCORE_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        score: 0,
        dartsThrown: 0,
        roundsPlayed: 0,
        bestTurn: 0,
      })),
      activeIndex: 0,
      turnDarts: [],
      turnTotal: 0,
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
    if (state.winnerId !== null) return { state, effects: [] }
    const turnDarts = [...state.turnDarts, dart]
    const turnTotal = state.turnTotal + dartValue(dart)

    if (turnDarts.length < DARTS_PER_TURN) {
      return { state: { ...state, turnDarts, turnTotal }, effects: [] }
    }
    return settle({ ...state, turnDarts, turnTotal }, turnTotal, DARTS_PER_TURN)
  },

  applyTurnTotal(state, total, dartsUsed) {
    if (state.winnerId !== null || !isReachableTurnTotal(total)) return { state, effects: [] }
    const darts = Math.min(DARTS_PER_TURN, Math.max(1, Math.trunc(dartsUsed ?? DARTS_PER_TURN)))
    return settle(state, total, darts)
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const active = state.players[state.activeIndex]
    const players: PlayerView[] = state.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      primary: String(player.score),
      secondary: [
        { label: 'Manches', value: `${player.roundsPlayed}/${state.config.rounds}` },
        { label: 'Meilleure volée', value: String(player.bestTurn) },
      ],
      isActive: index === state.activeIndex && state.winnerId === null,
      isFinished: player.roundsPlayed >= state.config.rounds,
    }))

    return {
      ruleId: 'high-score',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
    }
  },
}
