/**
 * Configurations favorites — §4.9.
 *
 * « Enregistrer "501, double out, best of 5" et la relancer en un tap. »
 *
 * C'est le levier le plus direct vers l'objectif du §1 : lancer une partie en
 * moins de 15 secondes. Une configuration favorite court-circuite tout l'écran
 * de réglages.
 *
 * Les favoris vivent dans la table des réglages plutôt que dans une table
 * dédiée : ils sont peu nombreux, et §4.9 annonce d'autres réglages à venir —
 * faire migrer le schéma à chaque ajout serait absurde.
 */

import { ref } from 'vue'
import type { PlayerRef } from '@chalk/core'
import { findRule } from '@chalk/core'
import { getSetting, setSetting } from '@/db'
import { randomId } from '@/lib/id'

const KEY = 'favourites'
const MAX = 12

export interface Favourite {
  readonly id: string
  readonly label: string
  /** Identifiant de la règle, enveloppe de match comprise (`match:x01`). */
  readonly ruleId: string
  readonly config: unknown
  readonly inputMode: 'turn' | 'dart'
  /** Joueurs mémorisés avec la configuration, s'il y en avait. */
  readonly players: readonly PlayerRef[]
  readonly createdAt: number
  readonly usedAt: number
  readonly uses: number
}

const favourites = ref<Favourite[]>([])
let loaded = false

/**
 * Écarte les favoris illisibles plutôt que de faire échouer le chargement.
 *
 * Un favori peut référencer un mode retiré d'une version ultérieure : il ne
 * doit pas empêcher les autres de s'afficher (§2 — on doit toujours pouvoir
 * jouer).
 */
function sanitise(value: unknown): Favourite[] {
  if (!Array.isArray(value)) return []
  return value.filter((entry): entry is Favourite => {
    if (typeof entry !== 'object' || entry === null) return false
    const candidate = entry as Favourite
    return (
      typeof candidate.id === 'string' &&
      typeof candidate.label === 'string' &&
      typeof candidate.ruleId === 'string' &&
      Array.isArray(candidate.players) &&
      findRule(candidate.ruleId) !== undefined
    )
  })
}

async function persist() {
  await setSetting(KEY, favourites.value)
}

export function useFavourites() {
  async function load() {
    if (loaded) return
    try {
      favourites.value = sanitise(await getSetting<unknown>(KEY, []))
    } catch (error) {
      console.error('Chargement des configurations favorites impossible', error)
    } finally {
      loaded = true
    }
  }

  async function refresh() {
    favourites.value = sanitise(await getSetting<unknown>(KEY, []))
  }

  async function add(
    input: Omit<Favourite, 'id' | 'createdAt' | 'usedAt' | 'uses'>,
  ): Promise<Favourite> {
    const now = Date.now()
    const favourite: Favourite = { ...input, id: randomId(), createdAt: now, usedAt: now, uses: 0 }
    // Les plus récentes en tête, et on borne : au-delà d'une douzaine, une
    // liste de favoris cesse d'être un raccourci.
    favourites.value = [favourite, ...favourites.value].slice(0, MAX)
    await persist()
    return favourite
  }

  async function remove(id: string) {
    favourites.value = favourites.value.filter((entry) => entry.id !== id)
    await persist()
  }

  /** Enregistre l'usage : les favoris les plus utilisés remontent. */
  async function markUsed(id: string) {
    favourites.value = favourites.value
      .map((entry) =>
        entry.id === id ? { ...entry, usedAt: Date.now(), uses: entry.uses + 1 } : entry,
      )
      .sort((a, b) => b.usedAt - a.usedAt)
    await persist()
  }

  return { favourites, load, refresh, add, remove, markUsed }
}

/** Libellé lisible d'une configuration, pour proposer un nom par défaut. */
export function describeConfiguration(options: {
  ruleId: string
  config: unknown
  legsBestOf: number
  setsBestOf: number
}): string {
  const rule = findRule(options.ruleId)
  const parts: string[] = []

  const config = options.config as Record<string, unknown> | null
  const inner = (config?.ruleConfig ?? config) as Record<string, unknown> | null

  if (options.ruleId.endsWith('x01') && typeof inner?.startingScore === 'number') {
    parts.push(String(inner.startingScore))
    if (inner.outMode === 'double') parts.push('double out')
    else if (inner.outMode === 'master') parts.push('master out')
    else parts.push('straight out')
  } else {
    parts.push(rule?.label ?? options.ruleId)
  }

  if (options.legsBestOf > 1) parts.push(`best of ${options.legsBestOf}`)
  if (options.setsBestOf > 1) parts.push(`${options.setsBestOf} sets`)

  return parts.join(', ')
}
