/**
 * Bibliothèque d'exercices intégrés — §4.5, #46.
 *
 * Les huit exercices du cahier des charges. Cinq s'expriment entièrement en
 * **données** sur les implémentations génériques : c'est le signe que
 * l'abstraction est au bon niveau. Si un exercice maison demandait du code,
 * elle serait trop étroite — et le §4.5 exige que l'utilisateur puisse créer
 * les siens.
 */

import type { AimPoint, Segment } from '../dart.js'
import { BULL } from '../dart.js'
import { AROUND_THE_CLOCK_DEFAULT_CONFIG, aroundTheClockRule } from '../games/around-the-clock.js'
import { X01_DEFAULT_CONFIG, x01Rule } from '../games/x01.js'
import type { AnyExerciseRule } from './exercise.js'
import { createBobs27 } from './bobs27.js'
import { createCheckoutPractice, drawCheckoutScores } from './checkout-practice.js'
import { createScoringPractice } from './scoring-practice.js'
import { createTargetPractice } from './target-practice.js'
import type { TargetPracticeSpec } from './target-practice.js'
import { fromGameRule } from './from-game-rule.js'

const double = (segment: Segment): AimPoint => ({ segment, multiplier: 2 })
const triple = (segment: Segment): AimPoint => ({ segment, multiplier: 3 })

/** D1 à D20 dans l'ordre, puis le bull. */
const ALL_DOUBLES: AimPoint[] = [
  ...Array.from({ length: 20 }, (_, i) => double((i + 1) as Segment)),
  { segment: BULL, multiplier: 2 },
]

/** §4.5 — « Tour des doubles : fermer D1 à D20 en un minimum de fléchettes ». */
export const DOUBLES_TOUR: TargetPracticeSpec = {
  id: 'tour-des-doubles',
  name: 'Tour des doubles',
  description: 'Fermer D1 à D20 puis le bull, dans l’ordre, en un minimum de fléchettes.',
  skill: 'doubles',
  targets: ALL_DOUBLES,
  // Illimité : on reste sur le double jusqu'à le toucher. C'est le nombre
  // total de fléchettes qui mesure la performance.
  dartsPerTarget: null,
  advanceOnHit: true,
  laps: 1,
  scoring: 'none',
  match: 'exact',
  trackStreak: false,
  metric: 'darts',
  higherIsBetter: false,
}

/** §4.5 — « Chasse au triple 20 : N volées sur le T20 ». */
export const TRIPLE_20_HUNT: TargetPracticeSpec = {
  id: 'chasse-triple-20',
  name: 'Chasse au triple 20',
  description: 'Dix volées de trois fléchettes sur le T20. Score et nombre de triples.',
  skill: 'scoring',
  targets: [triple(20)],
  dartsPerTarget: 3,
  advanceOnHit: false,
  laps: 10,
  scoring: 'value',
  match: 'exact',
  trackStreak: false,
  metric: 'score',
  higherIsBetter: true,
}

/** §4.5 — « Catch 40 : enchaîner les D20 avec un compteur de série ». */
export const CATCH_40: TargetPracticeSpec = {
  id: 'catch-40',
  name: 'Catch 40',
  description: 'Enchaîner les D20 sous pression. Seule la plus longue série compte.',
  skill: 'doubles',
  targets: [double(20)],
  dartsPerTarget: 3,
  advanceOnHit: false,
  laps: 10,
  scoring: 'hits',
  match: 'exact',
  trackStreak: true,
  metric: 'streak',
  higherIsBetter: true,
}

/**
 * Les huit exercices intégrés du §4.5.
 *
 * `random` est injecté pour l'exercice de sorties, dont les scores sont tirés
 * une fois à la création : un exercice qui tire au sort à l'exécution ne se
 * rejouerait pas à l'identique, et une séance interrompue ne pourrait pas
 * reprendre.
 */
export function builtInExercises(random: () => number = Math.random): AnyExerciseRule[] {
  return [
    createBobs27(),
    createTargetPractice(DOUBLES_TOUR),
    createTargetPractice(TRIPLE_20_HUNT),

    fromGameRule({
      id: 'around-the-clock-chrono',
      name: 'Around the Clock chronométré',
      description: '1 à 20 puis le bull, contre la montre. Le chronomètre tourne à l’écran.',
      skill: 'precision',
      metric: 'darts',
      higherIsBetter: false,
      rule: aroundTheClockRule,
      config: AROUND_THE_CLOCK_DEFAULT_CONFIG,
    }),

    createCheckoutPractice({
      id: 'entrainement-sorties',
      name: 'Entraînement aux sorties',
      description: 'Dix sorties tirées au sort entre 41 et 170, trois fléchettes pour finir.',
      scores: drawCheckoutScores(10, { random }),
      outMode: 'double',
    }),

    fromGameRule({
      id: 'leg-solo',
      name: 'Leg solo',
      description: 'Un 501 joué seul. L’objectif : baisser son nombre de fléchettes.',
      skill: 'scoring',
      metric: 'darts',
      higherIsBetter: false,
      rule: x01Rule,
      config: { ...X01_DEFAULT_CONFIG, startingScore: 501 },
    }),

    createTargetPractice(CATCH_40),

    createScoringPractice({
      id: 'ton-machine',
      name: 'Ton machine',
      description: 'Vingt volées. Combien atteignent 100 points ?',
      turns: 20,
      threshold: 100,
    }),
  ]
}

/** Retrouve un exercice intégré par son identifiant. */
export function findBuiltInExercise(
  id: string,
  random: () => number = Math.random,
): AnyExerciseRule | undefined {
  return builtInExercises(random).find((exercise) => exercise.id === id)
}
