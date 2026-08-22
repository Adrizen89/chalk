<script setup lang="ts">
/**
 * Choix des cibles d'un exercice — §4.5, #47.
 *
 * « Choix de la ou des cibles (segment + multiplicateur). »
 *
 * L'ordre compte : c'est celui dans lequel l'exercice les enchaînera. On
 * l'affiche donc, et on peut retirer une cible sans tout recommencer.
 */
import { ref } from 'vue'
import type { AimPoint, Multiplier, Segment } from '@chalk/core'
import { BULL, formatTarget } from '@chalk/core'

const targets = defineModel<AimPoint[]>({ required: true })

const multiplier = ref<Multiplier>(3)
const SEGMENTS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const

const MULTIPLIERS = [
  { value: 1, label: 'Simple', class: 'bg-slate-raised' },
  { value: 2, label: 'Double', class: 'bg-board-green' },
  { value: 3, label: 'Triple', class: 'bg-board-red' },
] as const

/** Le validateur borne à 30 : au-delà, l'exercice n'a plus de forme. */
const MAX = 30

function add(segment: Segment, forced?: Multiplier) {
  if (targets.value.length >= MAX) return
  targets.value = [...targets.value, { segment, multiplier: forced ?? multiplier.value }]
}

function removeAt(index: number) {
  targets.value = targets.value.filter((_, position) => position !== index)
}

/** Raccourci : les vingt doubles d'un coup, pour un tour complet. */
function addAllDoubles() {
  targets.value = Array.from({ length: 20 }, (_, i) => ({
    segment: (i + 1) as Segment,
    multiplier: 2 as Multiplier,
  }))
}
</script>

<template>
  <div class="space-y-2">
    <ul v-if="targets.length > 0" class="flex flex-wrap gap-1.5">
      <li v-for="(target, index) in targets" :key="index">
        <button
          type="button"
          class="tap num gap-1 bg-slate-raised px-2 text-sm text-chalk"
          :aria-label="`Retirer ${formatTarget(target)}`"
          @click="removeAt(index)"
        >
          <span class="text-[0.6rem] text-chalk-dim">{{ index + 1 }}</span>
          {{ formatTarget(target) }}
          <span class="text-chalk-dim">✕</span>
        </button>
      </li>
    </ul>
    <p v-else class="text-xs text-chalk-dim">Aucune cible. Touchez un numéro pour l'ajouter.</p>

    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="option in MULTIPLIERS"
        :key="option.value"
        type="button"
        class="tap h-10 text-xs font-bold"
        :class="[
          option.class,
          multiplier === option.value
            ? 'text-on-board ring-2 ring-accent'
            : 'text-on-board/70 opacity-60',
        ]"
        :aria-pressed="multiplier === option.value"
        @click="multiplier = option.value"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="grid grid-cols-5 gap-1.5">
      <button
        v-for="segment in SEGMENTS"
        :key="segment"
        type="button"
        class="tap num h-10 bg-slate-surface text-sm text-chalk active:bg-slate-line"
        @click="add(segment)"
      >
        {{ segment }}
      </button>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <button
        type="button"
        class="tap h-10 bg-board-green text-xs font-bold text-on-board"
        @click="add(BULL, 1)"
      >
        25
      </button>
      <button
        type="button"
        class="tap h-10 bg-board-red text-xs font-bold text-on-board"
        @click="add(BULL, 2)"
      >
        BULL
      </button>
      <button
        type="button"
        class="tap h-10 bg-slate-surface text-xs text-chalk-dim active:bg-slate-line"
        @click="addAllDoubles()"
      >
        Tous les doubles
      </button>
    </div>
  </div>
</template>
