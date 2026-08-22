<script setup lang="ts">
/**
 * Historique et statistiques — §4.7, #42 et #44.
 *
 * Tout se lit depuis la base locale : aucun compte, aucun serveur. Les données
 * existent déjà, elles étaient simplement invisibles.
 */
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { GameStats, PlayerCareerStats, PlayerId } from '@chalk/core'
import { baseRuleId, findRule } from '@chalk/core'
import AverageChart from '@/components/AverageChart.vue'
import StatGrid from '@/components/StatGrid.vue'
import type { StoredGame } from '@/db'
import { averageOverTime, careerStats, finishedGamesWithStats, playersWithHistory } from '@/db'
import { avatarColor, initials } from '@/composables/usePlayerBook'

defineEmits<{ close: [] }>()

const loading = ref(true)
const players = shallowRef<{ id: PlayerId; name: string }[]>([])
const selectedId = ref<PlayerId | null>(null)
const career = shallowRef<PlayerCareerStats | null>(null)
const curve = shallowRef<{ at: number; average: number }[]>([])
const games = shallowRef<{ game: StoredGame; stats: GameStats }[]>([])

/** §4.7 — filtre par mode de jeu. */
const ruleFilter = ref<string | null>(null)

const availableRules = computed(() => {
  const seen = new Set(games.value.map((entry) => entry.stats.baseRuleId))
  return [...seen].map((id) => ({ id, label: findRule(id)?.label ?? id }))
})

const visibleGames = computed(() =>
  games.value.filter((entry) => {
    if (ruleFilter.value && entry.stats.baseRuleId !== ruleFilter.value) return false
    if (selectedId.value) {
      return entry.stats.players.some((player) => player.playerId === selectedId.value)
    }
    return true
  }),
)

async function loadPlayer(id: PlayerId) {
  selectedId.value = id
  career.value = await careerStats(id)
  curve.value = await averageOverTime(id)
}

onMounted(async () => {
  try {
    games.value = await finishedGamesWithStats()
    players.value = await playersWithHistory()
    const first = players.value[0]
    if (first) await loadPlayer(first.id)
  } catch (error) {
    console.error("Lecture de l'historique impossible", error)
  } finally {
    loading.value = false
  }
})

function formatDate(timestamp: number): string {
  return new Date(timestamp).toLocaleDateString('fr-FR', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

const labelOf = (stats: GameStats) => findRule(baseRuleId(stats.ruleId))?.label ?? stats.baseRuleId
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-lg flex-col px-3">
    <header class="safe-top flex shrink-0 items-center gap-2 pb-2">
      <button
        type="button"
        class="tap px-2 text-sm text-chalk-dim"
        aria-label="Fermer les statistiques"
        @click="$emit('close')"
      >
        ✕
      </button>
      <h1 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">
        Historique et statistiques
      </h1>
    </header>

    <p v-if="loading" class="mt-8 text-center text-sm text-chalk-dim">Chargement…</p>

    <p v-else-if="games.length === 0" class="mt-8 text-center text-sm text-chalk-dim">
      Aucune partie terminée pour l'instant.<br />
      Les statistiques apparaîtront dès la première.
    </p>

    <div v-else class="min-h-0 flex-1 space-y-4 overflow-y-auto pb-6">
      <!-- Sélection du joueur -->
      <div v-if="players.length > 1" class="flex flex-wrap gap-2">
        <button
          v-for="player in players"
          :key="player.id"
          type="button"
          class="tap gap-2 px-3 text-sm"
          :class="
            selectedId === player.id
              ? 'bg-slate-raised text-chalk ring-2 ring-accent'
              : 'bg-slate-surface text-chalk-dim'
          "
          @click="loadPlayer(player.id)"
        >
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold text-slate-board"
            :style="{ backgroundColor: avatarColor(player.id) }"
            aria-hidden="true"
          >
            {{ initials(player.name) }}
          </span>
          {{ player.name }}
        </button>
      </div>

      <AverageChart v-if="curve.length > 1" :points="curve" />

      <StatGrid v-if="career" :stats="career" />

      <!-- §4.7 — historique filtrable -->
      <section>
        <div class="mb-2 flex items-center gap-2">
          <h2 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">Historique</h2>
          <div class="ml-auto flex gap-1.5">
            <button
              type="button"
              class="tap px-2 text-[0.7rem]"
              :class="
                ruleFilter === null
                  ? 'bg-accent text-slate-board'
                  : 'bg-slate-surface text-chalk-dim'
              "
              @click="ruleFilter = null"
            >
              Tous
            </button>
            <button
              v-for="rule in availableRules"
              :key="rule.id"
              type="button"
              class="tap px-2 text-[0.7rem]"
              :class="
                ruleFilter === rule.id
                  ? 'bg-accent text-slate-board'
                  : 'bg-slate-surface text-chalk-dim'
              "
              @click="ruleFilter = rule.id"
            >
              {{ rule.label }}
            </button>
          </div>
        </div>

        <ul class="space-y-1.5">
          <li
            v-for="entry in visibleGames"
            :key="entry.game.id"
            class="rounded-xl bg-slate-surface px-3 py-2"
          >
            <div class="flex items-baseline gap-2 text-xs text-chalk-dim">
              <span class="font-semibold text-chalk">{{ labelOf(entry.stats) }}</span>
              <span class="num ml-auto">{{ formatDate(entry.game.updatedAt) }}</span>
            </div>
            <ul class="mt-1 space-y-0.5">
              <li
                v-for="player in entry.stats.players"
                :key="player.playerId"
                class="flex items-baseline gap-2 text-sm"
                :class="player.won ? 'text-accent' : 'text-chalk-dim'"
              >
                <span class="truncate">{{ player.name }}</span>
                <span v-if="player.won" aria-label="vainqueur">🏆</span>
                <span class="num ml-auto tabular-nums">
                  {{ player.threeDartAverage > 0 ? player.threeDartAverage.toFixed(2) : '—' }}
                </span>
              </li>
            </ul>
          </li>
        </ul>
      </section>
    </div>
  </div>
</template>
