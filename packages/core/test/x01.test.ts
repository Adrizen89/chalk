import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { BULL } from '../src/dart.js'
import type { OutMode } from '../src/checkout.js'
import { GameSession } from '../src/session.js'
import type { InMode, X01Config, X01State } from '../src/games/x01.js'
import {
  X01_DEFAULT_CONFIG,
  firstNineAverage,
  suggestCheckout,
  threeDartAverage,
  x01Rule,
} from '../src/games/x01.js'
import { formatPath } from '../src/checkout.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart
const MISS: Dart = { segment: 0, multiplier: 1 }

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

function newSession(config: Partial<X01Config> = {}, players = PLAYERS) {
  return new GameSession(x01Rule, { ...X01_DEFAULT_CONFIG, ...config }, players)
}

const scoreOf = (state: X01State, id: string) => state.players.find((p) => p.id === id)!.score

describe('mise en place', () => {
  it('applique le score de départ choisi', () => {
    for (const startingScore of [301, 501, 701, 1001, 420]) {
      const session = newSession({ startingScore })
      expect(scoreOf(session.state, 'a')).toBe(startingScore)
      expect(scoreOf(session.state, 'b')).toBe(startingScore)
    }
  })

  it('applique un handicap par joueur (§4.4)', () => {
    const session = newSession({ startingScore: 501, handicaps: { b: -101 } })
    expect(scoreOf(session.state, 'a')).toBe(501)
    expect(scoreOf(session.state, 'b')).toBe(400)
  })

  it('refuse une fléchette qui n’existe pas sur une cible', () => {
    const session = newSession()
    expect(() => session.applyDart({ segment: BULL, multiplier: 3 })).toThrow(/n’existe pas/)
  })
})

describe('décompte et passage de main', () => {
  it('soustrait la valeur des fléchettes et passe la main après trois', () => {
    const session = newSession({ startingScore: 501 })
    session.applyDart(T(20))
    session.applyDart(T(20))
    expect(scoreOf(session.state, 'a')).toBe(381)
    expect(session.view.activePlayerId).toBe('a')

    session.applyDart(T(20))
    expect(scoreOf(session.state, 'a')).toBe(321)
    expect(session.view.activePlayerId).toBe('b')
  })

  it('signale les paliers 180, 140+ et 100+ (§4.7, §4.9)', () => {
    const session = newSession()
    session.applyDart(T(20))
    session.applyDart(T(20))
    const result = session.applyDart(T(20))
    expect(result.effects).toContainEqual({ type: 'milestone', playerId: 'a', label: '180' })

    session.applyDart(T(20)) // Bruno
    session.applyDart(T(20))
    const centQuarante = session.applyDart(S(20))
    expect(centQuarante.effects).toContainEqual({ type: 'milestone', playerId: 'b', label: '140+' })
  })

  it('compte le hors-cible comme une fléchette lancée sans point', () => {
    const session = newSession({ startingScore: 501 })
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    const joueur = session.state.players[0]!
    expect(joueur.score).toBe(501)
    expect(joueur.dartsThrown).toBe(3)
    expect(threeDartAverage(joueur)).toBe(0)
  })
})

describe('entrée : straight in et double in (§4.2)', () => {
  it('en straight in, la première fléchette compte', () => {
    const session = newSession({ startingScore: 301, inMode: 'straight' })
    session.applyDart(S(20))
    expect(scoreOf(session.state, 'a')).toBe(281)
  })

  it('en double in, rien ne compte tant qu’un double n’est pas touché', () => {
    const session = newSession({ startingScore: 301, inMode: 'double' })
    session.applyDart(T(20))
    expect(scoreOf(session.state, 'a')).toBe(301)
    expect(session.state.players[0]!.hasOpened).toBe(false)
    expect(session.state.players[0]!.dartsThrown).toBe(1)

    session.applyDart(D(20))
    expect(session.state.players[0]!.hasOpened).toBe(true)
    expect(scoreOf(session.state, 'a')).toBe(261)

    session.applyDart(T(20))
    expect(scoreOf(session.state, 'a')).toBe(201)
  })

  it('en double in, le double bull ouvre le compte', () => {
    const session = newSession({ startingScore: 301, inMode: 'double' })
    session.applyDart({ segment: BULL, multiplier: 2 })
    expect(session.state.players[0]!.hasOpened).toBe(true)
    expect(scoreOf(session.state, 'a')).toBe(251)
  })
})

describe('sortie et bust (§4.2)', () => {
  it('gagne le leg en terminant sur un double', () => {
    const session = newSession({ startingScore: 40 })
    const result = session.applyDart(D(20))
    expect(session.winnerId).toBe('a')
    expect(result.effects.map((e) => e.type)).toContain('leg-won')
    expect(result.effects.map((e) => e.type)).toContain('game-won')
  })

  it('bust quand le score devient négatif', () => {
    const session = newSession({ startingScore: 40 })
    session.applyDart(S(5)) // 35
    const result = session.applyDart(T(20)) // -25
    expect(result.effects[0]).toEqual({ type: 'bust', playerId: 'a', restoredScore: 40 })
    expect(scoreOf(session.state, 'a')).toBe(40)
    expect(session.view.activePlayerId).toBe('b')
  })

  it('applique les trois cas de bust en double out', () => {
    // Cas 1 : score négatif.
    const negatif = newSession({ startingScore: 20 })
    expect(negatif.applyDart(T(20)).effects[0]?.type).toBe('bust')

    // Cas 2 : reste 1, infinissable en double out.
    const reste1 = newSession({ startingScore: 21 })
    expect(reste1.applyDart(S(20)).effects[0]?.type).toBe('bust')

    // Cas 3 : zéro atteint sur un simple, sortie non respectée.
    const mauvaiseSortie = newSession({ startingScore: 20 })
    expect(mauvaiseSortie.applyDart(S(20)).effects[0]?.type).toBe('bust')
  })

  it('restaure le score du début de volée, pas celui d’avant la fléchette', () => {
    const session = newSession({ startingScore: 100 })
    session.applyDart(T(20)) // 40
    session.applyDart(S(10)) // 30
    session.applyDart(T(20)) // bust
    expect(scoreOf(session.state, 'a')).toBe(100)
  })

  it('en straight out, zéro atteint sur un simple gagne', () => {
    const session = newSession({ startingScore: 20, outMode: 'straight' })
    session.applyDart(S(20))
    expect(session.winnerId).toBe('a')
  })

  it('en master out, un triple conclut mais pas un simple', () => {
    const parTriple = newSession({ startingScore: 60, outMode: 'master' })
    parTriple.applyDart(T(20))
    expect(parTriple.winnerId).toBe('a')

    const parSimple = newSession({ startingScore: 20, outMode: 'master' })
    expect(parSimple.applyDart(S(20)).effects[0]?.type).toBe('bust')
  })

  it('la volée gagnante peut ne compter qu’une fléchette (§4.4)', () => {
    const session = newSession({ startingScore: 170 })
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart({ segment: BULL, multiplier: 2 })
    expect(session.winnerId).toBe('a')
    expect(session.state.players[0]!.dartsThrown).toBe(3)
  })
})

describe('saisie par volée (§4.3)', () => {
  it('soustrait le total et passe la main', () => {
    const session = newSession({ startingScore: 501 })
    session.applyTurnTotal(180)
    expect(scoreOf(session.state, 'a')).toBe(321)
    expect(session.view.activePlayerId).toBe('b')
    expect(session.state.players[0]!.dartsThrown).toBe(3)
  })

  it('ignore un total impossible plutôt que de corrompre la partie', () => {
    const session = newSession({ startingScore: 501 })
    session.applyTurnTotal(179)
    expect(scoreOf(session.state, 'a')).toBe(501)
  })

  it('bust si le total dépasse ou laisse 1', () => {
    const trop = newSession({ startingScore: 100 })
    expect(trop.applyTurnTotal(140).effects[0]?.type).toBe('bust')

    const laisseUn = newSession({ startingScore: 100 })
    expect(laisseUn.applyTurnTotal(99).effects[0]?.type).toBe('bust')
  })

  it('accepte un nombre de fléchettes réduit sur la volée gagnante (§4.4)', () => {
    const session = newSession({ startingScore: 40 })
    session.applyTurnTotal(40, 1)
    expect(session.winnerId).toBe('a')
    expect(session.state.players[0]!.dartsThrown).toBe(1)
  })
})

describe('statistiques (§4.7)', () => {
  it('calcule la moyenne 3 fléchettes', () => {
    const session = newSession({ startingScore: 501 })
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(T(20))
    expect(threeDartAverage(session.state.players[0]!)).toBe(180)
  })

  it('calcule la moyenne des 9 premières fléchettes', () => {
    const session = newSession({ startingScore: 501 })
    for (const total of [180, 140, 100]) {
      session.applyTurnTotal(total)
      session.applyTurnTotal(26) // Bruno
    }
    expect(firstNineAverage(session.state.players[0]!)).toBe(140)
  })

  it('compte un bust comme une volée à zéro', () => {
    const session = newSession({ startingScore: 100 })
    session.applyTurnTotal(99) // bust
    expect(session.state.players[0]!.turnTotals).toEqual([0])
    expect(session.state.players[0]!.pointsScored).toBe(0)
  })
})

describe('suggestions de sortie pendant la partie (§4.3)', () => {
  it('ne suggère rien au-dessus de 170', () => {
    const session = newSession({ startingScore: 501 })
    expect(suggestCheckout(session.state)).toBeNull()
  })

  it('suggère la sortie et des alternatives sous le seuil', () => {
    const session = newSession({ startingScore: 170 })
    const suggestion = suggestCheckout(session.state)
    expect(suggestion).not.toBeNull()
    expect(formatPath(suggestion!.best)).toBe('T20 T20 BULL')
  })

  it('adapte la suggestion aux fléchettes restantes', () => {
    const session = newSession({ startingScore: 100 })
    expect(formatPath(suggestCheckout(session.state)!.best)).toBe('T20 D20')
    session.applyDart(S(20)) // reste 80, 2 fléchettes
    const apres = suggestCheckout(session.state)!
    expect(apres.best.length).toBeLessThanOrEqual(2)
    expect(apres.best.reduce((s, d) => s + d.segment * d.multiplier, 0)).toBe(80)
  })

  it('ne suggère rien sur un bogey number', () => {
    const session = newSession({ startingScore: 169 })
    expect(suggestCheckout(session.state)).toBeNull()
  })

  it('ne suggère rien avant l’ouverture en double in', () => {
    const session = newSession({ startingScore: 120, inMode: 'double' })
    expect(suggestCheckout(session.state)).toBeNull()
  })
})

describe('affichage générique (§4.2)', () => {
  it('projette l’état vers une vue indépendante des règles', () => {
    const session = newSession({ startingScore: 501 })
    session.applyDart(T(20))
    const view = session.view

    expect(view.ruleId).toBe('x01')
    expect(view.players).toHaveLength(2)
    expect(view.players[0]!.primary).toBe('441')
    expect(view.players[0]!.isActive).toBe(true)
    expect(view.players[1]!.isActive).toBe(false)
    expect(view.dartsRemainingInTurn).toBe(2)
    expect(view.turnDarts).toHaveLength(1)
    expect(view.isFinished).toBe(false)
  })

  it('signale la partie terminée et son vainqueur', () => {
    const session = newSession({ startingScore: 40 })
    session.applyDart(D(20))
    expect(session.view.isFinished).toBe(true)
    expect(session.view.winnerId).toBe('a')
    expect(session.view.activePlayerId).toBeNull()
  })

  it('affiche le statut « non ouvert » en double in', () => {
    const session = newSession({ inMode: 'double' })
    const labels = session.view.players[0]!.secondary.map((s) => s.value)
    expect(labels).toContain('Non ouvert')
  })
})

describe('combinaisons entrée × sortie', () => {
  const inModes: InMode[] = ['straight', 'double']
  const outModes: OutMode[] = ['double', 'master', 'straight']

  it.each(inModes.flatMap((i) => outModes.map((o) => [i, o] as const)))(
    'joue un leg complet en %s in / %s out sans incohérence',
    (inMode, outMode) => {
      const session = newSession({ startingScore: 301, inMode, outMode })
      let garde = 0

      while (!session.isFinished && garde < 500) {
        garde += 1
        const state = session.state
        const joueur = state.players[state.activeIndex]!
        const suggestion = suggestCheckout(state)
        const dart = suggestion?.best[0] ?? (joueur.hasOpened ? T(20) : D(20))
        session.applyDart(dart)

        // Invariant : aucun score négatif ne doit jamais subsister.
        for (const p of session.state.players) expect(p.score).toBeGreaterThanOrEqual(0)
      }

      expect(session.isFinished).toBe(true)
      const gagnant = session.state.players.find((p) => p.id === session.winnerId)!
      expect(gagnant.score).toBe(0)
    },
  )
})
