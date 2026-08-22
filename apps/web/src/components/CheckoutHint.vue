<script setup lang="ts">
/**
 * Suggestion de sortie — §4.3.
 *
 * « Affichage automatique de la meilleure combinaison de sortie quand le score
 *   restant est ≤ 170, avec option pour afficher un chemin alternatif. »
 *
 * C'est ce qui dispense du calcul mental, au cœur de l'objectif « saisir les
 * scores sans réfléchir » (§1). Affichage discret et non bloquant (§5).
 */
import { ref } from 'vue'
import type { Dart } from '@chalk/core'
import { formatDart } from '@chalk/core'

defineProps<{ best: readonly Dart[]; alternatives: readonly (readonly Dart[])[] }>()

const showAlternatives = ref(false)
</script>

<template>
  <div class="rounded-xl border border-accent/40 bg-accent/10 px-3 py-2">
    <div class="flex items-center gap-3">
      <span class="text-xs font-medium text-chalk-dim">Sortie</span>
      <span class="num flex gap-1.5 text-lg font-bold tracking-wide text-accent">
        <span v-for="(dart, index) in best" :key="index">{{ formatDart(dart) }}</span>
      </span>
      <button
        v-if="alternatives.length > 0"
        type="button"
        class="ml-auto shrink-0 px-2 py-1 text-xs font-medium text-chalk-dim underline underline-offset-2"
        :aria-expanded="showAlternatives"
        @click="showAlternatives = !showAlternatives"
      >
        {{ showAlternatives ? 'Masquer' : 'Autres' }}
      </button>
    </div>

    <ul v-if="showAlternatives" class="mt-1.5 space-y-0.5 border-t border-accent/20 pt-1.5">
      <li
        v-for="(path, index) in alternatives"
        :key="index"
        class="num flex gap-1.5 text-sm text-chalk-dim"
      >
        <span v-for="(dart, i) in path" :key="i">{{ formatDart(dart) }}</span>
      </li>
    </ul>
  </div>
</template>
