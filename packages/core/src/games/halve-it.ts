/**
 * Mode de jeu Halve It — §4.2.
 *
 * « Liste de cibles paramétrable ; score divisé par deux en cas de manche
 *   ratée. »
 *
 * C'est un mode de nerfs : plus le score monte, plus une manche vierge coûte
 * cher. La division arrondit **vers le bas**, convention la plus répandue —
 * elle est explicite ici parce qu'un arrondi au hasard changerait l'équilibre
 * du jeu.
 */

import type { Dart, Segment } from '../dart.js'
import { BULL, DARTS_PER_TURN, dartValue, formatDart, isPhysicallyPossible } from '../dart.js'
import type {
  DartValidation,
  GameEffect,
  GameRule,
  GameView,
  PlayerId,
  PlayerView,
} from '../rule.js'
import { DART_ACCEPTED, rejectDart } from '../rule.js'

/** Une cible de Halve It : un numéro, ou une catégorie de fléchettes. */
export type HalveItTarget =
  | { readonly kind: 'number'; readonly value: Segment }
  | { readonly kind: 'double' }
  | { readonly kind: 'triple' }
  | { readonly kind: 'bull' }

export interface HalveItConfig {
  readonly targets: readonly HalveItTarget[]
  readonly startingScore: number
}

/** Liste classique : trois numéros, les doubles, les triples, et le bull. */
export const HALVE_IT_DEFAULT_TARGETS: readonly HalveItTarget[] = [
  { kind: 'number', value: 20 },
  { kind: 'number', value: 19 },
  { kind: 'double' },
  { kind: 'number', value: 18 },
  { kind: 'triple' },
  { kind: 'number', value: 17 },
  { kind: 'bull' },
]

export const HALVE_IT_DEFAULT_CONFIG: HalveItConfig = {
  targets: HALVE_IT_DEFAULT_TARGETS,
  startingScore: 40,
}

export interface HalveItPlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly score: number
  readonly dartsThrown: number
  /** Points marqués dans la manche en cours : zéro déclenche la division. */
  readonly roundScore: number
}

export interface HalveItState {
  readonly config: HalveItConfig
  readonly players: readonly HalveItPlayerState[]
  readonly activeIndex: number
  readonly roundIndex: number
  readonly turnsInRound: number
  readonly turnDarts: readonly Dart[]
  readonly winnerId: PlayerId | null
  readonly lastMessage?: string
}

export function formatHalveItTarget(target: HalveItTarget): string {
  switch (target.kind) {
    case 'number':
      return String(target.value)
    case 'double':
      return 'Doubles'
    case 'triple':
      return 'Triples'
    case 'bull':
      return 'Bull'
  }
}

/** La fléchette compte-t-elle pour cette cible ? */
function counts(target: HalveItTarget, dart: Dart): boolean {
  if (dart.segment === 0) return false
  switch (target.kind) {
    case 'number':
      return dart.segment === target.value
    case 'double':
      return dart.multiplier === 2
    case 'triple':
      return dart.multiplier === 3
    case 'bull':
      return dart.segment === BULL
  }
}

const targetAt = (config: HalveItConfig, index: number): HalveItTarget | null =>
  config.targets[index] ?? null

export const halveItRule: GameRule<HalveItConfig, HalveItState> = {
  id: 'halve-it',
  label: 'Halve It',
  requiresDartDetail: true,
  defaultConfig: HALVE_IT_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        score: config.startingScore,
        dartsThrown: 0,
        roundScore: 0,
      })),
      activeIndex: 0,
      roundIndex: 0,
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
    const target = targetAt(state.config, state.roundIndex)
    if (!player || !target || state.winnerId !== null) return { state, effects: [] }

    const effects: GameEffect[] = []
    const turnDarts = [...state.turnDarts, dart]
    const scored = counts(target, dart) ? dartValue(dart) : 0

    let players = state.players.map((entry, index) =>
      index === state.activeIndex
        ? {
            ...entry,
            roundScore: entry.roundScore + scored,
            dartsThrown: entry.dartsThrown + 1,
          }
        : entry,
    )

    if (turnDarts.length < DARTS_PER_TURN) {
      return { state: { ...state, players, turnDarts }, effects }
    }

    // Fin de volée : on solde la manche du joueur.
    const finished = players[state.activeIndex]
    let message: string | undefined
    if (finished) {
      const missed = finished.roundScore === 0
      // Division arrondie vers le bas : convention la plus répandue.
      const score = missed ? Math.floor(finished.score / 2) : finished.score + finished.roundScore
      if (missed) message = `${finished.name} rate la manche : score divisé par deux.`
      players = players.map((entry, index) =>
        index === state.activeIndex ? { ...entry, score, roundScore: 0 } : entry,
      )
    }
    effects.push({ type: 'turn-ended', playerId: player.id, total: finished?.roundScore ?? 0 })

    const turnsInRound = state.turnsInRound + 1
    const roundComplete = turnsInRound >= players.length
    const roundIndex = roundComplete ? state.roundIndex + 1 : state.roundIndex

    if (roundIndex >= state.config.targets.length) {
      const best = players.reduce((a, b) => (b.score > a.score ? b : a))
      effects.push({ type: 'leg-won', playerId: best.id })
      effects.push({ type: 'game-won', playerId: best.id })
      return { state: { ...state, players, turnDarts: [], winnerId: best.id }, effects }
    }

    // Le message de la manche précédente est périmé : on le retire plutôt que
    // de le fixer à `undefined`, que le schéma d'état n'accepte pas.
    const { lastMessage: _previous, ...rest } = state
    return {
      state: {
        ...rest,
        players,
        activeIndex: (state.activeIndex + 1) % players.length,
        roundIndex,
        turnsInRound: roundComplete ? 0 : turnsInRound,
        turnDarts: [],
        ...(message !== undefined ? { lastMessage: message } : {}),
      },
      effects,
    }
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const active = state.players[state.activeIndex]
    const target = targetAt(state.config, state.roundIndex)
    const players: PlayerView[] = state.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      primary: String(player.score),
      secondary: [
        { label: 'Manche', value: String(player.roundScore) },
        { label: 'Fléchettes', value: String(player.dartsThrown) },
      ],
      isActive: index === state.activeIndex && state.winnerId === null,
      isFinished: false,
    }))

    const message =
      state.lastMessage ?? (target ? `Cible : ${formatHalveItTarget(target)}` : undefined)

    return {
      ruleId: 'halve-it',
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
