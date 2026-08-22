<script setup lang="ts">
/**
 * Réglages — §4.9.
 *
 * Écran volontairement court : le cahier des charges veut qu'on joue, pas
 * qu'on paramètre. Chaque réglage y est parce qu'il change l'usage réel, pas
 * pour offrir un choix.
 */
import { onMounted } from 'vue'
import type { ScoreSize, ThemePreference } from '@/composables/useSettings'
import { useSettings } from '@/composables/useSettings'
import { useFeedback } from '@/composables/useFeedback'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { useWakeLock } from '@/composables/useWakeLock'

defineEmits<{ close: [] }>()

const settings = useSettings()
const feedback = useFeedback()
const install = usePwaInstall()
const wakeLock = useWakeLock()

onMounted(() => void settings.load())

const THEMES: { value: ThemePreference; label: string }[] = [
  { value: 'dark', label: 'Sombre' },
  { value: 'light', label: 'Clair' },
  { value: 'system', label: 'Système' },
]

const SIZES: { value: ScoreSize; label: string }[] = [
  { value: 'compact', label: 'Compact' },
  { value: 'normal', label: 'Normal' },
  { value: 'large', label: 'Grand' },
]

async function toggleSound() {
  const next = !settings.soundEnabled.value
  await settings.setSoundEnabled(next)
  // Un aperçu vaut mieux qu'une description : on entend ce qu'on active.
  if (next) feedback.preview()
}

async function toggleVibration() {
  const next = !settings.vibrationEnabled.value
  await settings.setVibrationEnabled(next)
  if (next) feedback.signal('leg')
}
</script>

<template>
  <div class="mx-auto flex h-full w-full max-w-lg flex-col px-3">
    <header class="safe-top flex shrink-0 items-center gap-2 pb-2">
      <button
        type="button"
        class="tap px-2 text-sm text-chalk-dim"
        aria-label="Fermer les réglages"
        @click="$emit('close')"
      >
        ✕
      </button>
      <h1 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">Réglages</h1>
    </header>

    <div class="min-h-0 flex-1 space-y-5 overflow-y-auto pb-6">
      <section>
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Thème</h2>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="choice in THEMES"
            :key="choice.value"
            type="button"
            class="tap text-sm"
            :class="
              settings.theme.value === choice.value
                ? 'bg-accent font-bold text-on-accent'
                : 'bg-slate-surface text-chalk'
            "
            @click="settings.setTheme(choice.value)"
          >
            {{ choice.label }}
          </button>
        </div>
        <p class="mt-2 text-xs text-chalk-dim">
          Le sombre reste le défaut : les salles de fléchettes sont souvent peu éclairées.
        </p>
      </section>

      <section>
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">
          Taille des scores
        </h2>
        <div class="grid grid-cols-3 gap-2">
          <button
            v-for="choice in SIZES"
            :key="choice.value"
            type="button"
            class="tap text-sm"
            :class="
              settings.scoreSize.value === choice.value
                ? 'bg-accent font-bold text-on-accent'
                : 'bg-slate-surface text-chalk'
            "
            @click="settings.setScoreSize(choice.value)"
          >
            {{ choice.label }}
          </button>
        </div>
        <!-- Aperçu immédiat : c'est la lisibilité à 2–3 m qui se règle ici (§5). -->
        <div class="mt-2 rounded-xl bg-slate-surface px-4 py-3 text-center">
          <span
            class="num leading-none font-bold text-chalk"
            :style="{ fontSize: 'var(--text-score)' }"
          >
            501
          </span>
        </div>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">
          Sons et vibrations
        </h2>
        <button
          type="button"
          class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk"
          role="switch"
          :aria-checked="settings.soundEnabled.value"
          @click="toggleSound()"
        >
          <span>Sons — 180, fin de leg</span>
          <span
            class="text-xs font-bold"
            :class="settings.soundEnabled.value ? 'text-ok' : 'text-chalk-dim'"
          >
            {{ settings.soundEnabled.value ? 'Oui' : 'Non' }}
          </span>
        </button>
        <button
          type="button"
          class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk"
          role="switch"
          :aria-checked="settings.vibrationEnabled.value"
          @click="toggleVibration()"
        >
          <span>Vibrations</span>
          <span
            class="text-xs font-bold"
            :class="settings.vibrationEnabled.value ? 'text-ok' : 'text-chalk-dim'"
          >
            {{ settings.vibrationEnabled.value ? 'Oui' : 'Non' }}
          </span>
        </button>
      </section>

      <section class="space-y-2">
        <h2 class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">
          Pendant la partie
        </h2>
        <button
          type="button"
          class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk disabled:opacity-40"
          role="switch"
          :aria-checked="wakeLock.enabled.value"
          :disabled="!wakeLock.supported"
          @click="wakeLock.setEnabled(!wakeLock.enabled.value)"
        >
          <span>Garder l'écran allumé</span>
          <span
            class="text-xs font-bold"
            :class="wakeLock.enabled.value ? 'text-ok' : 'text-chalk-dim'"
          >
            {{ wakeLock.supported ? (wakeLock.enabled.value ? 'Oui' : 'Non') : 'Indisponible' }}
          </span>
        </button>
        <p v-if="!wakeLock.supported" class="text-xs text-chalk-dim">
          Ce navigateur ne permet pas de garder l'écran allumé. Sur iOS, il faut installer
          l'application sur l'écran d'accueil.
        </p>
      </section>

      <section v-if="!install.installed.value">
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">
          Installation
        </h2>
        <button
          type="button"
          class="tap h-12 w-full bg-accent text-sm font-bold text-on-accent"
          @click="install.offerAgain()"
        >
          Installer Chalk sur cet appareil
        </button>
        <p class="mt-2 text-xs text-chalk-dim">
          Installée, l'application s'ouvre en plein écran et fonctionne sans réseau.
        </p>
      </section>
    </div>
  </div>
</template>
