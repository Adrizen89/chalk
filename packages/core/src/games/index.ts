/**
 * Registre des modes de jeu.
 *
 * Un instantané de partie ne porte que l'identifiant de sa règle (§3.4) : c'est
 * ici qu'on la retrouve pour rejouer le journal à la reprise (§4.4) ou après
 * réception depuis un autre appareil (§3.3).
 *
 * Ajouter un mode de jeu = un module implémentant `GameRule`, plus une ligne
 * ici. Rien d'autre à toucher — c'est l'exigence structurante du §4.2.
 */

import type { GameRule } from '../rule.js'
import { aroundTheClockRule } from './around-the-clock.js'
import { cricketRule } from './cricket.js'
import { killerRule } from './killer.js'
import { x01Rule } from './x01.js'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyGameRule = GameRule<any, any>

export const GAME_RULES: readonly AnyGameRule[] = [
  x01Rule,
  cricketRule,
  killerRule,
  aroundTheClockRule,
]

export function findRule(ruleId: string): AnyGameRule | undefined {
  return GAME_RULES.find((rule) => rule.id === ruleId)
}

export * from './x01.js'
export * from './cricket.js'
export * from './killer.js'
export * from './around-the-clock.js'
