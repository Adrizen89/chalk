/**
 * Session de jeu : journal d'entrées, undo multi-niveaux et correction — §4.3.
 *
 * Le CDC demande un bouton Annuler « toujours accessible » permettant d'annuler
 * la dernière fléchette, la dernière volée, ou de revenir plusieurs coups en
 * arrière, et il demande à l'hôte de pouvoir corriger une volée déjà validée.
 *
 * Plutôt que d'écrire une opération inverse par règle de jeu — impossible à
 * garder juste quand on ajoutera des règles maison (§4.2) — la session conserve
 * le **journal des entrées** et l'état obtenu après chacune. Annuler, c'est
 * revenir à un état antérieur ; corriger, c'est rejouer le journal modifié.
 *
 * Ce journal est aussi ce qui sera synchronisé entre appareils (§3.3) : une
 * suite d'entrées horodatées se réconcilie beaucoup mieux qu'un état mutable.
 */

import type { Dart } from './dart.js'
import type { ApplyResult, GameEffect, GameRule, GameView, PlayerId, PlayerRef } from './rule.js'

export type GameInput =
  | { readonly kind: 'dart'; readonly dart: Dart }
  | { readonly kind: 'turn-total'; readonly total: number; readonly dartsUsed?: number | undefined }

export interface RecordedInput {
  readonly input: GameInput
  /** Joueur à qui l'entrée a été imputée, capturé avant application. */
  readonly playerId: PlayerId | null
  readonly effects: readonly GameEffect[]
}

export class InvalidInputError extends Error {
  constructor(readonly reason: string) {
    super(reason)
    this.name = 'InvalidInputError'
  }
}

export class GameSession<TConfig, TState> {
  private readonly states: TState[]
  private readonly inputs: RecordedInput[] = []

  constructor(
    private readonly rule: GameRule<TConfig, TState>,
    private readonly config: TConfig,
    private readonly players: readonly PlayerRef[],
  ) {
    this.states = [rule.createState(config, players)]
  }

  get state(): TState {
    // Toujours au moins l'état initial, l'indexation ne peut pas échouer.
    return this.states[this.states.length - 1] as TState
  }

  get view(): GameView {
    return this.rule.view(this.state)
  }

  get history(): readonly RecordedInput[] {
    return this.inputs
  }

  get winnerId(): PlayerId | null {
    return this.rule.getWinner(this.state)
  }

  get isFinished(): boolean {
    return this.winnerId !== null
  }

  /** Nombre d'entrées annulables. */
  get undoDepth(): number {
    return this.inputs.length
  }

  applyDart(dart: Dart): ApplyResult<TState> {
    const validation = this.rule.validateDart(this.state, dart)
    if (!validation.ok) throw new InvalidInputError(validation.reason)
    return this.push({ kind: 'dart', dart }, this.rule.applyDart(this.state, dart))
  }

  applyTurnTotal(total: number, dartsUsed?: number): ApplyResult<TState> {
    const applyTurnTotal = this.rule.applyTurnTotal
    if (!applyTurnTotal) {
      throw new InvalidInputError(
        `Le mode ${this.rule.label} exige la saisie fléchette par fléchette.`,
      )
    }
    return this.push(
      { kind: 'turn-total', total, dartsUsed },
      applyTurnTotal.call(this.rule, this.state, total, dartsUsed),
    )
  }

  private push(input: GameInput, result: ApplyResult<TState>): ApplyResult<TState> {
    this.inputs.push({
      input,
      playerId: this.rule.view(this.state).activePlayerId,
      effects: result.effects,
    })
    this.states.push(result.state)
    return result
  }

  /** Annule la dernière entrée : une fléchette, ou une volée saisie en total. */
  undo(): boolean {
    if (this.inputs.length === 0) return false
    this.inputs.pop()
    this.states.pop()
    return true
  }

  /**
   * Annule la dernière volée complète.
   *
   * En saisie par volée, c'est une entrée. En saisie fléchette par fléchette,
   * c'est l'ensemble des fléchettes du joueur depuis le début de son tour — y
   * compris quand ce tour s'est terminé sur un bust.
   */
  undoTurn(): boolean {
    if (this.inputs.length === 0) return false

    const last = this.inputs[this.inputs.length - 1]
    if (!last || last.input.kind === 'turn-total') return this.undo()

    // On remonte jusqu'à l'entrée qui a clos le tour précédent.
    let index = this.inputs.length - 1
    while (index > 0) {
      const previous = this.inputs[index - 1]
      if (!previous) break
      const closedTurn = previous.effects.some(
        (effect) => effect.type === 'turn-ended' || effect.type === 'bust',
      )
      if (closedTurn) break
      index -= 1
    }
    return this.undoTo(index)
  }

  /** Revient plusieurs coups en arrière : conserve les `index` premières entrées. */
  undoTo(index: number): boolean {
    if (index < 0 || index >= this.inputs.length) return false
    while (this.inputs.length > index) {
      this.inputs.pop()
      this.states.pop()
    }
    return true
  }

  /**
   * Correction d'une entrée déjà validée — §4.3, droit de l'hôte.
   *
   * Le journal est rejoué depuis l'entrée modifiée. Les entrées devenues
   * invalides (la correction change le déroulé au point de les rendre
   * impossibles) sont abandonnées et retournées à l'appelant, à charge pour
   * l'interface de les signaler plutôt que de les perdre en silence.
   */
  replaceInput(index: number, input: GameInput): { readonly dropped: readonly GameInput[] } {
    if (index < 0 || index >= this.inputs.length) {
      throw new InvalidInputError(`Aucune entrée à l'index ${index}.`)
    }

    const tail = this.inputs.slice(index + 1).map((recorded) => recorded.input)
    this.undoTo(index)

    const dropped: GameInput[] = []
    for (const next of [input, ...tail]) {
      try {
        if (next.kind === 'dart') this.applyDart(next.dart)
        else this.applyTurnTotal(next.total, next.dartsUsed)
      } catch (error) {
        if (error instanceof InvalidInputError) dropped.push(next)
        else throw error
      }
    }
    return { dropped }
  }

  /** Instantané sérialisable, pour IndexedDB (§3.4) et la reprise de partie (§4.4). */
  toSnapshot(): GameSnapshot<TConfig> {
    return {
      ruleId: this.rule.id,
      config: this.config,
      players: this.players,
      inputs: this.inputs.map((recorded) => recorded.input),
    }
  }

  /** Reconstruit une session à partir d'un instantané, en rejouant le journal. */
  static restore<C, S>(rule: GameRule<C, S>, snapshot: GameSnapshot<C>): GameSession<C, S> {
    const session = new GameSession(rule, snapshot.config, snapshot.players)
    for (const input of snapshot.inputs) {
      if (input.kind === 'dart') session.applyDart(input.dart)
      else session.applyTurnTotal(input.total, input.dartsUsed)
    }
    return session
  }
}

export interface GameSnapshot<TConfig> {
  readonly ruleId: string
  readonly config: TConfig
  readonly players: readonly PlayerRef[]
  readonly inputs: readonly GameInput[]
}
