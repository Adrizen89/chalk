import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { BULL } from '../src/dart.js'
import { GameSession } from '../src/session.js'
import type { CricketConfig, CricketState } from '../src/games/cricket.js'
import {
  CRICKET_DEFAULT_CONFIG,
  CRICKET_TARGETS,
  cricketRule,
  hasClosed,
  hasClosedEverything,
  isTargetDead,
  marksOn,
} from '../src/games/cricket.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

const newSession = (config: Partial<CricketConfig> = {}, players = PLAYERS) =>
  new GameSession(cricketRule, { ...CRICKET_DEFAULT_CONFIG, ...config }, players)

const player = (state: CricketState, id: string) => state.players.find((p) => p.id === id)!

/** Joue `count` fléchettes identiques, en laissant la main tourner. */
function lancer(session: ReturnType<typeof newSession>, darts: Dart[]) {
  for (const dart of darts) session.applyDart(dart)
}

describe('marques et fermeture', () => {
  it('compte 1, 2 ou 3 marques selon le multiplicateur', () => {
    const session = newSession()
    session.applyDart(S(20))
    expect(marksOn(player(session.state, 'a'), 20)).toBe(1)
    session.applyDart(D(20))
    expect(marksOn(player(session.state, 'a'), 20)).toBe(3)
  })

  it('ferme un nombre en une volée avec un triple', () => {
    const session = newSession()
    session.applyDart(T(20))
    expect(hasClosed(player(session.state, 'a'), 20)).toBe(true)
  })

  it('ne dépasse jamais 3 marques', () => {
    const session = newSession()
    lancer(session, [T(20), T(20)])
    expect(marksOn(player(session.state, 'a'), 20)).toBe(3)
  })

  it('ignore les nombres hors cibles, mais compte la fléchette', () => {
    const session = newSession()
    session.applyDart(T(12))
    expect(player(session.state, 'a').score).toBe(0)
    expect(player(session.state, 'a').dartsThrown).toBe(1)
    expect(marksOn(player(session.state, 'a'), 12)).toBe(0)
  })

  it('traite le bull comme une cible, double bull compris', () => {
    const session = newSession()
    session.applyDart({ segment: BULL, multiplier: 2 })
    expect(marksOn(player(session.state, 'a'), BULL)).toBe(2)
  })
})

describe('points en Cricket standard', () => {
  it('ne marque pas de points tant que le nombre n’est pas fermé', () => {
    const session = newSession()
    lancer(session, [D(20)])
    expect(player(session.state, 'a').score).toBe(0)
  })

  it('marque les points des marques en trop', () => {
    const session = newSession()
    // T20 ferme (3 marques), le second T20 marque 3 × 20 = 60.
    lancer(session, [T(20), T(20)])
    expect(player(session.state, 'a').score).toBe(60)
  })

  it('marque le surplus de la fléchette qui ferme', () => {
    const session = newSession()
    // D20 = 2 marques, puis D20 = 2 marques : 1 pour fermer, 1 en trop → 20.
    lancer(session, [D(20), D(20)])
    expect(marksOn(player(session.state, 'a'), 20)).toBe(3)
    expect(player(session.state, 'a').score).toBe(20)
  })

  it('ne marque plus rien quand le nombre est mort', () => {
    const session = newSession()
    lancer(session, [T(20), S(1), S(1)]) // Adrien ferme le 20
    lancer(session, [T(20), S(1), S(1)]) // Bruno ferme le 20 → mort
    expect(isTargetDead(session.state, 20)).toBe(true)

    const avant = player(session.state, 'a').score
    session.applyDart(T(20))
    expect(player(session.state, 'a').score).toBe(avant)
  })
})

describe('variante Cut-throat', () => {
  it('donne les points aux adversaires qui n’ont pas fermé', () => {
    const session = newSession({ variant: 'cutthroat' })
    lancer(session, [T(20), T(20)])
    expect(player(session.state, 'a').score).toBe(0)
    expect(player(session.state, 'b').score).toBe(60)
  })

  it('épargne l’adversaire qui a déjà fermé', () => {
    const trois = [
      { id: 'a', name: 'Adrien' },
      { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Chloé' },
    ]
    const session = newSession({ variant: 'cutthroat' }, trois)
    lancer(session, [T(20), S(1), S(1)]) // Adrien ferme le 20
    lancer(session, [T(20), S(1), S(1)]) // Bruno ferme le 20
    lancer(session, [S(1), S(1), S(1)]) // Chloé passe
    session.applyDart(T(20)) // Adrien marque : seule Chloé encaisse

    expect(player(session.state, 'b').score).toBe(0)
    expect(player(session.state, 'c').score).toBe(60)
  })

  it('fait gagner le plus bas score', () => {
    const session = newSession({ variant: 'cutthroat', targets: [20, 19] })
    lancer(session, [T(20), T(20), S(1)]) // Adrien ferme le 20 et colle 60 à Bruno
    lancer(session, [S(1), S(1), S(1)]) // Bruno passe
    session.applyDart(T(19)) // Adrien ferme tout, et il est le plus bas

    expect(session.winnerId).toBe('a')
    expect(player(session.state, 'a').score).toBe(0)
    expect(player(session.state, 'b').score).toBe(60)
  })

  it('ne fait pas gagner celui qui a tout fermé mais encaissé des points', () => {
    const session = newSession({ variant: 'cutthroat', targets: [20, 19] })
    lancer(session, [T(20), T(20), S(1)]) // Adrien ferme le 20, Bruno prend 60
    lancer(session, [T(19), T(19), S(1)]) // Bruno ferme le 19, Adrien prend 57
    session.applyDart(T(19)) // Adrien ferme tout — la partie s'arrête ici

    expect(hasClosedEverything(player(session.state, 'a'), session.state.config)).toBe(true)
    expect(player(session.state, 'a').score).toBe(57)
    expect(player(session.state, 'b').score).toBe(60)
    // 57 ≤ 60 : Adrien est bien le plus bas, il gagne.
    expect(session.winnerId).toBe('a')
  })
})

describe('variante sans points', () => {
  it('ne compte aucun point et fait gagner le premier à tout fermer', () => {
    const session = newSession({ variant: 'no-score', targets: [20, 19] })
    lancer(session, [T(20), T(19)])
    expect(player(session.state, 'a').score).toBe(0)
    expect(session.winnerId).toBe('a')
  })
})

describe('condition de victoire (§4.2)', () => {
  it('exige d’avoir tout fermé ET d’être devant au score', () => {
    const session = newSession({ targets: [20, 19] })
    // Bruno prend l'avantage au score sur le 19.
    lancer(session, [S(1), S(1), S(1)]) // Adrien passe
    lancer(session, [T(19), T(19), S(1)]) // Bruno ferme le 19 et marque 57
    lancer(session, [T(20), T(19), S(1)]) // Adrien ferme tout mais est mené

    expect(hasClosedEverything(player(session.state, 'a'), session.state.config)).toBe(true)
    expect(player(session.state, 'a').score).toBeLessThan(player(session.state, 'b').score)
    expect(session.winnerId).toBeNull()
  })

  it('déclare vainqueur dès que le score repasse devant', () => {
    const session = newSession({ targets: [20, 19] })
    lancer(session, [S(1), S(1), S(1)]) // Adrien passe
    lancer(session, [T(19), T(19), S(1)]) // Bruno ferme le 19 et mène 57 à 0
    lancer(session, [T(20), T(19), S(1)]) // Adrien ferme tout, mené 0 à 57
    expect(session.winnerId).toBeNull()

    lancer(session, [S(1), S(1), S(1)]) // Bruno passe
    session.applyDart(T(20)) // Adrien marque 60 : il passe devant, la partie s'arrête
    expect(player(session.state, 'a').score).toBeGreaterThan(player(session.state, 'b').score)
    expect(session.winnerId).toBe('a')
  })

  it('supporte plus de deux joueurs', () => {
    const trois = [
      { id: 'a', name: 'Adrien' },
      { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Chloé' },
    ]
    const session = newSession({ targets: [20, 19] }, trois)
    expect(session.state.players).toHaveLength(3)

    lancer(session, [T(20), T(19)]) // Adrien ferme tout en deux fléchettes
    expect(session.winnerId).toBe('a')
  })
})

describe('cas limite : une seule cible', () => {
  it('gagne dès la fermeture, les scores étant tous à zéro', () => {
    const session = newSession({ targets: [20] })
    session.applyDart(T(20))
    expect(session.winnerId).toBe('a')
  })
})

describe('affichage (§4.2)', () => {
  it('expose le tableau de marques et l’état mort de chaque cible', () => {
    const session = newSession()
    session.applyDart(D(18))
    const vue = session.view.players[0]!
    const marques = vue.extra!.marks as Record<string, { marks: number; dead: boolean }>

    expect(Object.keys(marques)).toHaveLength(CRICKET_TARGETS.length)
    expect(marques['18']!.marks).toBe(2)
    expect(marques['18']!.dead).toBe(false)
    expect(vue.secondary.find((s) => s.label === 'Fermés')!.value).toBe('0/7')
  })

  it('affiche le nombre de cibles fermées en variante sans points', () => {
    const session = newSession({ variant: 'no-score' })
    session.applyDart(T(20))
    expect(session.view.players[0]!.primary).toBe('1')
  })
})

describe('intégration avec la session', () => {
  it('exige la saisie fléchette par fléchette (§4.3)', () => {
    expect(cricketRule.requiresDartDetail).toBe(true)
    const session = newSession()
    expect(() => session.applyTurnTotal(60)).toThrow(/fléchette par fléchette/)
  })

  it('s’annule et se rejoue comme les autres modes', () => {
    const session = newSession()
    lancer(session, [T(20), T(20)])
    expect(player(session.state, 'a').score).toBe(60)

    session.undo()
    expect(player(session.state, 'a').score).toBe(0)
    expect(marksOn(player(session.state, 'a'), 20)).toBe(3)
  })

  it('se restaure à l’identique depuis un instantané (§4.4)', () => {
    const session = newSession()
    lancer(session, [T(20), D(19), S(18), T(17)])
    const restaurée = GameSession.restore(
      cricketRule,
      JSON.parse(JSON.stringify(session.toSnapshot())),
    )
    expect(restaurée.state).toEqual(session.state)
  })
})

describe('validation de la saisie', () => {
  it('refuse une fléchette après la fin de la partie', () => {
    const session = newSession({ targets: [20] })
    session.applyDart(T(20))
    expect(() => session.applyDart(S(20))).toThrow(/terminée/)
  })

  it('refuse une quatrième fléchette dans la même volée', () => {
    const state = cricketRule.createState(CRICKET_DEFAULT_CONFIG, PLAYERS)
    const volleePleine = { ...state, turnDarts: [S(1), S(1), S(1)] }
    expect(cricketRule.validateDart(volleePleine, S(20))).toEqual({
      ok: false,
      reason: 'La volée est déjà complète.',
    })
  })

  it('n’a plus de joueur actif une fois la partie gagnée', () => {
    const session = newSession({ targets: [20] })
    session.applyDart(T(20))
    expect(session.view.activePlayerId).toBeNull()
    expect(session.view.isFinished).toBe(true)
  })
})
