/**
 * Parties enregistrées — #18 et #31.
 *
 * §4.4 : « une partie interrompue (batterie, fermeture du navigateur) doit être
 * proposée à la reprise ». La règle qui en découle est simple et non
 * négociable : **on écrit à chaque entrée validée**, pas à la sortie propre.
 * Une sortie propre, sur une batterie vide, n'arrive jamais.
 */

import type { GameSnapshot, PlayerId } from '@chalk/core'
import { db, isQuotaError } from './database.js'
import type { GameStatus, StoredGame, StoredInputMode } from './schema.js'

export class StorageFullError extends Error {
  constructor() {
    super("L'espace de stockage est plein. Supprimez d'anciennes parties pour continuer.")
    this.name = 'StorageFullError'
  }
}

/**
 * Ramène une valeur à des données brutes, clonables par IndexedDB.
 *
 * Une donnée lue en base puis passée dans un `ref()` de Vue devient un Proxy
 * réactif — et `structuredClone`, sur lequel repose IndexedDB, ne sait pas
 * cloner un Proxy : l'écriture échoue avec un `DataCloneError`. C'est arrivé
 * exactement sur le chemin le plus sensible, la reprise d'une partie (#31).
 *
 * L'aller-retour JSON est sans perte ici : §3.4 exige déjà qu'un instantané
 * soit sérialisable, et un test du moteur le vérifie. Le coût est négligeable
 * — quelques centaines de petits objets — au regard d'une écriture perdue.
 */
function toStorable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export interface SaveGameInput {
  readonly id: string
  readonly snapshot: GameSnapshot<unknown>
  readonly inputMode: StoredInputMode
  readonly status: GameStatus
  readonly winnerId: PlayerId | null
}

/**
 * Écrit ou met à jour une partie.
 *
 * `createdAt` est préservé d'un enregistrement à l'autre : c'est lui qui
 * ordonne l'historique (§4.7), et le réécrire ferait remonter une vieille
 * partie en tête à chaque volée.
 */
export async function saveGame(input: SaveGameInput): Promise<void> {
  const now = Date.now()
  try {
    const existing = await db().games.get(input.id)
    const record: StoredGame = {
      id: input.id,
      ruleId: input.snapshot.ruleId,
      config: toStorable(input.snapshot.config),
      players: toStorable(input.snapshot.players),
      inputs: toStorable(input.snapshot.inputs),
      inputMode: input.inputMode,
      status: input.status,
      winnerId: input.winnerId,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    }
    await db().games.put(record)
  } catch (error) {
    if (isQuotaError(error)) throw new StorageFullError()
    throw error
  }
}

/**
 * Parties interrompues, la plus récente en tête — §4.4.
 *
 * Plusieurs parties peuvent être en cours : on joue un 501 à la maison, on en
 * commence un autre au club. Aucune ne doit être écrasée par l'autre.
 */
export async function findResumableGames(limit = 5): Promise<StoredGame[]> {
  const games = await db()
    .games.where('status')
    .equals('in-progress' satisfies GameStatus)
    .reverse()
    .sortBy('updatedAt')
  return games.slice(0, limit)
}

export async function getGame(id: string): Promise<StoredGame | undefined> {
  return db().games.get(id)
}

/** Marque une partie abandonnée plutôt que de l'effacer (§4.4). */
export async function abandonGame(id: string): Promise<void> {
  await db().games.update(id, { status: 'abandoned', updatedAt: Date.now() })
}

export async function deleteGame(id: string): Promise<void> {
  await db().games.delete(id)
}

/** Historique, le plus récent en tête — amorce de #42. */
export async function listGames(limit = 50): Promise<StoredGame[]> {
  return db().games.orderBy('updatedAt').reverse().limit(limit).toArray()
}

export async function countGames(): Promise<number> {
  return db().games.count()
}

/**
 * Fait de la place en supprimant les plus anciennes parties **terminées ou
 * abandonnées**.
 *
 * Une partie en cours n'est jamais supprimée, même sous pression de quota :
 * c'est la seule chose que l'utilisateur ne peut pas rejouer.
 */
export async function pruneOldGames(keep = 100): Promise<number> {
  const finished = await db()
    .games.orderBy('updatedAt')
    .reverse()
    .filter((game) => game.status !== 'in-progress')
    .toArray()

  const excess = finished.slice(keep)
  if (excess.length === 0) return 0
  await db().games.bulkDelete(excess.map((game) => game.id))
  return excess.length
}
