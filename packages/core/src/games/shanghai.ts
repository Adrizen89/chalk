/**
 * Mode de jeu Shanghai — §4.2.
 *
 * « Manches 1 à 7 (ou 1 à 20) ; victoire immédiate sur simple + double +
 *   triple du numéro de la manche. »
 *
 * Le « shanghai » est ce qui fait le sel du mode : trois fléchettes bien
 * placées mettent fin à la partie quel que soit le score. Il se détecte dans
 * n'importe quel ordre.
 */

import type { Dart } from '../dart.js'
import { DARTS_PER_TURN, dartValue, formatDart, isPhysicallyPossible } from '../dart.js'
import type {
  DartValidation,
  GameEffect,
  GameRule,
  GameView,
  PlayerId,
  PlayerView,
} from '../rule.js'
import { DART_ACCEPTED, rejectDart } from '../rule.js'

export interface ShanghaiConfig {
  /** Nombre de manches : 7 pour la partie courte, 20 pour le tour complet. */
  readonly rounds: number
  /** Victoire immédiate sur simple + double + triple de la manche. */
  readonly shanghaiWins: boolean
}

export const SHANGHAI_DEFAULT_CONFIG: ShanghaiConfig = { rounds: 7, shanghaiWins: true }

export interface ShanghaiPlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly score: number
  readonly dartsThrown: number
}

export interface ShanghaiState {
  readonly config: ShanghaiConfig
  readonly players: readonly ShanghaiPlayerState[]
  readonly activeIndex: number
  /** Manche en cours, 1 à `rounds`. Le numéro de la manche est la cible. */
  readonly round: number
  /** Volées jouées dans la manche : la manche avance quand tous ont joué. */
  readonly turnsInRound: number
  readonly turnDarts: readonly Dart[]
  readonly winnerId: PlayerId | null
  readonly lastMessage?: string
}

/** Le joueur a-t-il réalisé un shanghai dans cette volée ? */
function isShanghai(darts: readonly Dart[], round: number): boolean {
  const multipliers = new Set(
    darts.filter((dart) => dart.segment === round).map((dart) => dart.multiplier),
  )
  return multipliers.has(1) && multipliers.has(2) && multipliers.has(3)
}

function leader(players: readonly ShanghaiPlayerState[]): PlayerId | null {
  if (players.length === 0) return null
  const best = players.reduce((a, b) => (b.score > a.score ? b : a))
  return best.id
}

export const shanghaiRule: GameRule<ShanghaiConfig, ShanghaiState> = {
  id: 'shanghai',
  label: 'Shanghai',
  // On doit connaître le multiplicateur : c'est lui qui fait le shanghai.
  requiresDartDetail: true,
  defaultConfig: SHANGHAI_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        score: 0,
        dartsThrown: 0,
      })),
      activeIndex: 0,
      round: 1,
      turnsInRound: 0,
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
    // Seul le numéro de la manche marque.
    const scored = dart.segment === state.round ? dartValue(dart) : 0

    const players = state.players.map((entry, index) =>
      index === state.activeIndex
        ? { ...entry, score: entry.score + scored, dartsThrown: entry.dartsThrown + 1 }
        : entry,
    )

    const shanghai = state.config.shanghaiWins && isShanghai(turnDarts, state.round)
    if (shanghai) {
      effects.push({ type: 'leg-won', playerId: player.id })
      effects.push({ type: 'game-won', playerId: player.id })
      return {
        state: {
          ...state,
          players,
          turnDarts,
          winnerId: player.id,
          lastMessage: `Shanghai ! ${player.name} remporte la partie.`,
        },
        effects,
      }
    }

    if (turnDarts.length < DARTS_PER_TURN) {
      return { state: { ...state, players, turnDarts }, effects }
    }

    // Fin de volée : la manche avance quand tout le monde a joué.
    const turnsInRound = state.turnsInRound + 1
    const roundComplete = turnsInRound >= players.length
    const round = roundComplete ? state.round + 1 : state.round
    effects.push({ type: 'turn-ended', playerId: player.id, total: 0 })

    if (round > state.config.rounds) {
      const winnerId = leader(players)
      if (winnerId) {
        effects.push({ type: 'leg-won', playerId: winnerId })
        effects.push({ type: 'game-won', playerId: winnerId })
      }
      return { state: { ...state, players, turnDarts: [], winnerId }, effects }
    }

    const { lastMessage: _, ...rest } = state
    return {
      state: {
        ...rest,
        players,
        activeIndex: (state.activeIndex + 1) % players.length,
        round,
        turnsInRound: roundComplete ? 0 : turnsInRound,
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
    const message =
      state.lastMessage ??
      (state.winnerId === null
        ? `Manche ${state.round} sur ${state.config.rounds} — visez le ${state.round}`
        : undefined)
    const players: PlayerView[] = state.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      primary: String(player.score),
      secondary: [{ label: 'Fléchettes', value: String(player.dartsThrown) }],
      isActive: index === state.activeIndex && state.winnerId === null,
      isFinished: false,
    }))

    return {
      ruleId: 'shanghai',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
      ...(message !== undefined ? { message } : {}),
    }
  },
}
