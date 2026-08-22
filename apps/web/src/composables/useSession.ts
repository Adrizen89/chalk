/**
 * Séance d'entraînement en cours — §4.5, #48.
 *
 * « Composition d'une séance : enchaînement de plusieurs exercices, avec durée
 *   estimée. »
 *
 * La séance ne fait qu'orchestrer : chaque exercice s'exécute normalement et
 * enregistre son propre résultat. Il n'y a donc pas deux historiques à
 * réconcilier, et une séance interrompue laisse derrière elle les exercices
 * réellement terminés.
 */

import { computed, ref, shallowRef } from 'vue'
import type { AnyExerciseRule } from '@chalk/core'
import type { StoredSession } from '@/db'
import { markSessionRun } from '@/db'

const session = shallowRef<StoredSession | null>(null)
const queue = shallowRef<AnyExerciseRule[]>([])
const index = ref(0)

export function useSession() {
  const isActive = computed(() => session.value !== null)
  const current = computed<AnyExerciseRule | null>(() => queue.value[index.value] ?? null)
  const remaining = computed(() => Math.max(0, queue.value.length - index.value))

  const progress = computed(() => ({
    done: Math.min(index.value, queue.value.length),
    total: queue.value.length,
  }))

  /**
   * Démarre une séance.
   *
   * Les exercices introuvables sont écartés : une séance qui référence un
   * exercice supprimé doit rester jouable pour le reste (§2 — on doit toujours
   * pouvoir s'entraîner).
   */
  function start(stored: StoredSession, resolve: (id: string) => AnyExerciseRule | undefined) {
    const resolved = stored.exerciseIds
      .map(resolve)
      .filter((exercise): exercise is AnyExerciseRule => exercise !== undefined)

    session.value = stored
    queue.value = resolved
    index.value = 0
    return resolved.length > 0
  }

  /** Passe à l'exercice suivant. Retourne `false` quand la séance est finie. */
  async function advance(): Promise<boolean> {
    index.value += 1
    if (index.value < queue.value.length) return true

    const finished = session.value
    if (finished) await markSessionRun(finished.id)
    return false
  }

  function stop() {
    session.value = null
    queue.value = []
    index.value = 0
  }

  return { session, current, isActive, remaining, progress, start, advance, stop }
}

/** Durée lisible : « 12 min », « 1 h 05 ». */
export function formatDuration(seconds: number): string {
  const minutes = Math.round(seconds / 60)
  if (minutes < 60) return `${Math.max(1, minutes)} min`
  const hours = Math.floor(minutes / 60)
  return `${hours} h ${String(minutes % 60).padStart(2, '0')}`
}
