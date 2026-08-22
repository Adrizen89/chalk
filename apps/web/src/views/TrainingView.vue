<script setup lang="ts">
/**
 * Module Entraînement — §4.5.
 *
 * « Espace distinct des parties, conçu pour la pratique solo. » Trois écrans en
 * un : la bibliothèque, l'exécution d'un exercice, et le bilan.
 *
 * Tout fonctionne hors ligne : rien ici ne dépend du réseau.
 */
import { computed, onMounted, onUnmounted, ref, shallowRef } from 'vue'
import type { AnyExerciseRule, Dart } from '@chalk/core'
import { builtInExercises, createCustomExercise } from '@chalk/core'
import DartPad from '@/components/DartPad.vue'
import AverageChart from '@/components/AverageChart.vue'
import ExerciseEditorView from '@/views/ExerciseEditorView.vue'
import type { StoredSession } from '@/db'
import {
  deleteCustomExercise,
  deleteSession,
  estimateSessionSeconds,
  listCustomExercises,
  listSessions,
  personalBest,
  progressCurve,
  saveSession,
} from '@/db'
import type { StoredExerciseResult } from '@/db'
import { useTraining } from '@/composables/useTraining'
import { formatDuration, useSession } from '@/composables/useSession'
import { useWakeLock } from '@/composables/useWakeLock'

defineEmits<{ close: [] }>()

const training = useTraining()
const { view, isActive, isFinished, result, canUndo, isTimed, elapsedSeconds, isPersonalBest } =
  training

/** §5 — l'écran ne doit pas s'éteindre entre deux volées. */
const wakeLock = useWakeLock()
onMounted(() => void wakeLock.request())
onUnmounted(() => {
  void wakeLock.release()
  training.quit()
})

const exercises = shallowRef<AnyExerciseRule[]>([])
/** §4.5, #47 — écran de création d'un exercice personnalisé. */
const editing = ref(false)

/** §4.5, #48 — séances : enchaînement de plusieurs exercices. */
const sessionRunner = useSession()
const sessions = shallowRef<StoredSession[]>([])
const durations = ref<Record<string, number>>({})
const composing = ref(false)
const draftName = ref('')
const draftIds = ref<string[]>([])
const records = ref<Record<string, StoredExerciseResult | null>>({})
const curve = shallowRef<{ at: number; average: number }[]>([])

const SKILL_LABELS: Record<string, string> = {
  doubles: 'Doubles',
  scoring: 'Scoring',
  checkout: 'Sorties',
  precision: 'Précision',
}

async function loadLibrary() {
  const custom = (await listCustomExercises()).map((entry) =>
    createCustomExercise(entry.definition),
  )
  exercises.value = [...builtInExercises(), ...custom]

  const entries = await Promise.all(
    exercises.value.map(
      async (exercise) => [exercise.id, await personalBest(exercise.id)] as const,
    ),
  )
  records.value = Object.fromEntries(entries)

  sessions.value = await listSessions()
  const estimates = await Promise.all(
    sessions.value.map(
      async (entry) => [entry.id, await estimateSessionSeconds(entry.exerciseIds)] as const,
    ),
  )
  durations.value = Object.fromEntries(estimates)
}

const findExercise = (id: string) => exercises.value.find((exercise) => exercise.id === id)

function toggleDraft(id: string) {
  draftIds.value = draftIds.value.includes(id)
    ? draftIds.value.filter((entry) => entry !== id)
    : [...draftIds.value, id]
}

async function saveDraft() {
  if (draftIds.value.length === 0) return
  await saveSession({ name: draftName.value || 'Ma séance', exerciseIds: draftIds.value })
  draftName.value = ''
  draftIds.value = []
  composing.value = false
  await loadLibrary()
}

async function beginSession(stored: StoredSession) {
  if (!sessionRunner.start(stored, findExercise)) return
  const first = sessionRunner.current.value
  if (first) await begin(first)
}

async function removeSession(stored: StoredSession) {
  await deleteSession(stored.id)
  await loadLibrary()
}

/** Interrompt la séance en cours et revient à la bibliothèque. */
function stopSession() {
  sessionRunner.stop()
  training.quit()
}

/** §4.5 — enchaîne sur l'exercice suivant de la séance, ou la clôt. */
async function continueSession() {
  const hasNext = await sessionRunner.advance()
  if (!hasNext) {
    sessionRunner.stop()
    training.quit()
    await loadLibrary()
    return
  }
  const next = sessionRunner.current.value
  if (next) await begin(next)
}

onMounted(loadLibrary)

async function onSaved() {
  editing.value = false
  await loadLibrary()
}

async function removeCustom(exercise: AnyExerciseRule) {
  await deleteCustomExercise(exercise.id)
  await loadLibrary()
}

async function begin(exercise: AnyExerciseRule) {
  training.start(exercise)
  curve.value = []
}

async function finishAndReview() {
  const id = training.exercise.value?.id
  if (!id) return
  const points = await progressCurve(id)
  // `AverageChart` parle en moyennes ; la forme est la même.
  curve.value = points.map((point) => ({ at: point.at, average: point.value }))
  await loadLibrary()
}

function onDart(dart: Dart) {
  void training.throwDart(dart).then(() => {
    if (isFinished.value) void finishAndReview()
  })
}

const formattedTime = computed(() => {
  const minutes = Math.floor(elapsedSeconds.value / 60)
  const seconds = elapsedSeconds.value % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
})

function recordLabel(exercise: AnyExerciseRule): string | null {
  const best = records.value[exercise.id]
  if (!best) return null
  const suffix = best.metric === 'darts' ? ' fléch.' : ''
  return `${best.metricValue}${suffix}`
}
</script>

<template>
  <ExerciseEditorView v-if="editing" @close="editing = false" @saved="onSaved()" />

  <div v-else class="mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden px-3">
    <header class="safe-top flex shrink-0 items-center gap-2 pb-2">
      <button
        type="button"
        class="tap px-2 text-sm text-chalk-dim"
        :aria-label="isActive ? 'Quitter l’exercice' : 'Fermer l’entraînement'"
        @click="isActive ? training.quit() : $emit('close')"
      >
        ✕
      </button>
      <h1 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">
        {{ isActive ? view?.name : 'Entraînement' }}
      </h1>
      <span v-if="isActive && isTimed" class="num ml-auto text-sm font-bold text-accent">
        {{ formattedTime }}
      </span>
      <button
        v-else-if="isActive"
        type="button"
        class="tap ml-auto bg-slate-surface px-3 text-sm text-chalk disabled:opacity-30"
        :disabled="!canUndo"
        @click="training.undo()"
      >
        ↶ Annuler
      </button>
    </header>

    <!-- Bibliothèque -->
    <div v-if="!isActive" class="min-h-0 flex-1 space-y-2 overflow-y-auto pb-6">
      <div class="flex items-center gap-2">
        <p class="flex-1 text-xs text-chalk-dim">Pratique solo. Tout fonctionne sans réseau.</p>
        <!-- §4.5 : « l'utilisateur doit pouvoir créer les siens ». -->
        <button
          type="button"
          class="tap shrink-0 bg-accent px-3 text-xs font-bold text-on-accent"
          @click="editing = true"
        >
          + Créer
        </button>
      </div>

      <!-- §4.5, #48 — séances enregistrées. -->
      <section v-if="sessions.length > 0 && !composing">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Séances</h2>
        <ul class="space-y-2">
          <li
            v-for="entry in sessions"
            :key="entry.id"
            class="flex items-stretch overflow-hidden rounded-2xl bg-slate-surface"
          >
            <button
              type="button"
              class="tap min-w-0 flex-1 flex-col items-start gap-0.5 p-3 text-left"
              @click="beginSession(entry)"
            >
              <span class="font-semibold text-chalk">{{ entry.name }}</span>
              <span class="text-xs font-normal text-chalk-dim">
                {{ entry.exerciseIds.length }} exercices ·
                {{ formatDuration(durations[entry.id] ?? 0) }} environ
              </span>
            </button>
            <button
              type="button"
              class="tap w-10 shrink-0 border-l border-slate-line text-chalk-dim"
              :aria-label="`Supprimer la séance ${entry.name}`"
              @click="removeSession(entry)"
            >
              ✕
            </button>
          </li>
        </ul>
      </section>

      <!-- Composition d'une séance : on touche les exercices dans l'ordre. -->
      <section
        v-if="composing"
        class="space-y-2 rounded-2xl border border-accent/50 bg-accent/10 p-3"
      >
        <input
          v-model="draftName"
          type="text"
          maxlength="40"
          placeholder="Nom de la séance"
          class="tap w-full justify-start rounded-xl bg-slate-surface px-3 text-sm text-chalk placeholder:text-chalk-dim/60 focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <p class="text-xs text-chalk-dim">Touchez les exercices à enchaîner, dans l'ordre voulu.</p>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="tap h-11 bg-slate-raised text-xs font-semibold text-chalk"
            @click="composing = false"
          >
            Annuler
          </button>
          <button
            type="button"
            class="tap h-11 bg-accent text-xs font-bold text-on-accent disabled:opacity-30"
            :disabled="draftIds.length === 0"
            @click="saveDraft()"
          >
            Enregistrer ({{ draftIds.length }})
          </button>
        </div>
      </section>

      <button
        v-if="!composing && exercises.length > 0"
        type="button"
        class="tap h-11 w-full bg-slate-raised text-xs font-semibold text-chalk"
        @click="composing = true"
      >
        + Composer une séance
      </button>

      <div
        v-for="exercise in exercises"
        :key="exercise.id"
        class="flex items-stretch overflow-hidden rounded-2xl bg-slate-surface"
        :class="composing && draftIds.includes(exercise.id) ? 'ring-2 ring-accent' : ''"
      >
        <button
          type="button"
          class="tap min-w-0 flex-1 flex-col items-start gap-1 p-3 text-left"
          @click="composing ? toggleDraft(exercise.id) : begin(exercise)"
        >
          <span class="flex w-full items-baseline gap-2">
            <span class="font-semibold text-chalk">{{ exercise.name }}</span>
            <span
              class="rounded px-1.5 py-0.5 text-[0.6rem] font-medium"
              :class="
                exercise.custom ? 'bg-board-green text-on-board' : 'bg-slate-line text-chalk-dim'
              "
            >
              {{ exercise.custom ? 'Perso' : SKILL_LABELS[exercise.skill] }}
            </span>
            <span v-if="recordLabel(exercise)" class="num ml-auto text-sm font-bold text-accent">
              {{ recordLabel(exercise) }}
            </span>
          </span>
          <span class="text-xs leading-snug font-normal text-chalk-dim">
            {{ exercise.description }}
          </span>
        </button>
        <button
          v-if="exercise.custom"
          type="button"
          class="tap w-10 shrink-0 border-l border-slate-line text-chalk-dim"
          :aria-label="`Supprimer ${exercise.name}`"
          @click="removeCustom(exercise)"
        >
          ✕
        </button>
      </div>
    </div>

    <!-- Exécution -->
    <template v-else-if="view && !isFinished">
      <div class="min-h-0 flex-1 overflow-y-auto">
        <div class="rounded-2xl border border-accent/50 bg-accent/10 px-4 py-3 text-center">
          <p class="text-xs tracking-wide text-chalk-dim uppercase">À viser</p>
          <p class="num mt-1 text-4xl leading-none font-bold text-accent">
            {{ view.targetLabel }}
          </p>
        </div>

        <div class="mt-3 flex items-baseline gap-3 rounded-xl bg-slate-surface px-4 py-2">
          <span class="num text-4xl leading-none font-bold text-chalk">{{ view.primary }}</span>
          <dl class="ml-auto flex flex-wrap justify-end gap-x-4 gap-y-0.5 text-xs text-chalk-dim">
            <div v-for="stat in view.secondary" :key="stat.label" class="flex gap-1">
              <dt>{{ stat.label }}</dt>
              <dd class="num font-semibold text-chalk">{{ stat.value }}</dd>
            </div>
          </dl>
        </div>

        <div class="mt-2 flex items-center gap-2 text-xs text-chalk-dim">
          <span class="num">{{ view.progress.done }} / {{ view.progress.total }}</span>
          <div class="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-surface">
            <div
              class="h-full rounded-full bg-accent transition-[width] duration-150"
              :style="{
                width: `${view.progress.total === 0 ? 0 : (view.progress.done / view.progress.total) * 100}%`,
              }"
            />
          </div>
          <span v-if="view.dartsRemainingInRound !== null" class="num">
            {{ view.dartsRemainingInRound }} fléch.
          </span>
        </div>

        <p v-if="view.message" class="mt-2 text-center text-sm font-medium text-bust" role="status">
          {{ view.message }}
        </p>
      </div>

      <div class="safe-bottom shrink-0 pt-2">
        <DartPad @throw="onDart" />
      </div>
    </template>

    <!-- Bilan -->
    <div v-else-if="result" class="min-h-0 flex-1 space-y-3 overflow-y-auto pb-6">
      <div
        class="rounded-2xl border p-4 text-center"
        :class="isPersonalBest ? 'border-ok bg-ok/10' : 'border-slate-line bg-slate-surface'"
      >
        <p v-if="isPersonalBest" class="text-sm font-bold text-ok">🎯 Record personnel</p>
        <p v-else class="text-sm text-chalk-dim">Terminé</p>
        <p class="num mt-1 text-5xl font-bold text-chalk">{{ result.metricValue }}</p>
        <p class="mt-1 text-xs text-chalk-dim">
          {{
            result.metric === 'darts'
              ? 'fléchettes'
              : result.metric === 'streak'
                ? 'de série'
                : 'points'
          }}
          · {{ result.hits }}/{{ result.attempts }} réussis
          <template v-if="isTimed"> · {{ formattedTime }}</template>
        </p>
      </div>

      <AverageChart v-if="curve.length > 1" :points="curve" />

      <!-- §4.5 — au sein d'une séance, on enchaîne plutôt que de revenir. -->
      <div v-if="sessionRunner.isActive.value" class="space-y-2">
        <p class="text-center text-xs text-chalk-dim">
          Séance {{ sessionRunner.session.value?.name }} —
          {{ sessionRunner.progress.value.done + 1 }} sur
          {{ sessionRunner.progress.value.total }}
        </p>
        <div class="grid grid-cols-2 gap-2">
          <button
            type="button"
            class="tap h-14 bg-slate-raised text-sm font-semibold text-chalk"
            @click="stopSession()"
          >
            Arrêter la séance
          </button>
          <button
            type="button"
            class="tap h-14 bg-accent text-sm font-bold text-on-accent"
            @click="continueSession()"
          >
            {{ sessionRunner.remaining.value > 1 ? 'Exercice suivant' : 'Terminer la séance' }}
          </button>
        </div>
      </div>

      <div v-else class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="tap h-14 bg-slate-raised text-sm font-semibold text-chalk"
          @click="training.quit()"
        >
          Bibliothèque
        </button>
        <button
          type="button"
          class="tap h-14 bg-accent text-sm font-bold text-on-accent"
          @click="training.restart()"
        >
          Recommencer
        </button>
      </div>
    </div>
  </div>
</template>
