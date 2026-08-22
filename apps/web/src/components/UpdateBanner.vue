<script setup lang="ts">
/**
 * Bannière de mise à jour — §3.2, §5.
 *
 * Non bloquante, et masquée par l'appelant tant qu'une partie est en cours :
 * une mise à jour ne doit jamais couper un leg.
 */
defineProps<{ applying: boolean }>()
defineEmits<{ apply: []; postpone: [] }>()
</script>

<template>
  <div
    class="flex items-center gap-3 rounded-2xl border border-slate-line bg-slate-surface p-3"
    role="status"
  >
    <p class="min-w-0 flex-1 text-xs text-chalk">Une nouvelle version de Chalk est disponible.</p>
    <button
      type="button"
      class="tap shrink-0 px-3 text-xs text-chalk-dim"
      @click="$emit('postpone')"
    >
      Plus tard
    </button>
    <button
      type="button"
      class="tap shrink-0 bg-accent px-3 text-xs font-bold text-on-accent disabled:opacity-50"
      :disabled="applying"
      @click="$emit('apply')"
    >
      {{ applying ? '…' : 'Mettre à jour' }}
    </button>
  </div>
</template>
