<script setup lang="ts">
/**
 * Format du match — §4.4, #28.
 *
 * « Legs et sets paramétrables (ex. : au meilleur des 5 legs, au meilleur des
 *   3 sets) », ordre de jeu et alternance.
 *
 * Les valeurs par défaut sont celles de la partie la plus fréquente — un leg
 * sec, alternance activée — parce que l'objectif du §1 est de lancer une
 * partie en moins de 15 secondes : personne ne doit avoir à toucher cet écran
 * pour jouer.
 */
export type OrderMode = 'manual' | 'random' | 'bull-off'

const legs = defineModel<number>('legs', { required: true })
const sets = defineModel<number>('sets', { required: true })
const alternate = defineModel<boolean>('alternate', { required: true })
const order = defineModel<OrderMode>('order', { required: true })

const LEG_CHOICES = [1, 3, 5, 7, 9] as const
const SET_CHOICES = [1, 3, 5] as const

const ORDER_CHOICES: { value: OrderMode; label: string; hint: string }[] = [
  { value: 'manual', label: 'Manuel', hint: "dans l'ordre de sélection" },
  { value: 'random', label: 'Aléatoire', hint: 'tiré au sort' },
  { value: 'bull-off', label: 'Bull-off', hint: 'lancer au bull' },
]

const label = (value: number) => (value === 1 ? 'Sec' : `Bo${value}`)
</script>

<template>
  <div class="space-y-3">
    <div>
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Legs</h2>
      <div class="grid grid-cols-5 gap-2">
        <button
          v-for="choice in LEG_CHOICES"
          :key="choice"
          type="button"
          class="tap num text-sm"
          :class="
            legs === choice ? 'bg-accent font-bold text-slate-board' : 'bg-slate-surface text-chalk'
          "
          :aria-label="choice === 1 ? 'Un seul leg' : `Au meilleur des ${choice} legs`"
          @click="legs = choice"
        >
          {{ label(choice) }}
        </button>
      </div>
    </div>

    <div>
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">Sets</h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="choice in SET_CHOICES"
          :key="choice"
          type="button"
          class="tap num text-sm"
          :class="
            sets === choice ? 'bg-accent font-bold text-slate-board' : 'bg-slate-surface text-chalk'
          "
          :aria-label="choice === 1 ? 'Sans sets' : `Au meilleur des ${choice} sets`"
          @click="sets = choice"
        >
          {{ choice === 1 ? 'Aucun' : `Bo${choice}` }}
        </button>
      </div>
    </div>

    <div>
      <h2 class="mb-2 text-xs font-semibold tracking-wide text-chalk-dim uppercase">
        Qui commence
      </h2>
      <div class="grid grid-cols-3 gap-2">
        <button
          v-for="choice in ORDER_CHOICES"
          :key="choice.value"
          type="button"
          class="tap flex-col gap-0 px-1 text-xs leading-tight"
          :class="
            order === choice.value
              ? 'bg-accent font-bold text-slate-board'
              : 'bg-slate-surface text-chalk'
          "
          @click="order = choice.value"
        >
          <span>{{ choice.label }}</span>
          <span class="text-[0.6rem] font-normal opacity-70">{{ choice.hint }}</span>
        </button>
      </div>
    </div>

    <!-- §4.4 : « alternance du joueur qui commence à chaque leg ». -->
    <button
      v-if="legs > 1 || sets > 1"
      type="button"
      class="tap w-full justify-between bg-slate-surface px-3 text-sm text-chalk"
      role="switch"
      :aria-checked="alternate"
      @click="alternate = !alternate"
    >
      <span>Alterner à chaque leg</span>
      <span class="text-xs font-bold" :class="alternate ? 'text-ok' : 'text-chalk-dim'">
        {{ alternate ? 'Oui' : 'Non' }}
      </span>
    </button>
  </div>
</template>
