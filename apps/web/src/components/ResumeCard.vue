<script setup lang="ts">
/**
 * Reprise d'une partie interrompue — §4.4, #31.
 *
 * « Une partie interrompue (batterie, fermeture du navigateur) doit être
 *   proposée à la reprise. »
 *
 * Elle est proposée **en évidence sur l'accueil**, au-dessus de la
 * configuration : retrouver son 501 en cours doit être plus rapide que d'en
 * relancer un.
 */
import { computed } from 'vue'
import { findRule } from '@chalk/core'
import type { StoredGame } from '@/db'
import { avatarColor, initials } from '@/composables/usePlayerBook'

const props = defineProps<{ game: StoredGame }>()
defineEmits<{ resume: []; discard: [] }>()

const label = computed(() => findRule(props.game.ruleId)?.label ?? props.game.ruleId)

/** Nombre de fléchettes déjà lancées, tous joueurs confondus. */
const dartsThrown = computed(
  () => props.game.inputs.filter((input) => input.kind === 'dart').length,
)

const relativeTime = computed(() => {
  const minutes = Math.round((Date.now() - props.game.updatedAt) / 60_000)
  if (minutes < 1) return "à l'instant"
  if (minutes < 60) return `il y a ${minutes} min`
  const hours = Math.round(minutes / 60)
  if (hours < 24) return `il y a ${hours} h`
  const days = Math.round(hours / 24)
  return days === 1 ? 'hier' : `il y a ${days} jours`
})
</script>

<template>
  <div class="rounded-2xl border border-accent/50 bg-accent/10 p-3">
    <div class="flex items-center gap-2">
      <span class="text-xs font-semibold tracking-wide text-accent uppercase">
        Partie en cours
      </span>
      <span class="text-xs text-chalk-dim">· {{ label }} · {{ relativeTime }}</span>
      <button
        type="button"
        class="tap ml-auto shrink-0 px-2 text-chalk-dim"
        aria-label="Abandonner cette partie"
        @click="$emit('discard')"
      >
        ✕
      </button>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-2">
      <span
        v-for="player in game.players"
        :key="player.id"
        class="flex items-center gap-1.5 rounded-lg bg-slate-surface/70 py-1 pr-2 pl-1 text-xs text-chalk"
      >
        <span
          class="flex h-5 w-5 items-center justify-center rounded-full text-[0.6rem] font-bold text-on-accent"
          :style="{ backgroundColor: avatarColor(player.id) }"
          aria-hidden="true"
        >
          {{ initials(player.name) }}
        </span>
        {{ player.name }}
      </span>
      <span class="num text-xs text-chalk-dim">{{ dartsThrown }} fléchettes</span>
    </div>

    <button
      type="button"
      class="tap mt-3 h-12 w-full bg-accent text-sm font-bold text-on-accent"
      @click="$emit('resume')"
    >
      Reprendre
    </button>
  </div>
</template>
