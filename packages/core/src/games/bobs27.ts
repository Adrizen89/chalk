/**
 * Mode de jeu Bob's 27 — §4.2.
 *
 * L'exercice du même nom (§4.5) porte déjà tout le barème. Ce mode ne fait
 * que le faire jouer à plusieurs, chacun sur son propre parcours : **une seule
 * implémentation des règles**, exposée aux deux endroits, comme le voulait
 * l'analyse de #53.
 */

import type { Dart } from '../dart.js'
import { DARTS_PER_TURN, formatDart, isPhysicallyPossible } from '../dart.js'
import type {
  DartValidation,
  GameEffect,
  GameRule,
  GameView,
  PlayerId,
  PlayerView,
} from '../rule.js'
import { DART_ACCEPTED, rejectDart } from '../rule.js'
import type { Bobs27Options, Bobs27State } from '../training/bobs27.js'
import { createBobs27 } from '../training/bobs27.js'

/**
 * La configuration du mode est celle de l'exercice : le barème est le même,
 * seul le nombre de joueurs change.
 */
export type Bobs27GameConfig = Bobs27Options

export const BOBS_27_DEFAULT_CONFIG: Bobs27GameConfig = { stopOnNegative: true }

export interface Bobs27GamePlayerState {
  readonly id: PlayerId
  readonly name: string
  /** État de l'exercice pour ce joueur. */
  readonly run: Bobs27State
}

export interface Bobs27GameState {
  readonly config: Bobs27GameConfig
  readonly players: readonly Bobs27GamePlayerState[]
  readonly activeIndex: number
  readonly turnDarts: readonly Dart[]
  readonly winnerId: PlayerId | null
}

/** Passe au joueur suivant qui n'a pas terminé son parcours. */
function nextActiveIndex(
  exercise: ReturnType<typeof createBobs27>,
  players: readonly Bobs27GamePlayerState[],
  fromIndex: number,
): number {
  for (let step = 1; step <= players.length; step += 1) {
    const index = (fromIndex + step) % players.length
    const candidate = players[index]
    if (candidate && !exercise.isFinished(candidate.run)) return index
  }
  return fromIndex
}

export const bobs27Rule: GameRule<Bobs27GameConfig, Bobs27GameState> = {
  id: 'bobs-27',
  label: "Bob's 27",
  requiresDartDetail: true,
  defaultConfig: BOBS_27_DEFAULT_CONFIG,

  createState(config, players) {
    const exercise = createBobs27(config)
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        run: exercise.createState(),
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
    const exercise = createBobs27(state.config)
    const player = state.players[state.activeIndex]
    if (!player || state.winnerId !== null) return { state, effects: [] }

    const effects: GameEffect[] = []
    const applied = exercise.applyDart(player.run, dart)
    const players = state.players.map((entry, index) =>
      index === state.activeIndex ? { ...entry, run: applied.state } : entry,
    )
    const turnDarts = [...state.turnDarts, dart]

    const playerDone = exercise.isFinished(applied.state)
    const turnOver = turnDarts.length >= DARTS_PER_TURN || playerDone

    if (!turnOver) return { state: { ...state, players, turnDarts }, effects }

    effects.push({ type: 'turn-ended', playerId: player.id, total: 0 })

    // La partie s'arrête quand tout le monde a fini son parcours ; le meilleur
    // score gagne, exactement comme à l'exercice.
    if (players.every((entry) => exercise.isFinished(entry.run))) {
      const best = players.reduce((a, b) => (b.run.score > a.run.score ? b : a))
      effects.push({ type: 'leg-won', playerId: best.id })
      effects.push({ type: 'game-won', playerId: best.id })
      return { state: { ...state, players, turnDarts: [], winnerId: best.id }, effects }
    }

    return {
      state: {
        ...state,
        players,
        activeIndex: nextActiveIndex(exercise, players, state.activeIndex),
        turnDarts: [],
      },
      effects,
    }
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const exercise = createBobs27(state.config)
    const active = state.players[state.activeIndex]
    const players: PlayerView[] = state.players.map((player, index) => {
      const run = exercise.view(player.run)
      return {
        playerId: player.id,
        name: player.name,
        primary: String(player.run.score),
        secondary: [
          { label: 'Cible', value: run.targetLabel },
          { label: 'Touchés', value: `${player.run.hits}/${player.run.attempts}` },
        ],
        isActive: index === state.activeIndex && state.winnerId === null,
        isFinished: exercise.isFinished(player.run),
        extra: { target: player.run.roundIndex },
      }
    })

    const target = active ? exercise.view(active.run).targetLabel : null

    return {
      ruleId: 'bobs-27',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
      ...(state.winnerId === null && target ? { message: `Visez ${target}` } : {}),
    }
  },
}
