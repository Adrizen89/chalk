/**
 * Statistiques — §4.7.
 *
 * « Moyenne 3 fléchettes (la métrique reine), moyenne des 9 premières
 *   fléchettes, taux de réussite aux doubles, meilleur checkout, meilleur leg,
 *   nombre de 180 / 140+ / 100+, parties jouées et gagnées. »
 *
 * Tout est **recalculé depuis le journal d'entrées**, jamais compté au vol
 * pendant la partie. Deux raisons :
 *
 *  1. Une volée annulée ou corrigée (§4.3) doit disparaître des statistiques.
 *     Un compteur incrémenté à la saisie garderait la trace d'un 180 effacé.
 *  2. Le moteur reste seul dépositaire des règles. Le calcul rejoue la partie
 *     et observe — il ne réimplémente ni les busts, ni les fins de leg.
 *
 * §4.7 demande que « l'affichage ne recalcule pas l'intégralité de
 * l'historique » : le résultat par partie est destiné à être calculé une fois
 * puis conservé, et l'agrégation n'est qu'une somme.
 */

import type { Dart, Segment } from './dart.js'
import { BULL, DARTS_PER_TURN, dartValue, isDouble } from './dart.js'
import type { AnyGameRule, PlayerId, PlayerRef } from './rule.js'
import type { GameInput } from './session.js'
import { baseRuleId, legStateOf } from './match.js'
import type { X01State } from './games/x01.js'
import { createCheckoutSolver } from './checkout.js'

/** Réussite sur un double donné — matière première de §4.6.5 et §4.5. */
export interface DoubleRecord {
  readonly attempts: number
  readonly hits: number
}

export interface PlayerGameStats {
  readonly playerId: PlayerId
  readonly name: string

  readonly dartsThrown: number
  readonly pointsScored: number
  /** §4.7 — « la métrique reine ». */
  readonly threeDartAverage: number
  readonly firstNineAverage: number

  readonly legsWon: number
  readonly won: boolean
  /** Nombre de fléchettes du meilleur leg gagné. */
  readonly bestLegDarts: number | null
  /** Plus haut score conclu en une volée. */
  readonly bestCheckout: number | null

  readonly checkoutAttempts: number
  readonly checkoutHits: number
  /** Réussite par double, du D1 au bull. */
  readonly doubles: Readonly<Record<number, DoubleRecord>>

  readonly count180: number
  readonly count140plus: number
  readonly count100plus: number

  /**
   * La partie a-t-elle été saisie fléchette par fléchette ?
   *
   * §4.7 : le taux de réussite aux doubles « nécessite la saisie fléchette par
   * fléchette ». Sans ce détail, ces statistiques doivent être présentées comme
   * **indisponibles**, jamais comme nulles.
   */
  readonly hasDartDetail: boolean
}

export interface GameStats {
  readonly ruleId: string
  /** Mode sous-jacent, l'enveloppe de match retirée. */
  readonly baseRuleId: string
  readonly winnerId: PlayerId | null
  readonly players: readonly PlayerGameStats[]
}

interface Accumulator {
  playerId: PlayerId
  name: string
  dartsThrown: number
  pointsScored: number
  turnTotals: number[]
  legsWon: number
  bestLegDarts: number | null
  bestCheckout: number | null
  checkoutAttempts: number
  checkoutHits: number
  doubles: Map<number, { attempts: number; hits: number }>
  count180: number
  count140plus: number
  count100plus: number
  dartInputs: number
  /** Fléchettes lancées dans le leg en cours, pour « meilleur leg ». */
  legDarts: number
  /** Score restant au début de la volée en cours, pour « meilleur checkout ». */
  turnStartScore: number | null
  /** Points marqués dans la volée en cours, à annuler en cas de bust. */
  turnPoints: number
}

function emptyAccumulator(player: PlayerRef): Accumulator {
  return {
    playerId: player.id,
    name: player.name,
    dartsThrown: 0,
    pointsScored: 0,
    turnTotals: [],
    legsWon: 0,
    bestLegDarts: null,
    bestCheckout: null,
    checkoutAttempts: 0,
    checkoutHits: 0,
    doubles: new Map(),
    count180: 0,
    count140plus: 0,
    count100plus: 0,
    dartInputs: 0,
    legDarts: 0,
    turnStartScore: null,
    turnPoints: 0,
  }
}

/**
 * Le joueur est-il « sur un double », c'est-à-dire en position de conclure
 * d'une seule fléchette ?
 *
 * C'est la définition retenue pour le taux de réussite aux doubles du §4.7 :
 * une tentative est une fléchette lancée alors que le score restant se termine
 * en une fléchette. On ne peut pas lire l'intention du joueur, mais on peut lire
 * sa position.
 */
function doubleTarget(remaining: number, outMode: 'double' | 'master' | 'straight'): number | null {
  if (outMode !== 'double') return null
  if (remaining === 50) return BULL
  if (remaining >= 2 && remaining <= 40 && remaining % 2 === 0) return remaining / 2
  return null
}

function x01PlayerState(state: unknown, ruleId: string, playerId: PlayerId) {
  const leg = legStateOf<X01State>(ruleId, state)
  return leg.players.find((player) => player.id === playerId)
}

/**
 * Rejoue une partie et en extrait les statistiques.
 *
 * Le journal est la seule entrée : ce qui a été annulé n'y figure plus, donc
 * n'est jamais compté.
 */
export function computeGameStats(params: {
  readonly rule: AnyGameRule
  readonly config: unknown
  readonly players: readonly PlayerRef[]
  readonly inputs: readonly GameInput[]
}): GameStats {
  const { rule, config, players, inputs } = params
  const base = baseRuleId(rule.id)
  const isX01 = base === 'x01'

  const accumulators = new Map(players.map((player) => [player.id, emptyAccumulator(player)]))
  let state: unknown = rule.createState(config, players)
  let winnerId: PlayerId | null = null

  const outMode: 'double' | 'master' | 'straight' = isX01
    ? ((legStateOf<X01State>(rule.id, state).config.outMode ?? 'double') as
        'double' | 'master' | 'straight')
    : 'double'

  for (const input of inputs) {
    const view = rule.view(state)
    const activeId = view.activePlayerId
    if (!activeId) break
    const accumulator = accumulators.get(activeId)
    if (!accumulator) break

    const remainingBefore = isX01 ? (x01PlayerState(state, rule.id, activeId)?.score ?? null) : null
    const dartsInTurnBefore = rule.view(state).turnDarts.length

    // Début de volée : on mémorise le score, pour « meilleur checkout ».
    if (dartsInTurnBefore === 0) {
      accumulator.turnStartScore = remainingBefore
      accumulator.turnPoints = 0
    }

    // §4.7 — tentative de double : le joueur est en position de conclure.
    let attemptedDouble: number | null = null
    if (isX01 && input.kind === 'dart' && remainingBefore !== null) {
      attemptedDouble = doubleTarget(remainingBefore, outMode)
      if (attemptedDouble !== null) {
        accumulator.checkoutAttempts += 1
        const record = accumulator.doubles.get(attemptedDouble) ?? { attempts: 0, hits: 0 }
        record.attempts += 1
        accumulator.doubles.set(attemptedDouble, record)
      }
    }

    const result =
      input.kind === 'dart'
        ? rule.applyDart(state, input.dart)
        : rule.applyTurnTotal
          ? rule.applyTurnTotal(state, input.total, input.dartsUsed)
          : { state, effects: [] }

    const dartsUsed = input.kind === 'dart' ? 1 : (input.dartsUsed ?? DARTS_PER_TURN)
    accumulator.dartsThrown += dartsUsed
    accumulator.legDarts += dartsUsed
    if (input.kind === 'dart') accumulator.dartInputs += 1

    const after = isX01 ? x01PlayerState(result.state, rule.id, activeId) : undefined
    const busted = result.effects.some((effect) => effect.type === 'bust')
    const legEnded = result.effects.some((effect) => effect.type === 'leg-won')

    /*
     * Points marqués, calculés depuis l'écart de score plutôt que lus sur le
     * compteur du moteur. Deux cas l'imposent :
     *
     *  - la fléchette qui termine un leg d'un match remet aussitôt l'état à
     *    zéro pour la manche suivante : le compteur du moteur a déjà disparu ;
     *  - une volée bustée ne marque rien, y compris ce qu'elle avait marqué
     *    avant de buster (§4.7).
     */
    if (isX01) {
      let scored = 0
      if (input.kind === 'turn-total') {
        scored = busted ? 0 : input.total
      } else if (busted) {
        scored = -accumulator.turnPoints
      } else if (legEnded) {
        scored = remainingBefore ?? 0
      } else {
        scored = (remainingBefore ?? 0) - (after?.score ?? 0)
      }
      accumulator.pointsScored += scored
      accumulator.turnPoints = busted ? 0 : accumulator.turnPoints + Math.max(0, scored)
    }

    for (const effect of result.effects) {
      switch (effect.type) {
        case 'turn-ended': {
          const target = accumulators.get(effect.playerId)
          if (target) target.turnTotals.push(effect.total)
          break
        }
        case 'milestone': {
          const target = accumulators.get(effect.playerId)
          if (!target) break
          if (effect.label === '180') target.count180 += 1
          if (effect.label === '180' || effect.label === '140+') target.count140plus += 1
          target.count100plus += 1
          break
        }
        case 'leg-won': {
          const target = accumulators.get(effect.playerId)
          if (!target) break
          target.legsWon += 1

          // §4.7 — meilleur leg, en nombre de fléchettes.
          if (target.bestLegDarts === null || target.legDarts < target.bestLegDarts) {
            target.bestLegDarts = target.legDarts
          }
          // §4.7 — meilleur checkout : le score conclu dans cette volée.
          const checkout = target.turnStartScore
          if (
            checkout !== null &&
            (target.bestCheckout === null || checkout > target.bestCheckout)
          ) {
            target.bestCheckout = checkout
          }
          if (attemptedDouble !== null) {
            target.checkoutHits += 1
            const record = target.doubles.get(attemptedDouble)
            if (record) record.hits += 1
          }

          // Tout le monde repart à zéro pour le leg suivant.
          for (const entry of accumulators.values()) entry.legDarts = 0
          break
        }
        case 'game-won':
          winnerId = effect.playerId
          break
        default:
          break
      }
    }

    state = result.state
  }

  // §4.7 : sans saisie fléchette par fléchette, le taux de réussite aux
  // doubles est indisponible — pas nul.
  const hasDartDetail = (accumulator: Accumulator) => accumulator.dartInputs > 0

  const stats: PlayerGameStats[] = players.map((player) => {
    const a = accumulators.get(player.id) ?? emptyAccumulator(player)
    const firstNine = a.turnTotals.slice(0, 3)
    return {
      playerId: a.playerId,
      name: a.name,
      dartsThrown: a.dartsThrown,
      pointsScored: a.pointsScored,
      threeDartAverage: a.dartsThrown === 0 ? 0 : (a.pointsScored / a.dartsThrown) * DARTS_PER_TURN,
      firstNineAverage:
        firstNine.length === 0
          ? 0
          : firstNine.reduce((sum, total) => sum + total, 0) / firstNine.length,
      legsWon: a.legsWon,
      won: winnerId === a.playerId,
      bestLegDarts: a.bestLegDarts,
      bestCheckout: a.bestCheckout,
      checkoutAttempts: a.checkoutAttempts,
      checkoutHits: a.checkoutHits,
      doubles: Object.fromEntries([...a.doubles].map(([segment, record]) => [segment, record])),
      count180: a.count180,
      count140plus: a.count140plus,
      count100plus: a.count100plus,
      hasDartDetail: hasDartDetail(a),
    }
  })

  return { ruleId: rule.id, baseRuleId: base, winnerId, players: stats }
}

/** Statistiques cumulées d'un joueur — §4.7, « cumulées dans le temps ». */
export interface PlayerCareerStats {
  readonly playerId: PlayerId
  readonly name: string
  readonly gamesPlayed: number
  readonly gamesWon: number
  readonly winRate: number
  readonly dartsThrown: number
  readonly pointsScored: number
  readonly threeDartAverage: number
  readonly legsWon: number
  readonly bestLegDarts: number | null
  readonly bestCheckout: number | null
  readonly checkoutAttempts: number
  readonly checkoutHits: number
  readonly checkoutRate: number | null
  readonly doubles: Readonly<Record<number, DoubleRecord>>
  readonly count180: number
  readonly count140plus: number
  readonly count100plus: number
  /** §4.7 — « statistiques par mode de jeu ». */
  readonly byRule: Readonly<Record<string, { gamesPlayed: number; gamesWon: number }>>
}

/**
 * Agrège les statistiques de plusieurs parties.
 *
 * Somme simple : c'est ce qui permet à l'affichage de ne pas rejouer
 * l'historique entier (§4.7).
 */
export function aggregateStats(
  games: readonly GameStats[],
  playerId: PlayerId,
): PlayerCareerStats | null {
  const entries = games
    .map((game) => ({ game, stats: game.players.find((player) => player.playerId === playerId) }))
    .filter(
      (entry): entry is { game: GameStats; stats: PlayerGameStats } => entry.stats !== undefined,
    )

  if (entries.length === 0) return null

  const doubles = new Map<number, { attempts: number; hits: number }>()
  const byRule: Record<string, { gamesPlayed: number; gamesWon: number }> = {}

  let dartsThrown = 0
  let pointsScored = 0
  let gamesWon = 0
  let legsWon = 0
  let checkoutAttempts = 0
  let checkoutHits = 0
  let count180 = 0
  let count140plus = 0
  let count100plus = 0
  let bestLegDarts: number | null = null
  let bestCheckout: number | null = null

  for (const { game, stats } of entries) {
    dartsThrown += stats.dartsThrown
    pointsScored += stats.pointsScored
    legsWon += stats.legsWon
    checkoutAttempts += stats.checkoutAttempts
    checkoutHits += stats.checkoutHits
    count180 += stats.count180
    count140plus += stats.count140plus
    count100plus += stats.count100plus
    if (stats.won) gamesWon += 1

    if (
      stats.bestLegDarts !== null &&
      (bestLegDarts === null || stats.bestLegDarts < bestLegDarts)
    ) {
      bestLegDarts = stats.bestLegDarts
    }
    if (
      stats.bestCheckout !== null &&
      (bestCheckout === null || stats.bestCheckout > bestCheckout)
    ) {
      bestCheckout = stats.bestCheckout
    }

    for (const [segment, record] of Object.entries(stats.doubles)) {
      const key = Number(segment)
      const current = doubles.get(key) ?? { attempts: 0, hits: 0 }
      current.attempts += record.attempts
      current.hits += record.hits
      doubles.set(key, current)
    }

    const rule = (byRule[game.baseRuleId] ??= { gamesPlayed: 0, gamesWon: 0 })
    rule.gamesPlayed += 1
    if (stats.won) rule.gamesWon += 1
  }

  const first = entries[0]!
  return {
    playerId,
    name: first.stats.name,
    gamesPlayed: entries.length,
    gamesWon,
    winRate: gamesWon / entries.length,
    dartsThrown,
    pointsScored,
    threeDartAverage: dartsThrown === 0 ? 0 : (pointsScored / dartsThrown) * DARTS_PER_TURN,
    legsWon,
    bestLegDarts,
    bestCheckout,
    checkoutAttempts,
    checkoutHits,
    checkoutRate: checkoutAttempts === 0 ? null : checkoutHits / checkoutAttempts,
    doubles: Object.fromEntries(doubles),
    count180,
    count140plus,
    count100plus,
    byRule,
  }
}

/**
 * Doubles les moins réussis, du plus faible au moins faible.
 *
 * Alimente la suggestion automatique d'exercices (§4.5, #67) et le choix des
 * chemins de sortie par le coach (§4.6.5, #65). Les doubles trop peu tentés
 * sont écartés : un échec sur deux tentatives ne dit rien.
 */
export function weakestDoubles(
  stats: PlayerCareerStats,
  minimumAttempts = 10,
): { segment: number; rate: number; attempts: number }[] {
  return Object.entries(stats.doubles)
    .map(([segment, record]) => ({
      segment: Number(segment),
      attempts: record.attempts,
      rate: record.attempts === 0 ? 0 : record.hits / record.attempts,
    }))
    .filter((entry) => entry.attempts >= minimumAttempts)
    .sort((a, b) => a.rate - b.rate)
}

export type { Dart, Segment }
export { dartValue, isDouble, createCheckoutSolver }
