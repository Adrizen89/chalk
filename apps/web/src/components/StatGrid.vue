<script setup lang="ts">
/**
 * Statistiques d'un joueur — §4.7.
 *
 * Les métriques qui exigent la saisie fléchette par fléchette sont marquées
 * **indisponibles** plutôt qu'affichées à zéro : le §4.7 le demande
 * explicitement, et un taux de réussite affiché à 0 % ferait croire à un
 * joueur qu'il ne réussit jamais ses doubles.
 */
import { computed } from 'vue'
import type { PlayerCareerStats } from '@chalk/core'

const props = defineProps<{ stats: PlayerCareerStats }>()

const percent = (value: number) => `${Math.round(value * 100)} %`

const entries = computed(() => [
  { label: 'Moyenne 3 fléch.', value: props.stats.threeDartAverage.toFixed(2), highlight: true },
  {
    label: 'Réussite aux doubles',
    value: props.stats.checkoutRate === null ? null : percent(props.stats.checkoutRate),
    hint: 'saisie fléchette par fléchette requise',
  },
  { label: 'Meilleur checkout', value: props.stats.bestCheckout?.toString() ?? null },
  {
    label: 'Meilleur leg',
    value: props.stats.bestLegDarts === null ? null : `${props.stats.bestLegDarts} fléch.`,
  },
  { label: 'Parties', value: `${props.stats.gamesWon} / ${props.stats.gamesPlayed}` },
  { label: 'Victoires', value: percent(props.stats.winRate) },
  { label: '180', value: String(props.stats.count180) },
  { label: '140+', value: String(props.stats.count140plus) },
  { label: '100+', value: String(props.stats.count100plus) },
])
</script>

<template>
  <dl class="grid grid-cols-2 gap-2">
    <div
      v-for="entry in entries"
      :key="entry.label"
      class="rounded-xl px-3 py-2"
      :class="entry.highlight ? 'col-span-2 bg-accent/10' : 'bg-slate-surface'"
    >
      <dt class="text-[0.65rem] tracking-wide text-chalk-dim uppercase">{{ entry.label }}</dt>
      <dd
        class="num font-bold"
        :class="[
          entry.highlight ? 'text-3xl text-accent' : 'text-xl text-chalk',
          entry.value === null ? 'text-chalk-dim/60' : '',
        ]"
      >
        <template v-if="entry.value !== null">{{ entry.value }}</template>
        <span v-else class="text-xs font-normal" :title="entry.hint">Indisponible</span>
      </dd>
    </div>
  </dl>
</template>
