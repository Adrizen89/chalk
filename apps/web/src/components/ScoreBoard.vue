<script setup lang="ts">
/**
 * Tableau de score — §4.3 et §5.
 *
 * Le CDC demande un affichage permanent du score restant, de la moyenne, du
 * nombre de fléchettes et du joueur dont c'est le tour. Et surtout : lisible à
 * 2–3 mètres, parce que l'appareil est posé sur une table près de la cible.
 *
 * Le composant ne connaît aucune règle : il affiche une `GameView` (§4.2).
 * C'est ce qui lui permet de servir X01, Cricket, Killer et Around the Clock.
 */
import type { GameView } from '@chalk/core'
import { avatarColor, initials } from '@/composables/usePlayerBook'

withDefaults(
  defineProps<{
    view: GameView
    /**
     * Mode compact : pour les modes qui ont leur propre tableau, comme le
     * Cricket, où l'information utile est dans les marques et non dans le
     * score. Le score reste visible, mais cesse de manger l'écran.
     */
    dense?: boolean
  }>(),
  { dense: false },
)
</script>

<template>
  <div v-if="dense" class="grid grid-cols-2 gap-2" role="list">
    <div
      v-for="player in view.players"
      :key="player.playerId"
      role="listitem"
      class="flex items-center gap-2 rounded-xl border px-2 py-1.5"
      :class="
        player.isActive ? 'border-accent/70 bg-accent/10' : 'border-slate-line bg-slate-surface/60'
      "
    >
      <span
        class="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[0.65rem] font-bold text-on-accent"
        :style="{ backgroundColor: avatarColor(player.playerId) }"
        aria-hidden="true"
      >
        {{ initials(player.name) }}
      </span>
      <span
        class="min-w-0 flex-1 truncate text-xs"
        :class="player.isActive ? 'text-accent' : 'text-chalk-dim'"
      >
        {{ player.name }}
      </span>
      <span
        class="num text-2xl leading-none font-bold"
        :class="player.isActive ? 'text-chalk' : 'text-chalk-dim'"
      >
        {{ player.primary }}
      </span>
    </div>
  </div>

  <div
    v-else
    class="grid gap-2"
    :class="view.players.length > 2 ? 'grid-cols-2' : 'grid-cols-1'"
    role="list"
  >
    <div
      v-for="player in view.players"
      :key="player.playerId"
      role="listitem"
      class="rounded-2xl border px-4 py-3 transition-colors"
      :class="
        player.isActive ? 'border-accent/70 bg-accent/10' : 'border-slate-line bg-slate-surface/60'
      "
    >
      <div class="flex items-center gap-2">
        <span
          class="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-on-accent"
          :style="{ backgroundColor: avatarColor(player.playerId) }"
          aria-hidden="true"
        >
          {{ initials(player.name) }}
        </span>
        <span
          class="truncate text-sm font-semibold"
          :class="player.isActive ? 'text-accent' : 'text-chalk-dim'"
        >
          {{ player.name }}
        </span>
        <span v-if="player.isActive" class="ml-auto text-xs font-bold text-accent">À vous</span>
      </div>

      <!-- Le score restant : le plus gros élément de l'écran, par construction. -->
      <div
        class="num mt-1 leading-none font-bold tabular-nums"
        :class="[
          player.isActive ? 'text-chalk' : 'text-chalk-dim',
          view.players.length > 2 ? 'text-[length:var(--text-score-idle)]' : '',
        ]"
        :style="
          view.players.length <= 2 && player.isActive
            ? { fontSize: 'var(--text-score)' }
            : { fontSize: 'var(--text-score-idle)' }
        "
      >
        {{ player.primary }}
      </div>

      <dl class="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs text-chalk-dim">
        <div v-for="stat in player.secondary" :key="stat.label" class="flex gap-1">
          <dt>{{ stat.label }}</dt>
          <dd class="num font-semibold text-chalk">{{ stat.value }}</dd>
        </div>
      </dl>
    </div>
  </div>
</template>
