<script setup lang="ts">
/**
 * Handicap — §4.4, #28.
 *
 * « Score de départ différent selon les joueurs, pour équilibrer les niveaux. »
 *
 * C'est ce qui permet à un débutant de jouer contre un joueur confirmé sans
 * que la partie soit pliée d'avance — donc de jouer tout court.
 */
import type { PlayerRef } from '@chalk/core'
import { avatarColor, initials } from '@/composables/usePlayerBook'

const props = defineProps<{ players: readonly PlayerRef[]; baseScore: number }>()
const handicaps = defineModel<Record<string, number>>({ required: true })

/** Pas de 20 points : un handicap plus fin ne se ressent pas au jeu. */
const STEP = 20

function adjust(id: string, delta: number) {
  const next = (handicaps.value[id] ?? 0) + delta
  // Un handicap ne doit pas produire un score de départ nul ou négatif.
  const floor = -(props.baseScore - STEP)
  handicaps.value = { ...handicaps.value, [id]: Math.max(floor, next) }
}
</script>

<template>
  <ul class="space-y-2">
    <li
      v-for="player in players"
      :key="player.id"
      class="flex items-center gap-2 rounded-xl bg-slate-surface px-2 py-1.5"
    >
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold text-slate-board"
        :style="{ backgroundColor: avatarColor(player.id) }"
        aria-hidden="true"
      >
        {{ initials(player.name) }}
      </span>
      <span class="min-w-0 flex-1 truncate text-sm text-chalk">{{ player.name }}</span>

      <button
        type="button"
        class="tap bg-slate-raised px-3 text-lg text-chalk"
        :aria-label="`Baisser le score de départ de ${player.name}`"
        @click="adjust(player.id, -STEP)"
      >
        −
      </button>
      <span class="num w-14 text-center text-sm font-bold text-chalk">
        {{ baseScore + (handicaps[player.id] ?? 0) }}
      </span>
      <button
        type="button"
        class="tap bg-slate-raised px-3 text-lg text-chalk"
        :aria-label="`Augmenter le score de départ de ${player.name}`"
        @click="adjust(player.id, STEP)"
      >
        +
      </button>
    </li>
  </ul>
</template>
