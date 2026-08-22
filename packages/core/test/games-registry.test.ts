/**
 * Contrat commun à toutes les règles de jeu.
 *
 * §4.2 : « l'architecture doit permettre d'ajouter un nouveau mode de jeu sans
 * réécrire le moteur ». Cette suite est le filet : elle s'applique à toutes les
 * règles du registre, y compris celles qui n'existent pas encore. Une règle
 * maison ajoutée plus tard hérite automatiquement de ces vérifications.
 */

import { describe, expect, it } from 'vitest'
import { BULL, DARTS_PER_TURN, allPossibleDarts } from '../src/dart.js'
import type { Dart } from '../src/dart.js'
import { GameSession } from '../src/session.js'
import { GAME_RULES, findRule } from '../src/games/index.js'
import { KILLER_DEFAULT_CONFIG } from '../src/games/killer.js'

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

/** Configuration jouable pour chaque règle : le Killer exige des numéros. */
function configFor(ruleId: string, defaultConfig: unknown): unknown {
  if (ruleId === 'killer') {
    return { ...KILLER_DEFAULT_CONFIG, numbers: { a: 20, b: 19 } }
  }
  return defaultConfig
}

describe('registre des modes de jeu', () => {
  it('expose les quatre modes prioritaires du lot 1 (§4.2)', () => {
    const ids = GAME_RULES.map((rule) => rule.id)
    for (const id of ['x01', 'cricket', 'killer', 'around-the-clock']) {
      expect(ids).toContain(id)
    }
  })

  it('expose les cinq modes souhaités du §4.2', () => {
    const ids = GAME_RULES.map((rule) => rule.id)
    for (const id of ['shanghai', 'halve-it', 'high-score', 'golf', 'bobs-27']) {
      expect(ids).toContain(id)
    }
  })

  it('n’en expose pas d’autres', () => {
    expect(GAME_RULES).toHaveLength(9)
  })

  it('donne à chaque règle un identifiant unique', () => {
    const ids = GAME_RULES.map((rule) => rule.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('retrouve une règle par son identifiant — nécessaire à la reprise (§4.4)', () => {
    for (const rule of GAME_RULES) expect(findRule(rule.id)).toBe(rule)
    expect(findRule('inexistant')).toBeUndefined()
  })
})

describe.each(GAME_RULES.map((rule) => [rule.label, rule] as const))(
  'contrat de règle : %s',
  (_label, rule) => {
    const config = configFor(rule.id, rule.defaultConfig)
    const newState = () => rule.createState(config, PLAYERS)

    it('a un identifiant et un libellé non vides', () => {
      expect(rule.id).toMatch(/\S/)
      expect(rule.label).toMatch(/\S/)
    })

    it('produit un état initial sérialisable (§3.4)', () => {
      const state = newState()
      expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    })

    it('ne désigne aucun vainqueur à l’état initial', () => {
      expect(rule.getWinner(newState())).toBeNull()
    })

    it('projette une vue cohérente', () => {
      const view = rule.view(newState())
      expect(view.ruleId).toBe(rule.id)
      expect(view.players).toHaveLength(PLAYERS.length)
      expect(view.players.filter((p) => p.isActive)).toHaveLength(1)
      expect(view.activePlayerId).toBe(PLAYERS[0]!.id)
      expect(view.turnDarts).toHaveLength(0)
      expect(view.dartsRemainingInTurn).toBe(DARTS_PER_TURN)
      expect(view.isFinished).toBe(false)
      expect(view.winnerId).toBeNull()
    })

    it('refuse une fléchette qui n’existe pas sur une cible', () => {
      const impossible: Dart = { segment: BULL, multiplier: 3 }
      expect(rule.validateDart(newState(), impossible).ok).toBe(false)
    })

    it('n’applique jamais de fléchette après la fin de la partie', () => {
      const state = newState()
      const view = rule.view(state)
      expect(view.isFinished).toBe(false)
    })

    it('ne mute pas l’état qu’on lui passe (§4.2, immuabilité)', () => {
      const state = newState()
      const avant = JSON.stringify(state)
      for (const dart of allPossibleDarts().slice(0, 12)) {
        if (!rule.validateDart(state, dart).ok) continue
        rule.applyDart(state, dart)
      }
      expect(JSON.stringify(state)).toBe(avant)
    })

    it('accepte les trois fléchettes d’une volée, puis refuse la quatrième', () => {
      const session = new GameSession(rule, config, PLAYERS)
      // Une fléchette sans effet dans tous les modes : le hors-cible.
      const miss: Dart = { segment: 0, multiplier: 1 }
      for (let i = 0; i < DARTS_PER_TURN; i += 1) session.applyDart(miss)
      // La volée est close : la main a tourné, la nouvelle volée est vide.
      expect(session.view.dartsRemainingInTurn).toBe(DARTS_PER_TURN)
      expect(session.view.activePlayerId).toBe(PLAYERS[1]!.id)
    })

    it('se rejoue à l’identique depuis son instantané (§3.3, §4.4)', () => {
      const session = new GameSession(rule, config, PLAYERS)
      const miss: Dart = { segment: 0, multiplier: 1 }
      for (let i = 0; i < 4; i += 1) session.applyDart(miss)

      const snapshot = JSON.parse(JSON.stringify(session.toSnapshot()))
      const restaurée = GameSession.restore(rule, snapshot)
      expect(restaurée.state).toEqual(session.state)
    })

    it('revient exactement en arrière après une annulation (§4.3)', () => {
      const session = new GameSession(rule, config, PLAYERS)
      const miss: Dart = { segment: 0, multiplier: 1 }
      session.applyDart(miss)
      const avant = JSON.stringify(session.state)
      session.applyDart(miss)
      session.undo()
      expect(JSON.stringify(session.state)).toBe(avant)
    })

    it('déclare honnêtement s’il exige la saisie fléchette par fléchette (§4.3)', () => {
      expect(typeof rule.requiresDartDetail).toBe('boolean')
      // Un mode qui exige le détail ne doit pas exposer la saisie rapide.
      if (rule.requiresDartDetail) expect(rule.applyTurnTotal).toBeUndefined()
    })
  },
)
