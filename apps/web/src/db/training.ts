/**
 * Entraînement : résultats, records et exercices personnalisés — §4.5.
 *
 * « Historique par exercice, avec record personnel mis en évidence » et
 * « courbe de progression par exercice ». Tout est local : le §4.5 exige que
 * le module fonctionne **intégralement hors ligne**.
 */

import type { CustomExerciseDefinition, ExerciseResult } from '@chalk/core'
import { validateCustomExercise } from '@chalk/core'
import { db } from './database.js'
import { toStorable } from './storable.js'
import { randomId } from '../lib/id.js'
import type { StoredCustomExercise, StoredExerciseResult } from './schema.js'

/** Un résultat est-il meilleur qu'un autre, selon la métrique de l'exercice ? */
export function isBetter(
  candidate: StoredExerciseResult,
  reference: StoredExerciseResult,
): boolean {
  return candidate.higherIsBetter
    ? candidate.metricValue > reference.metricValue
    : candidate.metricValue < reference.metricValue
}

export interface SaveResultInput {
  readonly exerciseId: string
  readonly result: ExerciseResult
  readonly durationSeconds?: number
}

/**
 * Enregistre un résultat et dit s'il constitue un record — §4.5.
 *
 * Le record est signalé **au moment où il est battu** : c'est ce que le §4.5
 * demande, et c'est aussi ce qui donne envie de recommencer.
 */
export async function saveExerciseResult(
  input: SaveResultInput,
): Promise<{ record: StoredExerciseResult; isPersonalBest: boolean }> {
  const previousBest = await personalBest(input.exerciseId)

  const record: StoredExerciseResult = {
    id: randomId(),
    exerciseId: input.exerciseId,
    at: Date.now(),
    metric: input.result.metric,
    metricValue: input.result.metricValue,
    higherIsBetter: input.result.higherIsBetter,
    score: input.result.score,
    dartsThrown: input.result.dartsThrown,
    hits: input.result.hits,
    attempts: input.result.attempts,
    bestStreak: input.result.bestStreak,
    ...(input.durationSeconds !== undefined ? { durationSeconds: input.durationSeconds } : {}),
  }

  await db().exerciseResults.put(toStorable(record))
  return { record, isPersonalBest: previousBest === null || isBetter(record, previousBest) }
}

/** Record personnel sur un exercice, ou `null` s'il n'a jamais été fait. */
export async function personalBest(exerciseId: string): Promise<StoredExerciseResult | null> {
  const results = await db().exerciseResults.where('exerciseId').equals(exerciseId).toArray()
  if (results.length === 0) return null
  return results.reduce((best, candidate) => (isBetter(candidate, best) ? candidate : best))
}

/** §4.5 — historique par exercice, le plus récent en tête. */
export async function exerciseHistory(
  exerciseId: string,
  limit = 50,
): Promise<StoredExerciseResult[]> {
  const results = await db().exerciseResults.where('exerciseId').equals(exerciseId).toArray()
  return results.sort((a, b) => b.at - a.at).slice(0, limit)
}

/** §4.5 — courbe de progression, de la plus ancienne à la plus récente. */
export async function progressCurve(exerciseId: string): Promise<{ at: number; value: number }[]> {
  const results = await exerciseHistory(exerciseId, 200)
  return results
    .map((result) => ({ at: result.at, value: result.metricValue }))
    .sort((a, b) => a.at - b.at)
}

/** Exercices déjà pratiqués au moins une fois. */
export async function practisedExerciseIds(): Promise<string[]> {
  const results = await db().exerciseResults.toArray()
  return [...new Set(results.map((result) => result.exerciseId))]
}

// --- Exercices personnalisés (§4.5, #47) ---------------------------------

export async function listCustomExercises(): Promise<StoredCustomExercise[]> {
  return db().customExercises.orderBy('updatedAt').reverse().toArray()
}

export async function getCustomExercise(id: string): Promise<StoredCustomExercise | undefined> {
  return db().customExercises.get(id)
}

/**
 * Enregistre un exercice personnalisé.
 *
 * La définition est **revalidée** avant écriture, y compris quand elle vient
 * de l'application elle-même : c'est le seul endroit qui garantit qu'aucune
 * définition impossible n'entre en base (§6).
 */
export async function saveCustomExercise(
  definition: CustomExerciseDefinition,
): Promise<StoredCustomExercise> {
  const validated = validateCustomExercise(definition)
  const existing = await db().customExercises.get(validated.id)
  const now = Date.now()

  const record: StoredCustomExercise = {
    id: validated.id,
    definition: validated,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  }
  await db().customExercises.put(toStorable(record))
  return record
}

export async function deleteCustomExercise(id: string): Promise<void> {
  await db().customExercises.delete(id)
  // Les résultats suivent : garder l'historique d'un exercice supprimé
  // afficherait des lignes sans nom ni contexte.
  const results = await db().exerciseResults.where('exerciseId').equals(id).toArray()
  await db().exerciseResults.bulkDelete(results.map((result) => result.id))
}

/** Nouvel identifiant pour un exercice créé par l'utilisateur. */
export function newCustomExerciseId(): string {
  return `custom-${randomId()}`
}
