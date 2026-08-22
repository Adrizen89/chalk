/**
 * Statistiques — §4.7, #43.
 *
 * Tout est recalculé depuis le journal : ce qui a été annulé ne doit jamais
 * apparaître, et la fin de leg d'un match ne doit rien faire perdre.
 */

import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { BULL } from '../src/dart.js'
import { GameSession } from '../src/session.js'
import { createMatchRule } from '../src/match.js'
import { X01_DEFAULT_CONFIG, x01Rule } from '../src/games/x01.js'
import { cricketRule, CRICKET_DEFAULT_CONFIG } from '../src/games/cricket.js'
import { aggregateStats, computeGameStats, weakestDoubles } from '../src/stats.js'
import type { AnyGameRule, PlayerRef } from '../src/rule.js'
import type { GameInput } from '../src/session.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart

const PLAYERS: PlayerRef[] = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

/** Rejoue une session et en extrait les statistiques, comme le fera l'app. */
function statsOf(session: GameSession<unknown, unknown>, rule: AnyGameRule, config: unknown) {
  const snapshot = session.toSnapshot()
  return computeGameStats({
    rule,
    config,
    players: snapshot.players,
    inputs: snapshot.inputs as GameInput[],
  })
}

function x01Session(config: Partial<typeof X01_DEFAULT_CONFIG> = {}) {
  const full = { ...X01_DEFAULT_CONFIG, ...config }
  const session = new GameSession(x01Rule, full, PLAYERS)
  return { session, config: full, rule: x01Rule as AnyGameRule }
}

const of = (stats: ReturnType<typeof computeGameStats>, id: string) =>
  stats.players.find((player) => player.playerId === id)!

describe('moyenne 3 fléchettes (§4.7, « la métrique reine »)', () => {
  it('calcule la moyenne sur les points réellement marqués', () => {
    const { session, config, rule } = x01Session({ startingScore: 501 })
    session.applyTurnTotal(180)
    session.applyTurnTotal(60)

    const stats = statsOf(session, rule, config)
    expect(of(stats, 'a').threeDartAverage).toBe(180)
    expect(of(stats, 'b').threeDartAverage).toBe(60)
  })

  it('ne compte pas les points d’une volée bustée', () => {
    const { session, config, rule } = x01Session({ startingScore: 100 })
    session.applyDart(T(20)) // 100 → 40
    session.applyDart(S(10)) // 40 → 30
    session.applyDart(T(20)) // bust

    const stats = statsOf(session, rule, config)
    expect(of(stats, 'a').pointsScored).toBe(0)
    expect(of(stats, 'a').dartsThrown).toBe(3)
    expect(of(stats, 'a').threeDartAverage).toBe(0)
  })

  it('compte la fléchette qui termine le leg', () => {
    const { session, config, rule } = x01Session({ startingScore: 60 })
    session.applyDart(S(20)) // 60 → 40
    session.applyDart(D(20)) // 40 → 0, leg gagné

    const stats = statsOf(session, rule, config)
    expect(of(stats, 'a').pointsScored).toBe(60)
    expect(of(stats, 'a').dartsThrown).toBe(2)
    expect(of(stats, 'a').threeDartAverage).toBe(90)
  })

  it('calcule la moyenne des 9 premières fléchettes', () => {
    const { session, config, rule } = x01Session({ startingScore: 501 })
    for (const total of [180, 140, 100]) {
      session.applyTurnTotal(total)
      session.applyTurnTotal(26)
    }
    session.applyTurnTotal(60) // au-delà des 9 premières

    expect(of(statsOf(session, rule, config), 'a').firstNineAverage).toBe(140)
  })
})

describe('ce qui a été annulé ne compte pas (§4.3)', () => {
  it('efface un 180 annulé des statistiques', () => {
    const { session, config, rule } = x01Session({ startingScore: 501 })
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(T(20))
    expect(of(statsOf(session, rule, config), 'a').count180).toBe(1)

    session.undo()
    const apres = of(statsOf(session, rule, config), 'a')
    expect(apres.count180).toBe(0)
    expect(apres.dartsThrown).toBe(2)
    expect(apres.pointsScored).toBe(120)
  })

  it('reflète une volée corrigée par l’hôte', () => {
    const { session, config, rule } = x01Session({ startingScore: 501 })
    session.applyTurnTotal(180)
    expect(of(statsOf(session, rule, config), 'a').count180).toBe(1)

    session.replaceInput(0, { kind: 'turn-total', total: 60 })
    const apres = of(statsOf(session, rule, config), 'a')
    expect(apres.count180).toBe(0)
    expect(apres.pointsScored).toBe(60)
  })
})

describe('paliers 180 / 140+ / 100+', () => {
  it('compte chaque palier de façon cumulative', () => {
    const { session, config, rule } = x01Session({ startingScore: 1001 })
    session.applyTurnTotal(180)
    session.applyTurnTotal(26)
    session.applyTurnTotal(140)
    session.applyTurnTotal(26)
    session.applyTurnTotal(100)
    session.applyTurnTotal(26)
    session.applyTurnTotal(99)

    const adrien = of(statsOf(session, rule, config), 'a')
    expect(adrien.count180).toBe(1)
    expect(adrien.count140plus).toBe(2) // le 180 en fait partie
    expect(adrien.count100plus).toBe(3)
  })
})

describe('doubles et checkouts (§4.7)', () => {
  it('compte une tentative dès que le joueur est sur un double', () => {
    const { session, config, rule } = x01Session({ startingScore: 40 })
    session.applyDart(S(1)) // 40 → 39 : tentative ratée sur D20

    const adrien = of(statsOf(session, rule, config), 'a')
    expect(adrien.checkoutAttempts).toBe(1)
    expect(adrien.checkoutHits).toBe(0)
    expect(adrien.doubles[20]).toEqual({ attempts: 1, hits: 0 })
  })

  it('compte la réussite sur le bon double', () => {
    const { session, config, rule } = x01Session({ startingScore: 32 })
    session.applyDart(D(16))

    const adrien = of(statsOf(session, rule, config), 'a')
    expect(adrien.checkoutAttempts).toBe(1)
    expect(adrien.checkoutHits).toBe(1)
    expect(adrien.doubles[16]).toEqual({ attempts: 1, hits: 1 })
  })

  it('reconnaît le bull comme double de sortie', () => {
    const { session, config, rule } = x01Session({ startingScore: 50 })
    session.applyDart({ segment: BULL, multiplier: 2 })
    expect(of(statsOf(session, rule, config), 'a').doubles[BULL]).toEqual({ attempts: 1, hits: 1 })
  })

  it('ne compte aucune tentative sur un score impair', () => {
    const { session, config, rule } = x01Session({ startingScore: 41 })
    session.applyDart(S(9)) // 41 → 32 : on n'était pas sur un double
    expect(of(statsOf(session, rule, config), 'a').checkoutAttempts).toBe(0)
  })

  it('retient le score conclu comme meilleur checkout', () => {
    const { session, config, rule } = x01Session({ startingScore: 100 })
    session.applyDart(T(20)) // 100 → 40
    session.applyDart(D(20)) // 40 → 0

    const adrien = of(statsOf(session, rule, config), 'a')
    expect(adrien.bestCheckout).toBe(100)
    expect(adrien.bestLegDarts).toBe(2)
  })

  it('n’attribue pas de tentative en master out', () => {
    const { session, config, rule } = x01Session({ startingScore: 40, outMode: 'master' })
    session.applyDart(S(1))
    expect(of(statsOf(session, rule, config), 'a').checkoutAttempts).toBe(0)
  })
})

describe('détail de saisie (§4.7)', () => {
  it('signale une partie saisie par volée comme sans détail', () => {
    const { session, config, rule } = x01Session({ startingScore: 501 })
    session.applyTurnTotal(180)
    expect(of(statsOf(session, rule, config), 'a').hasDartDetail).toBe(false)
  })

  it('signale une partie saisie fléchette par fléchette', () => {
    const { session, config, rule } = x01Session({ startingScore: 501 })
    session.applyDart(T(20))
    expect(of(statsOf(session, rule, config), 'a').hasDartDetail).toBe(true)
  })
})

describe('matchs en plusieurs legs (§4.4)', () => {
  const matchRule = createMatchRule(x01Rule) as AnyGameRule

  function matchSession(legsToWin: number) {
    const config = {
      ruleConfig: { ...X01_DEFAULT_CONFIG, startingScore: 100 },
      legsToWin,
      setsToWin: 1,
      alternateStart: false,
    }
    return { session: new GameSession(matchRule, config, PLAYERS), config, rule: matchRule }
  }

  it('cumule les points à travers les legs', () => {
    const { session, config, rule } = matchSession(2)
    session.applyDart(T(20)) // leg 1 : 100 → 40
    session.applyDart(D(20)) // leg 1 gagné
    session.applyDart(T(20)) // leg 2 : 100 → 40
    session.applyDart(D(20)) // leg 2 gagné, match gagné

    const adrien = of(statsOf(session, rule, config), 'a')
    expect(adrien.pointsScored).toBe(200)
    expect(adrien.dartsThrown).toBe(4)
    expect(adrien.legsWon).toBe(2)
    expect(adrien.won).toBe(true)
  })

  it('retient le meilleur leg, pas le dernier', () => {
    const { session, config, rule } = matchSession(3)
    // Leg 1 en 3 fléchettes : 20 + 40 + 40 = 100.
    session.applyDart(S(20))
    session.applyDart(D(20))
    session.applyDart(D(20))
    // Leg 2 en 2 fléchettes : 60 + 40 = 100.
    session.applyDart(T(20))
    session.applyDart(D(20))
    // Leg 3 en 3 fléchettes.
    session.applyDart(S(20))
    session.applyDart(D(20))
    session.applyDart(D(20))

    const adrien = of(statsOf(session, rule, config), 'a')
    expect(adrien.legsWon).toBe(3)
    expect(adrien.bestLegDarts).toBe(2)
    expect(adrien.dartsThrown).toBe(8)
    expect(adrien.pointsScored).toBe(300)
  })
})

describe('autres modes de jeu', () => {
  it('compte les fléchettes d’une partie de Cricket sans inventer de moyenne', () => {
    const config = { ...CRICKET_DEFAULT_CONFIG, targets: [20, 19] }
    const session = new GameSession(cricketRule, config, PLAYERS)
    session.applyDart(T(20))
    session.applyDart(T(19)) // Adrien ferme tout : partie gagnée

    const stats = computeGameStats({
      rule: cricketRule as AnyGameRule,
      config,
      players: PLAYERS,
      inputs: session.toSnapshot().inputs as GameInput[],
    })
    expect(stats.baseRuleId).toBe('cricket')
    expect(of(stats, 'a').dartsThrown).toBe(2)
    expect(of(stats, 'a').won).toBe(true)
    expect(of(stats, 'a').threeDartAverage).toBe(0)
  })
})

describe('agrégation dans le temps (§4.7)', () => {
  function finishedGame(startingScore: number, winner: 'a' | 'b') {
    const config = { ...X01_DEFAULT_CONFIG, startingScore }
    const session = new GameSession(x01Rule, config, PLAYERS)
    if (winner === 'b') session.applyTurnTotal(26) // Adrien passe la main
    session.applyDart(D(startingScore / 2))
    return computeGameStats({
      rule: x01Rule as AnyGameRule,
      config,
      players: PLAYERS,
      inputs: session.toSnapshot().inputs as GameInput[],
    })
  }

  it('cumule parties jouées, gagnées et ratio', () => {
    const games = [finishedGame(40, 'a'), finishedGame(32, 'a'), finishedGame(40, 'b')]
    const career = aggregateStats(games, 'a')!

    expect(career.gamesPlayed).toBe(3)
    expect(career.gamesWon).toBe(2)
    expect(career.winRate).toBeCloseTo(2 / 3)
  })

  it('retient le meilleur leg et le meilleur checkout sur l’ensemble', () => {
    const career = aggregateStats([finishedGame(40, 'a'), finishedGame(32, 'a')], 'a')!
    expect(career.bestLegDarts).toBe(1)
    expect(career.bestCheckout).toBe(40)
  })

  it('ventile par mode de jeu', () => {
    const career = aggregateStats([finishedGame(40, 'a'), finishedGame(32, 'a')], 'a')!
    expect(career.byRule.x01).toEqual({ gamesPlayed: 2, gamesWon: 2 })
  })

  it('renvoie null pour un joueur absent de l’historique', () => {
    expect(aggregateStats([finishedGame(40, 'a')], 'inconnu')).toBeNull()
  })

  it('laisse le taux de réussite indéterminé sans tentative', () => {
    const config = { ...X01_DEFAULT_CONFIG, startingScore: 501 }
    const session = new GameSession(x01Rule, config, PLAYERS)
    session.applyTurnTotal(180)
    const stats = computeGameStats({
      rule: x01Rule as AnyGameRule,
      config,
      players: PLAYERS,
      inputs: session.toSnapshot().inputs as GameInput[],
    })
    expect(aggregateStats([stats], 'a')!.checkoutRate).toBeNull()
  })
})

describe('doubles les plus faibles (§4.5, §4.6.5)', () => {
  it('classe du moins réussi au plus réussi, échantillon suffisant seulement', () => {
    const career = {
      playerId: 'a',
      name: 'Adrien',
      gamesPlayed: 1,
      gamesWon: 1,
      winRate: 1,
      dartsThrown: 0,
      pointsScored: 0,
      threeDartAverage: 0,
      legsWon: 0,
      bestLegDarts: null,
      bestCheckout: null,
      checkoutAttempts: 0,
      checkoutHits: 0,
      checkoutRate: null,
      doubles: {
        20: { attempts: 20, hits: 8 }, // 40 %
        16: { attempts: 20, hits: 12 }, // 60 %
        18: { attempts: 2, hits: 0 }, // échantillon trop faible
      },
      count180: 0,
      count140plus: 0,
      count100plus: 0,
      byRule: {},
    }

    const faibles = weakestDoubles(career, 10)
    expect(faibles.map((entry) => entry.segment)).toEqual([20, 16])
    expect(faibles[0]!.rate).toBeCloseTo(0.4)
  })
})
