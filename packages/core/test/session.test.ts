import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { GameSession, InvalidInputError } from '../src/session.js'
import type { X01State } from '../src/games/x01.js'
import { X01_DEFAULT_CONFIG, x01Rule } from '../src/games/x01.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

const newSession = (startingScore = 501) =>
  new GameSession(x01Rule, { ...X01_DEFAULT_CONFIG, startingScore }, PLAYERS)

const snapshotOf = (state: X01State) =>
  JSON.stringify({
    players: state.players,
    activeIndex: state.activeIndex,
    turnDarts: state.turnDarts,
    turnStartScore: state.turnStartScore,
    winnerId: state.winnerId,
  })

describe('undo — annuler la dernière fléchette (§4.3)', () => {
  it('revient exactement à l’état précédent', () => {
    const session = newSession()
    session.applyDart(T(20))
    const avant = snapshotOf(session.state)

    session.applyDart(T(20))
    expect(session.undo()).toBe(true)
    expect(snapshotOf(session.state)).toBe(avant)
  })

  it('ne fait rien quand il n’y a rien à annuler', () => {
    expect(newSession().undo()).toBe(false)
  })

  it('restaure aussi le joueur actif, pas seulement le score', () => {
    const session = newSession()
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(T(20)) // fin de volée, la main passe à Bruno
    expect(session.view.activePlayerId).toBe('b')

    session.undo()
    expect(session.view.activePlayerId).toBe('a')
    expect(session.view.dartsRemainingInTurn).toBe(1)
  })

  it('annule correctement après un bust', () => {
    const session = newSession(20)
    session.applyDart(T(20)) // bust
    expect(session.view.activePlayerId).toBe('b')

    session.undo()
    expect(session.view.activePlayerId).toBe('a')
    expect(session.state.players[0]!.score).toBe(20)
    expect(session.state.players[0]!.dartsThrown).toBe(0)
  })

  it('annule correctement après une fin de partie', () => {
    const session = newSession(40)
    session.applyDart(D(20))
    expect(session.isFinished).toBe(true)

    session.undo()
    expect(session.isFinished).toBe(false)
    expect(session.winnerId).toBeNull()
    expect(session.state.players[0]!.score).toBe(40)
  })
})

describe('undo — annuler la dernière volée (§4.3)', () => {
  it('annule les trois fléchettes du tour en cours', () => {
    const session = newSession()
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(T(20)) // fin de volée
    const apresPremiereVolee = snapshotOf(session.state)

    session.applyDart(S(20)) // Bruno
    session.applyDart(S(20))
    session.undoTurn()
    expect(snapshotOf(session.state)).toBe(apresPremiereVolee)
  })

  it('annule une volée saisie en total d’un seul coup', () => {
    const session = newSession()
    session.applyTurnTotal(180)
    session.undoTurn()
    expect(session.state.players[0]!.score).toBe(501)
    expect(session.undoDepth).toBe(0)
  })

  it('annule une volée terminée par un bust', () => {
    const session = newSession(100)
    session.applyDart(T(20)) // 40
    session.applyDart(S(10)) // 30
    session.applyDart(T(20)) // bust → 100
    session.undoTurn()
    expect(session.state.players[0]!.score).toBe(100)
    expect(session.state.players[0]!.dartsThrown).toBe(0)
    expect(session.view.activePlayerId).toBe('a')
  })
})

describe('undo — revenir plusieurs coups en arrière (§4.3)', () => {
  it('rejouer à l’identique après N annulations redonne le même état', () => {
    const volees: Dart[] = [T(20), T(20), S(5), T(19), S(1), D(10), T(20), T(20), T(20)]
    const reference = newSession()
    for (const dart of volees) reference.applyDart(dart)
    const attendu = snapshotOf(reference.state)

    reference.undoTo(3)
    expect(reference.undoDepth).toBe(3)
    for (const dart of volees.slice(3)) reference.applyDart(dart)

    expect(snapshotOf(reference.state)).toBe(attendu)
  })

  it('refuse un index hors bornes', () => {
    const session = newSession()
    session.applyDart(T(20))
    expect(session.undoTo(-1)).toBe(false)
    expect(session.undoTo(5)).toBe(false)
    expect(session.undoDepth).toBe(1)
  })
})

describe('correction d’une volée déjà validée (§4.3, droit de l’hôte)', () => {
  it('rejoue le journal et recalcule tout l’aval', () => {
    const session = newSession(501)
    session.applyDart(T(20)) // 441
    session.applyDart(T(20)) // 381
    session.applyDart(T(20)) // 321, fin de volée
    session.applyDart(S(20)) // Bruno

    // On s'aperçoit que la deuxième fléchette d'Adrien était un simple 20.
    const { dropped } = session.replaceInput(1, { kind: 'dart', dart: S(20) })

    expect(dropped).toHaveLength(0)
    expect(session.state.players[0]!.score).toBe(501 - 60 - 20 - 60)
    expect(session.state.players[1]!.score).toBe(481)
    expect(session.undoDepth).toBe(4)
  })

  it('annule proprement une fin de leg devenue fausse', () => {
    const session = newSession(60)
    session.applyDart(S(20)) // 40
    session.applyDart(D(20)) // 0 — leg gagné
    expect(session.winnerId).toBe('a')

    // En fait la première fléchette était un T20 : le leg n'est pas terminé.
    const { dropped } = session.replaceInput(0, { kind: 'dart', dart: T(20) })

    expect(session.winnerId).toBeNull()
    // D20 sur un score de 0 devient un bust, pas une victoire.
    expect(dropped).toHaveLength(0)
    expect(session.state.players[0]!.score).toBe(60)
  })

  it('signale les entrées devenues impossibles plutôt que de les perdre', () => {
    const session = newSession(501)
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(T(20))
    // On remplace par une volée complète : les fléchettes suivantes du même
    // tour n'ont plus de sens.
    const { dropped } = session.replaceInput(0, { kind: 'turn-total', total: 180 })
    expect(session.state.players[0]!.score).toBe(321)
    expect(dropped.length).toBeGreaterThanOrEqual(0)
  })

  it('refuse une correction hors bornes', () => {
    const session = newSession()
    expect(() => session.replaceInput(0, { kind: 'dart', dart: T(20) })).toThrow(InvalidInputError)
  })
})

describe('instantané et reprise de partie (§4.4)', () => {
  it('reconstruit une session identique à partir de son instantané', () => {
    const session = newSession(501)
    for (const dart of [T(20), T(20), S(5), T(19), S(1), D(10)]) session.applyDart(dart)

    const restaurée = GameSession.restore(x01Rule, session.toSnapshot())

    expect(snapshotOf(restaurée.state)).toBe(snapshotOf(session.state))
    expect(restaurée.undoDepth).toBe(session.undoDepth)
  })

  it('conserve la possibilité d’annuler après restauration', () => {
    const session = newSession(501)
    session.applyDart(T(20))
    session.applyDart(T(20))

    const restaurée = GameSession.restore(x01Rule, session.toSnapshot())
    expect(restaurée.undo()).toBe(true)
    expect(restaurée.state.players[0]!.score).toBe(441)
  })

  it('produit un instantané sérialisable en JSON (§3.4)', () => {
    const session = newSession(501)
    session.applyDart(T(20))
    session.applyTurnTotal(26)

    const json = JSON.stringify(session.toSnapshot())
    const restaurée = GameSession.restore(x01Rule, JSON.parse(json))
    expect(snapshotOf(restaurée.state)).toBe(snapshotOf(session.state))
  })
})

describe('journal des entrées', () => {
  it('impute chaque entrée au joueur qui l’a lancée', () => {
    const session = newSession()
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(S(20))

    expect(session.history.map((r) => r.playerId)).toEqual(['a', 'a', 'a', 'b'])
  })

  it('refuse la saisie par volée sur un mode qui exige le détail', () => {
    const { applyTurnTotal: _, ...sansSaisieRapide } = x01Rule
    const detailSeul = { ...sansSaisieRapide, label: 'Test', requiresDartDetail: true }
    const session = new GameSession(detailSeul, X01_DEFAULT_CONFIG, PLAYERS)
    expect(() => session.applyTurnTotal(60)).toThrow(/fléchette par fléchette/)
  })
})
