/**
 * Abstraction « exercice » — §4.5, #45.
 *
 * Le module Entraînement est un « espace distinct des parties, conçu pour la
 * pratique solo », et il « doit fonctionner intégralement hors ligne ».
 *
 * Même principe que l'abstraction « règle de jeu » du §4.2, et pour la même
 * raison : le §4.5 demande que l'utilisateur puisse **créer les siens**. Un
 * exercice personnalisé doit donc s'exécuter exactement comme un exercice
 * intégré, sans code dédié.
 *
 * Comme pour les règles de jeu, l'état est immuable et la session conserve le
 * journal des fléchettes : l'annulation et la reprise en découlent
 * gratuitement.
 */

import type { AimPoint, Dart } from '../dart.js'

/** §4.5 — l'objectif travaillé, qui sert au classement et aux suggestions. */
export type ExerciseSkill = 'doubles' | 'scoring' | 'checkout' | 'precision'

/**
 * Ce qui mesure la performance.
 *
 * Déterminant pour le record personnel (§4.5) : selon l'exercice, le meilleur
 * résultat est le plus grand score ou le plus petit nombre de fléchettes.
 */
export type ExerciseMetric = 'score' | 'darts' | 'hits' | 'streak'

export interface ExerciseResult {
  readonly score: number
  readonly dartsThrown: number
  readonly hits: number
  readonly attempts: number
  readonly bestStreak: number
  /** Valeur qui fait foi pour le record personnel. */
  readonly metricValue: number
  readonly metric: ExerciseMetric
  /** Un meilleur résultat est-il un résultat plus élevé ? */
  readonly higherIsBetter: boolean
}

export type ExerciseEffect =
  | { readonly type: 'hit'; readonly target: AimPoint; readonly dart: Dart }
  | { readonly type: 'miss'; readonly target: AimPoint; readonly dart: Dart }
  | { readonly type: 'round-ended'; readonly index: number }
  | { readonly type: 'streak'; readonly length: number }
  | { readonly type: 'finished' }

export interface ExerciseApplyResult<TState> {
  readonly state: TState
  readonly effects: readonly ExerciseEffect[]
}

/** Projection pour l'écran d'exécution, indépendante de l'exercice. */
export interface ExerciseView {
  readonly exerciseId: string
  readonly name: string
  /** Ce qu'il faut viser maintenant, ou `null` si l'exercice est terminé. */
  readonly target: AimPoint | null
  /** Libellé de la cible : `D16`, `T20`, `BULL`, ou une consigne libre. */
  readonly targetLabel: string
  /** Valeur mise en avant, en très gros (§5 : lisible à 2–3 m). */
  readonly primary: string
  readonly secondary: readonly { readonly label: string; readonly value: string }[]
  readonly progress: { readonly done: number; readonly total: number }
  readonly dartsRemainingInRound: number | null
  readonly isFinished: boolean
  readonly message?: string
}

export interface ExerciseRule<TState> {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly skill: ExerciseSkill
  readonly metric: ExerciseMetric
  readonly higherIsBetter: boolean
  /** Exercice intégré ou créé par l'utilisateur (§4.5). */
  readonly custom: boolean

  createState(): TState
  applyDart(state: TState, dart: Dart): ExerciseApplyResult<TState>
  isFinished(state: TState): boolean
  result(state: TState): ExerciseResult
  view(state: TState): ExerciseView
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyExerciseRule = ExerciseRule<any>

/**
 * Session d'exercice : journal des fléchettes, annulation, instantané.
 *
 * Volontairement identique dans l'esprit à `GameSession` — et pour les mêmes
 * raisons. Une séance interrompue doit pouvoir reprendre (§4.5, même exigence
 * que §4.4 pour les parties), et se tromper de saisie doit pouvoir s'annuler.
 */
export class ExerciseSession<TState> {
  private readonly states: TState[]
  private readonly darts: Dart[] = []

  constructor(private readonly rule: ExerciseRule<TState>) {
    this.states = [rule.createState()]
  }

  get state(): TState {
    return this.states[this.states.length - 1] as TState
  }

  get view(): ExerciseView {
    return this.rule.view(this.state)
  }

  get isFinished(): boolean {
    return this.rule.isFinished(this.state)
  }

  get result(): ExerciseResult {
    return this.rule.result(this.state)
  }

  get history(): readonly Dart[] {
    return this.darts
  }

  get undoDepth(): number {
    return this.darts.length
  }

  applyDart(dart: Dart): ExerciseApplyResult<TState> {
    if (this.isFinished) return { state: this.state, effects: [] }
    const result = this.rule.applyDart(this.state, dart)
    this.darts.push(dart)
    this.states.push(result.state)
    return result
  }

  undo(): boolean {
    if (this.darts.length === 0) return false
    this.darts.pop()
    this.states.pop()
    return true
  }

  /** Instantané rejouable, pour la reprise d'une séance (§4.5). */
  toSnapshot(): ExerciseSnapshot {
    return { exerciseId: this.rule.id, darts: [...this.darts] }
  }

  static restore<S>(rule: ExerciseRule<S>, snapshot: ExerciseSnapshot): ExerciseSession<S> {
    const session = new ExerciseSession(rule)
    for (const dart of snapshot.darts) session.applyDart(dart)
    return session
  }
}

export interface ExerciseSnapshot {
  readonly exerciseId: string
  readonly darts: readonly Dart[]
}
