/**
 * Entraînement aux sorties — §4.5.
 *
 * « Sorties tirées au sort entre 41 et 170, 3 fléchettes pour finir. »
 *
 * Le tirage n'a **pas lieu dans l'exercice** : comme pour les numéros du Killer
 * (§4.2), un moteur qui tire au sort ne se rejoue pas à l'identique, et une
 * séance interrompue ne pourrait pas reprendre. Les scores sont tirés une fois
 * à la création, puis figés dans la définition.
 */

import { dartValue } from '../dart.js'
import type { OutMode } from '../checkout.js'
import { createCheckoutSolver, isFinishingDart } from '../checkout.js'
import type {
  ExerciseApplyResult,
  ExerciseEffect,
  ExerciseResult,
  ExerciseRule,
  ExerciseView,
} from './exercise.js'

const DARTS_PER_ROUND = 3

export interface CheckoutPracticeSpec {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Scores à sortir, tirés une fois pour toutes. */
  readonly scores: readonly number[]
  readonly outMode: OutMode
  readonly custom?: boolean
}

export interface CheckoutPracticeState {
  readonly spec: CheckoutPracticeSpec
  readonly roundIndex: number
  readonly remaining: number
  readonly dartsInRound: number
  readonly dartsThrown: number
  readonly checkouts: number
  readonly attempts: number
  readonly streak: number
  readonly bestStreak: number
  readonly lastMessage?: string
}

/**
 * Tire des sorties finissables en trois fléchettes.
 *
 * Le générateur est injecté : le tirage doit pouvoir être reproduit dans un
 * test, et surtout figé dans la définition de l'exercice pour que la séance
 * reste rejouable.
 */
export function drawCheckoutScores(
  count: number,
  options: { min?: number; max?: number; outMode?: OutMode; random?: () => number } = {},
): number[] {
  const { min = 41, max = 170, outMode = 'double', random = Math.random } = options
  const solver = createCheckoutSolver({ outMode })

  const candidates: number[] = []
  for (let score = min; score <= max; score += 1) {
    // Les bogey numbers n'ont aucune sortie en trois fléchettes : les tirer
    // rendrait l'exercice impossible sans que le joueur comprenne pourquoi.
    if (solver.canFinish(score, DARTS_PER_ROUND)) candidates.push(score)
  }

  return Array.from({ length: Math.max(0, count) }, () => {
    const index = Math.min(candidates.length - 1, Math.floor(random() * candidates.length))
    return candidates[index] ?? min
  })
}

export function createCheckoutPractice(
  spec: CheckoutPracticeSpec,
): ExerciseRule<CheckoutPracticeState> {
  const scoreAt = (index: number) => spec.scores[index] ?? null

  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    skill: 'checkout',
    metric: 'hits',
    higherIsBetter: true,
    custom: spec.custom ?? false,

    createState(): CheckoutPracticeState {
      return {
        spec,
        roundIndex: 0,
        remaining: scoreAt(0) ?? 0,
        dartsInRound: 0,
        dartsThrown: 0,
        checkouts: 0,
        attempts: 0,
        streak: 0,
        bestStreak: 0,
      }
    },

    applyDart(state, dart): ExerciseApplyResult<CheckoutPracticeState> {
      if (scoreAt(state.roundIndex) === null) return { state, effects: [] }

      const effects: ExerciseEffect[] = []
      const value = dartValue(dart)
      const next = state.remaining - value
      const dartsInRound = state.dartsInRound + 1

      const finished = next === 0 && isFinishingDart(dart, state.spec.outMode)
      // Même logique de bust qu'au X01 : le reste doit rester finissable.
      const busted = next < 0 || (next > 0 && next < 2) || (next === 0 && !finished)

      const target = { segment: 0, multiplier: 1 } as const
      effects.push({ type: finished ? 'hit' : 'miss', target, dart })

      const roundOver = finished || busted || dartsInRound >= DARTS_PER_ROUND
      const roundIndex = roundOver ? state.roundIndex + 1 : state.roundIndex
      const streak = finished ? state.streak + 1 : roundOver ? 0 : state.streak

      if (roundOver) effects.push({ type: 'round-ended', index: state.roundIndex })
      if (finished) effects.push({ type: 'streak', length: streak })

      const result: CheckoutPracticeState = {
        ...state,
        roundIndex,
        remaining: roundOver ? (scoreAt(roundIndex) ?? 0) : next,
        dartsInRound: roundOver ? 0 : dartsInRound,
        dartsThrown: state.dartsThrown + 1,
        checkouts: state.checkouts + (finished ? 1 : 0),
        attempts: state.attempts + (roundOver ? 1 : 0),
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
        ...(busted ? { lastMessage: 'Bust — sortie manquée.' } : {}),
      }

      if (roundIndex >= state.spec.scores.length) effects.push({ type: 'finished' })
      return { state: result, effects }
    },

    isFinished(state) {
      return state.roundIndex >= state.spec.scores.length
    },

    result(state): ExerciseResult {
      return {
        score: state.checkouts,
        dartsThrown: state.dartsThrown,
        hits: state.checkouts,
        attempts: state.spec.scores.length,
        bestStreak: state.bestStreak,
        metricValue: state.checkouts,
        metric: 'hits',
        higherIsBetter: true,
      }
    },

    view(state): ExerciseView {
      const total = state.spec.scores.length
      const done = Math.min(state.roundIndex, total)
      return {
        exerciseId: state.spec.id,
        name: state.spec.name,
        target: null,
        targetLabel: state.roundIndex >= total ? 'Terminé' : `Sortir ${state.remaining}`,
        primary: state.roundIndex >= total ? String(state.checkouts) : String(state.remaining),
        secondary: [
          { label: 'Sorties', value: `${state.checkouts}/${done}` },
          { label: 'Fléchettes', value: String(state.dartsThrown) },
          { label: 'Meilleure série', value: String(state.bestStreak) },
        ],
        progress: { done, total },
        dartsRemainingInRound: DARTS_PER_ROUND - state.dartsInRound,
        isFinished: state.roundIndex >= total,
        ...(state.lastMessage !== undefined ? { message: state.lastMessage } : {}),
      }
    },
  }
}
