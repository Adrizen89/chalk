/**
 * Exercices personnalisés — §4.5, #47.
 *
 * Le cahier des charges en fait « le point important » du module : « l'utilisateur
 * doit pouvoir créer les siens ». Un exercice personnalisé est une **définition
 * de données**, exécutée par les mêmes implémentations que les exercices
 * intégrés — aucun code n'est produit à la volée, et rien n'est interprété.
 *
 * C'est aussi ce qui rend le partage par lien sûr : ce qui circule est une
 * structure validée, jamais du comportement.
 */

import type { AimPoint, Segment } from '../dart.js'
import { isPhysicallyPossible } from '../dart.js'
import type { AnyExerciseRule, ExerciseMetric, ExerciseSkill } from './exercise.js'
import { createTargetPractice } from './target-practice.js'
import { createScoringPractice } from './scoring-practice.js'
import { createCheckoutPractice, drawCheckoutScores } from './checkout-practice.js'

export const CUSTOM_EXERCISE_VERSION = 1

/** Les trois formes d'exercice qu'un utilisateur peut composer. */
export type CustomExerciseDefinition =
  | {
      readonly kind: 'targets'
      readonly id: string
      readonly name: string
      readonly description: string
      readonly skill: ExerciseSkill
      readonly targets: readonly AimPoint[]
      readonly dartsPerTarget: number | null
      readonly advanceOnHit: boolean
      readonly laps: number
      readonly scoring: 'hits' | 'value' | 'none'
      readonly match: 'exact' | 'segment'
      readonly trackStreak: boolean
      readonly metric: ExerciseMetric
      readonly higherIsBetter: boolean
    }
  | {
      readonly kind: 'scoring'
      readonly id: string
      readonly name: string
      readonly description: string
      readonly turns: number
      readonly threshold: number
    }
  | {
      readonly kind: 'checkout'
      readonly id: string
      readonly name: string
      readonly description: string
      readonly rounds: number
      readonly min: number
      readonly max: number
    }

export class InvalidExerciseError extends Error {
  constructor(reason: string) {
    super(reason)
    this.name = 'InvalidExerciseError'
  }
}

const SKILLS: ExerciseSkill[] = ['doubles', 'scoring', 'checkout', 'precision']
const METRICS: ExerciseMetric[] = ['score', 'darts', 'hits', 'streak']

function assert(condition: unknown, reason: string): asserts condition {
  if (!condition) throw new InvalidExerciseError(reason)
}

/**
 * Valide une définition venue de l'extérieur — import d'un lien partagé (§4.5),
 * ou lecture d'un enregistrement plus ancien.
 *
 * §6 : « protection contre l'injection sur les entrées utilisateur ». Un
 * exercice partagé ne doit pas pouvoir introduire de valeurs impossibles qui
 * bloqueraient l'exécution ou produiraient une boucle infinie.
 */
export function validateCustomExercise(value: unknown): CustomExerciseDefinition {
  assert(typeof value === 'object' && value !== null, 'Définition illisible.')
  const raw = value as Record<string, unknown>

  assert(typeof raw.id === 'string' && raw.id.length > 0, 'Identifiant manquant.')
  assert(typeof raw.name === 'string' && raw.name.trim().length > 0, 'Nom manquant.')
  assert(raw.name.length <= 60, 'Nom trop long.')
  const description = typeof raw.description === 'string' ? raw.description.slice(0, 300) : ''

  switch (raw.kind) {
    case 'targets': {
      assert(Array.isArray(raw.targets) && raw.targets.length > 0, 'Aucune cible.')
      assert(raw.targets.length <= 30, 'Trop de cibles (30 au maximum).')

      const targets = raw.targets.map((entry): AimPoint => {
        assert(typeof entry === 'object' && entry !== null, 'Cible illisible.')
        const point = entry as { segment?: unknown; multiplier?: unknown }
        assert(typeof point.segment === 'number', 'Cible sans segment.')
        assert(typeof point.multiplier === 'number', 'Cible sans multiplicateur.')
        const dart = {
          segment: point.segment as Segment,
          multiplier: point.multiplier as 1 | 2 | 3,
        }
        assert(isPhysicallyPossible(dart), `Cible impossible sur une cible de fléchettes.`)
        assert(dart.segment !== 0, 'Le hors-cible ne peut pas être une cible.')
        return dart
      })

      const dartsPerTarget =
        raw.dartsPerTarget === null || raw.dartsPerTarget === undefined
          ? null
          : Number(raw.dartsPerTarget)
      assert(
        dartsPerTarget === null ||
          (Number.isInteger(dartsPerTarget) && dartsPerTarget >= 1 && dartsPerTarget <= 30),
        'Nombre de fléchettes par cible invalide.',
      )
      const advanceOnHit = raw.advanceOnHit === true
      // Sans limite de fléchettes ni avance au touché, l'exercice ne finirait
      // jamais : le joueur resterait bloqué sur la première cible.
      assert(
        dartsPerTarget !== null || advanceOnHit,
        'Cet exercice ne pourrait jamais se terminer.',
      )

      const laps = Number(raw.laps ?? 1)
      assert(Number.isInteger(laps) && laps >= 1 && laps <= 50, 'Nombre de passages invalide.')

      const scoring = raw.scoring
      assert(scoring === 'hits' || scoring === 'value' || scoring === 'none', 'Barème invalide.')
      const match = raw.match === 'segment' ? 'segment' : 'exact'
      const metric = METRICS.includes(raw.metric as ExerciseMetric)
        ? (raw.metric as ExerciseMetric)
        : 'score'
      const skill = SKILLS.includes(raw.skill as ExerciseSkill)
        ? (raw.skill as ExerciseSkill)
        : 'precision'

      return {
        kind: 'targets',
        id: raw.id,
        name: raw.name.trim(),
        description,
        skill,
        targets,
        dartsPerTarget,
        advanceOnHit,
        laps,
        scoring,
        match,
        trackStreak: raw.trackStreak === true,
        metric,
        higherIsBetter: raw.higherIsBetter !== false,
      }
    }

    case 'scoring': {
      const turns = Number(raw.turns)
      const threshold = Number(raw.threshold)
      assert(Number.isInteger(turns) && turns >= 1 && turns <= 100, 'Nombre de volées invalide.')
      assert(
        Number.isInteger(threshold) && threshold >= 1 && threshold <= 180,
        'Seuil invalide (1 à 180).',
      )
      return { kind: 'scoring', id: raw.id, name: raw.name.trim(), description, turns, threshold }
    }

    case 'checkout': {
      const rounds = Number(raw.rounds)
      const min = Number(raw.min ?? 41)
      const max = Number(raw.max ?? 170)
      assert(
        Number.isInteger(rounds) && rounds >= 1 && rounds <= 100,
        'Nombre de sorties invalide.',
      )
      assert(Number.isInteger(min) && min >= 2 && min <= 170, 'Score minimal invalide.')
      assert(Number.isInteger(max) && max >= min && max <= 170, 'Score maximal invalide.')
      return { kind: 'checkout', id: raw.id, name: raw.name.trim(), description, rounds, min, max }
    }

    default:
      throw new InvalidExerciseError("Type d'exercice inconnu.")
  }
}

/** Construit un exercice exécutable depuis sa définition. */
export function createCustomExercise(
  definition: CustomExerciseDefinition,
  random: () => number = Math.random,
): AnyExerciseRule {
  switch (definition.kind) {
    case 'targets':
      return createTargetPractice({ ...definition, custom: true })
    case 'scoring':
      return createScoringPractice({ ...definition, custom: true })
    case 'checkout':
      return createCheckoutPractice({
        id: definition.id,
        name: definition.name,
        description: definition.description,
        scores: drawCheckoutScores(definition.rounds, {
          min: definition.min,
          max: definition.max,
          random,
        }),
        outMode: 'double',
        custom: true,
      })
  }
}

/**
 * §4.5 — « Possibilité de partager un exercice via un lien ».
 *
 * La définition est encodée en base64url pour tenir dans une URL sans
 * échappement. Elle est **revalidée à l'import** : ce qui arrive de l'extérieur
 * n'est jamais exécuté sur parole.
 */
export function encodeSharedExercise(definition: CustomExerciseDefinition): string {
  const payload = JSON.stringify({ v: CUSTOM_EXERCISE_VERSION, e: definition })
  const bytes = new TextEncoder().encode(payload)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
}

export function decodeSharedExercise(encoded: string): CustomExerciseDefinition {
  let payload: unknown
  try {
    const base64 = encoded.replaceAll('-', '+').replaceAll('_', '/')
    const binary = atob(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='))
    const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
    payload = JSON.parse(new TextDecoder().decode(bytes))
  } catch {
    throw new InvalidExerciseError('Lien illisible.')
  }

  assert(typeof payload === 'object' && payload !== null, 'Lien illisible.')
  const envelope = payload as { v?: unknown; e?: unknown }
  assert(envelope.v === CUSTOM_EXERCISE_VERSION, 'Ce lien vient d’une version incompatible.')
  return validateCustomExercise(envelope.e)
}
