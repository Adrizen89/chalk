/**
 * Persistance du module Entraînement — §4.5, #47 et #50.
 *
 * Couvre aussi la **migration de schéma v1 → v2** : le §4.4 promet que les
 * parties enregistrées se retrouvent, une évolution du schéma ne doit rien
 * emporter au passage.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import Dexie from 'dexie'
import type { CustomExerciseDefinition, ExerciseResult } from '@chalk/core'
import { InvalidExerciseError } from '@chalk/core'
import { ChalkDatabase, useDatabaseForTests } from '@/db/database'
import { SCHEMA_VERSION, STORES_V1 } from '@/db/schema'
import {
  deleteCustomExercise,
  exerciseHistory,
  isBetter,
  listCustomExercises,
  newCustomExerciseId,
  personalBest,
  practisedExerciseIds,
  progressCurve,
  saveCustomExercise,
  saveExerciseResult,
} from '@/db/training'

let database: ChalkDatabase
let counter = 0

beforeEach(async () => {
  counter += 1
  database = new ChalkDatabase(`chalk-training-${counter}`)
  useDatabaseForTests(database)
  await database.open()
})

afterEach(async () => {
  await database.delete()
  useDatabaseForTests(null)
})

const result = (over: Partial<ExerciseResult> = {}): ExerciseResult => ({
  score: 50,
  dartsThrown: 30,
  hits: 10,
  attempts: 20,
  bestStreak: 3,
  metricValue: 50,
  metric: 'score',
  higherIsBetter: true,
  ...over,
})

describe('records personnels (§4.5)', () => {
  it('signale le premier résultat comme record', async () => {
    const { isPersonalBest } = await saveExerciseResult({ exerciseId: 'bobs-27', result: result() })
    expect(isPersonalBest).toBe(true)
  })

  it('reconnaît un meilleur score quand le plus haut gagne', async () => {
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result({ metricValue: 50 }) })
    const second = await saveExerciseResult({
      exerciseId: 'bobs-27',
      result: result({ metricValue: 80 }),
    })
    expect(second.isPersonalBest).toBe(true)
    expect((await personalBest('bobs-27'))?.metricValue).toBe(80)
  })

  /**
   * Selon l'exercice, le meilleur résultat est le plus bas — le Tour des
   * doubles se mesure en nombre de fléchettes. Sans la métrique portée par le
   * résultat lui-même, la comparaison serait fausse une fois sur deux.
   */
  it('reconnaît un meilleur score quand le plus bas gagne', async () => {
    const bas = { metric: 'darts' as const, higherIsBetter: false }
    await saveExerciseResult({
      exerciseId: 'tour-des-doubles',
      result: result({ ...bas, metricValue: 60 }),
    })
    const second = await saveExerciseResult({
      exerciseId: 'tour-des-doubles',
      result: result({ ...bas, metricValue: 45 }),
    })
    expect(second.isPersonalBest).toBe(true)
    expect((await personalBest('tour-des-doubles'))?.metricValue).toBe(45)
  })

  it('ne signale pas un résultat moins bon', async () => {
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result({ metricValue: 80 }) })
    const second = await saveExerciseResult({
      exerciseId: 'bobs-27',
      result: result({ metricValue: 40 }),
    })
    expect(second.isPersonalBest).toBe(false)
  })

  it('sépare les records par exercice', async () => {
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result({ metricValue: 80 }) })
    expect(await personalBest('catch-40')).toBeNull()
  })

  it('compare selon la métrique portée par le résultat', () => {
    const haut = { metricValue: 10, higherIsBetter: true } as never
    const bas = { metricValue: 5, higherIsBetter: true } as never
    expect(isBetter(haut, bas)).toBe(true)
    expect(isBetter({ ...(haut as object), higherIsBetter: false } as never, bas)).toBe(false)
  })
})

describe('historique et progression (§4.5)', () => {
  it('classe l’historique du plus récent au plus ancien', async () => {
    for (const value of [10, 20, 30]) {
      await saveExerciseResult({ exerciseId: 'bobs-27', result: result({ metricValue: value }) })
      await new Promise((resolve) => setTimeout(resolve, 3))
    }
    expect((await exerciseHistory('bobs-27')).map((r) => r.metricValue)).toEqual([30, 20, 10])
  })

  it('classe la courbe de progression dans l’ordre chronologique', async () => {
    for (const value of [10, 20, 30]) {
      await saveExerciseResult({ exerciseId: 'bobs-27', result: result({ metricValue: value }) })
      await new Promise((resolve) => setTimeout(resolve, 3))
    }
    expect((await progressCurve('bobs-27')).map((point) => point.value)).toEqual([10, 20, 30])
  })

  it('liste les exercices déjà pratiqués', async () => {
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result() })
    await saveExerciseResult({ exerciseId: 'catch-40', result: result() })
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result() })
    expect((await practisedExerciseIds()).sort()).toEqual(['bobs-27', 'catch-40'])
  })

  it('conserve la durée des exercices chronométrés', async () => {
    await saveExerciseResult({
      exerciseId: 'around-the-clock-chrono',
      result: result({ metric: 'darts', higherIsBetter: false }),
      durationSeconds: 184,
    })
    expect((await exerciseHistory('around-the-clock-chrono'))[0]?.durationSeconds).toBe(184)
  })
})

describe('exercices personnalisés (§4.5, #47)', () => {
  const definition: CustomExerciseDefinition = {
    kind: 'targets',
    id: 'custom-1',
    name: 'Mes triples',
    description: '',
    skill: 'scoring',
    targets: [{ segment: 20, multiplier: 3 }],
    dartsPerTarget: 3,
    advanceOnHit: false,
    laps: 5,
    scoring: 'value',
    match: 'exact',
    trackStreak: false,
    metric: 'score',
    higherIsBetter: true,
  }

  it('enregistre puis relit un exercice', async () => {
    await saveCustomExercise(definition)
    const stored = await listCustomExercises()
    expect(stored).toHaveLength(1)
    expect(stored[0]?.definition.name).toBe('Mes triples')
  })

  it('met à jour sans créer de doublon, et préserve la date de création', async () => {
    const premier = await saveCustomExercise(definition)
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await saveCustomExercise({ ...definition, name: 'Renommé' })

    expect(await listCustomExercises()).toHaveLength(1)
    expect(second.createdAt).toBe(premier.createdAt)
    expect(second.updatedAt).toBeGreaterThanOrEqual(premier.createdAt)
  })

  /**
   * §6 — la validation est le seul endroit qui garantit qu'aucune définition
   * impossible n'entre en base, y compris venant de l'application elle-même.
   */
  it('refuse une définition invalide à l’écriture', async () => {
    await expect(saveCustomExercise({ ...definition, targets: [] })).rejects.toThrow(
      InvalidExerciseError,
    )
    expect(await listCustomExercises()).toHaveLength(0)
  })

  it('supprime l’exercice et son historique', async () => {
    await saveCustomExercise(definition)
    await saveExerciseResult({ exerciseId: 'custom-1', result: result() })
    expect(await exerciseHistory('custom-1')).toHaveLength(1)

    await deleteCustomExercise('custom-1')
    expect(await listCustomExercises()).toHaveLength(0)
    // Un historique orphelin afficherait des lignes sans nom ni contexte.
    expect(await exerciseHistory('custom-1')).toHaveLength(0)
  })

  it('produit des identifiants distincts', () => {
    expect(newCustomExerciseId()).not.toBe(newCustomExerciseId())
    expect(newCustomExerciseId()).toMatch(/^custom-/)
  })
})

describe('migration du schéma v1 → v2 (§4.4)', () => {
  /**
   * Une évolution du schéma ne doit rien emporter : le §4.4 promet à
   * l'utilisateur qu'il retrouve ses parties.
   */
  it('conserve les données d’une base de version 1', async () => {
    const name = `chalk-migration-${counter}`
    await database.delete()

    // On fabrique une base telle qu'elle existait avant le module Entraînement.
    const v1 = new Dexie(name)
    v1.version(1).stores(STORES_V1)
    await v1.open()
    await v1.table('players').put({
      id: 'a',
      name: 'Adrien',
      createdAt: 1,
      lastPlayedAt: 2,
      gamesPlayed: 3,
    })
    await v1.table('settings').put({ key: 'theme', value: 'dark' })
    v1.close()

    // Puis on l'ouvre avec le schéma courant.
    const migrated = new ChalkDatabase(name)
    useDatabaseForTests(migrated)
    await migrated.open()

    expect(migrated.verno).toBe(SCHEMA_VERSION)
    expect((await migrated.players.get('a'))?.name).toBe('Adrien')
    expect((await migrated.settings.get('theme'))?.value).toBe('dark')
    // Et les nouvelles tables existent.
    expect(await migrated.exerciseResults.count()).toBe(0)
    expect(await migrated.customExercises.count()).toBe(0)

    database = migrated
  })
})
