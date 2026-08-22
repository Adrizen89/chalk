/**
 * Instance Dexie et migrations — §3.4, #18.
 */

import Dexie from 'dexie'
import type { EntityTable } from 'dexie'
import type { PendingSync, StoredGame, StoredPlayer, StoredSetting } from './schema.js'
import { STORES } from './schema.js'

export class ChalkDatabase extends Dexie {
  games!: EntityTable<StoredGame, 'id'>
  players!: EntityTable<StoredPlayer, 'id'>
  settings!: EntityTable<StoredSetting, 'key'>
  syncQueue!: EntityTable<PendingSync, 'id'>

  constructor(name = 'chalk') {
    super(name)

    // Version 1 — schéma initial.
    this.version(1).stores(STORES)

    /*
     * Les versions suivantes viendront ici, chacune avec son `upgrade` si les
     * données existantes doivent être transformées. Ne jamais modifier une
     * version déjà publiée : Dexie rejoue les migrations depuis la version
     * installée chez l'utilisateur, pas depuis zéro.
     */
  }
}

let instance: ChalkDatabase | null = null

export function db(): ChalkDatabase {
  instance ??= new ChalkDatabase()
  return instance
}

/** Réservé aux tests : repart d'une base neuve. */
export function useDatabaseForTests(database: ChalkDatabase | null) {
  instance = database
}

/** Une écriture a-t-elle échoué faute de place ? */
export function isQuotaError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (error.name === 'QuotaExceededError' ||
      // Dexie enveloppe l'erreur native.
      error.name === 'QuotaExceededError2' ||
      /quota/i.test(error.message))
  )
}

/**
 * Estimation de l'espace disponible, pour prévenir avant de se retrouver
 * bloqué en pleine partie.
 */
export async function storageEstimate(): Promise<{ usage: number; quota: number } | null> {
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null
  const { usage = 0, quota = 0 } = await navigator.storage.estimate()
  return { usage, quota }
}

/**
 * Demande au navigateur de ne pas évincer nos données sous pression disque.
 *
 * Sans stockage persistant, une partie en cours peut disparaître si l'appareil
 * manque de place — exactement ce que §4.4 interdit. Le navigateur peut
 * refuser ; ce n'est pas bloquant.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false
  try {
    if (await navigator.storage.persisted?.()) return true
    return await navigator.storage.persist()
  } catch {
    return false
  }
}
