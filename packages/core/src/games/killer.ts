/**
 * Mode de jeu Killer — §4.2.
 *
 * « Attribution d'un numéro par joueur (tirage automatique ou lancer de la main
 *   faible) ; devenir killer en touchant son double ; retrait de vies ; nombre
 *   de vies paramétrable. »
 *
 * Note de conception : le tirage des numéros **n'a pas lieu dans le moteur**.
 * Un moteur pur ne tire pas au sort — sinon deux rejeux du même journal ne
 * donneraient pas la même partie, ce qui casserait à la fois la reprise après
 * fermeture (§4.4) et la synchronisation multi-appareil (§3.3). Le tirage est
 * fait une fois, à la configuration, par `drawKillerNumbers`, et le résultat
 * est figé dans la configuration de la partie.
 */

import type { Dart } from '../dart.js'
import { DARTS_PER_TURN, formatDart, isPhysicallyPossible } from '../dart.js'
import type {
  DartValidation,
  GameEffect,
  GameRule,
  GameView,
  PlayerId,
  PlayerRef,
  PlayerView,
} from '../rule.js'
import { DART_ACCEPTED, rejectDart } from '../rule.js'

export interface KillerConfig {
  /** §4.2 — nombre de vies paramétrable. */
  readonly lives: number
  /** Numéro attribué à chaque joueur. Aucun doublon. */
  readonly numbers: Readonly<Record<PlayerId, number>>
  /**
   * Variante répandue : un killer qui touche son propre double perd une vie.
   * Elle pousse à viser juste plutôt qu'à mitrailler sa propre zone.
   */
  readonly selfHitCostsLife: boolean
}

export const KILLER_DEFAULT_CONFIG: KillerConfig = {
  lives: 3,
  numbers: {},
  selfHitCostsLife: true,
}

export interface KillerPlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly number: number
  readonly lives: number
  readonly isKiller: boolean
  readonly dartsThrown: number
}

export interface KillerState {
  readonly config: KillerConfig
  readonly players: readonly KillerPlayerState[]
  readonly activeIndex: number
  readonly turnDarts: readonly Dart[]
  readonly winnerId: PlayerId | null
}

/**
 * Tire un numéro distinct par joueur — §4.2, « tirage automatique ».
 *
 * Le générateur est injecté : le moteur reste pur, et un test peut fixer le
 * tirage. En production, l'écran de configuration appelle cette fonction une
 * fois puis fige le résultat dans la configuration.
 */
export function drawKillerNumbers(
  players: readonly PlayerRef[],
  random: () => number = Math.random,
): Record<PlayerId, number> {
  const pool = Array.from({ length: 20 }, (_, i) => i + 1)
  // Mélange de Fisher-Yates, en consommant le générateur fourni.
  for (let i = pool.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1))
    const a = pool[i]
    const b = pool[j]
    if (a === undefined || b === undefined) continue
    pool[i] = b
    pool[j] = a
  }

  const numbers: Record<PlayerId, number> = {}
  players.forEach((player, index) => {
    const drawn = pool[index]
    if (drawn !== undefined) numbers[player.id] = drawn
  })
  return numbers
}

/** Le lancer de la main faible : le joueur saisit le numéro qu'il a touché. */
export function assignKillerNumber(
  numbers: Readonly<Record<PlayerId, number>>,
  playerId: PlayerId,
  number: number,
): Record<PlayerId, number> {
  const taken = Object.entries(numbers).some(([id, value]) => id !== playerId && value === number)
  if (taken) throw new Error(`Le numéro ${number} est déjà attribué à un autre joueur.`)
  return { ...numbers, [playerId]: number }
}

const isAlive = (player: KillerPlayerState) => player.lives > 0

function nextActiveIndex(players: readonly KillerPlayerState[], fromIndex: number): number {
  for (let step = 1; step <= players.length; step += 1) {
    const index = (fromIndex + step) % players.length
    const candidate = players[index]
    if (candidate && isAlive(candidate)) return index
  }
  return fromIndex
}

function survivorId(players: readonly KillerPlayerState[]): PlayerId | null {
  const alive = players.filter(isAlive)
  return alive.length === 1 ? (alive[0]?.id ?? null) : null
}

export const killerRule: GameRule<KillerConfig, KillerState> = {
  id: 'killer',
  label: 'Killer',
  // On doit savoir quel numéro et quel multiplicateur ont été touchés.
  requiresDartDetail: true,
  defaultConfig: KILLER_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        number: config.numbers[player.id] ?? 0,
        lives: config.lives,
        isKiller: false,
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
    const withoutNumber = state.players.find((player) => player.number === 0)
    if (withoutNumber) {
      return rejectDart(`${withoutNumber.name} n’a pas encore de numéro attribué.`)
    }
    return DART_ACCEPTED
  },

  applyDart(state, dart) {
    const thrower = state.players[state.activeIndex]
    if (!thrower || state.winnerId !== null) return { state, effects: [] }

    const effects: GameEffect[] = []
    const turnDarts = [...state.turnDarts, dart]
    let players = state.players.map((player, index) =>
      index === state.activeIndex ? { ...player, dartsThrown: player.dartsThrown + 1 } : player,
    )

    // Seul le double d'un numéro attribué a un effet.
    if (dart.multiplier === 2 && dart.segment !== 0) {
      const touched = dart.segment

      if (touched === thrower.number) {
        players = players.map((player, index) => {
          if (index !== state.activeIndex) return player
          if (!player.isKiller) return { ...player, isKiller: true }
          if (!state.config.selfHitCostsLife) return player
          return { ...player, lives: Math.max(0, player.lives - 1) }
        })
      } else if (thrower.isKiller) {
        // Un killer retire une vie au propriétaire du double touché.
        players = players.map((player) =>
          player.number === touched && isAlive(player)
            ? { ...player, lives: Math.max(0, player.lives - 1) }
            : player,
        )
      }
    }

    // Un joueur qui tombe à zéro perd aussi son statut de killer.
    players = players.map((player) => (isAlive(player) ? player : { ...player, isKiller: false }))

    const winnerId = survivorId(players)
    const afterHit: KillerState = { ...state, players, turnDarts }

    if (winnerId !== null) {
      effects.push({ type: 'leg-won', playerId: winnerId })
      effects.push({ type: 'game-won', playerId: winnerId })
      return { state: { ...afterHit, winnerId }, effects }
    }

    const throwerAfter = players[state.activeIndex]
    const turnOver = turnDarts.length === DARTS_PER_TURN || (throwerAfter && !isAlive(throwerAfter))

    if (turnOver) {
      effects.push({ type: 'turn-ended', playerId: thrower.id, total: 0 })
      return {
        state: {
          ...afterHit,
          activeIndex: nextActiveIndex(players, state.activeIndex),
          turnDarts: [],
        },
        effects,
      }
    }

    return { state: afterHit, effects }
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const active = state.players[state.activeIndex]
    const players: PlayerView[] = state.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      primary: '❤'.repeat(player.lives) || '☠',
      secondary: [
        { label: 'Numéro', value: `D${player.number}` },
        { label: 'Statut', value: player.isKiller ? 'Killer' : 'En chasse' },
      ],
      isActive: index === state.activeIndex && state.winnerId === null,
      isFinished: !isAlive(player),
      extra: { number: player.number, lives: player.lives, isKiller: player.isKiller },
    }))

    return {
      ruleId: 'killer',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
    }
  },
}
