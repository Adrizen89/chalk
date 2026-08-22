<script setup lang="ts">
/**
 * Racine de l'application.
 *
 * Navigation par état plutôt que par routeur : il n'y a que deux écrans. Un
 * routeur arrivera avec les liens profonds — partage d'un exercice (#47), d'un
 * tournoi (#60), rejoindre un salon par QR code (#40).
 *
 * C'est aussi ici que vivent les bannières qui ne doivent **jamais** apparaître
 * pendant une partie (§5) : mise à jour de l'application et invitation à
 * l'installation.
 */
import { computed } from 'vue'
import type { AnyGameRule, PlayerRef } from '@chalk/core'
import UpdateBanner from '@/components/UpdateBanner.vue'
import GameView from '@/views/GameView.vue'
import SetupView from '@/views/SetupView.vue'
import type { InputMode } from '@/composables/useMatch'
import { useMatch } from '@/composables/useMatch'
import { usePwaUpdate } from '@/composables/usePwaUpdate'

const { isActive, start, quit } = useMatch()
const { needRefresh, applying, applyUpdate, postpone } = usePwaUpdate()

/**
 * §5 : « aucune fenêtre modale pendant une partie en cours ». Une mise à jour
 * recharge la page — la proposer au milieu d'un leg ferait perdre la partie.
 */
const canShowUpdate = computed(() => needRefresh.value && !isActive.value)

function onStart(rule: AnyGameRule, config: unknown, players: PlayerRef[], inputMode: InputMode) {
  start(rule, config, players, inputMode)
}
</script>

<template>
  <main class="h-full">
    <div v-if="canShowUpdate" class="safe-top mx-auto w-full max-w-lg px-3 pb-1">
      <UpdateBanner :applying="applying" @apply="applyUpdate()" @postpone="postpone()" />
    </div>

    <GameView v-if="isActive" @quit="quit()" />
    <SetupView v-else @start="onStart" />
  </main>
</template>
