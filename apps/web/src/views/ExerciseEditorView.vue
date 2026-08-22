<script setup lang="ts">
/**
 * Création d'un exercice personnalisé — §4.5, #47.
 *
 * Le cahier des charges en fait « le point important » du module : « choix de
 * la ou des cibles, nombre de volées ou de manches, condition de réussite et
 * barème, nom, description, enregistrement dans sa bibliothèque personnelle,
 * possibilité de partager via un lien ».
 *
 * L'écran ne produit que des **données** : elles passent par le même
 * validateur que les exercices reçus d'un lien, et sont exécutées par les
 * mêmes implémentations que les exercices intégrés.
 */
import { computed, ref } from 'vue'
import type { AimPoint, CustomExerciseDefinition, ExerciseMetric, ExerciseSkill } from '@chalk/core'
import {
  InvalidExerciseError,
  decodeSharedExercise,
  encodeSharedExercise,
  validateCustomExercise,
} from '@chalk/core'
import TargetPicker from '@/components/TargetPicker.vue'
import { newCustomExerciseId, saveCustomExercise } from '@/db'

const emit = defineEmits<{ close: []; saved: [] }>()

type Kind = CustomExerciseDefinition['kind']

const kind = ref<Kind>('targets')
const name = ref('')
const description = ref('')
const error = ref<string | null>(null)
const shareLink = ref<string | null>(null)
const importText = ref('')

// Cibles
const targets = ref<AimPoint[]>([])
const dartsPerTarget = ref<number | null>(3)
const advanceOnHit = ref(false)
const laps = ref(1)
const scoring = ref<'hits' | 'value' | 'none'>('value')
const match = ref<'exact' | 'segment'>('exact')
const trackStreak = ref(false)
const metric = ref<ExerciseMetric>('score')
const higherIsBetter = ref(true)
const skill = ref<ExerciseSkill>('precision')

// Scoring
const turns = ref(10)
const threshold = ref(100)

// Sorties
const rounds = ref(10)
const minScore = ref(41)
const maxScore = ref(170)

const KINDS: { value: Kind; label: string; hint: string }[] = [
  { value: 'targets', label: 'Cibles', hint: 'enchaîner des segments précis' },
  { value: 'scoring', label: 'Volées', hint: 'compter les volées au-dessus d’un seuil' },
  { value: 'checkout', label: 'Sorties', hint: 'sortir des scores tirés au sort' },
]

/** Construit la définition, sans la valider : c'est le rôle du moteur. */
function draft(id: string): unknown {
  const common = { id, name: name.value.trim(), description: description.value.trim() }
  switch (kind.value) {
    case 'targets':
      return {
        ...common,
        kind: 'targets',
        skill: skill.value,
        targets: targets.value,
        dartsPerTarget: dartsPerTarget.value,
        advanceOnHit: advanceOnHit.value,
        laps: laps.value,
        scoring: scoring.value,
        match: match.value,
        trackStreak: trackStreak.value,
        metric: metric.value,
        higherIsBetter: higherIsBetter.value,
      }
    case 'scoring':
      return { ...common, kind: 'scoring', turns: turns.value, threshold: threshold.value }
    case 'checkout':
      return {
        ...common,
        kind: 'checkout',
        rounds: rounds.value,
        min: minScore.value,
        max: maxScore.value,
      }
  }
}

/**
 * Validation en direct.
 *
 * Le même validateur que celui appliqué aux exercices reçus par lien : mieux
 * vaut apprendre tout de suite qu'un exercice ne pourrait jamais se terminer
 * qu'au moment de l'enregistrer.
 */
const validation = computed<{ ok: true } | { ok: false; reason: string }>(() => {
  try {
    validateCustomExercise(draft('preview'))
    return { ok: true }
  } catch (caught) {
    return {
      ok: false,
      reason: caught instanceof InvalidExerciseError ? caught.message : 'Définition invalide.',
    }
  }
})

async function save() {
  error.value = null
  try {
    const definition = validateCustomExercise(draft(newCustomExerciseId()))
    await saveCustomExercise(definition)
    emit('saved')
  } catch (caught) {
    error.value =
      caught instanceof InvalidExerciseError ? caught.message : 'Enregistrement impossible.'
  }
}

/** §4.5 — « possibilité de partager un exercice via un lien ». */
function share() {
  error.value = null
  try {
    const definition = validateCustomExercise(draft(newCustomExerciseId()))
    const code = encodeSharedExercise(definition)
    shareLink.value = `${window.location.origin}/?exercice=${code}`
    void navigator.clipboard?.writeText(shareLink.value)
  } catch (caught) {
    error.value = caught instanceof InvalidExerciseError ? caught.message : 'Partage impossible.'
  }
}

/** Import : ce qui arrive de l'extérieur est revalidé, jamais exécuté sur parole. */
async function importShared() {
  error.value = null
  const raw = importText.value.trim()
  if (!raw) return
  try {
    const code = raw.includes('exercice=') ? (raw.split('exercice=')[1] ?? '') : raw
    const definition = decodeSharedExercise(code)
    await saveCustomExercise({ ...definition, id: newCustomExerciseId() })
    importText.value = ''
    emit('saved')
  } catch (caught) {
    error.value = caught instanceof InvalidExerciseError ? caught.message : 'Lien illisible.'
  }
}
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-lg flex-col px-3">
    <header class="safe-top flex shrink-0 items-center gap-2 pb-2">
      <button
        type="button"
        class="tap px-2 text-sm text-chalk-dim"
        aria-label="Annuler"
        @click="emit('close')"
      >
        ✕
      </button>
      <h1 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">Nouvel exercice</h1>
    </header>

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto pb-4">
      <section>
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Type</h2>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="choice in KINDS"
            :key="choice.value"
            type="button"
            class="tap flex-col gap-0 px-1 text-xs leading-tight"
            :class="
              kind === choice.value
                ? 'bg-accent font-bold text-on-accent'
                : 'bg-slate-surface text-chalk'
            "
            @click="kind = choice.value"
          >
            <span>{{ choice.label }}</span>
            <span class="text-[0.6rem] font-normal opacity-70">{{ choice.hint }}</span>
          </button>
        </div>
      </section>

      <section class="space-y-2">
        <input
          v-model="name"
          type="text"
          maxlength="60"
          placeholder="Nom de l'exercice"
          class="tap w-full justify-start rounded-xl bg-slate-surface px-3 text-base text-chalk placeholder:text-chalk-dim/60 focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <input
          v-model="description"
          type="text"
          maxlength="300"
          placeholder="Description (facultatif)"
          class="tap w-full justify-start rounded-xl bg-slate-surface px-3 text-sm text-chalk placeholder:text-chalk-dim/60 focus:ring-2 focus:ring-accent focus:outline-none"
        />
      </section>

      <!-- Exercice de cibles -->
      <template v-if="kind === 'targets'">
        <section>
          <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">
            Cibles, dans l'ordre
          </h2>
          <TargetPicker v-model="targets" />
        </section>

        <section class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">
              Fléchettes par cible
            </span>
            <select
              :value="dartsPerTarget === null ? 'illimite' : String(dartsPerTarget)"
              class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
              @change="
                dartsPerTarget =
                  ($event.target as HTMLSelectElement).value === 'illimite'
                    ? null
                    : Number(($event.target as HTMLSelectElement).value)
              "
            >
              <option v-for="n in [1, 2, 3, 6, 9]" :key="n" :value="String(n)">{{ n }}</option>
              <option value="illimite">Jusqu'au touché</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Passages</span>
            <select
              v-model.number="laps"
              class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
            >
              <option v-for="n in [1, 2, 3, 5, 10]" :key="n" :value="n">{{ n }}</option>
            </select>
          </label>
        </section>

        <section class="space-y-2">
          <button
            type="button"
            class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk"
            role="switch"
            :aria-checked="advanceOnHit"
            @click="advanceOnHit = !advanceOnHit"
          >
            <span>Passer à la cible suivante dès le touché</span>
            <span class="text-xs font-bold" :class="advanceOnHit ? 'text-ok' : 'text-chalk-dim'">
              {{ advanceOnHit ? 'Oui' : 'Non' }}
            </span>
          </button>
          <button
            type="button"
            class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk"
            role="switch"
            :aria-checked="match === 'segment'"
            @click="match = match === 'segment' ? 'exact' : 'segment'"
          >
            <span>Accepter tout multiplicateur</span>
            <span
              class="text-xs font-bold"
              :class="match === 'segment' ? 'text-ok' : 'text-chalk-dim'"
            >
              {{ match === 'segment' ? 'Oui' : 'Non' }}
            </span>
          </button>
          <button
            type="button"
            class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk"
            role="switch"
            :aria-checked="trackStreak"
            @click="trackStreak = !trackStreak"
          >
            <span>Compter les séries</span>
            <span class="text-xs font-bold" :class="trackStreak ? 'text-ok' : 'text-chalk-dim'">
              {{ trackStreak ? 'Oui' : 'Non' }}
            </span>
          </button>
        </section>

        <section class="grid grid-cols-2 gap-3">
          <label class="block">
            <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Barème</span>
            <select
              v-model="scoring"
              class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
            >
              <option value="value">Valeur touchée</option>
              <option value="hits">1 par touché</option>
              <option value="none">Aucun score</option>
            </select>
          </label>
          <label class="block">
            <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Mesure</span>
            <select
              v-model="metric"
              class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
              @change="higherIsBetter = metric !== 'darts'"
            >
              <option value="score">Score</option>
              <option value="hits">Touchés</option>
              <option value="streak">Meilleure série</option>
              <option value="darts">Fléchettes (le moins possible)</option>
            </select>
          </label>
        </section>
      </template>

      <!-- Exercice de volées -->
      <section v-else-if="kind === 'scoring'" class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Volées</span>
          <select
            v-model.number="turns"
            class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
          >
            <option v-for="n in [5, 10, 15, 20, 30]" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Seuil</span>
          <select
            v-model.number="threshold"
            class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
          >
            <option v-for="n in [40, 60, 80, 100, 120, 140]" :key="n" :value="n">{{ n }}+</option>
          </select>
        </label>
      </section>

      <!-- Exercice de sorties -->
      <section v-else class="grid grid-cols-3 gap-3">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Sorties</span>
          <select
            v-model.number="rounds"
            class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
          >
            <option v-for="n in [5, 10, 15, 20]" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">De</span>
          <select
            v-model.number="minScore"
            class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
          >
            <option v-for="n in [2, 20, 41, 61, 81]" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">À</span>
          <select
            v-model.number="maxScore"
            class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
          >
            <option v-for="n in [60, 100, 130, 170]" :key="n" :value="n">{{ n }}</option>
          </select>
        </label>
      </section>

      <!-- §4.5 — partage par lien -->
      <section class="space-y-2 border-t border-slate-line pt-3">
        <h2 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">Partage</h2>
        <p
          v-if="shareLink"
          class="rounded-xl bg-slate-surface px-3 py-2 text-xs break-all text-chalk"
        >
          {{ shareLink }}
          <span class="block text-chalk-dim">Copié dans le presse-papiers.</span>
        </p>
        <input
          v-model="importText"
          type="text"
          placeholder="Coller un lien reçu pour l'importer"
          class="tap w-full justify-start rounded-xl bg-slate-surface px-3 text-sm text-chalk placeholder:text-chalk-dim/60 focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <button
          type="button"
          class="tap h-10 w-full bg-slate-raised text-xs font-semibold text-chalk disabled:opacity-30"
          :disabled="importText.trim().length === 0"
          @click="importShared()"
        >
          Importer
        </button>
      </section>
    </div>

    <div class="safe-bottom shrink-0 space-y-2 pt-2">
      <p v-if="error" class="text-center text-sm font-medium text-bust" role="alert">{{ error }}</p>
      <p
        v-else-if="!validation.ok && name.trim().length > 0"
        class="text-center text-xs text-chalk-dim"
        role="status"
      >
        {{ validation.reason }}
      </p>

      <div class="grid grid-cols-3 gap-2">
        <button
          type="button"
          class="tap h-14 bg-slate-raised text-xs font-semibold text-chalk disabled:opacity-30"
          :disabled="!validation.ok"
          @click="share()"
        >
          Partager
        </button>
        <button
          type="button"
          class="tap col-span-2 h-14 bg-accent text-sm font-bold text-on-accent disabled:opacity-30"
          :disabled="!validation.ok"
          @click="save()"
        >
          Enregistrer
        </button>
      </div>
    </div>
  </div>
</template>
