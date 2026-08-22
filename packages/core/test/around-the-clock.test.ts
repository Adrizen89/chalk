import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { BULL } from '../src/dart.js'
import { GameSession } from '../src/session.js'
import type { AroundTheClockConfig, AroundTheClockState } from '../src/games/around-the-clock.js'
import {
  AROUND_THE_CLOCK_DEFAULT_CONFIG,
  AROUND_THE_CLOCK_SEQUENCE,
  aroundTheClockRule,
  currentTarget,
  hasFinished,
} from '../src/games/around-the-clock.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

const newSession = (config: Partial<AroundTheClockConfig> = {}, players = PLAYERS) =>
  new GameSession(aroundTheClockRule, { ...AROUND_THE_CLOCK_DEFAULT_CONFIG, ...config }, players)

const player = (state: AroundTheClockState, id: string) => state.players.find((p) => p.id === id)!

/** Fait parcourir tout le tour au joueur actif, en solo. */
function parcourir(session: ReturnType<typeof newSession>, dart: (target: number) => Dart) {
  let garde = 0
  while (!session.isFinished && garde < 200) {
    garde += 1
    const state = session.state
    const actif = state.players[state.activeIndex]!
    const target = currentTarget(state, actif)
    if (target === null) break
    session.applyDart(dart(target))
  }
}

describe('séquence', () => {
  it('va de 1 à 20 puis au bull', () => {
    expect(AROUND_THE_CLOCK_SEQUENCE).toHaveLength(21)
    expect(AROUND_THE_CLOCK_SEQUENCE[0]).toBe(1)
    expect(AROUND_THE_CLOCK_SEQUENCE[19]).toBe(20)
    expect(AROUND_THE_CLOCK_SEQUENCE[20]).toBe(BULL)
  })

  it('retire le bull quand la configuration le demande', () => {
    const session = newSession({ includeBull: false })
    expect(session.state.sequence).toHaveLength(20)
    expect(session.state.sequence).not.toContain(BULL)
  })

  it('démarre tout le monde sur le 1', () => {
    const session = newSession()
    for (const p of session.state.players) expect(currentTarget(session.state, p)).toBe(1)
  })
})

describe('variante simple : tout touché fait avancer', () => {
  it('avance sur un simple, un double ou un triple', () => {
    const session = newSession({ mode: 'any' })
    session.applyDart(S(1))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(2)
    session.applyDart(D(2))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(3)
    session.applyDart(T(3))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(4)
  })

  it('n’avance pas sur un autre numéro', () => {
    const session = newSession({ mode: 'any' })
    session.applyDart(S(7))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(1)
    expect(player(session.state, 'a').dartsThrown).toBe(1)
  })
})

describe('variantes double et triple obligatoires (§4.2)', () => {
  it('en double obligatoire, seul le double avance', () => {
    const session = newSession({ mode: 'double' })
    session.applyDart(S(1))
    session.applyDart(T(1))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(1)
    session.applyDart(D(1))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(2)
  })

  it('en triple obligatoire, seul le triple avance', () => {
    const session = newSession({ mode: 'triple' })
    session.applyDart(D(1))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(1)
    session.applyDart(T(1))
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(2)
  })

  it('accepte le double bull pour conclure en triple obligatoire', () => {
    // Le bull n'a pas de triple : sans cette règle, le parcours serait
    // impossible à terminer.
    const session = newSession({ mode: 'triple' })
    parcourir(session, (target) => (target === BULL ? { segment: BULL, multiplier: 2 } : T(target)))
    expect(session.winnerId).toBe('a')
  })
})

describe('fin de parcours', () => {
  it('gagne en terminant sur le bull', () => {
    const session = newSession({ mode: 'any' })
    parcourir(session, (target) => S(target))
    expect(session.winnerId).toBe('a')
    expect(hasFinished(session.state, player(session.state, 'a'))).toBe(true)
  })

  it('compte les fléchettes lancées — la métrique du mode', () => {
    const session = newSession({ mode: 'any' })
    parcourir(session, (target) => S(target))
    // 21 cibles touchées d'affilée : le parcours parfait.
    expect(player(session.state, 'a').dartsThrown).toBe(21)
  })

  it('passe la main après trois fléchettes', () => {
    const session = newSession({ mode: 'any' })
    session.applyDart(S(1))
    session.applyDart(S(2))
    expect(session.view.activePlayerId).toBe('a')
    session.applyDart(S(3))
    expect(session.view.activePlayerId).toBe('b')
  })
})

describe('affichage (§4.2)', () => {
  it('met la cible courante en avant', () => {
    const session = newSession()
    expect(session.view.players[0]!.primary).toBe('1')
    session.applyDart(S(1))
    expect(session.view.players[0]!.primary).toBe('2')
  })

  it('affiche BULL sur la dernière cible', () => {
    const session = newSession({ includeBull: true })
    parcourir(session, (target) => (target === BULL ? S(0) : S(target)))
    expect(session.view.players[0]!.primary).toBe('BULL')
  })

  it('affiche la progression', () => {
    const session = newSession()
    session.applyDart(S(1))
    expect(session.view.players[0]!.secondary[0]!.value).toBe('1/21')
  })
})

describe('intégration avec la session', () => {
  it('s’annule fléchette par fléchette', () => {
    const session = newSession()
    session.applyDart(S(1))
    session.applyDart(S(2))
    session.undo()
    expect(currentTarget(session.state, player(session.state, 'a'))).toBe(2)
  })

  it('se restaure à l’identique depuis un instantané (§4.4)', () => {
    const session = newSession()
    session.applyDart(S(1))
    session.applyDart(D(2))
    session.applyDart(T(3))
    const restaurée = GameSession.restore(
      aroundTheClockRule,
      JSON.parse(JSON.stringify(session.toSnapshot())),
    )
    expect(restaurée.state).toEqual(session.state)
  })
})

describe('validation de la saisie', () => {
  it('refuse une fléchette après la fin du parcours', () => {
    const session = newSession({ mode: 'any' })
    parcourir(session, (target) => S(target))
    expect(() => session.applyDart(S(1))).toThrow(/terminée/)
  })

  it('refuse une quatrième fléchette dans la même volée', () => {
    const state = aroundTheClockRule.createState(AROUND_THE_CLOCK_DEFAULT_CONFIG, PLAYERS)
    const volleePleine = { ...state, turnDarts: [S(1), S(1), S(1)] }
    expect(aroundTheClockRule.validateDart(volleePleine, S(1)).ok).toBe(false)
  })

  it('n’a plus de joueur actif une fois le parcours terminé', () => {
    const session = newSession({ mode: 'any' })
    parcourir(session, (target) => S(target))
    expect(session.view.activePlayerId).toBeNull()
    expect(session.view.players[0]!.primary).toBe('Fini')
  })
})
