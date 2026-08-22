import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { GameSession } from '../src/session.js'
import type { KillerConfig, KillerState } from '../src/games/killer.js'
import {
  KILLER_DEFAULT_CONFIG,
  assignKillerNumber,
  drawKillerNumbers,
  killerRule,
} from '../src/games/killer.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

const NUMEROS = { a: 20, b: 19 }

const newSession = (config: Partial<KillerConfig> = {}, players = PLAYERS) =>
  new GameSession(killerRule, { ...KILLER_DEFAULT_CONFIG, numbers: NUMEROS, ...config }, players)

const player = (state: KillerState, id: string) => state.players.find((p) => p.id === id)!

describe('attribution des numéros (§4.2)', () => {
  it('tire un numéro distinct par joueur', () => {
    const numbers = drawKillerNumbers([
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ])
    const values = Object.values(numbers)
    expect(values).toHaveLength(3)
    expect(new Set(values).size).toBe(3)
    for (const value of values) expect(value).toBeGreaterThanOrEqual(1)
    for (const value of values) expect(value).toBeLessThanOrEqual(20)
  })

  it('est reproductible quand le générateur l’est — le moteur reste rejouable', () => {
    // §3.3 et §4.4 : un journal rejoué doit redonner la même partie. C'est
    // pourquoi le tirage vit hors du moteur, avec un générateur injectable.
    const constant = () => 0.42
    const premier = drawKillerNumbers(PLAYERS, constant)
    const second = drawKillerNumbers(PLAYERS, constant)
    expect(premier).toEqual(second)
  })

  it('accepte l’attribution manuelle du lancer de la main faible', () => {
    const numbers = assignKillerNumber({}, 'a', 7)
    expect(numbers.a).toBe(7)
  })

  it('refuse un numéro déjà pris', () => {
    expect(() => assignKillerNumber({ a: 7 }, 'b', 7)).toThrow(/déjà attribué/)
  })

  it('refuse de jouer tant qu’un joueur n’a pas de numéro', () => {
    const session = newSession({ numbers: { a: 20 } })
    expect(() => session.applyDart(D(20))).toThrow(/pas encore de numéro/)
  })
})

describe('devenir killer', () => {
  it('exige de toucher le double de son propre numéro', () => {
    const session = newSession()
    session.applyDart(S(20))
    expect(player(session.state, 'a').isKiller).toBe(false)
    session.applyDart(T(20))
    expect(player(session.state, 'a').isKiller).toBe(false)
    session.applyDart(D(20))
    expect(player(session.state, 'a').isKiller).toBe(true)
  })

  it('ne devient pas killer en touchant le double d’un autre', () => {
    const session = newSession()
    session.applyDart(D(19))
    expect(player(session.state, 'a').isKiller).toBe(false)
    expect(player(session.state, 'b').lives).toBe(3)
  })
})

describe('retrait de vies', () => {
  it('un killer retire une vie en touchant le double d’un adversaire', () => {
    const session = newSession()
    session.applyDart(D(20)) // Adrien devient killer
    session.applyDart(D(19)) // et frappe Bruno
    expect(player(session.state, 'b').lives).toBe(2)
  })

  it('un non-killer ne retire rien', () => {
    const session = newSession()
    session.applyDart(D(19))
    session.applyDart(D(19))
    expect(player(session.state, 'b').lives).toBe(3)
  })

  it('un killer qui retouche son propre double perd une vie', () => {
    const session = newSession({ selfHitCostsLife: true })
    session.applyDart(D(20)) // killer
    session.applyDart(D(20)) // se punit
    expect(player(session.state, 'a').lives).toBe(2)
    expect(player(session.state, 'a').isKiller).toBe(true)
  })

  it('épargne le killer quand la variante est désactivée', () => {
    const session = newSession({ selfHitCostsLife: false })
    session.applyDart(D(20))
    session.applyDart(D(20))
    expect(player(session.state, 'a').lives).toBe(3)
  })

  it('respecte le nombre de vies paramétré (§4.2)', () => {
    const session = newSession({ lives: 1 })
    expect(player(session.state, 'b').lives).toBe(1)
  })
})

describe('élimination et victoire', () => {
  it('élimine un joueur à zéro vie et désigne le survivant', () => {
    const session = newSession({ lives: 2 })
    session.applyDart(D(20)) // Adrien killer
    session.applyDart(D(19)) // Bruno à 1
    session.applyDart(D(19)) // Bruno à 0 → éliminé

    expect(player(session.state, 'b').lives).toBe(0)
    expect(session.winnerId).toBe('a')
  })

  it('fait perdre son statut de killer à un joueur éliminé', () => {
    const trois = [
      { id: 'a', name: 'Adrien' },
      { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Chloé' },
    ]
    const session = newSession({ lives: 1, numbers: { a: 20, b: 19, c: 18 } }, trois)
    session.applyDart(D(19)) // Adrien pas encore killer : sans effet
    session.applyDart(D(20)) // Adrien killer
    session.applyDart(D(19)) // Bruno éliminé

    expect(player(session.state, 'b').lives).toBe(0)
    expect(player(session.state, 'b').isKiller).toBe(false)
    expect(session.winnerId).toBeNull() // Chloé est encore en vie
  })

  it('saute les joueurs éliminés dans l’ordre de jeu', () => {
    const trois = [
      { id: 'a', name: 'Adrien' },
      { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Chloé' },
    ]
    const session = newSession({ lives: 1, numbers: { a: 20, b: 19, c: 18 } }, trois)
    session.applyDart(D(20)) // killer
    session.applyDart(D(19)) // Bruno éliminé
    session.applyDart(S(1)) // fin de volée d'Adrien

    expect(session.view.activePlayerId).toBe('c')
  })

  it('termine le tour d’un joueur qui vient de s’éliminer lui-même', () => {
    const trois = [
      { id: 'a', name: 'Adrien' },
      { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Chloé' },
    ]
    const session = newSession({ lives: 1, numbers: { a: 20, b: 19, c: 18 } }, trois)
    session.applyDart(D(20)) // Adrien killer, 1 vie
    session.applyDart(D(20)) // il se punit → 0 vie, éliminé

    expect(player(session.state, 'a').lives).toBe(0)
    expect(session.view.activePlayerId).toBe('b')
  })
})

describe('affichage (§4.2)', () => {
  it('montre les vies, le numéro et le statut', () => {
    const session = newSession()
    session.applyDart(D(20))
    const vue = session.view.players[0]!
    expect(vue.primary).toBe('❤❤❤')
    expect(vue.secondary.find((s) => s.label === 'Numéro')!.value).toBe('D20')
    expect(vue.secondary.find((s) => s.label === 'Statut')!.value).toBe('Killer')
    expect(vue.extra!.isKiller).toBe(true)
  })

  it('affiche une tête de mort pour un joueur éliminé', () => {
    const trois = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    const session = newSession({ lives: 1, numbers: { a: 20, b: 19, c: 18 } }, trois)
    session.applyDart(D(20))
    session.applyDart(D(19))
    expect(session.view.players[1]!.primary).toBe('☠')
    expect(session.view.players[1]!.isFinished).toBe(true)
  })
})

describe('intégration avec la session', () => {
  it('exige la saisie fléchette par fléchette', () => {
    expect(killerRule.requiresDartDetail).toBe(true)
  })

  it('s’annule et se restaure comme les autres modes', () => {
    const session = newSession()
    session.applyDart(D(20))
    session.applyDart(D(19))
    expect(player(session.state, 'b').lives).toBe(2)

    session.undo()
    expect(player(session.state, 'b').lives).toBe(3)

    const restaurée = GameSession.restore(
      killerRule,
      JSON.parse(JSON.stringify(session.toSnapshot())),
    )
    expect(restaurée.state).toEqual(session.state)
  })
})

describe('validation de la saisie', () => {
  it('refuse une fléchette après la fin de la partie', () => {
    const session = newSession({ lives: 1 })
    session.applyDart(D(20))
    session.applyDart(D(19)) // Bruno éliminé, Adrien gagne
    expect(() => session.applyDart(S(1))).toThrow(/terminée/)
  })

  it('refuse une quatrième fléchette dans la même volée', () => {
    const state = killerRule.createState({ ...KILLER_DEFAULT_CONFIG, numbers: NUMEROS }, PLAYERS)
    const volleePleine = { ...state, turnDarts: [S(1), S(1), S(1)] }
    expect(killerRule.validateDart(volleePleine, D(20)).ok).toBe(false)
  })

  it('n’a plus de joueur actif une fois la partie gagnée', () => {
    const session = newSession({ lives: 1 })
    session.applyDart(D(20))
    session.applyDart(D(19))
    expect(session.view.activePlayerId).toBeNull()
  })
})
