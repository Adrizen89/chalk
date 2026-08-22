<script setup lang="ts">
/**
 * Tableau de marques du Cricket — §4.2.
 *
 * L'écran de partie générique ne sait pas afficher des marques : la règle les
 * expose dans `view.players[].extra.marks`, et ce composant les rend. C'est le
 * point d'extension prévu pour l'affichage propre à un mode.
 *
 * La colonne des nombres est à gauche plutôt qu'au centre : la disposition
 * traditionnelle ne tient pas au-delà de deux joueurs, et §6 impose de rester
 * lisible dès 320 px de large.
 */
import { computed } from 'vue'
import type { GameView } from '@chalk/core'

const props = defineProps<{ view: GameView }>()

interface Mark {
  marks: number
  dead: boolean
}

const targets = computed(() => {
  const first = props.view.players[0]?.extra?.marks as Record<string, Mark> | undefined
  if (!first) return []
  return Object.keys(first)
    .map(Number)
    .sort((a, b) => b - a)
})

function markOf(playerIndex: number, target: number): Mark {
  const marks = props.view.players[playerIndex]?.extra?.marks as Record<string, Mark> | undefined
  return marks?.[String(target)] ?? { marks: 0, dead: false }
}

/** Notation traditionnelle : une barre, une croix, puis le cercle de fermeture. */
function symbol(marks: number): string {
  if (marks >= 3) return '⊗'
  if (marks === 2) return '✕'
  if (marks === 1) return '╱'
  return '·'
}

const label = (target: number) => (target === 25 ? 'BULL' : String(target))
</script>

<template>
  <table class="w-full border-separate border-spacing-y-0.5 text-center text-sm">
    <caption class="sr-only">
      Tableau de marques du Cricket
    </caption>
    <thead>
      <tr class="text-xs text-chalk-dim">
        <th scope="col" class="w-16 text-left font-medium">Cible</th>
        <th
          v-for="player in view.players"
          :key="player.playerId"
          scope="col"
          class="truncate font-medium"
          :class="player.isActive ? 'text-accent' : ''"
        >
          {{ player.name }}
        </th>
      </tr>
    </thead>
    <tbody>
      <tr v-for="target in targets" :key="target">
        <th
          scope="row"
          class="num rounded-lg bg-slate-raised px-2 text-left font-bold"
          :class="markOf(0, target).dead ? 'text-chalk-dim/50 line-through' : 'text-chalk'"
        >
          {{ label(target) }}
        </th>
        <td
          v-for="(player, index) in view.players"
          :key="player.playerId"
          class="num rounded-lg bg-slate-surface/60 text-base leading-7"
          :class="markOf(index, target).dead ? 'text-chalk-dim/40' : 'text-accent'"
        >
          <span class="sr-only">{{ markOf(index, target).marks }} marque sur 3</span>
          <span aria-hidden="true">{{ symbol(markOf(index, target).marks) }}</span>
        </td>
      </tr>
    </tbody>
  </table>
</template>
