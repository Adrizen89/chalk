<script setup lang="ts">
/**
 * Écran de partie — #29, §4.3 et §5.
 *
 * L'écran le plus regardé de l'application, et celui où toutes les contraintes
 * d'ergonomie du §5 se vérifient :
 *
 *  - le score restant est le plus gros élément, lisible à 2–3 m ;
 *  - les zones de tap sont dans la moitié basse, utilisables au pouce ;
 *  - aucune fenêtre modale, aucune animation qui bloque la saisie suivante ;
 *  - retour visuel immédiat après chaque saisie.
 *
 * Il ne connaît aucune règle : il affiche une `GameView` (§4.2). C'est ce qui
 * lui permet de servir X01, Cricket, Killer et Around the Clock — et les règles
 * maison à venir.
 */
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import type { Dart } from '@chalk/core'
import CheckoutHint from '@/components/CheckoutHint.vue'
import CricketMarks from '@/components/CricketMarks.vue'
import DartPad from '@/components/DartPad.vue'
import RecentTurns from '@/components/RecentTurns.vue'
import ScoreBoard from '@/components/ScoreBoard.vue'
import TurnDarts from '@/components/TurnDarts.vue'
import TurnTotalPad from '@/components/TurnTotalPad.vue'
import { useMatch } from '@/composables/useMatch'
import { useWakeLock } from '@/composables/useWakeLock'
import { useFeedback } from '@/composables/useFeedback'

const emit = defineEmits<{ quit: [] }>()

const match = useMatch()
const {
  view,
  rule,
  baseRule,
  isFinished,
  winner,
  canUndo,
  checkout,
  recentTurns,
  effectiveInputMode,
  lastEffects,
  throwDart,
  submitTurnTotal,
  undo,
  undoTurn,
  rematch,
  abandon,
  storageError,
} = match

/**
 * §5 — l'écran ne doit pas s'éteindre pendant la partie. Le verrou est pris à
 * l'entrée et relâché à la sortie : le garder au-delà consommerait de la
 * batterie pour rien.
 */
const wakeLock = useWakeLock()
/** §4.9 — annonce sonore et vibration des moments forts. */
const feedback = useFeedback()
onMounted(() => void wakeLock.request())
onUnmounted(() => void wakeLock.release())

/**
 * §4.4, §5 — l'abandon demande deux gestes.
 *
 * Abandonner retire définitivement la partie des reprises proposées, et le
 * bouton vit dans le bandeau du haut, à portée d'un faux contact — on manipule
 * l'écran debout, parfois d'une main, les fléchettes dans l'autre. Un tap
 * suffisait à perdre le leg en cours.
 *
 * Ce n'est pas une fenêtre de confirmation : §5 les interdit pendant une
 * partie. Le bouton s'arme, annonce ce qu'il va faire, et se désarme tout seul
 * — au bout de quelques secondes, ou dès que la partie reprend son cours.
 * L'écran ne se bloque à aucun moment.
 */
const abandonArmed = ref(false)
let abandonTimer: ReturnType<typeof setTimeout> | undefined

/** Laissé assez long pour lire, assez court pour ne pas rester armé par oubli. */
const ABANDON_ARMED_MS = 4000

function onAbandon() {
  if (abandonArmed.value) {
    disarmAbandon()
    void abandon()
    return
  }
  abandonArmed.value = true
  clearTimeout(abandonTimer)
  abandonTimer = setTimeout(() => (abandonArmed.value = false), ABANDON_ARMED_MS)
}

/** Une fléchette de plus, c'est la preuve qu'on ne voulait pas abandonner. */
function disarmAbandon() {
  clearTimeout(abandonTimer)
  abandonArmed.value = false
}

onUnmounted(() => clearTimeout(abandonTimer))

const error = ref<string | null>(null)
/** §4.9 — annonce des 180 et fin de leg, en bandeau non bloquant. */
const banner = ref<string | null>(null)
let bannerTimer: ReturnType<typeof setTimeout> | undefined

/** Score restant du joueur actif, pour valider la saisie par volée. */
const remaining = computed(() => {
  if (baseRule.value !== 'x01') return undefined
  const active = view.value?.players.find((player) => player.isActive)
  if (!active) return undefined
  const parsed = Number(active.primary)
  return Number.isFinite(parsed) ? parsed : undefined
})

/** Modes qui affichent leur propre tableau : le score passe en bande compacte. */
const hasOwnBoard = computed(() => baseRule.value === 'cricket')

const activeName = computed(() => view.value?.players.find((player) => player.isActive)?.name ?? '')

/** Nom d'un joueur, pour les annonces. */
function nameOf(playerId: string): string {
  return view.value?.players.find((player) => player.playerId === playerId)?.name ?? ''
}

/**
 * §4.9 — annonces : 180, bust, leg et set gagnés.
 *
 * L'ordre compte : un set gagné est aussi un leg gagné, et c'est le plus fort
 * des deux qu'il faut annoncer. La fin de match, elle, a son propre écran.
 */
watch(lastEffects, (effects) => {
  feedback.onEffects(effects)
  const types = new Set(effects.map((effect) => effect.type))
  if (types.has('game-won')) return

  for (const effect of effects) {
    if (effect.type === 'set-won') return announce(`Set pour ${nameOf(effect.playerId)}`)
  }
  for (const effect of effects) {
    if (effect.type === 'leg-won') return announce(`Leg pour ${nameOf(effect.playerId)}`)
  }
  for (const effect of effects) {
    if (effect.type === 'milestone' && effect.label === '180') return announce('180 !')
    if (effect.type === 'bust') return announce('Bust')
  }
})

function announce(message: string) {
  banner.value = message
  clearTimeout(bannerTimer)
  bannerTimer = setTimeout(() => (banner.value = null), 1600)
}

function onDart(dart: Dart) {
  disarmAbandon()
  error.value = throwDart(dart)
}

function onTurnTotal(total: number, dartsUsed?: number) {
  disarmAbandon()
  error.value = submitTurnTotal(total, dartsUsed)
}
</script>

<template>
  <div
    v-if="view"
    class="mx-auto flex h-full w-full max-w-lg flex-col overflow-hidden px-3 sm:landscape:max-w-5xl"
  >
    <header class="safe-top flex shrink-0 items-center gap-2 pb-2">
      <button
        type="button"
        class="tap px-2 text-sm text-chalk-dim"
        aria-label="Quitter la partie sans l'abandonner"
        @click="emit('quit')"
      >
        ✕
      </button>
      <span class="text-xs font-semibold tracking-wide text-chalk-dim uppercase">
        {{ rule?.label }}
      </span>
      <!-- §4.4 : quitter conserve la partie, l'abandonner la retire des
           reprises proposées. Deux gestes distincts, volontairement.
           Armé, le bouton prend la couleur du bust : c'est déjà celle que
           l'application emploie pour « ce que vous venez de faire coûte cher ». -->
      <button
        v-if="!isFinished"
        type="button"
        class="tap px-2 text-xs"
        :class="abandonArmed ? 'bg-bust/15 font-bold text-bust' : 'text-chalk-dim'"
        :aria-label="
          abandonArmed
            ? 'Confirmer : la partie sera abandonnée'
            : 'Abandonner la partie, en deux gestes'
        "
        @click="onAbandon()"
      >
        {{ abandonArmed ? 'Confirmer ?' : 'Abandonner' }}
      </button>
      <!-- §4.3 : bouton Annuler toujours accessible. -->
      <button
        type="button"
        class="tap ml-auto bg-slate-surface px-3 text-sm text-chalk disabled:opacity-30"
        :disabled="!canUndo"
        @click="undo()"
      >
        ↶ Annuler
      </button>
      <button
        type="button"
        class="tap bg-slate-surface px-3 text-xs text-chalk-dim disabled:opacity-30"
        :disabled="!canUndo"
        @click="undoTurn()"
      >
        Volée
      </button>
    </header>

    <!-- §3.2 : portrait par défaut, paysage exploité dès qu'il y a la largeur
         — tablette posée près de la cible, ou téléphone couché. -->
    <div class="flex min-h-0 flex-1 flex-col sm:landscape:flex-row sm:landscape:gap-4">
      <!-- Zone d'information : elle cède la place au pavé de saisie si l'écran
           est petit, plutôt que de le repousser hors de portée du pouce. -->
      <div class="flex min-h-0 flex-1 flex-col">
        <div class="min-h-0 flex-1 overflow-y-auto">
          <ScoreBoard :view="view" :dense="hasOwnBoard" />
          <CricketMarks v-if="baseRule === 'cricket'" :view="view" class="mt-2" />
        </div>

        <!-- §4.3 — rappel des dernières volées, ancré au bas de la zone
             d'information : il occupe l'espace qui restait vide entre le
             tableau et le pavé, et se retrouve au plus près du regard qui
             vient de valider.
             `shrink-0` et hors de la zone qui défile : à trois joueurs ou
             plus, c'est le tableau qui défile, jamais le rappel qui se coupe
             au milieu d'une ligne. -->
        <!-- En paysage, cette colonne descend jusqu'au bas de l'écran : le
             rappel est alors le dernier élément, et doit dégager la zone sûre
             lui-même (§3.2). En portrait, le pavé de saisie s'en charge. -->
        <RecentTurns
          v-if="recentTurns.length > 0"
          :turns="recentTurns"
          :show-total="baseRule === 'x01'"
          class="shrink-0 pt-3 sm:landscape:pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        />
      </div>

      <!-- La saisie occupe la moitié basse en portrait, la colonne droite en
           paysage : dans les deux cas, sous le pouce (§5). -->
      <div
        class="flex min-h-0 shrink-0 flex-col justify-end overflow-y-auto sm:landscape:w-1/2 sm:landscape:max-w-md"
      >
        <div class="mt-2 space-y-2">
          <TurnDarts
            v-if="effectiveInputMode === 'dart'"
            :darts="view.turnDarts"
            :show-total="baseRule === 'x01'"
          />
          <CheckoutHint
            v-if="checkout"
            :best="checkout.best"
            :alternatives="checkout.alternatives"
          />

          <!-- §5 : messages courts, jamais bloquants. -->
          <p
            v-if="banner"
            class="rounded-xl bg-accent px-3 py-2 text-center text-lg font-bold text-on-accent"
            role="status"
          >
            {{ banner }}
          </p>
          <p v-else-if="error" class="text-center text-sm font-medium text-bust" role="alert">
            {{ error }}
          </p>
          <!-- §5 : un problème d'enregistrement se signale, il n'interrompt pas
               la partie — les scores restent en mémoire et la volée suivante
               peut être saisie. -->
          <p
            v-else-if="storageError"
            class="text-center text-xs font-medium text-bust"
            role="alert"
          >
            {{ storageError }}
          </p>
        </div>

        <div class="safe-bottom pt-2">
          <template v-if="!isFinished">
            <!-- Masqué en paysage : la place manque, et l'information est déjà
                 portée par le badge « À vous » du tableau de score. -->
            <p class="mb-2 text-center text-xs text-chalk-dim sm:landscape:hidden">
              Au tour de <span class="font-bold text-accent">{{ activeName }}</span>
            </p>
            <DartPad v-if="effectiveInputMode === 'dart'" @throw="onDart" />
            <TurnTotalPad v-else :remaining="remaining" @submit="onTurnTotal" />
          </template>

          <!-- §4.4 — écran de fin : vainqueur et relance en un tap. -->
          <div v-else class="rounded-2xl border border-accent/50 bg-accent/10 p-4 text-center">
            <p class="text-sm text-chalk-dim">Vainqueur</p>
            <p class="mt-1 text-3xl font-bold text-accent">{{ winner?.name }}</p>
            <dl class="mt-3 flex justify-center gap-4 text-xs text-chalk-dim">
              <div v-for="stat in winner?.secondary ?? []" :key="stat.label" class="flex gap-1">
                <dt>{{ stat.label }}</dt>
                <dd class="num font-bold text-chalk">{{ stat.value }}</dd>
              </div>
            </dl>
            <div class="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                class="tap h-14 bg-slate-raised text-sm font-semibold text-chalk"
                @click="emit('quit')"
              >
                Terminer
              </button>
              <button
                type="button"
                class="tap h-14 bg-accent text-sm font-bold text-on-accent"
                @click="rematch()"
              >
                Revanche
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
