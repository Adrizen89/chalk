/**
 * Legs et sets — §4.4, #28.
 *
 * Le match est lui-même une règle de jeu : c'est ce qui lui fait hériter
 * gratuitement de l'undo, de la reprise et de la persistance. Ces tests
 * vérifient à la fois les règles de match et le fait que cet héritage tient.
 */

import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { GameSession } from '../src/session.js'
import type { MatchConfig, MatchState } from '../src/match.js'
import {
  MATCH_RULE_PREFIX,
  baseRuleId,
  bestOf,
  createMatchRule,
  isMatchRuleId,
  isSingleLeg,
  legStateOf,
} from '../src/match.js'
import { findRule } from '../src/games/index.js'
import type { X01Config, X01State } from '../src/games/x01.js'
import { X01_DEFAULT_CONFIG, suggestCheckout, x01Rule } from '../src/games/x01.js'
import { cricketRule } from '../src/games/cricket.js'
import { formatPath } from '../src/checkout.js'

const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart
const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

const matchX01 = createMatchRule(x01Rule)

type X01Match = MatchState<X01Config, X01State>

function newMatch(config: Partial<MatchConfig<X01Config>> = {}, players = PLAYERS) {
  const full: MatchConfig<X01Config> = {
    ruleConfig: { ...X01_DEFAULT_CONFIG, startingScore: 40 },
    legsToWin: 1,
    setsToWin: 1,
    alternateStart: true,
    ...config,
  }
  return new GameSession(matchX01, full, players)
}

/** Fait gagner un leg au joueur actif : un double 20 sur un départ à 40. */
function winLeg(session: ReturnType<typeof newMatch>) {
  session.applyDart(D(20))
}

const state = (session: ReturnType<typeof newMatch>) => session.state as X01Match

describe('« au meilleur des N »', () => {
  it('convertit en nombre de manches à gagner', () => {
    expect(bestOf(1)).toBe(1)
    expect(bestOf(3)).toBe(2)
    expect(bestOf(5)).toBe(3)
    expect(bestOf(7)).toBe(4)
    expect(bestOf(11)).toBe(6)
  })

  it('se protège des valeurs absurdes', () => {
    expect(bestOf(0)).toBe(1)
    expect(bestOf(-4)).toBe(1)
    expect(bestOf(2.7)).toBe(1)
  })

  it('reconnaît un match à manche unique', () => {
    const single: MatchConfig<unknown> = {
      ruleConfig: {},
      legsToWin: 1,
      setsToWin: 1,
      alternateStart: true,
    }
    expect(isSingleLeg(single)).toBe(true)
    expect(isSingleLeg({ ...single, legsToWin: 3 })).toBe(false)
    expect(isSingleLeg({ ...single, setsToWin: 2 })).toBe(false)
  })
})

describe('enchaînement des legs', () => {
  it('ne termine pas le match sur le premier leg quand il en faut trois', () => {
    const session = newMatch({ legsToWin: 3 })
    winLeg(session)

    expect(session.isFinished).toBe(false)
    expect(state(session).legsWon.a).toBe(1)
    expect(state(session).legNumber).toBe(2)
  })

  it('réinitialise les scores à chaque nouveau leg', () => {
    const session = newMatch({ legsToWin: 3 })
    winLeg(session)
    expect(state(session).leg.players.every((player) => player.score === 40)).toBe(true)
  })

  it('déclare le vainqueur au dernier leg', () => {
    const session = newMatch({ legsToWin: 2, alternateStart: false })
    winLeg(session) // Adrien mène 1-0
    expect(session.isFinished).toBe(false)
    winLeg(session) // Adrien 2-0
    expect(session.winnerId).toBe('a')
  })

  it('refuse toute fléchette une fois le match terminé', () => {
    const session = newMatch({ legsToWin: 1 })
    winLeg(session)
    expect(() => session.applyDart(D(20))).toThrow(/match est terminé/)
  })
})

describe('alternance du joueur qui commence (§4.4)', () => {
  it('fait commencer l’autre joueur au leg suivant', () => {
    const session = newMatch({ legsToWin: 3, alternateStart: true })
    expect(session.view.activePlayerId).toBe('a')

    winLeg(session)
    expect(session.view.activePlayerId).toBe('b')

    // Bruno gagne le sien : c'est de nouveau à Adrien de commencer.
    winLeg(session)
    expect(session.view.activePlayerId).toBe('a')
  })

  it('garde le même joueur au départ quand l’alternance est désactivée', () => {
    const session = newMatch({ legsToWin: 3, alternateStart: false })
    winLeg(session)
    expect(session.view.activePlayerId).toBe('a')
  })

  it('alterne indépendamment de qui a gagné le leg', () => {
    const session = newMatch({ legsToWin: 5, alternateStart: true })
    // Adrien commence et perd son leg : Bruno gagne, mais c'est à Bruno de
    // commencer le suivant de toute façon.
    session.applyDart(S(1))
    session.applyDart(S(1))
    session.applyDart(S(1))
    winLeg(session) // Bruno gagne le leg 1
    expect(state(session).legsWon.b).toBe(1)
    expect(session.view.activePlayerId).toBe('b')
  })

  it('tourne correctement à plus de deux joueurs', () => {
    const trois = [
      { id: 'a', name: 'Adrien' },
      { id: 'b', name: 'Bruno' },
      { id: 'c', name: 'Chloé' },
    ]
    const session = newMatch({ legsToWin: 4, alternateStart: true }, trois)
    expect(session.view.activePlayerId).toBe('a')
    winLeg(session)
    expect(session.view.activePlayerId).toBe('b')
    winLeg(session)
    expect(session.view.activePlayerId).toBe('c')
    winLeg(session)
    expect(session.view.activePlayerId).toBe('a')
  })
})

describe('sets', () => {
  it('remporte un set une fois les legs gagnés, et repart à zéro', () => {
    const session = newMatch({ legsToWin: 2, setsToWin: 2, alternateStart: false })
    winLeg(session)
    winLeg(session)

    expect(session.isFinished).toBe(false)
    expect(state(session).setsWon.a).toBe(1)
    expect(state(session).legsWon.a).toBe(0)
    expect(state(session).setNumber).toBe(2)
    expect(state(session).legNumber).toBe(1)
  })

  it('remporte le match au dernier set', () => {
    const session = newMatch({ legsToWin: 2, setsToWin: 2, alternateStart: false })
    for (let i = 0; i < 4; i += 1) winLeg(session)
    expect(session.winnerId).toBe('a')
    expect(state(session).setsWon.a).toBe(2)
  })
})

describe('effets annoncés (§4.9)', () => {
  it('annonce le leg sans annoncer le match', () => {
    const session = newMatch({ legsToWin: 3 })
    const result = session.applyDart(D(20))
    const types = result.effects.map((effect) => effect.type)

    expect(types).toContain('leg-won')
    expect(types).not.toContain('set-won')
    expect(types).not.toContain('game-won')
  })

  it('annonce le set puis le match au bon moment', () => {
    const session = newMatch({ legsToWin: 1, setsToWin: 2, alternateStart: false })
    const premier = session.applyDart(D(20)).effects.map((e) => e.type)
    expect(premier).toEqual(expect.arrayContaining(['leg-won', 'set-won']))
    expect(premier).not.toContain('game-won')

    const second = session.applyDart(D(20)).effects.map((e) => e.type)
    expect(second).toEqual(expect.arrayContaining(['leg-won', 'set-won', 'game-won']))
  })

  it('laisse passer les effets de la manche : bust et paliers', () => {
    const session = newMatch({
      legsToWin: 3,
      ruleConfig: { ...X01_DEFAULT_CONFIG, startingScore: 501 },
    })
    session.applyDart(T(20))
    session.applyDart(T(20))
    const troisieme = session.applyDart(T(20))
    expect(troisieme.effects).toContainEqual({ type: 'milestone', playerId: 'a', label: '180' })
  })
})

describe('affichage (§4.3)', () => {
  it('ajoute les legs au tableau de score', () => {
    const session = newMatch({ legsToWin: 3, alternateStart: false })
    winLeg(session)
    const adrien = session.view.players.find((player) => player.playerId === 'a')!
    expect(adrien.secondary.find((stat) => stat.label === 'Legs')?.value).toBe('1')
  })

  it('n’affiche les sets que lorsqu’il y en a', () => {
    const sansSets = newMatch({ legsToWin: 3 })
    expect(sansSets.view.players[0]!.secondary.some((s) => s.label === 'Sets')).toBe(false)

    const avecSets = newMatch({ legsToWin: 2, setsToWin: 2 })
    expect(avecSets.view.players[0]!.secondary.some((s) => s.label === 'Sets')).toBe(true)
  })

  it('garde l’ordre d’affichage des joueurs stable malgré l’alternance', () => {
    const session = newMatch({ legsToWin: 3, alternateStart: true })
    expect(session.view.players.map((p) => p.playerId)).toEqual(['a', 'b'])
    winLeg(session)
    // Bruno commence désormais, mais Adrien reste affiché en premier.
    expect(session.view.players.map((p) => p.playerId)).toEqual(['a', 'b'])
    expect(session.view.activePlayerId).toBe('b')
  })

  it('annonce le leg gagné par un message court, non bloquant (§5)', () => {
    const session = newMatch({ legsToWin: 3 })
    winLeg(session)
    expect(session.view.message).toBe('Adrien remporte le leg.')
  })

  it('efface le message dès la fléchette suivante', () => {
    const session = newMatch({ legsToWin: 3 })
    winLeg(session)
    expect(session.view.message).toContain('remporte le leg')

    session.applyDart(S(1))
    expect(session.view.message).toBeUndefined()
  })
})

describe('héritage des mécanismes du moteur', () => {
  it('s’annule à travers une frontière de leg (§4.3)', () => {
    const session = newMatch({ legsToWin: 3, alternateStart: true })
    winLeg(session)
    expect(state(session).legsWon.a).toBe(1)
    expect(session.view.activePlayerId).toBe('b')

    session.undo()
    expect(state(session).legsWon.a).toBe(0)
    expect(state(session).legNumber).toBe(1)
    expect(session.view.activePlayerId).toBe('a')
    expect(state(session).leg.players[0]!.score).toBe(40)
  })

  it('se restaure à l’identique depuis un instantané (§4.4)', () => {
    const session = newMatch({ legsToWin: 3, alternateStart: true })
    winLeg(session)
    session.applyDart(S(5))

    const restored = GameSession.restore(matchX01, JSON.parse(JSON.stringify(session.toSnapshot())))
    expect(restored.state).toEqual(session.state)
  })

  it('est retrouvée par le registre à partir de son identifiant (#18)', () => {
    expect(matchX01.id).toBe(`${MATCH_RULE_PREFIX}x01`)
    const found = findRule(matchX01.id)
    expect(found?.id).toBe(matchX01.id)
    expect(found?.label).toBe('X01')
  })

  it('renvoie undefined pour une règle enveloppée inconnue', () => {
    expect(findRule(`${MATCH_RULE_PREFIX}inexistant`)).toBeUndefined()
  })
})

describe('composition avec les autres modes (§4.2)', () => {
  it('enveloppe le Cricket sans le modifier', () => {
    const matchCricket = createMatchRule(cricketRule)
    expect(matchCricket.requiresDartDetail).toBe(true)
    expect(matchCricket.applyTurnTotal).toBeUndefined()

    const session = new GameSession(
      matchCricket,
      {
        ruleConfig: { variant: 'standard' as const, targets: [20] },
        legsToWin: 2,
        setsToWin: 1,
        alternateStart: false,
      },
      PLAYERS,
    )
    session.applyDart(T(20)) // Adrien ferme le 20 : leg gagné
    expect(session.isFinished).toBe(false)
    session.applyDart(T(20))
    expect(session.winnerId).toBe('a')
  })

  it('expose la saisie par volée quand la règle sous-jacente le permet (§4.3)', () => {
    expect(matchX01.applyTurnTotal).toBeDefined()
    const session = newMatch({
      legsToWin: 2,
      alternateStart: false,
      ruleConfig: { ...X01_DEFAULT_CONFIG, startingScore: 100 },
    })
    session.applyTurnTotal(100, 3)
    expect(state(session).legsWon.a).toBe(1)
    expect(session.isFinished).toBe(false)
  })
})

describe('reconnaître la règle sous-jacente', () => {
  /**
   * Régression : envelopper une règle dans un match change son identifiant
   * (`x01` devient `match:x01`). L'interface, qui adapte son affichage au mode
   * — suggestions de sortie, tableau de marques du Cricket — ne reconnaissait
   * plus rien et faisait disparaître ces affichages **sans aucune erreur**.
   */
  it('distingue une règle enveloppée d’une règle nue', () => {
    expect(isMatchRuleId('match:x01')).toBe(true)
    expect(isMatchRuleId('x01')).toBe(false)
  })

  it('retrouve l’identifiant de la règle sous-jacente', () => {
    expect(baseRuleId('match:x01')).toBe('x01')
    expect(baseRuleId('match:cricket')).toBe('cricket')
    expect(baseRuleId('x01')).toBe('x01')
  })

  it('extrait l’état de la manche, que la règle soit enveloppée ou non', () => {
    const match = newMatch({ legsToWin: 3 })
    match.applyDart(S(5))
    const leg = legStateOf<X01State>(matchX01.id, match.state)
    expect(leg.players[0]!.score).toBe(35)

    const nue = new GameSession(x01Rule, { ...X01_DEFAULT_CONFIG, startingScore: 40 }, PLAYERS)
    nue.applyDart(S(5))
    expect(legStateOf<X01State>(x01Rule.id, nue.state).players[0]!.score).toBe(35)
  })

  it('permet aux suggestions de sortie de fonctionner dans un match (§4.3)', () => {
    const session = newMatch({
      legsToWin: 3,
      ruleConfig: { ...X01_DEFAULT_CONFIG, startingScore: 170 },
    })
    const leg = legStateOf<X01State>(matchX01.id, session.state)
    const suggestion = suggestCheckout(leg)
    expect(suggestion).not.toBeNull()
    expect(formatPath(suggestion!.best)).toBe('T20 T20 BULL')
  })
})
