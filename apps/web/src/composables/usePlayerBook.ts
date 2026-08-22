/**
 * Carnet de joueurs — §4.1, #33.
 *
 * §4.1 le qualifie d'indispensable : « on rejoue souvent avec les mêmes
 * personnes ». C'est le principal levier pour tenir l'objectif des 15 secondes
 * du §1, d'où le tri par usage récent.
 *
 * Les données vivent en IndexedDB (#18). Le carnet écrit en `localStorage`
 * avant cette migration est repris au premier chargement.
 */

import { ref } from 'vue'
import type { PlayerRef } from '@chalk/core'
import * as repository from '@/db/players'
import type { StoredPlayer } from '@/db'

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

const players = ref<StoredPlayer[]>([])
const loaded = ref(false)

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
  async function refresh() {
    players.value = await repository.listPlayers()
  }

  async function load() {
    if (loaded.value) return
    try {
      await repository.migrateLegacyPlayers()
      await refresh()
    } catch (error) {
      // §2 : un carnet illisible ne doit jamais empêcher de lancer une partie.
      console.error('Chargement du carnet de joueurs impossible', error)
    } finally {
      loaded.value = true
    }
  }

  /** §4.1 — ajout d'un joueur à la volée pendant la configuration. */
  async function add(name: string): Promise<PlayerRef | null> {
    const player = await repository.addPlayer(name)
    if (player) await refresh()
    return player
  }

  async function remove(id: string) {
    await repository.removePlayer(id)
    await refresh()
  }

  async function rename(id: string, name: string) {
    await repository.renamePlayer(id, name)
    await refresh()
  }

  return { players, loaded, load, refresh, add, remove, rename }
}
