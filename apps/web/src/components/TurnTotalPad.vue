<script setup lang="ts">
/**
 * Saisie par volée — §4.3, mode rapide.
 *
 * On tape le total des 3 fléchettes et on valide. Le rejet des scores
 * impossibles vient du moteur (`isReachableTurnTotal`) : la liste n'est ni
 * recopiée ni dupliquée ici.
 *
 * Disposition : pavé dans la moitié basse de l'écran, utilisable au pouce d'une
 * seule main — on tient ses fléchettes de l'autre (§5).
 */
import { computed, ref } from 'vue'
import { MAX_TURN_TOTAL, isReachableTurnTotal } from '@chalk/core'

const emit = defineEmits<{ submit: [total: number, dartsUsed?: number] }>()
const props = defineProps<{ remaining?: number | undefined }>()

const draft = ref('')

/** §4.3 — raccourcis pour les scores les plus fréquents. */
const SHORTCUTS = [26, 41, 45, 60, 85, 100, 140, 180] as const

const total = computed(() => (draft.value === '' ? null : Number(draft.value)))

const problem = computed<string | null>(() => {
  const value = total.value
  if (value === null) return null
  if (value > MAX_TURN_TOTAL) return `${value} dépasse le maximum de 180.`
  if (!isReachableTurnTotal(value)) return `${value} est impossible en 3 fléchettes.`
  if (props.remaining !== undefined && value > props.remaining) {
    return `${value} dépasserait le score restant.`
  }
  return null
})

const canSubmit = computed(() => total.value !== null && problem.value === null)

/**
 * §4.4 — la volée gagnante peut ne compter qu'une ou deux fléchettes. Sans
 * cette précision, la statistique « meilleur leg » est fausse.
 */
const asksDartCount = computed(
  () => canSubmit.value && props.remaining !== undefined && total.value === props.remaining,
)

function press(digit: string) {
  if (draft.value.length >= 3) return
  const next = draft.value === '0' ? digit : draft.value + digit
  if (Number(next) > MAX_TURN_TOTAL) return
  draft.value = next
}

function backspace() {
  draft.value = draft.value.slice(0, -1)
}

function submit(dartsUsed?: number) {
  if (!canSubmit.value || total.value === null) return
  emit('submit', total.value, dartsUsed)
  draft.value = ''
}

function shortcut(value: number) {
  draft.value = String(value)
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <!-- Zone de lecture : ce qui est en train d'être saisi, en grand. -->
    <div class="flex items-center gap-3 rounded-xl bg-slate-surface px-4 py-2">
      <span class="text-xs text-chalk-dim">Total de la volée</span>
      <span class="num ml-auto text-3xl font-bold" :class="problem ? 'text-bust' : 'text-chalk'">
        {{ draft || '—' }}
      </span>
    </div>

    <!-- §5 : message court et non bloquant, jamais de fenêtre modale. -->
    <p v-if="problem" class="text-center text-sm font-medium text-bust" role="alert">
      {{ problem }}
    </p>

    <!-- §4.4 : la volée gagnante peut ne compter qu'une ou deux fléchettes.
         Sans la réponse, la statistique « meilleur leg » est fausse. -->
    <div v-if="asksDartCount" class="rounded-xl border border-ok/50 bg-ok/10 p-2">
      <p class="mb-2 text-center text-xs font-semibold text-ok">
        Volée gagnante — en combien de fléchettes ?
      </p>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="count in [1, 2, 3]"
          :key="count"
          type="button"
          class="tap h-12 bg-ok text-sm font-bold text-slate-board"
          @click="submit(count)"
        >
          {{ count }} fléch.
        </button>
      </div>
    </div>

    <div class="flex gap-1.5 overflow-x-auto pb-1">
      <button
        v-for="value in SHORTCUTS"
        :key="value"
        type="button"
        class="tap num shrink-0 bg-slate-raised px-3 text-sm text-chalk-dim active:bg-slate-line"
        @click="shortcut(value)"
      >
        {{ value }}
      </button>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="digit in ['1', '2', '3', '4', '5', '6', '7', '8', '9']"
        :key="digit"
        type="button"
        class="tap num h-14 bg-slate-raised text-2xl text-chalk active:bg-slate-line sm:landscape:h-12"
        @click="press(digit)"
      >
        {{ digit }}
      </button>

      <button
        type="button"
        class="tap h-14 bg-slate-raised text-lg text-chalk-dim active:bg-slate-line sm:landscape:h-12"
        aria-label="Effacer le dernier chiffre"
        @click="backspace()"
      >
        ⌫
      </button>
      <button
        type="button"
        class="tap num h-14 bg-slate-raised text-2xl text-chalk active:bg-slate-line sm:landscape:h-12"
        @click="press('0')"
      >
        0
      </button>
      <button
        type="button"
        class="tap h-14 bg-accent text-base font-bold text-slate-board disabled:opacity-30 sm:landscape:h-12"
        :disabled="!canSubmit || asksDartCount"
        @click="submit()"
      >
        {{ asksDartCount ? 'Fini ?' : 'Valider' }}
      </button>
    </div>
  </div>
</template>
