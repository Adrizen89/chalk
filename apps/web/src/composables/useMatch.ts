/**
 * État de la partie en cours, et sa persistance.
 *
 * Un simple module réactif plutôt qu'une bibliothèque de store : il n'y a
 * qu'une partie active à la fois, et le moteur (`@chalk/core`) porte déjà toute
 * la logique.
 *
 * `GameSession` est une classe à état mutable, volontairement hors du système
 * de réactivité : on la garde dans un `shallowRef` et on incrémente une
 * révision après chaque mutation. Envelopper la session dans un `reactive`
 * ferait proxifier tout le journal d'entrées à chaque fléchette, pour rien.
 *
 * §4.4 impose d'écrire **à chaque entrée validée**, pas à la sortie propre :
 * une batterie qui se vide ne laisse pas le temps de sortir proprement.
 * L'écriture est donc déclenchée après chaque fléchette — sans être attendue,
 * pour rester sous les 100 ms de latence de saisie du §6.
 */

import { computed, ref, shallowRef } from 'vue'
import type { AnyGameRule, Dart, GameEffect, GameSnapshot, GameView, PlayerRef } from '@chalk/core'
import { GameSession, findRule, suggestCheckout } from '@chalk/core'
import { StorageFullError, abandonGame, markPlayed, saveGame } from '@/db'
import type { StoredGame } from '@/db'

/** §4.3 — deux modes de saisie, choisis dans les réglages. */
export type InputMode = 'turn' | 'dart'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySession = GameSession<any, any>

const session = shallowRef<AnySession | null>(null)
const rule = shallowRef<AnyGameRule | null>(null)
const gameId = ref<string | null>(null)
const revision = ref(0)
const lastEffects = ref<readonly GameEffect[]>([])
const inputMode = ref<InputMode>('turn')
/** Erreur de persistance à signaler sans interrompre la partie (§5). */
const storageError = ref<string | null>(null)

/** Configuration de la dernière partie lancée, pour « Revanche » (§4.4). */
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

/**
 * Écrit la partie sans être attendue.
 *
 * Attendre l'écriture ajouterait le temps d'une transaction IndexedDB au
 * chemin de saisie, que §6 borne à 100 ms de latence perçue. En cas d'échec,
 * l'erreur remonte dans `storageError` et l'interface l'affiche en message
 * court — sans jamais bloquer la volée suivante (§5).
 */
function persist() {
  const current = session.value
  const id = gameId.value
  if (!current || !id) return

  const snapshot = current.toSnapshot() as GameSnapshot<unknown>
  const winnerId = current.winnerId

  void saveGame({
    id,
    snapshot,
    inputMode: inputMode.value,
    status: winnerId !== null ? 'finished' : 'in-progress',
    winnerId,
  }).catch((error: unknown) => {
    storageError.value =
      error instanceof StorageFullError ? error.message : "La partie n'a pas pu être enregistrée."
    console.error('Enregistrement de la partie impossible', error)
  })
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
    gameId.value = crypto.randomUUID()
    lastLaunch = { rule: gameRule, config, players }
    inputMode.value = gameRule.requiresDartDetail ? 'dart' : mode
    storageError.value = null
    touch()
    persist()
    void markPlayed(players)
  }

  /**
   * Reprend une partie interrompue — §4.4, #31.
   *
   * Le journal est rejoué par le moteur : on retrouve non seulement les scores,
   * mais aussi le joueur actif, la volée en cours et la possibilité d'annuler.
   */
  function resume(stored: StoredGame): boolean {
    const storedRule = findRule(stored.ruleId)
    if (!storedRule) {
      storageError.value = `Le mode « ${stored.ruleId} » n'existe plus dans cette version.`
      return false
    }

    try {
      session.value = GameSession.restore(storedRule, {
        ruleId: stored.ruleId,
        config: stored.config,
        players: stored.players,
        inputs: stored.inputs,
      })
    } catch (error) {
      storageError.value = 'Cette partie est illisible et ne peut pas être reprise.'
      console.error('Reprise impossible', error)
      return false
    }

    rule.value = storedRule
    gameId.value = stored.id
    lastLaunch = { rule: storedRule, config: stored.config, players: stored.players }
    inputMode.value = stored.inputMode
    storageError.value = null
    touch()
    return true
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
      persist()
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
      persist()
      return null
    } catch (error) {
      return error instanceof Error ? error.message : 'Saisie refusée.'
    }
  }

  function undo() {
    if (session.value?.undo()) {
      touch()
      persist()
    }
  }

  function undoTurn() {
    if (session.value?.undoTurn()) {
      touch()
      persist()
    }
  }

  /**
   * Quitte l'écran de partie.
   *
   * Une partie non terminée **reste enregistrée en cours** : c'est tout
   * l'intérêt de #31. Pour s'en débarrasser, il faut l'abandonner explicitement.
   */
  function quit() {
    session.value = null
    rule.value = null
    gameId.value = null
    storageError.value = null
    touch()
  }

  /** §4.4 — abandon explicite : la partie sort des reprises proposées. */
  async function abandon() {
    const id = gameId.value
    quit()
    if (id) await abandonGame(id)
  }

  function snapshot(): GameSnapshot<unknown> | null {
    return (session.value?.toSnapshot() as GameSnapshot<unknown>) ?? null
  }

  return {
    rule,
    gameId,
    view,
    isActive,
    isFinished,
    winner,
    canUndo,
    checkout,
    lastEffects,
    storageError,
    inputMode,
    effectiveInputMode,
    requiresDartDetail,
    start,
    resume,
    rematch,
    throwDart,
    submitTurnTotal,
    undo,
    undoTurn,
    quit,
    abandon,
    snapshot,
  }
}
