/**
 * Modes de jeu secondaires — §4.2, #51 à #55.
 *
 * Les cinq modes « souhaités » du cahier des charges. Aucun n'a demandé de
 * modification du moteur : la suite de contrat de `games-registry.test.ts`
 * s'applique déjà aux neuf modes.
 */

import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { BULL } from '../src/dart.js'
import type { AnyGameRule } from '../src/rule.js'
import { GameSession } from '../src/session.js'
import { SHANGHAI_DEFAULT_CONFIG, shanghaiRule } from '../src/games/shanghai.js'
import type { ShanghaiState } from '../src/games/shanghai.js'
import { HALVE_IT_DEFAULT_CONFIG, formatHalveItTarget, halveItRule } from '../src/games/halve-it.js'
import type { HalveItState } from '../src/games/halve-it.js'
import { HIGH_SCORE_DEFAULT_CONFIG, highScoreRule } from '../src/games/high-score.js'
import type { HighScoreState } from '../src/games/high-score.js'
import { GOLF_DEFAULT_CONFIG, golfRule, strokesFor } from '../src/games/golf.js'
import type { GolfState } from '../src/games/golf.js'
import { BOBS_27_DEFAULT_CONFIG, bobs27Rule } from '../src/games/bobs27.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart
const MISS: Dart = { segment: 0, multiplier: 1 }

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

/** Récupère l'état d'un joueur en conservant son typage. */
function playerOf<T extends { id: string }>(state: { players: readonly T[] }, id: string): T {
  return state.players.find((player) => player.id === id)!
}

describe('Shanghai (§4.2, #51)', () => {
  const newSession = (config = {}) =>
    new GameSession(shanghaiRule, { ...SHANGHAI_DEFAULT_CONFIG, ...config }, PLAYERS)

  it('ne marque que sur le numéro de la manche', () => {
    const session = newSession()
    session.applyDart(T(1)) // manche 1 : 3 points
    session.applyDart(T(20)) // hors manche : rien
    expect(playerOf(session.state as ShanghaiState, 'a').score).toBe(3)
  })

  it('avance de manche quand tous les joueurs ont joué', () => {
    const session = newSession()
    for (let i = 0; i < 3; i += 1) session.applyDart(MISS) // Adrien
    expect((session.state as ShanghaiState).round).toBe(1)
    for (let i = 0; i < 3; i += 1) session.applyDart(MISS) // Bruno
    expect((session.state as ShanghaiState).round).toBe(2)
  })

  it('donne la victoire immédiate sur un shanghai', () => {
    const session = newSession()
    session.applyDart(S(1))
    session.applyDart(D(1))
    session.applyDart(T(1))
    expect(session.winnerId).toBe('a')
    expect(session.view.message).toContain('Shanghai')
  })

  it('reconnaît le shanghai quel que soit l’ordre des fléchettes', () => {
    const session = newSession()
    session.applyDart(T(1))
    session.applyDart(S(1))
    session.applyDart(D(1))
    expect(session.winnerId).toBe('a')
  })

  it('ne déclenche pas de shanghai quand la variante est désactivée', () => {
    const session = newSession({ shanghaiWins: false, rounds: 2 })
    session.applyDart(S(1))
    session.applyDart(D(1))
    session.applyDart(T(1))
    expect(session.winnerId).toBeNull()
  })

  it('désigne le meilleur score à la fin des manches', () => {
    const session = newSession({ rounds: 1, shanghaiWins: false })
    session.applyDart(T(1)) // Adrien : 3
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(S(1)) // Bruno : 1
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(session.winnerId).toBe('a')
  })
})

describe('Halve It (§4.2, #52)', () => {
  const newSession = (config = {}) =>
    new GameSession(halveItRule, { ...HALVE_IT_DEFAULT_CONFIG, ...config }, PLAYERS)

  it('démarre au score configuré', () => {
    expect(playerOf(newSession().state as HalveItState, 'a').score).toBe(40)
  })

  it('ajoute les points de la manche réussie', () => {
    const session = newSession()
    session.applyDart(T(20)) // cible : 20
    session.applyDart(S(20))
    session.applyDart(MISS)
    expect(playerOf(session.state as HalveItState, 'a').score).toBe(40 + 80)
  })

  /** Le cœur du mode : une manche vierge coûte la moitié du capital. */
  it('divise le score par deux sur une manche vierge', () => {
    const session = newSession()
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(playerOf(session.state as HalveItState, 'a').score).toBe(20)
    expect(session.view.message).toContain('divisé par deux')
  })

  it('arrondit la division vers le bas', () => {
    const session = newSession({ startingScore: 25 })
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(playerOf(session.state as HalveItState, 'a').score).toBe(12)
  })

  it('accepte les cibles par catégorie : doubles, triples, bull', () => {
    const session = newSession({ targets: [{ kind: 'double' }] })
    session.applyDart(D(3)) // n'importe quel double compte
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(playerOf(session.state as HalveItState, 'a').score).toBe(46)
  })

  it('compte le bull quel que soit le multiplicateur', () => {
    const session = newSession({ targets: [{ kind: 'bull' }] })
    session.applyDart({ segment: BULL, multiplier: 2 })
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(playerOf(session.state as HalveItState, 'a').score).toBe(90)
  })

  it('nomme les cibles pour l’affichage', () => {
    expect(formatHalveItTarget({ kind: 'number', value: 20 })).toBe('20')
    expect(formatHalveItTarget({ kind: 'double' })).toBe('Doubles')
    expect(formatHalveItTarget({ kind: 'triple' })).toBe('Triples')
    expect(formatHalveItTarget({ kind: 'bull' })).toBe('Bull')
  })

  it('donne la victoire au plus haut score à la fin de la liste', () => {
    const session = newSession({ targets: [{ kind: 'number', value: 20 }] })
    session.applyDart(T(20)) // Adrien : 40 + 60
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS) // Bruno : manche vierge, 40 → 20
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(session.winnerId).toBe('a')
  })
})

describe('High Score (§4.2, #54)', () => {
  const newSession = (config = {}) =>
    new GameSession(highScoreRule, { ...HIGH_SCORE_DEFAULT_CONFIG, ...config }, PLAYERS)

  it('accepte la saisie par volée — aucun détail requis', () => {
    expect(highScoreRule.requiresDartDetail).toBe(false)
    const session = newSession({ rounds: 2 })
    session.applyTurnTotal(180)
    expect(playerOf(session.state as HighScoreState, 'a').score).toBe(180)
  })

  it('accepte aussi la saisie fléchette par fléchette', () => {
    const session = newSession({ rounds: 2 })
    session.applyDart(T(20))
    session.applyDart(T(20))
    session.applyDart(T(20))
    expect(playerOf(session.state as HighScoreState, 'a').score).toBe(180)
  })

  it('signale les paliers (§4.9)', () => {
    const session = newSession({ rounds: 2 })
    const result = session.applyTurnTotal(180)
    expect(result.effects).toContainEqual({ type: 'milestone', playerId: 'a', label: '180' })
  })

  it('attend que tout le monde ait joué le même nombre de manches', () => {
    const session = newSession({ rounds: 1 })
    session.applyTurnTotal(180) // Adrien a fini sa manche
    expect(session.isFinished).toBe(false)
    session.applyTurnTotal(60) // Bruno aussi
    expect(session.winnerId).toBe('a')
  })

  it('retient la meilleure volée', () => {
    const session = newSession({ rounds: 3 })
    session.applyTurnTotal(100)
    session.applyTurnTotal(26)
    session.applyTurnTotal(140)
    expect(playerOf(session.state as HighScoreState, 'a').bestTurn).toBe(140)
  })

  it('ignore un total impossible', () => {
    const session = newSession({ rounds: 2 })
    session.applyTurnTotal(179)
    expect(playerOf(session.state as HighScoreState, 'a').score).toBe(0)
  })
})

describe('Golf (§4.2, #55)', () => {
  const newSession = (config = {}) =>
    new GameSession(golfRule, { ...GOLF_DEFAULT_CONFIG, ...config }, PLAYERS)

  it('applique le barème documenté', () => {
    expect(strokesFor(T(1), 1)).toBe(1)
    expect(strokesFor(D(1), 1)).toBe(2)
    expect(strokesFor(S(1), 1)).toBe(3)
    expect(strokesFor(S(5), 1)).toBe(5) // mauvais numéro
    expect(strokesFor(MISS, 1)).toBe(5)
  })

  it('ne retient que la meilleure fléchette du trou', () => {
    const session = newSession({ holes: 1 })
    session.applyDart(MISS) // 5
    session.applyDart(D(1)) // 2
    session.applyDart(S(1)) // 3 — la meilleure reste 2
    expect(playerOf(session.state as GolfState, 'a').strokes).toBe(2)
  })

  it('compte cinq coups sur un trou totalement manqué', () => {
    const session = newSession({ holes: 1 })
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(playerOf(session.state as GolfState, 'a').strokes).toBe(5)
  })

  it('donne la victoire au score le plus bas', () => {
    const session = newSession({ holes: 1 })
    session.applyDart(T(1)) // Adrien : 1 coup
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS) // Bruno : 5 coups
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(session.winnerId).toBe('a')
  })

  it('annonce l’écart au par, comme au golf', () => {
    const session = newSession({ holes: 2 })
    session.applyDart(T(1))
    session.applyDart(MISS)
    session.applyDart(MISS)
    const vue = session.view.players.find((player) => player.playerId === 'a')!
    // Un trou joué en 1 coup pour un par de 3 : deux sous le par.
    expect(vue.secondary.find((stat) => stat.label === 'Par')?.value).toBe('-2')
  })

  it('avance de trou quand tous ont joué', () => {
    const session = newSession({ holes: 2 })
    for (let i = 0; i < 3; i += 1) session.applyDart(MISS)
    expect((session.state as GolfState).hole).toBe(1)
    for (let i = 0; i < 3; i += 1) session.applyDart(MISS)
    expect((session.state as GolfState).hole).toBe(2)
  })
})

describe("Bob's 27 en mode de jeu (§4.2, #53)", () => {
  const newSession = (config = {}) =>
    new GameSession(bobs27Rule, { ...BOBS_27_DEFAULT_CONFIG, ...config }, PLAYERS)

  it('démarre chaque joueur à 27 sur le D1', () => {
    const session = newSession()
    const vue = session.view.players[0]!
    expect(vue.primary).toBe('27')
    expect(vue.secondary.find((stat) => stat.label === 'Cible')?.value).toBe('D1')
  })

  /** Une seule implémentation du barème, partagée avec l'exercice du §4.5. */
  it('applique le même barème que l’exercice', () => {
    const session = newSession()
    session.applyDart(D(1))
    session.applyDart(D(1))
    session.applyDart(MISS)
    expect(session.view.players[0]!.primary).toBe('31') // 27 + 2 × 2
  })

  it('passe la main après trois fléchettes', () => {
    const session = newSession()
    for (let i = 0; i < 3; i += 1) session.applyDart(MISS)
    expect(session.view.activePlayerId).toBe('b')
  })

  it('saute un joueur dont le parcours est terminé', () => {
    const session = newSession({ stopOnNegative: true })
    // Adrien rate tout jusqu'à passer sous zéro.
    let garde = 0
    while (session.view.activePlayerId === 'a' && garde < 100) {
      session.applyDart(MISS)
      garde += 1
    }
    expect(session.view.activePlayerId).toBe('b')
  })

  it('désigne le meilleur score quand tout le monde a fini', () => {
    const session = newSession({ stopOnNegative: true })
    let garde = 0
    while (!session.isFinished && garde < 400) {
      session.applyDart(MISS)
      garde += 1
    }
    expect(session.isFinished).toBe(true)
    expect(session.winnerId).not.toBeNull()
  })

  it('conserve un état sérialisable malgré l’état d’exercice imbriqué', () => {
    const session = newSession()
    session.applyDart(D(1))
    const restored = GameSession.restore(
      bobs27Rule,
      JSON.parse(JSON.stringify(session.toSnapshot())),
    )
    expect(restored.state).toEqual(session.state)
  })
})

describe('composition avec les legs et les sets (§4.4)', () => {
  it('les modes secondaires s’enveloppent dans un match comme les autres', async () => {
    const { createMatchRule } = await import('../src/match.js')
    const matchGolf = createMatchRule(golfRule)
    const session = new GameSession(
      matchGolf,
      { ruleConfig: { holes: 1 }, legsToWin: 2, setsToWin: 1, alternateStart: false },
      PLAYERS,
    )
    session.applyDart(T(1))
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    // Adrien gagne le premier leg, la partie continue.
    expect(session.isFinished).toBe(false)
  })
})

describe('validation et cas limites des modes secondaires', () => {
  // Typé volontairement en `AnyGameRule` : ces vérifications portent sur le
  // contrat commun, pas sur l'état propre à chaque mode.
  const RULES: { rule: AnyGameRule; config: unknown }[] = [
    { rule: shanghaiRule, config: SHANGHAI_DEFAULT_CONFIG },
    { rule: halveItRule, config: HALVE_IT_DEFAULT_CONFIG },
    { rule: highScoreRule, config: HIGH_SCORE_DEFAULT_CONFIG },
    { rule: golfRule, config: GOLF_DEFAULT_CONFIG },
    { rule: bobs27Rule, config: BOBS_27_DEFAULT_CONFIG },
  ]

  it.each(RULES.map((entry) => [entry.rule.label, entry] as const))(
    '%s refuse une fléchette impossible et une quatrième dans la volée',
    (_label, entry) => {
      const state = entry.rule.createState(entry.config, PLAYERS)
      expect(entry.rule.validateDart(state, { segment: BULL, multiplier: 3 }).ok).toBe(false)

      const pleine = { ...state, turnDarts: [MISS, MISS, MISS] }
      expect(entry.rule.validateDart(pleine, S(20)).ok).toBe(false)
    },
  )

  it.each(RULES.map((entry) => [entry.rule.label, entry] as const))(
    '%s n’applique plus rien une fois la partie gagnée',
    (_label, entry) => {
      const state = entry.rule.createState(entry.config, PLAYERS)
      const termine = { ...state, winnerId: 'a' }
      expect(entry.rule.validateDart(termine, S(20)).ok).toBe(false)
      expect(entry.rule.applyDart(termine, S(20)).effects).toHaveLength(0)
      expect(entry.rule.view(termine).activePlayerId).toBeNull()
      expect(entry.rule.view(termine).isFinished).toBe(true)
    },
  )

  it('High Score ignore une volée après la fin', () => {
    const session = new GameSession(highScoreRule, { rounds: 1 }, PLAYERS)
    session.applyTurnTotal(180)
    session.applyTurnTotal(60)
    expect(session.isFinished).toBe(true)
    const avant = JSON.stringify(session.state)
    expect(highScoreRule.applyTurnTotal!(session.state, 100).effects).toHaveLength(0)
    expect(JSON.stringify(session.state)).toBe(avant)
  })

  it('High Score borne le nombre de fléchettes déclaré', () => {
    const session = new GameSession(highScoreRule, { rounds: 2 }, PLAYERS)
    session.applyTurnTotal(60, 99)
    expect(playerOf(session.state as HighScoreState, 'a').dartsThrown).toBe(3)
    session.applyTurnTotal(60, 0)
    expect(playerOf(session.state as HighScoreState, 'b').dartsThrown).toBe(1)
  })

  it('Halve It s’arrête si la liste de cibles est épuisée en cours de volée', () => {
    const session = new GameSession(
      halveItRule,
      { ...HALVE_IT_DEFAULT_CONFIG, targets: [{ kind: 'number', value: 20 }] },
      PLAYERS,
    )
    for (let i = 0; i < 6; i += 1) session.applyDart(S(20))
    expect(session.isFinished).toBe(true)
    expect(halveItRule.applyDart(session.state, S(20)).effects).toHaveLength(0)
  })

  it('Golf compte le par correctement au-dessus et en dessous', () => {
    const session = new GameSession(golfRule, { holes: 2 }, PLAYERS)
    for (let i = 0; i < 3; i += 1) session.applyDart(MISS) // Adrien : 5 coups, +2
    const vue = session.view.players.find((player) => player.playerId === 'a')!
    expect(vue.secondary.find((stat) => stat.label === 'Par')?.value).toBe('+2')
  })

  it('Golf affiche « = » quand le score est au par', () => {
    const session = new GameSession(golfRule, { holes: 2 }, PLAYERS)
    session.applyDart(S(1)) // 3 coups = le par
    session.applyDart(MISS)
    session.applyDart(MISS)
    const vue = session.view.players.find((player) => player.playerId === 'a')!
    expect(vue.secondary.find((stat) => stat.label === 'Par')?.value).toBe('=')
  })

  it('Shanghai n’a plus de message une fois la partie gagnée', () => {
    const session = new GameSession(shanghaiRule, { rounds: 1, shanghaiWins: false }, PLAYERS)
    for (let i = 0; i < 6; i += 1) session.applyDart(MISS)
    expect(session.isFinished).toBe(true)
    expect(session.view.message).toBeUndefined()
  })

  it("Bob's 27 en mode de jeu ignore une fléchette après la fin", () => {
    const session = new GameSession(bobs27Rule, BOBS_27_DEFAULT_CONFIG, PLAYERS)
    let garde = 0
    while (!session.isFinished && garde < 400) {
      session.applyDart(MISS)
      garde += 1
    }
    expect(bobs27Rule.applyDart(session.state, D(1)).effects).toHaveLength(0)
  })
})
