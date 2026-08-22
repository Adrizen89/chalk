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
  BOBS_27_DEFAULT_CONFIG,
  CRICKET_DEFAULT_CONFIG,
  GAME_RULES,
  GOLF_DEFAULT_CONFIG,
  HALVE_IT_DEFAULT_CONFIG,
  HIGH_SCORE_DEFAULT_CONFIG,
  KILLER_DEFAULT_CONFIG,
  SHANGHAI_DEFAULT_CONFIG,
  X01_DEFAULT_CONFIG,
  X01_PRESETS,
  bestOf,
  createMatchRule,
  drawKillerNumbers,
  findRule,
} from '@chalk/core'
import HandicapPicker from '@/components/HandicapPicker.vue'
import InstallBanner from '@/components/InstallBanner.vue'
import type { OrderMode } from '@/components/MatchOptions.vue'
import MatchOptions from '@/components/MatchOptions.vue'
import ResumeCard from '@/components/ResumeCard.vue'
import type { StoredGame, StoredPlayer } from '@/db'
import { abandonGame, findResumableGames, requestPersistentStorage } from '@/db'
import type { InputMode } from '@/composables/useMatch'
import { usePwaInstall } from '@/composables/usePwaInstall'
import { usePlayerBook, avatarColor, initials } from '@/composables/usePlayerBook'
import type { Favourite } from '@/composables/useFavourites'
import { describeConfiguration, useFavourites } from '@/composables/useFavourites'
import { useSettings } from '@/composables/useSettings'

const emit = defineEmits<{
  start: [rule: AnyGameRule, config: unknown, players: PlayerRef[], inputMode: InputMode]
  resume: [game: StoredGame]
  stats: []
  training: []
  settings: []
}>()

const { players: book, load, add } = usePlayerBook()

/**
 * §3.2 — l'invitation à l'installation vit ici, sur l'écran de configuration :
 * c'est le seul endroit où l'on n'est pas en train de jouer (§5).
 */
const install = usePwaInstall()

/** §4.9 — configurations favorites, relançables en un tap. */
const favourites = useFavourites()
const settings = useSettings()

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
// Shanghai
const shanghaiRounds = ref(SHANGHAI_DEFAULT_CONFIG.rounds)
// High Score
const highScoreRounds = ref(HIGH_SCORE_DEFAULT_CONFIG.rounds)
// Golf
const golfHoles = ref(GOLF_DEFAULT_CONFIG.holes)
// Halve It
const halveItStart = ref(HALVE_IT_DEFAULT_CONFIG.startingScore)
// Bob's 27
const bobsStopOnNegative = ref(BOBS_27_DEFAULT_CONFIG.stopOnNegative)

const inputMode = ref<InputMode>('turn')

/**
 * §4.4, #28 — format du match. Les valeurs par défaut correspondent à la
 * partie la plus fréquente : un leg sec, pas de sets.
 */
const legsBestOf = ref(1)
const setsBestOf = ref(1)
const alternateStart = ref(true)
const orderMode = ref<OrderMode>('manual')
const handicapEnabled = ref(false)
const handicaps = ref<Record<string, number>>({})
/** Bull-off : l'ordre n'est connu qu'après le lancer (§4.4). */
const awaitingBullOff = ref(false)

/**
 * Tous les modes acceptent les legs et les sets : l'enveloppe de match (§4.4)
 * est générique, elle ne connaît pas la règle qu'elle enchaîne.
 */
const supportsLegs = computed(() => true)
const supportsHandicap = computed(() => rule.value.id === 'x01')

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
  await settings.load()
  await favourites.load()
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

function buildConfig(players: readonly PlayerRef[]): unknown {
  switch (rule.value.id) {
    case 'x01':
      return {
        startingScore: startingScore.value,
        inMode: inMode.value,
        outMode: outMode.value,
        ...(handicapEnabled.value ? { handicaps: { ...handicaps.value } } : {}),
      }
    case 'cricket':
      return { ...CRICKET_DEFAULT_CONFIG, variant: cricketVariant.value }
    case 'killer':
      return {
        ...KILLER_DEFAULT_CONFIG,
        lives: killerLives.value,
        // Le tirage a lieu ici, une fois, et le résultat est figé dans la
        // configuration : le moteur reste pur et la partie reste rejouable.
        numbers: drawKillerNumbers(players),
      }
    case 'around-the-clock':
      return { mode: atcMode.value, includeBull: true }
    case 'shanghai':
      return { ...SHANGHAI_DEFAULT_CONFIG, rounds: shanghaiRounds.value }
    case 'halve-it':
      return { ...HALVE_IT_DEFAULT_CONFIG, startingScore: halveItStart.value }
    case 'high-score':
      return { rounds: highScoreRounds.value }
    case 'golf':
      return { holes: golfHoles.value }
    case 'bobs-27':
      return { stopOnNegative: bobsStopOnNegative.value }
    default:
      return rule.value.defaultConfig
  }
}

/** Mélange sans muter, pour l'ordre de jeu aléatoire (§4.4). */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items]
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    const a = copy[i]
    const b = copy[j]
    if (a === undefined || b === undefined) continue
    copy[i] = b
    copy[j] = a
  }
  return copy
}

function orderedPlayers(firstId?: string): PlayerRef[] {
  const players = selectedPlayers.value
  if (firstId) {
    const first = players.find((player) => player.id === firstId)
    if (!first) return players
    return [first, ...players.filter((player) => player.id !== firstId)]
  }
  return orderMode.value === 'random' ? shuffled(players) : players
}

function launch(players: PlayerRef[]) {
  const ruleConfig = buildConfig(players)
  const legsToWin = supportsLegs.value ? bestOf(legsBestOf.value) : 1
  const setsToWin = supportsLegs.value ? bestOf(setsBestOf.value) : 1

  // Un leg sec n'a pas besoin de l'enveloppe de match : on garde la règle nue,
  // ce qui garde aussi l'identifiant enregistré simple (#18).
  if (legsToWin <= 1 && setsToWin <= 1) {
    emit('start', rule.value, ruleConfig, players, inputMode.value)
    return
  }

  emit(
    'start',
    createMatchRule(rule.value),
    { ruleConfig, legsToWin, setsToWin, alternateStart: alternateStart.value },
    players,
    inputMode.value,
  )
}

/** §4.9 — enregistre la configuration courante pour la relancer en un tap. */
async function saveFavourite() {
  const players = orderedPlayers()
  const legsToWin = bestOf(legsBestOf.value)
  const setsToWin = bestOf(setsBestOf.value)
  const single = legsToWin <= 1 && setsToWin <= 1
  const ruleConfig = buildConfig(players)

  await favourites.add({
    label: describeConfiguration({
      ruleId: rule.value.id,
      config: ruleConfig,
      legsBestOf: legsBestOf.value,
      setsBestOf: setsBestOf.value,
    }),
    ruleId: single ? rule.value.id : `match:${rule.value.id}`,
    config: single
      ? ruleConfig
      : { ruleConfig, legsToWin, setsToWin, alternateStart: alternateStart.value },
    inputMode: inputMode.value,
    // Les joueurs sont mémorisés : c'est ce qui fait gagner le plus de temps.
    players: selectedPlayers.value,
  })
}

/**
 * Relance une configuration favorite — §4.9, et §1 : c'est le chemin le plus
 * court vers une partie lancée.
 */
async function launchFavourite(favourite: Favourite) {
  const favouriteRule = findRule(favourite.ruleId)
  if (!favouriteRule) return

  const players = favourite.players.length > 0 ? [...favourite.players] : orderedPlayers()
  if (players.length === 0) return

  await favourites.markUsed(favourite.id)
  emit('start', favouriteRule, favourite.config, players, favourite.inputMode)
}

function start() {
  if (!canStart.value) return
  // §4.4 — bull-off : on ne peut pas deviner qui a gagné le lancer, on demande.
  if (orderMode.value === 'bull-off' && selectedPlayers.value.length > 1) {
    awaitingBullOff.value = true
    return
  }
  launch(orderedPlayers())
}

function startAfterBullOff(winnerId: string) {
  awaitingBullOff.value = false
  launch(orderedPlayers(winnerId))
}
</script>

<template>
  <div class="mx-auto flex min-h-full w-full max-w-lg flex-col gap-5 px-4 pt-4 pb-6">
    <header class="flex items-start gap-2">
      <div class="flex-1">
        <h1 class="text-3xl font-bold tracking-tight">Chalk</h1>
        <p class="text-sm text-chalk-dim">Marqueur de points</p>
      </div>
      <!-- §4.9 — réglages. -->
      <button
        type="button"
        class="tap bg-slate-surface px-3 text-sm text-chalk"
        aria-label="Réglages"
        @click="emit('settings')"
      >
        ⚙
      </button>
      <!-- §4.5 — l'entraînement est un espace distinct des parties. -->
      <button
        type="button"
        class="tap bg-slate-surface px-3 text-sm text-chalk"
        @click="emit('training')"
      >
        Entraînement
      </button>
      <!-- §4.7 — l'historique se consulte hors partie. -->
      <button
        type="button"
        class="tap bg-slate-surface px-3 text-sm text-chalk"
        @click="emit('stats')"
      >
        Stats
      </button>
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

    <!-- §4.9 et §1 — une configuration favorite relance une partie en un tap,
         sans passer par le reste de l'écran. -->
    <section v-if="favourites.favourites.value.length > 0">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Favoris</h2>
      <ul class="flex flex-wrap gap-2">
        <li
          v-for="favourite in favourites.favourites.value"
          :key="favourite.id"
          class="flex items-stretch overflow-hidden rounded-xl bg-slate-raised"
        >
          <button
            type="button"
            class="tap flex-col items-start gap-0 px-3 text-left"
            @click="launchFavourite(favourite)"
          >
            <span class="text-sm font-semibold text-chalk">{{ favourite.label }}</span>
            <span v-if="favourite.players.length > 0" class="text-[0.65rem] text-chalk-dim">
              {{ favourite.players.map((player) => player.name).join(' · ') }}
            </span>
          </button>
          <button
            type="button"
            class="tap w-9 border-l border-slate-line text-chalk-dim"
            :aria-label="`Supprimer le favori ${favourite.label}`"
            @click="favourites.remove(favourite.id)"
          >
            ✕
          </button>
        </li>
      </ul>
    </section>

    <InstallBanner v-if="install.shouldOffer.value" />

    <section>
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Mode de jeu</h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="entry in GAME_RULES"
          :key="entry.id"
          type="button"
          class="tap h-14 px-1 text-center text-xs leading-tight"
          :class="
            ruleId === entry.id
              ? 'bg-accent font-bold text-on-accent'
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
            class="flex h-6 w-6 items-center justify-center rounded-full text-[0.65rem] font-bold text-on-accent"
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
                ? 'bg-accent font-bold text-on-accent'
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
              ? 'bg-accent font-bold text-on-accent'
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
              ? 'bg-accent font-bold text-on-accent'
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
              ? 'bg-accent font-bold text-on-accent'
              : 'bg-slate-surface text-chalk'
          "
          @click="atcMode = mode.value as typeof atcMode"
        >
          {{ mode.label }}
        </button>
      </div>
    </section>

    <section v-else-if="rule.id === 'shanghai'">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Manches</h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="choice in [7, 10, 20]"
          :key="choice"
          type="button"
          class="tap num text-sm"
          :class="
            shanghaiRounds === choice
              ? 'bg-accent font-bold text-on-accent'
              : 'bg-slate-surface text-chalk'
          "
          @click="shanghaiRounds = choice"
        >
          1 à {{ choice }}
        </button>
      </div>
      <p class="mt-2 text-xs text-chalk-dim">
        Simple + double + triple du numéro dans la même volée : victoire immédiate.
      </p>
    </section>

    <section v-else-if="rule.id === 'halve-it'">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">
        Score de départ
      </h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="choice in [40, 100, 200]"
          :key="choice"
          type="button"
          class="tap num text-sm"
          :class="
            halveItStart === choice
              ? 'bg-accent font-bold text-on-accent'
              : 'bg-slate-surface text-chalk'
          "
          @click="halveItStart = choice"
        >
          {{ choice }}
        </button>
      </div>
      <p class="mt-2 text-xs text-chalk-dim">
        20, 19, doubles, 18, triples, 17, bull. Une manche sans touché divise le score par deux.
      </p>
    </section>

    <section v-else-if="rule.id === 'high-score'">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Manches</h2>
      <div class="grid grid-cols-4 gap-2">
        <button
          v-for="choice in [5, 10, 15, 20]"
          :key="choice"
          type="button"
          class="tap num text-sm"
          :class="
            highScoreRounds === choice
              ? 'bg-accent font-bold text-on-accent'
              : 'bg-slate-surface text-chalk'
          "
          @click="highScoreRounds = choice"
        >
          {{ choice }}
        </button>
      </div>
    </section>

    <section v-else-if="rule.id === 'golf'">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Trous</h2>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="choice in [9, 18]"
          :key="choice"
          type="button"
          class="tap num text-sm"
          :class="
            golfHoles === choice
              ? 'bg-accent font-bold text-on-accent'
              : 'bg-slate-surface text-chalk'
          "
          @click="golfHoles = choice"
        >
          {{ choice }} trous
        </button>
      </div>
      <p class="mt-2 text-xs text-chalk-dim">
        Triple 1 coup, double 2, simple 3, manqué 5. La meilleure fléchette du trou compte, le score
        le plus bas gagne.
      </p>
    </section>

    <section v-else-if="rule.id === 'bobs-27'">
      <button
        type="button"
        class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk"
        role="switch"
        :aria-checked="bobsStopOnNegative"
        @click="bobsStopOnNegative = !bobsStopOnNegative"
      >
        <span>S'arrêter sous zéro</span>
        <span class="text-xs font-bold" :class="bobsStopOnNegative ? 'text-ok' : 'text-chalk-dim'">
          {{ bobsStopOnNegative ? 'Oui' : 'Non' }}
        </span>
      </button>
      <p class="mt-2 text-xs text-chalk-dim">
        D1 à D20 puis le bull, départ à 27 points. Une manche sans touché coûte la valeur du double.
      </p>
    </section>

    <!-- §4.4, #28 — format du match. -->
    <MatchOptions
      v-if="supportsLegs"
      v-model:legs="legsBestOf"
      v-model:sets="setsBestOf"
      v-model:alternate="alternateStart"
      v-model:order="orderMode"
    />

    <!-- §4.4 — handicap, pour qu'un débutant puisse jouer contre un confirmé. -->
    <section v-if="supportsHandicap && selectedPlayers.length > 0">
      <button
        type="button"
        class="tap mb-2 w-full justify-between px-1 text-xs font-semibold tracking-wide text-chalk-dim uppercase"
        :aria-expanded="handicapEnabled"
        @click="handicapEnabled = !handicapEnabled"
      >
        <span>Handicap</span>
        <span class="text-chalk">{{ handicapEnabled ? '−' : '+' }}</span>
      </button>
      <HandicapPicker
        v-if="handicapEnabled"
        v-model="handicaps"
        :players="selectedPlayers"
        :base-score="startingScore"
      />
    </section>

    <section v-if="!rule.requiresDartDetail">
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Saisie</h2>
      <div class="grid grid-cols-2 gap-2">
        <button
          type="button"
          class="tap text-xs"
          :class="
            inputMode === 'turn'
              ? 'bg-accent font-bold text-on-accent'
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
              ? 'bg-accent font-bold text-on-accent'
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
    <div class="mt-auto">
      <!-- §4.4 — le bull-off se joue sur la cible : l'application ne peut que
           demander qui l'a gagné. -->
      <div v-if="awaitingBullOff" class="rounded-2xl border border-accent/50 bg-accent/10 p-3">
        <p class="mb-2 text-center text-sm font-semibold text-accent">Qui a gagné le bull ?</p>
        <div class="grid gap-2" :class="selectedPlayers.length > 2 ? 'grid-cols-2' : 'grid-cols-1'">
          <button
            v-for="player in selectedPlayers"
            :key="player.id"
            type="button"
            class="tap h-14 gap-2 bg-accent text-sm font-bold text-on-accent"
            @click="startAfterBullOff(player.id)"
          >
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full bg-slate-board text-[0.7rem] text-chalk"
              aria-hidden="true"
            >
              {{ initials(player.name) }}
            </span>
            {{ player.name }}
          </button>
        </div>
        <button
          type="button"
          class="tap mt-2 w-full text-xs text-chalk-dim"
          @click="awaitingBullOff = false"
        >
          Annuler
        </button>
      </div>

      <template v-else>
        <button
          type="button"
          class="tap h-16 w-full bg-accent text-lg font-bold text-on-accent disabled:opacity-30"
          :disabled="!canStart"
          @click="start()"
        >
          Lancer la partie
        </button>
        <!-- §4.9 — mémoriser cette configuration pour la relancer en un tap. -->
        <button
          type="button"
          class="tap mt-2 h-10 w-full text-xs text-chalk-dim disabled:opacity-30"
          :disabled="!canStart"
          @click="saveFavourite()"
        >
          ☆ Enregistrer dans les favoris
        </button>
      </template>
    </div>

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
