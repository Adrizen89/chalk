/**
 * Réglages — §4.9.
 *
 * Table clé/valeur plutôt qu'un enregistrement typé : les réglages du §4.9
 * (thème, taille des scores, sons, configurations favorites) arriveront par
 * petits bouts, et faire migrer le schéma à chaque ajout serait absurde.
 */

import { db } from './database.js'
import { toStorable } from './storable.js'

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const row = await db().settings.get(key)
  return row === undefined ? fallback : (row.value as T)
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  // Normalisé ici plutôt qu'à l'appel : voir `storable.ts`.
  await db().settings.put({ key, value: toStorable(value) })
}

export async function removeSetting(key: string): Promise<void> {
  await db().settings.delete(key)
}
