<script setup lang="ts">
/**
 * Racine de l'application.
 *
 * Navigation par état plutôt que par routeur : il n'y a que deux écrans pour
 * l'instant. `vue-router` arrivera avec la PWA (#10–#16), où les liens
 * profonds, le bouton retour et le partage de tournoi (#60) le rendront
 * nécessaire.
 */
import type { AnyGameRule, PlayerRef } from '@chalk/core'
import GameView from '@/views/GameView.vue'
import SetupView from '@/views/SetupView.vue'
import type { InputMode } from '@/composables/useMatch'
import { useMatch } from '@/composables/useMatch'

const { isActive, start, quit } = useMatch()

function onStart(rule: AnyGameRule, config: unknown, players: PlayerRef[], inputMode: InputMode) {
  start(rule, config, players, inputMode)
}
</script>

<template>
  <main class="h-full">
    <GameView v-if="isActive" @quit="quit()" />
    <SetupView v-else @start="onStart" />
  </main>
</template>
