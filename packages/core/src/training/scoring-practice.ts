/**
 * Entraînement au scoring — §4.5.
 *
 * « Ton machine : nombre de volées à 100+ sur une série donnée. »
 *
 * Le travail de cibles (`target-practice`) ne convient pas ici : ce qui compte
 * n'est pas la cible touchée mais le **total d'une volée**. Plutôt que de
 * tordre l'abstraction générique, un exercice dédié — c'est précisément ce que
 * l'interface `ExerciseRule` doit rendre possible.
 */

import { DARTS_PER_TURN, dartValue } from '../dart.js'
import type {
  ExerciseApplyResult,
  ExerciseEffect,
  ExerciseResult,
  ExerciseRule,
  ExerciseView,
} from './exercise.js'

export interface ScoringPracticeSpec {
  readonly id: string
  readonly name: string
  readonly description: string
  /** Nombre de volées de la série. */
  readonly turns: number
  /** Seuil à atteindre pour qu'une volée compte. */
  readonly threshold: number
  readonly custom?: boolean
}

export interface ScoringPracticeState {
  readonly spec: ScoringPracticeSpec
  readonly turnIndex: number
  readonly dartsInTurn: number
  readonly turnTotal: number
  readonly dartsThrown: number
  readonly totalScored: number
  readonly turnsAtThreshold: number
  readonly bestTurn: number
  readonly streak: number
  readonly bestStreak: number
}

export function createScoringPractice(
  spec: ScoringPracticeSpec,
): ExerciseRule<ScoringPracticeState> {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    skill: 'scoring',
    metric: 'hits',
    higherIsBetter: true,
    custom: spec.custom ?? false,

    createState(): ScoringPracticeState {
      return {
        spec,
        turnIndex: 0,
        dartsInTurn: 0,
        turnTotal: 0,
        dartsThrown: 0,
        totalScored: 0,
        turnsAtThreshold: 0,
        bestTurn: 0,
        streak: 0,
        bestStreak: 0,
      }
    },

    applyDart(state, dart): ExerciseApplyResult<ScoringPracticeState> {
      if (state.turnIndex >= state.spec.turns) return { state, effects: [] }

      const effects: ExerciseEffect[] = []
      const value = dartValue(dart)
      const turnTotal = state.turnTotal + value
      const dartsInTurn = state.dartsInTurn + 1
      const turnOver = dartsInTurn >= DARTS_PER_TURN

      const reached = turnOver && turnTotal >= state.spec.threshold
      const streak = turnOver ? (reached ? state.streak + 1 : 0) : state.streak

      if (turnOver) {
        effects.push({
          type: reached ? 'hit' : 'miss',
          target: { segment: 0, multiplier: 1 },
          dart,
        })
        effects.push({ type: 'round-ended', index: state.turnIndex })
        if (reached) effects.push({ type: 'streak', length: streak })
      }

      const turnIndex = turnOver ? state.turnIndex + 1 : state.turnIndex
      const next: ScoringPracticeState = {
        ...state,
        turnIndex,
        dartsInTurn: turnOver ? 0 : dartsInTurn,
        turnTotal: turnOver ? 0 : turnTotal,
        dartsThrown: state.dartsThrown + 1,
        totalScored: state.totalScored + value,
        turnsAtThreshold: state.turnsAtThreshold + (reached ? 1 : 0),
        bestTurn: turnOver ? Math.max(state.bestTurn, turnTotal) : state.bestTurn,
        streak,
        bestStreak: Math.max(state.bestStreak, streak),
      }

      if (turnIndex >= state.spec.turns) effects.push({ type: 'finished' })
      return { state: next, effects }
    },

    isFinished(state) {
      return state.turnIndex >= state.spec.turns
    },

    result(state): ExerciseResult {
      return {
        score: state.totalScored,
        dartsThrown: state.dartsThrown,
        hits: state.turnsAtThreshold,
        attempts: state.spec.turns,
        bestStreak: state.bestStreak,
        metricValue: state.turnsAtThreshold,
        metric: 'hits',
        higherIsBetter: true,
      }
    },

    view(state): ExerciseView {
      const average =
        state.dartsThrown === 0 ? 0 : (state.totalScored / state.dartsThrown) * DARTS_PER_TURN
      return {
        exerciseId: state.spec.id,
        name: state.spec.name,
        target: null,
        targetLabel:
          state.turnIndex >= state.spec.turns
            ? 'Terminé'
            : `Volée ${state.turnIndex + 1} — visez ${state.spec.threshold}+`,
        primary: String(state.turnsAtThreshold),
        secondary: [
          { label: 'Volée en cours', value: String(state.turnTotal) },
          { label: 'Moy. 3 fléch.', value: average.toFixed(2) },
          { label: 'Meilleure volée', value: String(state.bestTurn) },
        ],
        progress: { done: Math.min(state.turnIndex, state.spec.turns), total: state.spec.turns },
        dartsRemainingInRound: DARTS_PER_TURN - state.dartsInTurn,
        isFinished: state.turnIndex >= state.spec.turns,
      }
    },
  }
}
