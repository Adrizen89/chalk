<script setup lang="ts">
/**
 * Bannière d'installation — §3.2, #14.
 *
 * Deux formes selon la plateforme : le prompt natif sur Android, la marche à
 * suivre sur iOS Safari où l'API n'existe pas. Toujours refusable, et jamais
 * affichée pendant une partie (l'appelant s'en charge, §5).
 */
import { ref } from 'vue'
import { usePwaInstall } from '@/composables/usePwaInstall'

const { canPromptNatively, needsIosInstructions, promptInstall, dismiss } = usePwaInstall()
const showIosSteps = ref(false)
</script>

<template>
  <div class="rounded-2xl border border-accent/40 bg-accent/10 p-3">
    <div class="flex items-start gap-3">
      <img src="/icons/icon-192.png" alt="" class="h-10 w-10 shrink-0 rounded-lg" />
      <div class="min-w-0 flex-1">
        <p class="text-sm font-semibold text-chalk">Installer Chalk</p>
        <p class="mt-0.5 text-xs text-chalk-dim">
          Sur l'écran d'accueil, l'application s'ouvre en plein écran et fonctionne sans réseau.
        </p>
      </div>
      <button
        type="button"
        class="tap shrink-0 px-2 text-chalk-dim"
        aria-label="Masquer l'invitation"
        @click="dismiss()"
      >
        ✕
      </button>
    </div>

    <button
      v-if="canPromptNatively"
      type="button"
      class="tap mt-3 h-12 w-full bg-accent text-sm font-bold text-slate-board"
      @click="promptInstall()"
    >
      Installer
    </button>

    <!-- iOS Safari n'expose aucune API : on explique la manipulation. -->
    <template v-else-if="needsIosInstructions">
      <button
        type="button"
        class="tap mt-3 h-12 w-full bg-accent text-sm font-bold text-slate-board"
        :aria-expanded="showIosSteps"
        @click="showIosSteps = !showIosSteps"
      >
        Comment faire ?
      </button>
      <ol v-if="showIosSteps" class="mt-3 space-y-2 text-xs text-chalk">
        <li class="flex gap-2">
          <span class="font-bold text-accent">1.</span>
          <span
            >Touchez le bouton <strong>Partager</strong> en bas de Safari (le carré avec une
            flèche).</span
          >
        </li>
        <li class="flex gap-2">
          <span class="font-bold text-accent">2.</span>
          <span>Faites défiler et choisissez <strong>Sur l'écran d'accueil</strong>.</span>
        </li>
        <li class="flex gap-2">
          <span class="font-bold text-accent">3.</span>
          <span>Validez avec <strong>Ajouter</strong>.</span>
        </li>
      </ol>
    </template>
  </div>
</template>
