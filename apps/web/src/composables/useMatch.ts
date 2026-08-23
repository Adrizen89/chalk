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
import type {
  AnyGameRule,
  Dart,
  GameEffect,
  GameSnapshot,
  GameView,
  PlayerId,
  PlayerRef,
} from '@chalk/core'
import type { X01State } from '@chalk/core'
import {
  GameSession,
  baseRuleId,
  dartValue,
  findRule,
  legStateOf,
  suggestCheckout,
} from '@chalk/core'
import { StorageFullError, abandonGame, markPlayed, saveGame } from '@/db'
import { randomId } from '@/lib/id'
import type { StoredGame } from '@/db'

/** §4.3 — deux modes de saisie, choisis dans les réglages. */
export type InputMode = 'turn' | 'dart'

/**
 * Nombre de volées rappelées sous le tableau de score.
 *
 * Trois : de quoi contrôler la saisie qu'on vient de faire et celle d'avant,
 * sans transformer l'écran de partie en historique.
 */
const RECENT_TURNS = 3

/**
 * Une volée terminée, telle qu'on la rappelle à l'écran.
 *
 * Le total vient de l'effet `turn-ended`, donc du moteur : l'interface ne
 * recompte rien, exactement comme les statistiques du §4.7. Une volée qui
 * gagne le leg fait exception — elle s'arrête sur `leg-won` sans passer par
 * `turn-ended` — d'où le repli sur les entrées elles-mêmes.
 */
export interface RecentTurn {
  readonly playerId: PlayerId
  readonly name: string
  readonly total: number
  readonly bust: boolean
  /** Détail des fléchettes. Vide en saisie par volée, qui n'en connaît aucune. */
  readonly darts: readonly Dart[]
}

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
    const id = rule.value?.id
    if (!session.value || !id || baseRule.value !== 'x01') return null
    // Fonctionne que la partie soit un leg sec ou un match en plusieurs legs.
    return suggestCheckout(legStateOf<X01State>(id, session.value.state))
  })

  /**
   * Identifiant du mode de jeu **sous-jacent**.
   *
   * Une règle enveloppée dans un match (§4.4) porte l'identifiant
   * `match:x01`. Tout ce qui adapte l'affichage au mode — suggestions de
   * sortie, tableau de marques du Cricket — doit raisonner là-dessus, sinon
   * ces affichages disparaissent silencieusement dès qu'on joue en legs.
   */
  const baseRule = computed(() => (rule.value ? baseRuleId(rule.value.id) : null))

  const requiresDartDetail = computed(() => rule.value?.requiresDartDetail ?? false)

  const effectiveInputMode = computed<InputMode>(() =>
    requiresDartDetail.value ? 'dart' : inputMode.value,
  )

  /**
   * §4.3, §5 — rappel des dernières volées validées.
   *
   * En saisie par volée, le score saisi disparaît à la validation : il ne
   * reste que le score restant. Or la question qui revient sans arrêt quand on
   * marque pour les autres est « j'ai bien mis 60 ? ». Sans ce rappel, la
   * seule façon de vérifier est d'annuler — c'est-à-dire de défaire
   * précisément ce qu'on voulait contrôler.
   *
   * La projection se fait depuis le journal d'entrées, comme les statistiques
   * (§4.7). Une volée annulée ou corrigée disparaît donc du rappel sans aucun
   * traitement particulier : elle n'est plus dans le journal.
   */
  const recentTurns = computed<RecentTurn[]>(() => {
    trackSession()
    const current = session.value
    if (!current) return []

    const names = new Map(
      (view.value?.players ?? []).map((player) => [player.playerId, player.name] as const),
    )

    const turns: RecentTurn[] = []
    let darts: Dart[] = []
    let scored = 0
    let playerId: PlayerId | null = null

    for (const recorded of current.history) {
      playerId ??= recorded.playerId
      if (recorded.input.kind === 'dart') {
        darts.push(recorded.input.dart)
        scored += dartValue(recorded.input.dart)
      } else {
        scored += recorded.input.total
      }

      const ended = recorded.effects.find(
        (effect): effect is Extract<GameEffect, { type: 'turn-ended' }> =>
          effect.type === 'turn-ended',
      )
      const bust = recorded.effects.some((effect) => effect.type === 'bust')
      /*
       * Une volée qui gagne le leg s'arrête sur `leg-won` sans émettre
       * `turn-ended`. Sans ce cas, la volée la plus intéressante de la partie
       * serait la seule à ne pas apparaître.
       */
      const won = recorded.effects.some(
        (effect) => effect.type === 'leg-won' || effect.type === 'game-won',
      )
      if (!ended && !bust && !won) continue

      if (playerId !== null) {
        turns.push({
          playerId,
          name: names.get(playerId) ?? '',
          // Une volée bustée ne marque rien, y compris ce qui l'avait été avant.
          total: bust ? 0 : (ended?.total ?? scored),
          bust,
          darts,
        })
      }

      darts = []
      scored = 0
      playerId = null
    }

    return turns.slice(-RECENT_TURNS)
  })

  function start(
    gameRule: AnyGameRule,
    config: unknown,
    players: readonly PlayerRef[],
    mode: InputMode = 'turn',
  ) {
    rule.value = gameRule
    session.value = new GameSession(gameRule, config, players)
    gameId.value = randomId()
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
    baseRule,
    gameId,
    view,
    isActive,
    isFinished,
    winner,
    canUndo,
    checkout,
    recentTurns,
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
