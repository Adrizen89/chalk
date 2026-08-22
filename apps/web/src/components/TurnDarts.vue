<script setup lang="ts">
/**
 * Fléchettes de la volée en cours — §4.3, affichage permanent.
 *
 * Trois emplacements toujours visibles : on voit d'un coup d'œil où on en est
 * dans sa volée, sans compter mentalement.
 */
import { computed } from 'vue'
import type { Dart } from '@chalk/core'
import { dartValue, formatDart } from '@chalk/core'

const props = defineProps<{
  darts: readonly Dart[]
  slots?: number
  /** Le total n'a de sens que sur un mode à score, comme le X01. */
  showTotal?: boolean
}>()

const cells = computed(() => {
  const total = props.slots ?? 3
  return Array.from({ length: total }, (_, index) => props.darts[index] ?? null)
})

const turnTotal = computed(() => props.darts.reduce((sum, dart) => sum + dartValue(dart), 0))
</script>

<template>
  <div class="flex items-center gap-2">
    <div
      v-for="(dart, index) in cells"
      :key="index"
      class="num flex h-10 flex-1 items-center justify-center rounded-lg text-base font-bold"
      :class="dart ? 'bg-slate-raised text-chalk' : 'bg-slate-surface/50 text-chalk-dim/40'"
    >
      {{ dart ? formatDart(dart) : '·' }}
    </div>
    <div v-if="showTotal" class="num w-14 text-right text-xl font-bold text-chalk-dim">
      {{ turnTotal }}
    </div>
  </div>
</template>
