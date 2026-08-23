<script setup lang="ts">
/**
 * Rappel des dernières volées validées — §4.3 et §5.
 *
 * Une fois la volée validée, l'écran n'affiche plus que le score restant : ce
 * qui a été saisi a disparu. C'est le seul point de la boucle de saisie où le
 * marqueur ne peut plus vérifier son geste sans l'annuler.
 *
 * Ordre chronologique, la plus récente en bas : elle se retrouve ainsi au plus
 * près du pavé de saisie, donc du regard qui vient de valider — et la lecture
 * de haut en bas reste celle d'un tableau de score à la craie.
 *
 * Affichage volontairement discret : c'est une information de contrôle, pas
 * une information de jeu. Elle ne doit jamais disputer la place au score
 * restant, qui reste le plus gros élément de l'écran (§5).
 */
import type { RecentTurn } from '@/composables/useMatch'
import { formatDart } from '@chalk/core'
import { avatarColor } from '@/composables/usePlayerBook'

const props = withDefaults(
  defineProps<{
    turns: readonly RecentTurn[]
    /**
     * Le total d'une volée détaillée n'a de sens que sur un mode à score, comme
     * le X01 : au Cricket, l'information est dans les marques.
     */
    showTotal?: boolean
  }>(),
  { showTotal: false },
)

/**
 * Nombre à afficher en fin de ligne, s'il y en a un.
 *
 * Une volée saisie en total porte toujours le sien : c'est le nombre que le
 * marqueur a tapé, et donc exactement ce qu'il cherche à vérifier — quel que
 * soit le mode de jeu.
 */
function totalOf(turn: RecentTurn): number | null {
  if (turn.bust) return null
  if (turn.darts.length === 0) return turn.total
  return props.showTotal ? turn.total : null
}
</script>

<template>
  <section :aria-label="`${turns.length} dernières volées`">
    <ul class="space-y-1">
      <li
        v-for="(turn, index) in turns"
        :key="`${turn.playerId}-${index}`"
        class="flex items-center gap-2 px-1 text-xs"
        :class="index === turns.length - 1 ? 'text-chalk-dim' : 'text-chalk-dim/60'"
      >
        <span
          class="h-2 w-2 shrink-0 rounded-full"
          :style="{ backgroundColor: avatarColor(turn.playerId) }"
          aria-hidden="true"
        />
        <span class="min-w-0 truncate">{{ turn.name }}</span>

        <!-- Le détail des fléchettes n'existe qu'en saisie détaillée. C'est là
             qu'il est le plus utile : trois taps se contrôlent moins bien
             qu'un total. -->
        <span v-if="turn.darts.length > 0" class="num ml-auto truncate tracking-wide">
          {{ turn.darts.map((dart) => formatDart(dart)).join(' ') }}
        </span>

        <span v-if="turn.bust" class="num ml-auto shrink-0 font-bold text-bust">Bust</span>
        <span
          v-else-if="totalOf(turn) !== null"
          class="num shrink-0 font-bold text-chalk"
          :class="turn.darts.length === 0 ? 'ml-auto' : ''"
        >
          {{ totalOf(turn) }}
        </span>
      </li>
    </ul>
  </section>
</template>
