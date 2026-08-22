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
import { getSetting, setSetting } from '@/db/settings'
import { describeConfiguration } from '@/composables/useFavourites'
import { toStorable } from '@/db/storable'
import { ref } from 'vue'
import { SCHEMA_VERSION, STORES_V1, STORES_V2 } from '@/db/schema'
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
  deleteSession,
  estimateExerciseSeconds,
  estimateSessionSeconds,
  listSessions,
  markSessionRun,
  saveSession,
} from '@/db/training'
import { formatDuration } from '@/composables/useSession'

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

describe('configurations favorites (§4.9)', () => {
  /**
   * §1 — c'est le levier le plus direct vers l'objectif des 15 secondes :
   * relancer « 501, double out, best of 5 » sans toucher au reste de l'écran.
   */
  it('décrit une configuration X01 de façon lisible', () => {
    expect(
      describeConfiguration({
        ruleId: 'match:x01',
        config: { ruleConfig: { startingScore: 501, outMode: 'double' } },
        legsBestOf: 5,
        setsBestOf: 1,
      }),
    ).toBe('501, double out, best of 5')
  })

  it('décrit un leg sec sans mention de format', () => {
    expect(
      describeConfiguration({
        ruleId: 'x01',
        config: { startingScore: 301, outMode: 'master' },
        legsBestOf: 1,
        setsBestOf: 1,
      }),
    ).toBe('301, master out')
  })

  it('mentionne les sets quand il y en a', () => {
    expect(
      describeConfiguration({
        ruleId: 'match:x01',
        config: { ruleConfig: { startingScore: 501, outMode: 'straight' } },
        legsBestOf: 3,
        setsBestOf: 3,
      }),
    ).toBe('501, straight out, best of 3, 3 sets')
  })

  it('retombe sur le nom du mode pour les autres jeux', () => {
    expect(
      describeConfiguration({ ruleId: 'cricket', config: {}, legsBestOf: 1, setsBestOf: 1 }),
    ).toBe('Cricket')
  })
})

describe('réglages persistés (§4.9)', () => {
  it('conserve le thème et la taille des scores', async () => {
    await setSetting('theme', 'light')
    await setSetting('scoreSize', 'large')
    expect(await getSetting('theme', 'dark')).toBe('light')
    expect(await getSetting('scoreSize', 'normal')).toBe('large')
  })

  it('retombe sur la valeur par défaut quand rien n’est enregistré', async () => {
    expect(await getSetting('soundEnabled', false)).toBe(false)
  })

  it('enregistre une liste de favoris', async () => {
    const favoris = [{ id: 'f1', label: '501, double out', ruleId: 'x01', config: {}, players: [] }]
    await setSetting('favourites', favoris)
    expect(await getSetting<typeof favoris>('favourites', [])).toEqual(favoris)
  })
})

describe('écriture de données réactives (régression)', () => {
  /**
   * IndexedDB repose sur `structuredClone`, qui ne sait pas cloner un Proxy.
   * Toute donnée passée par un `ref()` de Vue en est un.
   *
   * Le piège s'est présenté deux fois : à la reprise d'une partie (#31), puis
   * aux configurations favorites (§4.9). La garde vit désormais à la frontière
   * du stockage, une seule fois — ces tests la verrouillent pour chaque table.
   */
  it('enregistre un réglage venu d’un ref() Vue', async () => {
    const favoris = ref([{ id: 'f1', label: '501, double out', players: [{ id: 'a', name: 'A' }] }])
    await expect(setSetting('favourites', favoris.value)).resolves.toBeUndefined()
    expect(await getSetting('favourites', [])).toEqual([
      { id: 'f1', label: '501, double out', players: [{ id: 'a', name: 'A' }] },
    ])
  })

  it('enregistre un résultat d’exercice venu d’un ref() Vue', async () => {
    const reactif = ref(result())
    await expect(
      saveExerciseResult({ exerciseId: 'bobs-27', result: reactif.value }),
    ).resolves.toBeDefined()
    expect(await exerciseHistory('bobs-27')).toHaveLength(1)
  })

  it('enregistre un exercice personnalisé venu d’un ref() Vue', async () => {
    const reactif = ref<CustomExerciseDefinition>({
      kind: 'scoring',
      id: 'custom-reactif',
      name: 'Réactif',
      description: '',
      turns: 5,
      threshold: 60,
    })
    await expect(saveCustomExercise(reactif.value)).resolves.toBeDefined()
    expect(await listCustomExercises()).toHaveLength(1)
  })

  it('normalise une valeur profondément réactive', () => {
    const reactif = ref({ a: [{ b: [1, 2, 3] }] })
    const brut = toStorable(reactif.value)
    expect(brut).toEqual({ a: [{ b: [1, 2, 3] }] })
    // La copie est bien détachée du Proxy réactif.
    expect(JSON.stringify(brut)).toBe(JSON.stringify({ a: [{ b: [1, 2, 3] }] }))
  })
})

describe('séances (§4.5, #48)', () => {
  it('enregistre une séance et son ordre d’exercices', async () => {
    const seance = await saveSession({
      name: 'Doubles du soir',
      exerciseIds: ['bobs-27', 'catch-40', 'tour-des-doubles'],
    })
    expect(seance.exerciseIds).toEqual(['bobs-27', 'catch-40', 'tour-des-doubles'])
    expect(await listSessions()).toHaveLength(1)
  })

  it('refuse une séance sans nom ou sans exercice', async () => {
    await expect(saveSession({ name: '  ', exerciseIds: ['bobs-27'] })).rejects.toThrow(/nom/)
    await expect(saveSession({ name: 'Vide', exerciseIds: [] })).rejects.toThrow(/exercice/)
  })

  it('met à jour sans dupliquer et préserve la date de création', async () => {
    const premier = await saveSession({ name: 'Séance', exerciseIds: ['bobs-27'] })
    await new Promise((resolve) => setTimeout(resolve, 5))
    const second = await saveSession({
      id: premier.id,
      name: 'Séance renommée',
      exerciseIds: ['catch-40'],
    })
    expect(await listSessions()).toHaveLength(1)
    expect(second.createdAt).toBe(premier.createdAt)
    expect(second.exerciseIds).toEqual(['catch-40'])
  })

  it('compte les séances menées à terme', async () => {
    const seance = await saveSession({ name: 'S', exerciseIds: ['bobs-27'] })
    await markSessionRun(seance.id)
    await markSessionRun(seance.id)
    const [stored] = await listSessions()
    expect(stored?.runs).toBe(2)
    expect(stored?.lastRunAt).toBeDefined()
  })

  it('ignore une séance inconnue plutôt que d’échouer', async () => {
    await expect(markSessionRun('inexistante')).resolves.toBeUndefined()
  })

  it('supprime une séance', async () => {
    const seance = await saveSession({ name: 'S', exerciseIds: ['bobs-27'] })
    await deleteSession(seance.id)
    expect(await listSessions()).toHaveLength(0)
  })

  /**
   * §4.5 demande une durée **estimée**. Elle s'appuie d'abord sur les durées
   * réellement mesurées : sans historique, l'estimation resterait une promesse
   * en l'air.
   */
  it('estime la durée depuis les séances réellement mesurées', async () => {
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result(), durationSeconds: 200 })
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result(), durationSeconds: 400 })
    expect(await estimateExerciseSeconds('bobs-27')).toBe(300)
  })

  it('retombe sur une estimation par défaut sans historique', async () => {
    expect(await estimateExerciseSeconds('jamais-fait')).toBeGreaterThan(0)
  })

  it('estime une séance comme la somme de ses exercices', async () => {
    await saveExerciseResult({ exerciseId: 'bobs-27', result: result(), durationSeconds: 120 })
    await saveExerciseResult({ exerciseId: 'catch-40', result: result(), durationSeconds: 180 })
    expect(await estimateSessionSeconds(['bobs-27', 'catch-40'])).toBe(300)
  })

  it('formate une durée lisible', () => {
    expect(formatDuration(120)).toBe('2 min')
    expect(formatDuration(20)).toBe('1 min')
    expect(formatDuration(3900)).toBe('1 h 05')
  })
})

describe('migration du schéma v2 → v3 (§4.4)', () => {
  it('conserve résultats et exercices en ajoutant les séances', async () => {
    const name = `chalk-migration-v3-${counter}`
    await database.delete()

    const v2 = new Dexie(name)
    v2.version(1).stores(STORES_V1)
    v2.version(2).stores(STORES_V2)
    await v2.open()
    await v2.table('exerciseResults').put({
      id: 'r1',
      exerciseId: 'bobs-27',
      at: 1,
      metric: 'score',
      metricValue: 40,
      higherIsBetter: true,
      score: 40,
      dartsThrown: 60,
      hits: 10,
      attempts: 20,
      bestStreak: 2,
    })
    v2.close()

    const migrated = new ChalkDatabase(name)
    useDatabaseForTests(migrated)
    await migrated.open()

    expect(migrated.verno).toBe(SCHEMA_VERSION)
    expect((await migrated.exerciseResults.get('r1'))?.metricValue).toBe(40)
    expect(await migrated.trainingSessions.count()).toBe(0)

    database = migrated
  })
})
