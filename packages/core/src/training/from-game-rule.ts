/**
 * Transforme une règle de jeu en exercice — §4.5.
 *
 * Le cahier des charges prévoit explicitement cette réutilisation : « Around
 * the Clock chronométré » est le mode Around the Clock (§4.2) avec un
 * chronomètre, et « Leg solo » est un 501 joué seul.
 *
 * L'adaptateur évite d'en écrire une seconde implémentation — et garantit que
 * l'exercice suit les mêmes règles que la partie correspondante. Le chronomètre
 * reste à l'interface : la règle compte les fléchettes, elle ne connaît pas le
 * temps.
 */

import type { GameRule, PlayerRef } from '../rule.js'
import type {
  ExerciseApplyResult,
  ExerciseEffect,
  ExerciseMetric,
  ExerciseResult,
  ExerciseRule,
  ExerciseSkill,
  ExerciseView,
} from './exercise.js'

export interface GameRuleExerciseState<TGameState> {
  readonly game: TGameState
  readonly dartsThrown: number
}

const SOLO_PLAYER: PlayerRef = { id: 'solo', name: 'Vous' }

export function fromGameRule<TConfig, TGameState>(options: {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly skill: ExerciseSkill
  readonly metric: ExerciseMetric
  readonly higherIsBetter: boolean
  readonly rule: GameRule<TConfig, TGameState>
  readonly config: TConfig
}): ExerciseRule<GameRuleExerciseState<TGameState>> {
  const { rule, config } = options

  return {
    id: options.id,
    name: options.name,
    description: options.description,
    skill: options.skill,
    metric: options.metric,
    higherIsBetter: options.higherIsBetter,
    custom: false,

    createState() {
      return { game: rule.createState(config, [SOLO_PLAYER]), dartsThrown: 0 }
    },

    applyDart(state, dart): ExerciseApplyResult<GameRuleExerciseState<TGameState>> {
      if (rule.getWinner(state.game) !== null) return { state, effects: [] }
      if (!rule.validateDart(state.game, dart).ok) return { state, effects: [] }

      const applied = rule.applyDart(state.game, dart)
      const effects: ExerciseEffect[] = []
      // On ne traduit que ce qui a un sens pour un exercice : la fin.
      if (rule.getWinner(applied.state) !== null) effects.push({ type: 'finished' })

      return {
        state: { game: applied.state, dartsThrown: state.dartsThrown + 1 },
        effects,
      }
    },

    isFinished(state) {
      return rule.getWinner(state.game) !== null
    },

    result(state): ExerciseResult {
      return {
        score: state.dartsThrown,
        dartsThrown: state.dartsThrown,
        hits: 0,
        attempts: state.dartsThrown,
        bestStreak: 0,
        metricValue: options.metric === 'darts' ? state.dartsThrown : state.dartsThrown,
        metric: options.metric,
        higherIsBetter: options.higherIsBetter,
      }
    },

    view(state): ExerciseView {
      const gameView = rule.view(state.game)
      const player = gameView.players[0]
      const extra = player?.extra as { target?: number; progress?: number } | undefined
      const target =
        extra?.target !== undefined && extra.target !== null
          ? ({ segment: extra.target, multiplier: 1 } as ExerciseView['target'])
          : null

      return {
        exerciseId: options.id,
        name: options.name,
        target,
        targetLabel: player?.primary ?? '—',
        primary: String(state.dartsThrown),
        secondary: [
          ...(player?.secondary ?? []),
          { label: 'Fléchettes', value: String(state.dartsThrown) },
        ],
        progress: { done: extra?.progress ?? 0, total: extra?.progress === undefined ? 0 : 21 },
        dartsRemainingInRound: gameView.dartsRemainingInTurn,
        isFinished: rule.getWinner(state.game) !== null,
      }
    },
  }
}
