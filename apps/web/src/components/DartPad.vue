<script setup lang="ts">
/**
 * Saisie fléchette par fléchette — §4.3, mode détaillé.
 *
 * Indispensable : le Cricket ne peut pas s'en passer, et c'est la seule source
 * de données pour le taux de réussite aux doubles (§4.7) et pour le modèle de
 * dispersion du coach de ciblage (§4.6).
 *
 * Le multiplicateur est **collant** : on le choisit une fois et on tape les
 * numéros. Trois triples se saisissent donc en 4 taps, pas en 6 (§1 : ne pas
 * ralentir le joueur qui vient de lancer).
 *
 * Le vert et le rouge des sélecteurs sont ceux des doubles et triples de la
 * cible : on cherche le repère visuel du joueur, pas une palette d'interface.
 */
import { ref } from 'vue'
import type { Dart, Multiplier } from '@chalk/core'
import { BULL } from '@chalk/core'

const emit = defineEmits<{ throw: [dart: Dart] }>()

const multiplier = ref<Multiplier>(1)

const SEGMENTS = [20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1] as const

const MULTIPLIERS = [
  { value: 1, label: 'Simple', short: 'S', class: 'bg-slate-raised' },
  { value: 2, label: 'Double', short: 'D', class: 'bg-board-green' },
  { value: 3, label: 'Triple', short: 'T', class: 'bg-board-red' },
] as const

function send(segment: number, forced?: Multiplier) {
  emit('throw', { segment, multiplier: forced ?? multiplier.value } as Dart)
  // Le multiplicateur revient au simple : c'est le cas le plus fréquent, et
  // laisser « triple » actif produit des saisies fausses en cascade.
  multiplier.value = 1
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <div class="grid grid-cols-3 gap-2">
      <button
        v-for="option in MULTIPLIERS"
        :key="option.value"
        type="button"
        class="tap h-12 text-sm font-bold"
        :class="[
          option.class,
          multiplier === option.value
            ? 'text-chalk ring-2 ring-accent'
            : 'text-chalk/70 opacity-60',
        ]"
        :aria-pressed="multiplier === option.value"
        @click="multiplier = option.value as Multiplier"
      >
        {{ option.label }}
      </button>
    </div>

    <div class="grid grid-cols-5 gap-1.5">
      <button
        v-for="segment in SEGMENTS"
        :key="segment"
        type="button"
        class="tap num h-12 bg-slate-raised text-lg text-chalk active:bg-slate-line"
        :aria-label="`${MULTIPLIERS[multiplier - 1]?.label} ${segment}`"
        @click="send(segment)"
      >
        {{ segment }}
      </button>
    </div>

    <div class="grid grid-cols-3 gap-2">
      <!-- Le bull n'a pas de triple : deux touches explicites plutôt qu'un
           multiplicateur qui produirait une fléchette impossible. -->
      <button
        type="button"
        class="tap h-12 bg-board-green text-sm font-bold text-chalk"
        @click="send(BULL, 1)"
      >
        25
      </button>
      <button
        type="button"
        class="tap h-12 bg-board-red text-sm font-bold text-chalk"
        @click="send(BULL, 2)"
      >
        BULL
      </button>
      <button
        type="button"
        class="tap h-12 bg-slate-surface text-sm font-semibold text-chalk-dim active:bg-slate-line"
        @click="send(0, 1)"
      >
        Manqué
      </button>
    </div>
  </div>
</template>
