<script setup lang="ts">
/**
 * Configuration d'une partie — amorce de #28.
 *
 * Objectif chiffré du §1 : **lancer une partie en moins de 15 secondes**. Cet
 * écran est le principal risque de rater cet objectif, donc : valeurs par
 * défaut correspondant à la configuration la plus fréquente, joueurs
 * sélectionnables en un tap depuis le carnet (§4.1), et un seul bouton.
 *
 * Restent à faire dans #28 : legs et sets, ordre de jeu (aléatoire / manuel /
 * bull-off), handicap, configurations favorites (§4.9).
 */
import { computed, onMounted, ref, shallowRef } from 'vue'
import type { AnyGameRule, PlayerRef } from '@chalk/core'
import {
  CRICKET_DEFAULT_CONFIG,
  GAME_RULES,
  KILLER_DEFAULT_CONFIG,
  X01_DEFAULT_CONFIG,
  X01_PRESETS,
  drawKillerNumbers,
} from '@chalk/core'
import InstallBanner from '@/components/InstallBanner.vue'
import ResumeCard from '@/components/ResumeCard.vue'
import type { StoredGame, StoredPlayer } from '@/db'
import { abandonGame, findResumableGames, requestPersistentStorage } from '@/db'
import type { InputMode } from '@/composables/useMatch'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { usePlayerBook, avatarColor, initials } from '@/composables/usePlayerBook'

const emit = defineEmits<{
  start: [rule: AnyGameRule, config: unknown, players: PlayerRef[], inputMode: InputMode]
  resume: [game: StoredGame]
}>()

const { players: book, load, add } = usePlayerBook()

/**
 * §3.2 — l'invitation à l'installation vit ici, sur l'écran de configuration :
 * c'est le seul endroit où l'on n'est pas en train de jouer (§5).
 */
const install = usePwaInstall()

/**
 * §4.4, #31 — parties interrompues à proposer à la reprise.
 *
 * `shallowRef` et non `ref` : ce sont des enregistrements en lecture seule.
 * Les rendre profondément réactifs les envelopperait dans des Proxies, que
 * IndexedDB ne sait pas cloner au moment de les réécrire.
 */
const resumable = shallowRef<StoredGame[]>([])

const ruleId = ref('x01')
const selectedIds = ref<string[]>([])
const newPlayerName = ref('')

// X01
const startingScore = ref<number>(X01_DEFAULT_CONFIG.startingScore)
const inMode = ref(X01_DEFAULT_CONFIG.inMode)
const outMode = ref(X01_DEFAULT_CONFIG.outMode)
// Cricket
const cricketVariant = ref(CRICKET_DEFAULT_CONFIG.variant)
// Killer
const killerLives = ref(KILLER_DEFAULT_CONFIG.lives)
// Around the Clock
const atcMode = ref<'any' | 'double' | 'triple'>('any')

const inputMode = ref<InputMode>('turn')

const rule = computed(() => GAME_RULES.find((entry) => entry.id === ruleId.value) ?? GAME_RULES[0]!)

const selectedPlayers = computed<PlayerRef[]>(() =>
  selectedIds.value
    .map((id) => book.value.find((player) => player.id === id))
    .filter((player): player is StoredPlayer => player !== undefined)
    .map((player) => ({ id: player.id, name: player.name })),
)

const canStart = computed(() => selectedPlayers.value.length >= 1)

onMounted(async () => {
  await load()
  await refreshResumable()
  // Demande au navigateur de ne pas évincer nos données sous pression disque :
  // une partie en cours ne doit pas disparaître faute de place (§4.4).
  void requestPersistentStorage()
})

async function refreshResumable() {
  try {
    resumable.value = await findResumableGames()
  } catch (error) {
    console.error('Lecture des parties en cours impossible', error)
  }
}

async function discard(game: StoredGame) {
  await abandonGame(game.id)
  await refreshResumable()
}

function toggle(id: string) {
  selectedIds.value = selectedIds.value.includes(id)
    ? selectedIds.value.filter((entry) => entry !== id)
    : [...selectedIds.value, id]
}

/** §4.1 — ajout d'un joueur à la volée, sans quitter l'écran. */
async function addPlayer() {
  const player = await add(newPlayerName.value)
  if (!player) return
  if (!selectedIds.value.includes(player.id)) selectedIds.value = [...selectedIds.value, player.id]
  newPlayerName.value = ''
}

function buildConfig(): unknown {
  switch (rule.value.id) {
    case 'x01':
      return { startingScore: startingScore.value, inMode: inMode.value, outMode: outMode.value }
    case 'cricket':
      return { ...CRICKET_DEFAULT_CONFIG, variant: cricketVariant.value }
    case 'killer':
      return {
        ...KILLER_DEFAULT_CONFIG,
        lives: killerLives.value,
        // Le tirage a lieu ici, une fois, et le résultat est figé dans la
        // configuration : le moteur reste pur et la partie reste rejouable.
        numbers: drawKillerNumbers(selectedPlayers.value),
      }
    case 'around-the-clock':
      return { mode: atcMode.value, includeBull: true }
    default:
      return rule.value.defaultConfig
  }
}

function start() {
  if (!canStart.value) return
  emit('start', rule.value, buildConfig(), selectedPlayers.value, inputMode.value)
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 px-4 pt-4 pb-6">
    <header>
      <h1 class="text-3xl font-bold tracking-tight">Chalk</h1>
      <p class="text-sm text-chalk-dim">Marqueur de points</p>
    </header>

    <!-- §4.4, #31 : la reprise passe avant la configuration. Retrouver son
         501 en cours doit être plus rapide que d'en relancer un. -->
    <ResumeCard
      v-for="game in resumable"
      :key="game.id"
      :game="game"
      @resume="emit('resume', game)"
      @discard="discard(game)"
    />

    <InstallBanner v-if="install.shouldOffer.value" />

    <section>
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Mode de jeu</h2>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="entry in GAME_RULES"
          :key="entry.id"
          type="button"
          class="tap h-14 px-3 text-sm"
          :class="
            ruleId === entry.id
              ? 'bg-accent font-bold text-slate-board'
              : 'bg-slate-surface text-chalk'
          "
          :aria-pressed="ruleId === entry.id"
          @click="ruleId = entry.id"
        >
          {{ entry.label }}
        </button>
      </div>
    </section>

    <section>
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Joueurs</h2>

      <div v-if="book.length > 0" class="mb-2 flex flex-wrap gap-2">
        <button
          v-for="player in book"
          :key="player.id"
          type="button"
          class="tap gap-2 px-3 text-sm"
          :class="
            selectedIds.includes(player.id)
              ? 'bg-slate-raised text-chalk ring-2 ring-accent'
              : 'bg-slate-surface text-chalk-dim'
          "
          :aria-pressed="selectedIds.includes(player.id)"
          @click="toggle(player.id)"
        >
          <span
            class="flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold text-slate-board"
            :style="{ backgroundColor: avatarColor(player.id) }"
            aria-hidden="true"
          >
            {{ initials(player.name) }}
          </span>
          {{ player.name }}
          <span
            v-if="selectedIds.includes(player.id)"
            class="num text-xs font-bold text-accent"
            aria-label="Ordre de jeu"
          >
            {{ selectedIds.indexOf(player.id) + 1 }}
          </span>
        </button>
      </div>

      <form class="flex gap-2" @submit.prevent="addPlayer">
        <input
          v-model="newPlayerName"
          type="text"
          placeholder="Ajouter un joueur"
          autocomplete="off"
          class="tap min-w-0 flex-1 justify-start rounded-xl bg-slate-surface px-3 text-base text-chalk placeholder:text-chalk-dim/60 focus:ring-2 focus:ring-accent focus:outline-none"
        />
        <button type="submit" class="tap bg-slate-raised px-4 text-xl text-chalk">+</button>
      </form>
    </section>

    <section v-if="rule.id === 'x01'" class="space-y-3">
      <div>
        <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Score</h2>
        <div class="grid grid-cols-4 gap-2">
          <button
            v-for="preset in X01_PRESETS"
            :key="preset"
            type="button"
            class="tap num text-base"
            :class="
              startingScore === preset
                ? 'bg-accent font-bold text-slate-board'
                : 'bg-slate-surface text-chalk'
            "
            @click="startingScore = preset"
          >
            {{ preset }}
          </button>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Entrée</span>
          <select
            v-model="inMode"
            class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
          >
            <option value="straight">Straight in</option>
            <option value="double">Double in</option>
          </select>
        </label>
        <label class="block">
          <span class="mb-1 block text-xs font-semibold text-chalk-dim uppercase">Sortie</span>
          <select
            v-model="outMode"
            class="tap w-full rounded-xl bg-slate-surface px-3 text-sm text-chalk"
          >
            <option value="double">Double out</option>
            <option value="master">Master out</option>
            <option value="straight">Straight out</option>
          </select>
        </label>
      </div>
    </section>

    <section v-else-if="rule.id === 'cricket'">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Variante</h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="variant in [
            { value: 'standard', label: 'Standard' },
            { value: 'cutthroat', label: 'Cut-throat' },
            { value: 'no-score', label: 'Sans points' },
          ]"
          :key="variant.value"
          type="button"
          class="tap px-2 text-xs"
          :class="
            cricketVariant === variant.value
              ? 'bg-accent font-bold text-slate-board'
              : 'bg-slate-surface text-chalk'
          "
          @click="cricketVariant = variant.value as typeof cricketVariant"
        >
          {{ variant.label }}
        </button>
      </div>
    </section>

    <section v-else-if="rule.id === 'killer'">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Vies</h2>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="lives in [1, 3, 5, 7]"
          :key="lives"
          type="button"
          class="tap num"
          :class="
            killerLives === lives
              ? 'bg-accent font-bold text-slate-board'
              : 'bg-slate-surface text-chalk'
          "
          @click="killerLives = lives"
        >
          {{ lives }}
        </button>
      </div>
      <p class="mt-2 text-xs text-chalk-dim">
        Les numéros sont tirés au sort au lancement de la partie.
      </p>
    </section>

    <section v-else-if="rule.id === 'around-the-clock'">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Difficulté</h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="mode in [
            { value: 'any', label: 'Simple' },
            { value: 'double', label: 'Doubles' },
            { value: 'triple', label: 'Triples' },
          ]"
          :key="mode.value"
          type="button"
          class="tap text-xs"
          :class="
            atcMode === mode.value
              ? 'bg-accent font-bold text-slate-board'
              : 'bg-slate-surface text-chalk'
          "
          @click="atcMode = mode.value as typeof atcMode"
        >
          {{ mode.label }}
        </button>
      </div>
    </section>

    <section v-if="!rule.requiresDartDetail">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Saisie</h2>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="tap text-xs"
          :class="
            inputMode === 'turn'
              ? 'bg-accent font-bold text-slate-board'
              : 'bg-slate-surface text-chalk'
          "
          @click="inputMode = 'turn'"
        >
          Par volée
        </button>
        <button
          type="button"
          class="tap text-xs"
          :class="
            inputMode === 'dart'
              ? 'bg-accent font-bold text-slate-board'
              : 'bg-slate-surface text-chalk'
          "
          @click="inputMode = 'dart'"
        >
          Fléchette par fléchette
        </button>
      </div>
    </section>
    <p v-else class="text-xs text-chalk-dim">
      {{ rule.label }} exige la saisie fléchette par fléchette.
    </p>

    <!-- §5 : l'action principale reste en bas de l'écran, sous le pouce. -->
    <button
      type="button"
      class="tap mt-auto h-16 bg-accent text-lg font-bold text-slate-board disabled:opacity-30"
      :disabled="!canStart"
      @click="start()"
    >
      Lancer la partie
    </button>

    <!-- §3.2 : point d'entrée permanent et discret, même après un refus de
         l'invitation — l'application n'étant sur aucun store, c'est le seul
         chemin vers l'installation. -->
    <button
      v-if="!install.installed.value && !install.shouldOffer.value"
      type="button"
      class="safe-bottom text-center text-xs text-chalk-dim underline underline-offset-2"
      @click="install.offerAgain()"
    >
      Installer Chalk sur cet appareil
    </button>
    <div v-else class="safe-bottom" />
  </div>
</template>
