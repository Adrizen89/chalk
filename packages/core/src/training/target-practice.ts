/**
 * Exercice générique de travail de cibles — §4.5, #45 et #47.
 *
 * C'est l'implémentation qui rend les **exercices personnalisés** possibles :
 * le §4.5 demande que l'utilisateur choisisse « la ou les cibles, le nombre de
 * volées ou de manches, la condition de réussite et le barème ». Tout cela est
 * ici de la donnée, pas du code.
 *
 * Plusieurs exercices intégrés s'expriment avec la même structure — c'est le
 * signe que l'abstraction est au bon niveau : si un exercice maison demandait
 * du code, elle serait trop étroite.
 */

import type { AimPoint, Dart } from '../dart.js'
import { BULL, dartValue, formatDart } from '../dart.js'
import type {
  ExerciseApplyResult,
  ExerciseEffect,
  ExerciseMetric,
  ExerciseResult,
  ExerciseRule,
  ExerciseSkill,
  ExerciseView,
} from './exercise.js'

export interface TargetPracticeSpec {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly skill: ExerciseSkill

  /** Séquence de cibles à travailler, dans l'ordre. */
  readonly targets: readonly AimPoint[]
  /**
   * Fléchettes allouées par cible. `null` : on reste sur la cible jusqu'à la
   * toucher — c'est le mode du « Tour des doubles », dont la performance se
   * mesure au nombre total de fléchettes.
   */
  readonly dartsPerTarget: number | null
  /** Passer à la cible suivante dès qu'elle est touchée. */
  readonly advanceOnHit: boolean
  /** Nombre de passages sur la séquence. */
  readonly laps: number

  /**
   * - `hits` : un point par touché.
   * - `value` : la valeur du segment touché, multiplicateur compris.
   * - `none` : aucun score, seul le nombre de fléchettes compte.
   */
  readonly scoring: 'hits' | 'value' | 'none'
  /**
   * - `exact` : le multiplicateur doit correspondre (D16 ≠ S16).
   * - `segment` : n'importe quel touché sur le numéro compte.
   */
  readonly match: 'exact' | 'segment'
  /** §4.5 — « Catch 40 : enchaîner les D20 avec un compteur de série ». */
  readonly trackStreak: boolean
  readonly metric: ExerciseMetric
  readonly higherIsBetter: boolean
  readonly custom?: boolean
}

export interface TargetPracticeState {
  readonly spec: TargetPracticeSpec
  /** Index dans la séquence complète (cibles × passages). */
  readonly roundIndex: number
  readonly dartsInRound: number
  readonly dartsThrown: number
  readonly score: number
  readonly hits: number
  readonly attempts: number
  readonly streak: number
  readonly bestStreak: number
  readonly lastMessage?: string
}

const totalRounds = (spec: TargetPracticeSpec) => spec.targets.length * Math.max(1, spec.laps)

function targetAt(spec: TargetPracticeSpec, roundIndex: number): AimPoint | null {
  if (roundIndex >= totalRounds(spec)) return null
  return spec.targets[roundIndex % spec.targets.length] ?? null
}

export function formatTarget(target: AimPoint): string {
  if (target.segment === BULL) return target.multiplier === 2 ? 'BULL' : '25'
  return formatDart({ segment: target.segment, multiplier: target.multiplier })
}

/** La fléchette touche-t-elle la cible visée ? */
function isHit(spec: TargetPracticeSpec, target: AimPoint, dart: Dart): boolean {
  if (dart.segment === 0 || dart.segment !== target.segment) return false
  return spec.match === 'segment' || dart.multiplier === target.multiplier
}

export function createTargetPractice(spec: TargetPracticeSpec): ExerciseRule<TargetPracticeState> {
  return {
    id: spec.id,
    name: spec.name,
    description: spec.description,
    skill: spec.skill,
    metric: spec.metric,
    higherIsBetter: spec.higherIsBetter,
    custom: spec.custom ?? false,

    createState() {
      return {
        spec,
        roundIndex: 0,
        dartsInRound: 0,
        dartsThrown: 0,
        score: 0,
        hits: 0,
        attempts: 0,
        streak: 0,
        bestStreak: 0,
      }
    },

    applyDart(state, dart): ExerciseApplyResult<TargetPracticeState> {
      const target = targetAt(state.spec, state.roundIndex)
      if (!target) return { state, effects: [] }

      const effects: ExerciseEffect[] = []
      const hit = isHit(state.spec, target, dart)
      effects.push({ type: hit ? 'hit' : 'miss', target, dart })

      const scored =
        !hit || state.spec.scoring === 'none'
          ? 0
          : state.spec.scoring === 'value'
            ? dartValue(dart)
            : 1

      const streak = hit ? state.streak + 1 : 0
      const bestStreak = Math.max(state.bestStreak, streak)
      if (state.spec.trackStreak && hit) effects.push({ type: 'streak', length: streak })

      const dartsInRound = state.dartsInRound + 1
      const allowance = state.spec.dartsPerTarget
      const roundOver =
        (state.spec.advanceOnHit && hit) || (allowance !== null && dartsInRound >= allowance)

      const roundIndex = roundOver ? state.roundIndex + 1 : state.roundIndex
      if (roundOver) effects.push({ type: 'round-ended', index: state.roundIndex })

      const next: TargetPracticeState = {
        ...state,
        roundIndex,
        dartsInRound: roundOver ? 0 : dartsInRound,
        dartsThrown: state.dartsThrown + 1,
        score: state.score + scored,
        hits: state.hits + (hit ? 1 : 0),
        attempts: state.attempts + 1,
        streak,
        bestStreak,
      }

      if (roundIndex >= totalRounds(state.spec)) effects.push({ type: 'finished' })
      return { state: next, effects }
    },

    isFinished(state) {
      return state.roundIndex >= totalRounds(state.spec)
    },

    result(state): ExerciseResult {
      const metricValue =
        state.spec.metric === 'darts'
          ? state.dartsThrown
          : state.spec.metric === 'hits'
            ? state.hits
            : state.spec.metric === 'streak'
              ? state.bestStreak
              : state.score

      return {
        score: state.score,
        dartsThrown: state.dartsThrown,
        hits: state.hits,
        attempts: state.attempts,
        bestStreak: state.bestStreak,
        metricValue,
        metric: state.spec.metric,
        higherIsBetter: state.spec.higherIsBetter,
      }
    },

    view(state): ExerciseView {
      const target = targetAt(state.spec, state.roundIndex)
      const total = totalRounds(state.spec)
      const allowance = state.spec.dartsPerTarget

      const primary =
        state.spec.metric === 'darts'
          ? String(state.dartsThrown)
          : state.spec.metric === 'streak'
            ? String(state.streak)
            : String(state.score)

      const secondary: ExerciseView['secondary'] = [
        { label: 'Touchés', value: `${state.hits}/${state.attempts}` },
        ...(state.spec.metric === 'darts'
          ? []
          : [{ label: 'Fléchettes', value: String(state.dartsThrown) }]),
        ...(state.spec.trackStreak
          ? [{ label: 'Meilleure série', value: String(state.bestStreak) }]
          : []),
      ]

      return {
        exerciseId: state.spec.id,
        name: state.spec.name,
        target,
        targetLabel: target ? formatTarget(target) : 'Terminé',
        primary,
        secondary,
        progress: { done: Math.min(state.roundIndex, total), total },
        dartsRemainingInRound: allowance === null ? null : allowance - state.dartsInRound,
        isFinished: state.roundIndex >= total,
        ...(state.lastMessage !== undefined ? { message: state.lastMessage } : {}),
      }
    },
  }
}
