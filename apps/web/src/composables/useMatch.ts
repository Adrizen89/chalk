/**
 * État de la partie en cours.
 *
 * Un simple module réactif plutôt qu'une bibliothèque de store : il n'y a
 * qu'une partie active à la fois, et le moteur (`@chalk/core`) porte déjà toute
 * la logique. Ce fichier ne fait que l'exposer à Vue.
 *
 * `GameSession` est une classe à état mutable, volontairement hors du système
 * de réactivité : on la garde dans un `shallowRef` et on incrémente une
 * révision après chaque mutation. Envelopper la session dans un `reactive`
 * ferait proxifier tout le journal d'entrées à chaque fléchette, pour rien.
 */

import { computed, ref, shallowRef } from 'vue'
import type { AnyGameRule, Dart, GameEffect, GameSnapshot, GameView, PlayerRef } from '@chalk/core'
import { GameSession, suggestCheckout } from '@chalk/core'

/** §4.3 — deux modes de saisie, choisis dans les réglages. */
export type InputMode = 'turn' | 'dart'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySession = GameSession<any, any>

const session = shallowRef<AnySession | null>(null)
const rule = shallowRef<AnyGameRule | null>(null)
const revision = ref(0)
const lastEffects = ref<readonly GameEffect[]>([])
const inputMode = ref<InputMode>('turn')
const isPaused = ref(false)

/** Configuration de la dernière partie lancée, pour le bouton « Revanche » (§4.4). */
let lastLaunch: { rule: AnyGameRule; config: unknown; players: readonly PlayerRef[] } | null = null

/**
 * Crée la dépendance réactive vers la session, qui vit hors du système de
 * réactivité de Vue. À appeler au début de chaque `computed` qui lit son état.
 */
function trackSession() {
  return revision.value
}

function touch(effects: readonly GameEffect[] = []) {
  revision.value += 1
  lastEffects.value = effects
}

export function useMatch() {
  const view = computed<GameView | null>(() => {
    trackSession()
    return session.value?.view ?? null
  })

  const isActive = computed(() => session.value !== null)

  const isFinished = computed(() => {
    trackSession()
    return session.value?.isFinished ?? false
  })

  const winner = computed(() => {
    const id = view.value?.winnerId
    if (!id) return null
    return view.value?.players.find((player) => player.playerId === id) ?? null
  })

  const canUndo = computed(() => {
    trackSession()
    return (session.value?.undoDepth ?? 0) > 0
  })

  /**
   * §4.3 — suggestion de sortie. Propre au X01 : les autres modes n'ont pas de
   * score restant à faire tomber à zéro.
   */
  const checkout = computed(() => {
    trackSession()
    if (!session.value || rule.value?.id !== 'x01') return null
    return suggestCheckout(session.value.state)
  })

  /** Le mode impose-t-il la saisie fléchette par fléchette ? (§4.3) */
  const requiresDartDetail = computed(() => rule.value?.requiresDartDetail ?? false)

  const effectiveInputMode = computed<InputMode>(() =>
    requiresDartDetail.value ? 'dart' : inputMode.value,
  )

  function start(
    gameRule: AnyGameRule,
    config: unknown,
    players: readonly PlayerRef[],
    mode: InputMode = 'turn',
  ) {
    rule.value = gameRule
    session.value = new GameSession(gameRule, config, players)
    lastLaunch = { rule: gameRule, config, players }
    inputMode.value = gameRule.requiresDartDetail ? 'dart' : mode
    isPaused.value = false
    touch()
  }

  /** §4.4 — « Revanche » : relance la même configuration en un tap. */
  function rematch() {
    if (!lastLaunch) return
    start(lastLaunch.rule, lastLaunch.config, lastLaunch.players, inputMode.value)
  }

  function throwDart(dart: Dart): string | null {
    if (!session.value || isFinished.value) return null
    try {
      const result = session.value.applyDart(dart)
      touch(result.effects)
      return null
    } catch (error) {
      // §5 : aucune fenêtre modale. L'erreur remonte comme un message court.
      return error instanceof Error ? error.message : 'Saisie refusée.'
    }
  }

  function submitTurnTotal(total: number, dartsUsed?: number): string | null {
    if (!session.value || isFinished.value) return null
    try {
      const result = session.value.applyTurnTotal(total, dartsUsed)
      touch(result.effects)
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Saisie refusée.'
    }
  }

  function undo() {
    if (session.value?.undo()) touch()
  }

  function undoTurn() {
    if (session.value?.undoTurn()) touch()
  }

  function quit() {
    session.value = null
    rule.value = null
    isPaused.value = false
    touch()
  }

  function snapshot(): GameSnapshot<unknown> | null {
    return session.value?.toSnapshot() ?? null
  }

  return {
    rule,
    view,
    isActive,
    isFinished,
    isPaused,
    winner,
    canUndo,
    checkout,
    lastEffects,
    inputMode,
    effectiveInputMode,
    requiresDartDetail,
    start,
    rematch,
    throwDart,
    submitTurnTotal,
    undo,
    undoTurn,
    quit,
    snapshot,
  }
}
