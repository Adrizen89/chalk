/**
 * Carnet de joueurs — amorce de #33.
 *
 * §4.1 le qualifie d'indispensable : « on rejoue souvent avec les mêmes
 * personnes ». C'est le principal levier pour tenir l'objectif des 15 secondes
 * du §1.
 *
 * Version minimale, adossée à `localStorage`, suffisante pour l'écran de
 * configuration. Le carnet complet (avatars, tri par fréquence, édition,
 * rattachement à un compte) passera sur IndexedDB avec #18 et #33.
 */

import { ref, watch } from 'vue'
import type { PlayerRef } from '@chalk/core'

const STORAGE_KEY = 'chalk.players.v1'

/** Couleurs d'avatar par initiales — contraste vérifié sur fond ardoise (§6). */
const AVATAR_COLORS = [
  '#f6c453',
  '#35b37e',
  '#4c9aff',
  '#e5484d',
  '#b18cf0',
  '#f28c48',
  '#3fb8c4',
] as const

function load(): PlayerRef[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(
      (entry): entry is PlayerRef =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PlayerRef).id === 'string' &&
        typeof (entry as PlayerRef).name === 'string',
    )
  } catch {
    // Un stockage illisible ne doit jamais empêcher de lancer une partie (§2).
    return []
  }
}

const players = ref<PlayerRef[]>(load())

watch(
  players,
  (value) => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(value))
    } catch {
      // Mode navigation privée, quota plein : on continue sans persister.
    }
  },
  { deep: true },
)

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return (parts[0] ?? '').slice(0, 2).toUpperCase()
  return `${parts[0]?.[0] ?? ''}${parts[1]?.[0] ?? ''}`.toUpperCase()
}

export function avatarColor(id: string): string {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) % 997
  return AVATAR_COLORS[hash % AVATAR_COLORS.length] ?? AVATAR_COLORS[0]
}

export function usePlayerBook() {
  /** §4.1 — ajout d'un joueur à la volée pendant la configuration. */
  function add(name: string): PlayerRef | null {
    const trimmed = name.trim()
    if (!trimmed) return null

    const existing = players.value.find(
      (player) => player.name.toLowerCase() === trimmed.toLowerCase(),
    )
    if (existing) return existing

    const player: PlayerRef = { id: crypto.randomUUID(), name: trimmed }
    players.value = [...players.value, player]
    return player
  }

  function remove(id: string) {
    players.value = players.value.filter((player) => player.id !== id)
  }

  return { players, add, remove }
}
