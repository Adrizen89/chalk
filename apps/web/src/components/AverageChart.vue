<script setup lang="ts">
/**
 * Courbe d'évolution de la moyenne — §4.7, #44.
 *
 * SVG à la main plutôt qu'une bibliothèque de graphiques : une seule courbe,
 * quelques dizaines de points, et le §6 impose un chargement sous 3 s en 4G.
 * Ajouter 40 Ko de dépendance pour tracer une ligne serait mal dépensé.
 *
 * §6 accessibilité : l'information n'est jamais portée par la seule couleur —
 * les valeurs extrêmes sont écrites, et le graphique a une description
 * textuelle pour les lecteurs d'écran.
 */
import { computed } from 'vue'

const props = defineProps<{ points: readonly { at: number; average: number }[] }>()

const WIDTH = 320
const HEIGHT = 120
const PADDING = 4

const bounds = computed(() => {
  const values = props.points.map((point) => point.average)
  const min = Math.min(...values)
  const max = Math.max(...values)
  // Une marge évite une courbe collée aux bords quand tout se ressemble.
  const span = Math.max(1, max - min)
  return { min: min - span * 0.1, max: max + span * 0.1 }
})

const path = computed(() => {
  const count = props.points.length
  if (count === 0) return ''
  const { min, max } = bounds.value
  const usableWidth = WIDTH - PADDING * 2
  const usableHeight = HEIGHT - PADDING * 2

  return props.points
    .map((point, index) => {
      const x = PADDING + (count === 1 ? usableWidth / 2 : (index / (count - 1)) * usableWidth)
      const y = PADDING + usableHeight - ((point.average - min) / (max - min)) * usableHeight
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
})

const best = computed(() => Math.max(...props.points.map((point) => point.average)))
const latest = computed(() => props.points[props.points.length - 1]?.average ?? 0)

const description = computed(
  () =>
    `Évolution de la moyenne 3 fléchettes sur ${props.points.length} parties. ` +
    `Meilleure : ${best.value.toFixed(2)}. Dernière : ${latest.value.toFixed(2)}.`,
)
</script>

<template>
  <figure class="rounded-2xl bg-slate-surface p-3">
    <figcaption class="mb-2 flex items-baseline gap-2">
      <span class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">
        Moyenne 3 fléchettes
      </span>
      <span class="num ml-auto text-lg font-bold text-accent">{{ latest.toFixed(2) }}</span>
    </figcaption>

    <svg
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      class="h-28 w-full"
      role="img"
      :aria-label="description"
      preserveAspectRatio="none"
    >
      <path
        :d="path"
        fill="none"
        stroke="var(--color-accent)"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
        vector-effect="non-scaling-stroke"
      />
    </svg>

    <p class="num mt-1 flex justify-between text-[0.65rem] text-chalk-dim">
      <span>{{ points.length }} parties</span>
      <span>meilleure {{ best.toFixed(2) }}</span>
    </p>
  </figure>
</template>
