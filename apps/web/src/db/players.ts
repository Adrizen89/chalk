/**
 * Carnet de joueurs — §4.1, #33.
 *
 * « Indispensable — on rejoue souvent avec les mêmes personnes. » Le tri par
 * fréquence récente est le levier principal de l'objectif des 15 secondes (§1).
 */

import type { PlayerRef } from '@chalk/core'
import { randomId } from '../lib/id.js'
import { db } from './database.js'
import { toStorable } from './storable.js'
import type { StoredPlayer } from './schema.js'

const LEGACY_KEY = 'chalk.players.v1'

/** Joueurs triés par usage récent : les habitués en tête. */
export async function listPlayers(): Promise<StoredPlayer[]> {
  const players = await db().players.toArray()
  return players.sort((a, b) => b.lastPlayedAt - a.lastPlayedAt || b.gamesPlayed - a.gamesPlayed)
}

export async function addPlayer(name: string): Promise<StoredPlayer | null> {
  const trimmed = name.trim()
  if (!trimmed) return null

  const existing = (await db().players.toArray()).find(
    (player) => player.name.toLowerCase() === trimmed.toLowerCase(),
  )
  if (existing) return existing

  const now = Date.now()
  const player: StoredPlayer = {
    id: randomId(),
    name: trimmed,
    createdAt: now,
    lastPlayedAt: 0,
    gamesPlayed: 0,
  }
  await db().players.put(toStorable(player))
  return player
}

export async function renamePlayer(id: string, name: string): Promise<void> {
  const trimmed = name.trim()
  if (!trimmed) return
  await db().players.update(id, { name: trimmed })
}

export async function removePlayer(id: string): Promise<void> {
  await db().players.delete(id)
}

/** Appelé au lancement d'une partie : alimente le tri par fréquence. */
export async function markPlayed(players: readonly PlayerRef[]): Promise<void> {
  const now = Date.now()
  await db().transaction('rw', db().players, async () => {
    for (const player of players) {
      const stored = await db().players.get(player.id)
      if (!stored) continue
      await db().players.update(player.id, {
        lastPlayedAt: now,
        gamesPlayed: stored.gamesPlayed + 1,
      })
    }
  })
}

/**
 * Reprise du carnet écrit en `localStorage` avant #18.
 *
 * Les joueurs déjà saisis ne doivent pas disparaître parce que le stockage a
 * changé. La migration ne s'exécute qu'une fois, et la clé d'origine n'est
 * effacée qu'après une écriture réussie.
 */
export async function migrateLegacyPlayers(): Promise<number> {
  if (typeof localStorage === 'undefined') return 0

  let raw: string | null = null
  try {
    raw = localStorage.getItem(LEGACY_KEY)
  } catch {
    return 0
  }
  if (!raw) return 0

  let legacy: unknown
  try {
    legacy = JSON.parse(raw)
  } catch {
    // Contenu illisible : on l'écarte plutôt que de bloquer le démarrage.
    localStorage.removeItem(LEGACY_KEY)
    return 0
  }
  if (!Array.isArray(legacy)) return 0

  const now = Date.now()
  const candidates = legacy
    .filter(
      (entry): entry is PlayerRef =>
        typeof entry === 'object' &&
        entry !== null &&
        typeof (entry as PlayerRef).id === 'string' &&
        typeof (entry as PlayerRef).name === 'string',
    )
    .map<StoredPlayer>((entry) => ({
      id: entry.id,
      name: entry.name,
      createdAt: now,
      lastPlayedAt: 0,
      gamesPlayed: 0,
    }))

  if (candidates.length > 0) {
    // `add` et non `put` : une partie déjà migrée ne doit pas être réinitialisée.
    await db().players.bulkPut(
      await Promise.all(
        candidates.map(async (candidate) => (await db().players.get(candidate.id)) ?? candidate),
      ),
    )
  }

  localStorage.removeItem(LEGACY_KEY)
  return candidates.length
}
