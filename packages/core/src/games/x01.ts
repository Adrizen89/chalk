/**
 * Mode de jeu X01 — §4.2.
 *
 * « 301 / 501 / 701 / 1001, + score libre. Options : *straight in* ou *double in* ;
 *   *double out*, *master out* ou *straight out* ; gestion du *bust* (retour au
 *   score du début de volée). »
 *
 * C'est le mode principal de l'application, et la source de données de la
 * plupart des statistiques (§4.7) comme du coach de ciblage (§4.6).
 */

import type { Dart } from '../dart.js'
import {
  DARTS_PER_TURN,
  dartValue,
  formatDart,
  isDouble,
  isPhysicallyPossible,
  isReachableTurnTotal,
} from '../dart.js'
import type { CheckoutSolver, DartsRemaining, OutMode } from '../checkout.js'
import {
  CHECKOUT_SUGGESTION_THRESHOLD,
  createCheckoutSolver,
  isFinishingDart,
} from '../checkout.js'
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

export const X01_PRESETS = [301, 501, 701, 1001] as const

export type InMode = 'straight' | 'double'

export interface X01Config {
  /** 301, 501, 701, 1001 ou n'importe quel score libre (§4.2). */
  readonly startingScore: number
  readonly inMode: InMode
  readonly outMode: OutMode
  /**
   * §4.4 — handicap : score de départ différent selon les joueurs, pour
   * équilibrer les niveaux. Écart appliqué au score de départ, par joueur.
   */
  readonly handicaps?: Readonly<Record<PlayerId, number>>
}

export const X01_DEFAULT_CONFIG: X01Config = {
  startingScore: 501,
  inMode: 'straight',
  outMode: 'double',
}

export interface X01PlayerState {
  readonly id: PlayerId
  readonly name: string
  readonly score: number
  /** Faux tant que le joueur n'a pas ouvert, en *double in*. */
  readonly hasOpened: boolean
  /** Fléchettes réellement lancées — base de la moyenne 3 fléchettes (§4.7). */
  readonly dartsThrown: number
  /** Points marqués, busts exclus. */
  readonly pointsScored: number
  /** Totaux de chaque volée terminée : sert aux 180 / 140+ / 100+ et à la moyenne des 9 premières (§4.7). */
  readonly turnTotals: readonly number[]
  readonly hasWon: boolean
}

export interface X01State {
  readonly config: X01Config
  readonly players: readonly X01PlayerState[]
  readonly activeIndex: number
  /** Fléchettes de la volée en cours. */
  readonly turnDarts: readonly Dart[]
  /** Score du joueur actif au début de sa volée — cible du retour en cas de bust (§4.2). */
  readonly turnStartScore: number
  readonly winnerId: PlayerId | null
  /** Dernier événement notable, affiché en message non bloquant (§5). */
  readonly lastMessage?: string
}

function startingScoreFor(config: X01Config, playerId: PlayerId): number {
  return config.startingScore + (config.handicaps?.[playerId] ?? 0)
}

function activePlayer(state: X01State): X01PlayerState | undefined {
  return state.players[state.activeIndex]
}

/**
 * Score restant minimal encore finissable.
 *
 * En *double out* comme en *master out*, la plus petite sortie vaut 2 : rester
 * sur 1 est donc un bust. En *straight out*, 1 se termine sur un simple 1.
 */
function minimumFinishableScore(outMode: OutMode): number {
  return outMode === 'straight' ? 1 : 2
}

function turnTotalOf(darts: readonly Dart[]): number {
  return darts.reduce((total, dart) => total + dartValue(dart), 0)
}

function milestoneFor(total: number): '180' | '140+' | '100+' | null {
  if (total === 180) return '180'
  if (total >= 140) return '140+'
  if (total >= 100) return '100+'
  return null
}

function replacePlayer(
  players: readonly X01PlayerState[],
  index: number,
  patch: Partial<X01PlayerState>,
): X01PlayerState[] {
  return players.map((player, i) => (i === index ? { ...player, ...patch } : player))
}

/** Joueur suivant, en sautant ceux qui ont déjà terminé. */
function nextActiveIndex(players: readonly X01PlayerState[], fromIndex: number): number {
  for (let step = 1; step <= players.length; step += 1) {
    const index = (fromIndex + step) % players.length
    if (!players[index]?.hasWon) return index
  }
  return fromIndex
}

export const x01Rule: GameRule<X01Config, X01State> = {
  id: 'x01',
  label: 'X01',
  // La saisie par volée suffit : le détail par fléchette reste possible et
  // nécessaire aux statistiques de précision (§4.7) et au coach (§4.6).
  requiresDartDetail: false,
  defaultConfig: X01_DEFAULT_CONFIG,

  createState(config, players) {
    return {
      config,
      players: players.map((player) => ({
        id: player.id,
        name: player.name,
        score: startingScoreFor(config, player.id),
        hasOpened: config.inMode === 'straight',
        dartsThrown: 0,
        pointsScored: 0,
        turnTotals: [],
        hasWon: false,
      })),
      activeIndex: 0,
      turnDarts: [],
      turnStartScore: startingScoreFor(config, players[0]?.id ?? ''),
      winnerId: null,
    }
  },

  validateDart(state, dart): DartValidation {
    if (state.winnerId !== null) return rejectDart('La partie est terminée.')
    if (state.turnDarts.length >= DARTS_PER_TURN) return rejectDart('La volée est déjà complète.')
    if (!activePlayer(state)) return rejectDart('Aucun joueur actif.')
    if (!isPhysicallyPossible(dart)) {
      return rejectDart(`${formatDart(dart)} n’existe pas sur une cible.`)
    }
    return DART_ACCEPTED
  },

  applyDart(state, dart) {
    const player = activePlayer(state)
    if (!player || state.winnerId !== null) return { state, effects: [] }

    const { outMode, inMode } = state.config
    const effects: GameEffect[] = []
    const turnDarts = [...state.turnDarts, dart]
    const dartsThrown = player.dartsThrown + 1

    // §4.2 — *double in* : tant que le joueur n'a pas touché un double, ses
    // fléchettes sont lancées mais ne marquent pas.
    const opensNow = !player.hasOpened && inMode === 'double' && isDouble(dart)
    const counts = player.hasOpened || opensNow
    const value = counts ? dartValue(dart) : 0
    const newScore = player.score - value

    const busts =
      newScore < 0 ||
      (newScore > 0 && newScore < minimumFinishableScore(outMode)) ||
      (newScore === 0 && !isFinishingDart(dart, outMode))

    if (busts) {
      // §4.2 — bust : retour au score du début de volée, fin de tour immédiate.
      effects.push({ type: 'bust', playerId: player.id, restoredScore: state.turnStartScore })

      /*
       * §4.7 — une volée bustée ne marque rien, y compris les fléchettes déjà
       * comptées avant le bust. Sans ce retrait, la moyenne 3 fléchettes — que
       * le cahier des charges appelle « la métrique reine » — récompenserait le
       * joueur pour des points qu'il vient de perdre.
       */
      const scoredThisTurn = state.turnStartScore - player.score

      return endTurn(
        state,
        {
          ...player,
          score: state.turnStartScore,
          hasOpened: player.hasOpened,
          dartsThrown,
          pointsScored: player.pointsScored - scoredThisTurn,
          turnTotals: [...player.turnTotals, 0],
        },
        effects,
        0,
      )
    }

    const updated: X01PlayerState = {
      ...player,
      score: newScore,
      hasOpened: counts,
      dartsThrown,
      pointsScored: player.pointsScored + value,
    }

    if (newScore === 0) {
      const turnTotal = turnTotalOf(turnDarts)
      const winner: X01PlayerState = {
        ...updated,
        hasWon: true,
        turnTotals: [...player.turnTotals, turnTotal],
      }
      const players = replacePlayer(state.players, state.activeIndex, winner)
      effects.push({ type: 'leg-won', playerId: player.id })
      const milestone = milestoneFor(turnTotal)
      if (milestone) effects.push({ type: 'milestone', playerId: player.id, label: milestone })
      effects.push({ type: 'game-won', playerId: player.id })
      return {
        state: {
          ...state,
          players,
          turnDarts,
          winnerId: player.id,
          lastMessage: `${player.name} termine sur ${formatFinish(turnDarts)}.`,
        },
        effects,
      }
    }

    if (turnDarts.length === DARTS_PER_TURN) {
      const turnTotal = turnTotalOf(turnDarts)
      return endTurn(
        state,
        { ...updated, turnTotals: [...player.turnTotals, turnTotal] },
        effects,
        turnTotal,
      )
    }

    return {
      state: {
        ...state,
        players: replacePlayer(state.players, state.activeIndex, updated),
        turnDarts,
      },
      effects,
    }
  },

  applyTurnTotal(state, total, dartsUsed) {
    const player = activePlayer(state)
    if (!player || state.winnerId !== null) return { state, effects: [] }
    if (!isReachableTurnTotal(total)) return { state, effects: [] }

    const { outMode } = state.config
    const effects: GameEffect[] = []
    const newScore = player.score - total
    const darts = clampDartsUsed(dartsUsed)

    const busts = newScore < 0 || (newScore > 0 && newScore < minimumFinishableScore(outMode))

    if (busts) {
      effects.push({ type: 'bust', playerId: player.id, restoredScore: state.turnStartScore })
      return endTurn(
        state,
        {
          ...player,
          score: state.turnStartScore,
          dartsThrown: player.dartsThrown + darts,
          turnTotals: [...player.turnTotals, 0],
        },
        effects,
        0,
      )
    }

    const updated: X01PlayerState = {
      ...player,
      score: newScore,
      // En saisie rapide, on ne peut pas savoir si un double a ouvert le compte.
      // On fait confiance au marqueur : une volée saisie est une volée valide.
      hasOpened: true,
      dartsThrown: player.dartsThrown + darts,
      pointsScored: player.pointsScored + total,
      turnTotals: [...player.turnTotals, total],
    }

    if (newScore === 0) {
      const players = replacePlayer(state.players, state.activeIndex, { ...updated, hasWon: true })
      effects.push({ type: 'leg-won', playerId: player.id })
      const milestone = milestoneFor(total)
      if (milestone) effects.push({ type: 'milestone', playerId: player.id, label: milestone })
      effects.push({ type: 'game-won', playerId: player.id })
      return {
        state: { ...state, players, turnDarts: [], winnerId: player.id },
        effects,
      }
    }

    return endTurn(state, updated, effects, total)
  },

  getWinner(state) {
    return state.winnerId
  },

  view(state): GameView {
    const active = activePlayer(state)
    const players: PlayerView[] = state.players.map((player, index) => ({
      playerId: player.id,
      name: player.name,
      primary: String(player.score),
      secondary: [
        { label: 'Moy. 3 fléch.', value: formatAverage(threeDartAverage(player)) },
        { label: 'Fléchettes', value: String(player.dartsThrown) },
        ...(state.config.inMode === 'double' && !player.hasOpened
          ? [{ label: 'Statut', value: 'Non ouvert' }]
          : []),
      ],
      isActive: index === state.activeIndex && state.winnerId === null,
      isFinished: player.hasWon,
    }))

    return {
      ruleId: 'x01',
      players,
      activePlayerId: state.winnerId === null ? (active?.id ?? null) : null,
      turnDarts: state.turnDarts,
      dartsRemainingInTurn: DARTS_PER_TURN - state.turnDarts.length,
      isFinished: state.winnerId !== null,
      winnerId: state.winnerId,
      ...(state.lastMessage !== undefined ? { message: state.lastMessage } : {}),
    }
  },
}

function clampDartsUsed(dartsUsed: number | undefined): number {
  if (dartsUsed === undefined) return DARTS_PER_TURN
  return Math.min(DARTS_PER_TURN, Math.max(1, Math.trunc(dartsUsed)))
}

function formatFinish(darts: readonly Dart[]): string {
  return `${turnTotalOf(darts)} en ${darts.length} fléchette${darts.length > 1 ? 's' : ''}`
}

function endTurn(
  state: X01State,
  updatedPlayer: X01PlayerState,
  effects: GameEffect[],
  turnTotal: number,
): ApplyResult<X01State> {
  const players = replacePlayer(state.players, state.activeIndex, updatedPlayer)
  const milestone = milestoneFor(turnTotal)
  if (milestone) effects.push({ type: 'milestone', playerId: updatedPlayer.id, label: milestone })
  effects.push({ type: 'turn-ended', playerId: updatedPlayer.id, total: turnTotal })

  const activeIndex = nextActiveIndex(players, state.activeIndex)
  // Une nouvelle volée commence : le message de la précédente est périmé.
  const { lastMessage: _, ...rest } = state
  return {
    state: {
      ...rest,
      players,
      activeIndex,
      turnDarts: [],
      turnStartScore: players[activeIndex]?.score ?? state.turnStartScore,
    },
    effects,
  }
}

/** Moyenne 3 fléchettes — §4.7, « la métrique reine ». */
export function threeDartAverage(player: X01PlayerState): number {
  if (player.dartsThrown === 0) return 0
  return (player.pointsScored / player.dartsThrown) * DARTS_PER_TURN
}

/** Moyenne des 9 premières fléchettes — §4.7. */
export function firstNineAverage(player: X01PlayerState): number {
  const firstThree = player.turnTotals.slice(0, 3)
  if (firstThree.length === 0) return 0
  return firstThree.reduce((sum, total) => sum + total, 0) / firstThree.length
}

export function formatAverage(average: number): string {
  return average.toFixed(2)
}

/**
 * Suggestion de sortie pour le joueur actif — §4.3.
 *
 * Retourne `null` au-dessus du seuil d'affichage, ou quand le score restant
 * n'est pas finissable avec les fléchettes disponibles. Le solveur est passé en
 * paramètre pour que le coach puisse en fournir un calibré sur les doubles
 * préférés du joueur (§4.6.5).
 */
export function suggestCheckout(
  state: X01State,
  solver: CheckoutSolver = createCheckoutSolver({ outMode: state.config.outMode }),
): { readonly best: Dart[]; readonly alternatives: Dart[][] } | null {
  const player = activePlayer(state)
  if (!player || state.winnerId !== null || !player.hasOpened) return null
  if (player.score > CHECKOUT_SUGGESTION_THRESHOLD) return null

  const remaining = (DARTS_PER_TURN - state.turnDarts.length) as DartsRemaining
  if (remaining < 1) return null

  const best = solver.find(player.score, remaining)
  if (!best) return null

  const alternatives = solver
    .findAlternatives(player.score, remaining, 3)
    .filter((path) => path !== best)
    .slice(0, 2)

  return { best, alternatives }
}
