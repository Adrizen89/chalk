/**
 * Mode de jeu Golf — §4.2.
 *
 * « 18 "trous" ; barème selon le segment touché. »
 *
 * Le cahier des charges laisse le barème ouvert. Celui retenu est le plus
 * répandu, et il est écrit ici noir sur blanc : un barème implicite se
 * réinterprète différemment à chaque relecture.
 *
 * | Segment touché | Coups |
 * |---|---|
 * | Triple | 1 |
 * | Double | 2 |
 * | Simple | 3 (le par) |
 * | Hors du numéro | 5 |
 *
 * Trois fléchettes par trou, **la meilleure compte**. Le score le plus bas
 * gagne, comme au golf.
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

export interface GolfConfig {
  /** Nombre de trous : 18 pour le parcours complet, 9 pour la version courte. */
  readonly holes: number
}

export const GOLF_DEFAULT_CONFIG: GolfConfig = { holes: 18 }

/** Coups comptés quand aucune fléchette n'a trouvé le numéro du trou. */
export const GOLF_MISS_STROKES = 5
/** Le par : un simple sur le bon numéro. */
export const GOLF_PAR = 3

export function strokesFor(dart: Dart, hole: number): number {
  if (dart.segment !== hole || dart.segment === 0) return GOLF_MISS_STROKES
  if (dart.multiplier === 3) return 1
  if (dart.multiplier === 2) return 2
  return GOLF_PAR
}

export interface GolfPlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly strokes: number
  readonly holesPlayed: number
  readonly dartsThrown: number
  /** Meilleur résultat sur le trou en cours, 5 tant que rien n'est touché. */
  readonly currentBest: number
}

export interface GolfState {
  readonly config: GolfConfig
  readonly players: readonly GolfPlayerState[]
  readonly activeIndex: number
  readonly hole: number
  readonly turnsInHole: number
  readonly turnDarts: readonly Dart[]
  readonly winnerId: PlayerId | null
}

export const golfRule: GameRule<GolfConfig, GolfState> = {
  id: 'golf',
  label: 'Golf',
  requiresDartDetail: true,
  defaultConfig: GOLF_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        strokes: 0,
        holesPlayed: 0,
        dartsThrown: 0,
        currentBest: GOLF_MISS_STROKES,
      })),
      activeIndex: 0,
      hole: 1,
      turnsInHole: 0,
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
    // La meilleure fléchette du trou compte : on garde le minimum.
    const best = Math.min(player.currentBest, strokesFor(dart, state.hole))

    let players = state.players.map((entry, index) =>
      index === state.activeIndex
        ? { ...entry, currentBest: best, dartsThrown: entry.dartsThrown + 1 }
        : entry,
    )

    if (turnDarts.length < DARTS_PER_TURN) {
      return { state: { ...state, players, turnDarts }, effects }
    }

    // Fin du trou pour ce joueur : on inscrit le meilleur résultat.
    players = players.map((entry, index) =>
      index === state.activeIndex
        ? {
            ...entry,
            strokes: entry.strokes + best,
            holesPlayed: entry.holesPlayed + 1,
            currentBest: GOLF_MISS_STROKES,
          }
        : entry,
    )
    effects.push({ type: 'turn-ended', playerId: player.id, total: best })

    const turnsInHole = state.turnsInHole + 1
    const holeComplete = turnsInHole >= players.length
    const hole = holeComplete ? state.hole + 1 : state.hole

    if (hole > state.config.holes) {
      // Le score le plus bas gagne.
      const best = players.reduce((a, b) => (b.strokes < a.strokes ? b : a))
      effects.push({ type: 'leg-won', playerId: best.id })
      effects.push({ type: 'game-won', playerId: best.id })
      return { state: { ...state, players, turnDarts: [], winnerId: best.id }, effects }
    }

    return {
      state: {
        ...state,
        players,
        activeIndex: (state.activeIndex + 1) % players.length,
        hole,
        turnsInHole: holeComplete ? 0 : turnsInHole,
        turnDarts: [],
      },
      effects,
    }
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const active = state.players[state.activeIndex]
    const players: PlayerView[] = state.players.map((player, index) => {
      // Convention du golf : on annonce l'écart au par, pas le total brut.
      const par = player.holesPlayed * GOLF_PAR
      const delta = player.strokes - par
      return {
        playerId: player.id,
        name: player.name,
        primary: String(player.strokes),
        secondary: [
          { label: 'Par', value: delta === 0 ? '=' : delta > 0 ? `+${delta}` : String(delta) },
          { label: 'Trous', value: `${player.holesPlayed}/${state.config.holes}` },
        ],
        isActive: index === state.activeIndex && state.winnerId === null,
        isFinished: player.holesPlayed >= state.config.holes,
        extra: { currentBest: player.currentBest },
      }
    })

    return {
      ruleId: 'golf',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
      ...(state.winnerId === null
        ? { message: `Trou ${state.hole} sur ${state.config.holes} — visez le ${state.hole}` }
        : {}),
    }
  },
}
