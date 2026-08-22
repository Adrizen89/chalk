/**
 * Bob's 27 — §4.5 et §4.2.
 *
 * « Doubles de D1 à D20 puis bull ; score de départ 27 ; entraînement aux
 *   doubles. » Chaque manche ratée coûte des points.
 *
 * L'exercice apparaît deux fois dans le cahier des charges : comme mode de jeu
 * (§4.2) et comme exercice d'entraînement (§4.5). Une seule implémentation,
 * exposée aux deux endroits.
 */

import type { Segment } from '../dart.js'
import { BULL, isDouble } from '../dart.js'
import type {
  ExerciseApplyResult,
  ExerciseEffect,
  ExerciseResult,
  ExerciseRule,
  ExerciseView,
} from './exercise.js'

export const BOBS_27_START = 27
const DARTS_PER_ROUND = 3

/** D1 à D20, puis le bull. */
const SEQUENCE: readonly Segment[] = [
  ...Array.from({ length: 20 }, (_, i) => (i + 1) as Segment),
  BULL,
]

export interface Bobs27State {
  readonly score: number
  readonly roundIndex: number
  readonly dartsInRound: number
  readonly hitsInRound: number
  readonly dartsThrown: number
  readonly hits: number
  readonly attempts: number
  readonly bestStreak: number
  readonly streak: number
  /** Le score est passé sous zéro : l'exercice s'arrête (variante classique). */
  readonly busted: boolean
}

const targetOf = (roundIndex: number) => SEQUENCE[roundIndex] ?? null

/** Valeur du double visé : 2×N, ou 50 pour le bull. */
const doubleValue = (segment: Segment) => segment * 2

export interface Bobs27Options {
  /** Variante : s'arrêter dès que le score passe sous zéro. */
  readonly stopOnNegative: boolean
}

export function createBobs27(options: Bobs27Options = { stopOnNegative: true }) {
  const rule: ExerciseRule<Bobs27State> = {
    id: 'bobs-27',
    name: "Bob's 27",
    description:
      'D1 à D20 puis le bull, trois fléchettes par double. Départ à 27 points ; ' +
      'une manche sans touché coûte la valeur du double.',
    skill: 'doubles',
    metric: 'score',
    higherIsBetter: true,
    custom: false,

    createState(): Bobs27State {
      return {
        score: BOBS_27_START,
        roundIndex: 0,
        dartsInRound: 0,
        hitsInRound: 0,
        dartsThrown: 0,
        hits: 0,
        attempts: 0,
        bestStreak: 0,
        streak: 0,
        busted: false,
      }
    },

    applyDart(state, dart): ExerciseApplyResult<Bobs27State> {
      const segment = targetOf(state.roundIndex)
      if (segment === null || state.busted) return { state, effects: [] }

      const target = { segment, multiplier: 2 } as const
      const effects: ExerciseEffect[] = []
      const hit = isDouble(dart) && dart.segment === segment
      effects.push({ type: hit ? 'hit' : 'miss', target, dart })

      const streak = hit ? state.streak + 1 : 0
      const dartsInRound = state.dartsInRound + 1
      const hitsInRound = state.hitsInRound + (hit ? 1 : 0)
      const roundOver = dartsInRound >= DARTS_PER_ROUND

      // Le barème ne s'applique qu'à la fin de la manche : on marque la valeur
      // du double par touché, et on la perd si la manche est vierge.
      let score = state.score
      if (roundOver) {
        const value = doubleValue(segment)
        score += hitsInRound > 0 ? hitsInRound * value : -value
        effects.push({ type: 'round-ended', index: state.roundIndex })
      }

      const busted = options.stopOnNegative && score < 0
      const roundIndex = roundOver ? state.roundIndex + 1 : state.roundIndex

      const next: Bobs27State = {
        score,
        roundIndex,
        dartsInRound: roundOver ? 0 : dartsInRound,
        hitsInRound: roundOver ? 0 : hitsInRound,
        dartsThrown: state.dartsThrown + 1,
        hits: state.hits + (hit ? 1 : 0),
        attempts: state.attempts + 1,
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        busted,
      }

      if (busted || roundIndex >= SEQUENCE.length) effects.push({ type: 'finished' })
      return { state: next, effects }
    },

    isFinished(state) {
      return state.busted || state.roundIndex >= SEQUENCE.length
    },

    result(state): ExerciseResult {
      return {
        score: state.score,
        dartsThrown: state.dartsThrown,
        hits: state.hits,
        attempts: state.attempts,
        bestStreak: state.bestStreak,
        metricValue: state.score,
        metric: 'score',
        higherIsBetter: true,
      }
    },

    view(state): ExerciseView {
      const segment = targetOf(state.roundIndex)
      const target = segment === null ? null : ({ segment, multiplier: 2 } as const)
      return {
        exerciseId: 'bobs-27',
        name: "Bob's 27",
        target,
        targetLabel: segment === null ? 'Terminé' : segment === BULL ? 'BULL' : `D${segment}`,
        primary: String(state.score),
        secondary: [
          { label: 'Touchés', value: `${state.hits}/${state.attempts}` },
          { label: 'Dans la manche', value: String(state.hitsInRound) },
        ],
        progress: { done: Math.min(state.roundIndex, SEQUENCE.length), total: SEQUENCE.length },
        dartsRemainingInRound: DARTS_PER_ROUND - state.dartsInRound,
        isFinished: state.busted || state.roundIndex >= SEQUENCE.length,
        ...(state.busted ? { message: 'Score négatif : exercice terminé.' } : {}),
      }
    },
  }

  return rule
}
