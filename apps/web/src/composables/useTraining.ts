/**
 * Séance d'entraînement en cours — §4.5.
 *
 * Même structure que `useMatch` : la session vit hors du système de réactivité
 * de Vue, et une révision déclenche les recalculs. Envelopper le journal dans
 * un `reactive` le ferait proxifier à chaque fléchette, pour rien.
 */

import { computed, ref, shallowRef } from 'vue'
import type { AnyExerciseRule, Dart, ExerciseResult, ExerciseView } from '@chalk/core'
import { ExerciseSession } from '@chalk/core'
import { saveExerciseResult } from '@/db'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySession = ExerciseSession<any>

const session = shallowRef<AnySession | null>(null)
const exercise = shallowRef<AnyExerciseRule | null>(null)
const revision = ref(0)
const startedAt = ref<number | null>(null)
const elapsedSeconds = ref(0)
const isPersonalBest = ref(false)
const saved = ref(false)

let timer: ReturnType<typeof setInterval> | undefined

function trackSession() {
  return revision.value
}

export function useTraining() {
  const view = computed<ExerciseView | null>(() => {
    trackSession()
    return session.value?.view ?? null
  })

  const isActive = computed(() => session.value !== null)

  const isFinished = computed(() => {
    trackSession()
    return session.value?.isFinished ?? false
  })

  const result = computed<ExerciseResult | null>(() => {
    trackSession()
    return session.value?.result ?? null
  })

  const canUndo = computed(() => {
    trackSession()
    return (session.value?.undoDepth ?? 0) > 0
  })

  /** §4.5 — « Around the Clock chronométré ». Le temps vit ici, pas dans la règle. */
  const isTimed = computed(() => exercise.value?.id === 'around-the-clock-chrono')

  function stopTimer() {
    clearInterval(timer)
    timer = undefined
  }

  function start(rule: AnyExerciseRule) {
    exercise.value = rule
    session.value = new ExerciseSession(rule)
    startedAt.value = Date.now()
    elapsedSeconds.value = 0
    isPersonalBest.value = false
    saved.value = false
    revision.value += 1

    stopTimer()
    timer = setInterval(() => {
      if (startedAt.value === null) return
      elapsedSeconds.value = Math.floor((Date.now() - startedAt.value) / 1000)
    }, 1000)
  }

  async function throwDart(dart: Dart) {
    if (!session.value || session.value.isFinished) return
    session.value.applyDart(dart)
    revision.value += 1

    if (session.value.isFinished) {
      stopTimer()
      await persistResult()
    }
  }

  async function persistResult() {
    const current = session.value
    const rule = exercise.value
    if (!current || !rule || saved.value) return

    try {
      const outcome = await saveExerciseResult({
        exerciseId: rule.id,
        result: current.result,
        ...(isTimed.value ? { durationSeconds: elapsedSeconds.value } : {}),
      })
      isPersonalBest.value = outcome.isPersonalBest
      saved.value = true
    } catch (error) {
      // §2 : un échec d'enregistrement ne doit pas effacer le résultat affiché.
      console.error("Enregistrement du résultat d'exercice impossible", error)
    }
  }

  function undo() {
    if (session.value?.undo()) revision.value += 1
  }

  function quit() {
    stopTimer()
    session.value = null
    exercise.value = null
    startedAt.value = null
    revision.value += 1
  }

  function restart() {
    if (exercise.value) start(exercise.value)
  }

  return {
    exercise,
    view,
    isActive,
    isFinished,
    result,
    canUndo,
    isTimed,
    elapsedSeconds,
    isPersonalBest,
    start,
    throwDart,
    undo,
    quit,
    restart,
  }
}
