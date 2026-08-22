/**
 * Solveur de sorties (checkouts) — §4.3.
 *
 * Le cahier des charges demande d'afficher « la meilleure combinaison de sortie
 * quand le score restant est ≤ 170 », en tenant compte du nombre de fléchettes
 * restantes dans la volée, avec un chemin alternatif possible.
 *
 * La table n'est pas recopiée : elle est résolue. Une table écrite à la main est
 * fausse quelque part, et elle ne sait pas s'adapter au mode de sortie ni aux
 * doubles préférés du joueur — deux choses que le CDC exige (§4.3 et §4.6.5).
 *
 * Ce module est réutilisé par :
 *   - l'affichage des suggestions pendant la partie (§4.3) ;
 *   - l'exercice « Entraînement aux sorties » (§4.5) ;
 *   - le conseil de préparation de sortie du coach de ciblage (§4.6.4).
 */

import type { Dart, Segment } from './dart.js'
import { allPossibleDarts, dartValue, formatDart, isDouble, isTriple } from './dart.js'

/** §4.2 : *double out*, *master out* ou *straight out*. */
export type OutMode = 'double' | 'master' | 'straight'

/** Nombre de fléchettes encore disponibles dans la volée en cours. */
export type DartsRemaining = 1 | 2 | 3

/**
 * Scores impossibles à terminer en 3 fléchettes en *double out* — §4.6.4.
 * Le coach doit éviter de laisser le joueur sur l'un d'eux.
 */
export const BOGEY_NUMBERS: readonly number[] = [159, 162, 163, 165, 166, 168, 169]

/**
 * Ordre de préférence des doubles, du plus souhaitable au moins souhaitable.
 *
 * D16 en tête : c'est le double qui se rattrape le mieux après une fléchette
 * manquée (D16 → D8 → D4 → D2 → D1, sans jamais tomber sur un score impair),
 * et cet ordre reproduit les tables de sortie classiques — 41 se sort en
 * « 9, D16 » et non en « 1, D20 », parce que le simple 1 est bordé par le 20
 * et le 18 : le manquer coûte très cher.
 *
 * Les tables publiées ne sont pas toutes d'accord entre elles — « école D16 »
 * contre « école D20 ». Cet ordre n'est donc qu'un défaut : §4.6.5 demande de
 * le remplacer par les doubles réellement réussis par le joueur, mesurés sur
 * son historique. Le solveur est conçu pour que ce remplacement soit la seule
 * chose à changer.
 */
export const DEFAULT_DOUBLE_PREFERENCE: readonly Segment[] = [
  16, 20, 8, 4, 12, 10, 18, 14, 6, 2, 25, 19, 17, 15, 13, 11, 9, 7, 5, 3, 1,
]

export interface CheckoutOptions {
  readonly outMode: OutMode
  /** §4.6.5 — doubles préférés du joueur, du meilleur au moins bon. */
  readonly doublePreference?: readonly Segment[]
}

/** La fléchette est-elle une conclusion légale dans ce mode de sortie ? */
export function isFinishingDart(dart: Dart, outMode: OutMode): boolean {
  if (dart.segment === 0) return false
  switch (outMode) {
    case 'double':
      return isDouble(dart)
    case 'master':
      return isDouble(dart) || isTriple(dart)
    case 'straight':
      return true
  }
}

/** Un score est-il un *bogey number* (impossible à finir en 3 fléchettes, double out) ? */
export function isBogeyNumber(score: number): boolean {
  return BOGEY_NUMBERS.includes(score)
}

const SCORING_DARTS = allPossibleDarts().filter((dart) => dart.segment !== 0)

/**
 * Comparateur de chemins de sortie.
 *
 * Lexicographique, chaque critère traduisant une habitude réelle de joueur :
 *  1. le moins de fléchettes possible ;
 *  2. le moins de doubles en préparation — on ne prépare pas une sortie sur un
 *     double, c'est la moitié de la surface d'un simple ;
 *  3. le double final le plus préféré (§4.6.5) ;
 *  4. le moins de triples en préparation — à égalité, un simple 9 vaut mieux
 *     qu'un triple 3 ;
 *  5. la plus grosse première fléchette, puis un départage stable sur la notation,
 *     pour que la table soit déterministe et testable.
 */
function comparePaths(a: Dart[], b: Dart[], preferenceRank: ReadonlyMap<Segment, number>): number {
  const setup = (path: Dart[]) => path.slice(0, -1)
  const finalRank = (path: Dart[]) => {
    const last = path[path.length - 1]
    if (!last) return Number.MAX_SAFE_INTEGER
    return preferenceRank.get(last.segment) ?? Number.MAX_SAFE_INTEGER
  }
  const count = (path: Dart[], predicate: (d: Dart) => boolean) =>
    setup(path).filter(predicate).length

  return (
    a.length - b.length ||
    count(a, isDouble) - count(b, isDouble) ||
    finalRank(a) - finalRank(b) ||
    count(a, isTriple) - count(b, isTriple) ||
    dartValue(b[0] ?? { segment: 0, multiplier: 1 }) -
      dartValue(a[0] ?? { segment: 0, multiplier: 1 }) ||
    formatPath(a).localeCompare(formatPath(b))
  )
}

/** Notation lisible d'un chemin : `T20 T20 BULL`. */
export function formatPath(path: readonly Dart[]): string {
  return path.map(formatDart).join(' ')
}

export interface CheckoutSolver {
  /** Meilleur chemin de sortie, ou `null` si le score n'est pas finissable. */
  find(score: number, dartsRemaining: DartsRemaining): Dart[] | null
  /** §4.3 — chemins alternatifs, le meilleur en premier. */
  findAlternatives(score: number, dartsRemaining: DartsRemaining, limit?: number): Dart[][]
  /** Le score est-il finissable avec ce nombre de fléchettes ? */
  canFinish(score: number, dartsRemaining: DartsRemaining): boolean
  readonly outMode: OutMode
}

/**
 * Construit un solveur avec sa propre mémoïsation.
 *
 * Un solveur par joueur : la préférence de doubles change d'un joueur à l'autre
 * (§4.6.5), donc les tables résolues ne sont pas partageables.
 */
export function createCheckoutSolver(options: CheckoutOptions): CheckoutSolver {
  const { outMode } = options
  const preference = options.doublePreference ?? DEFAULT_DOUBLE_PREFERENCE
  const preferenceRank = new Map<Segment, number>(preference.map((segment, i) => [segment, i]))
  const memo = new Map<string, Dart[] | null>()

  function best(score: number, darts: number): Dart[] | null {
    if (score <= 0 || darts <= 0) return null
    const key = `${score}:${darts}`
    const cached = memo.get(key)
    if (cached !== undefined) return cached

    // Réservation avant récursion : les chemins ne peuvent pas boucler
    // (chaque fléchette consomme des points et une fléchette), mais la
    // réservation garde la mémoïsation lisible.
    memo.set(key, null)

    let bestPath: Dart[] | null = null
    for (const dart of SCORING_DARTS) {
      const value = dartValue(dart)
      let candidate: Dart[] | null = null

      if (value === score) {
        if (isFinishingDart(dart, outMode)) candidate = [dart]
      } else if (value < score && darts > 1) {
        const rest = best(score - value, darts - 1)
        if (rest) candidate = [dart, ...rest]
      }

      if (candidate && (!bestPath || comparePaths(candidate, bestPath, preferenceRank) < 0)) {
        bestPath = candidate
      }
    }

    memo.set(key, bestPath)
    return bestPath
  }

  return {
    outMode,
    canFinish: (score, dartsRemaining) => best(score, dartsRemaining) !== null,
    find: (score, dartsRemaining) => best(score, dartsRemaining),
    findAlternatives(score, dartsRemaining, limit = 3) {
      const paths: Dart[][] = []
      const seen = new Set<string>()

      for (const dart of SCORING_DARTS) {
        const value = dartValue(dart)
        let candidate: Dart[] | null = null

        if (value === score) {
          if (isFinishingDart(dart, outMode)) candidate = [dart]
        } else if (value < score && dartsRemaining > 1) {
          const rest = best(score - value, dartsRemaining - 1)
          if (rest) candidate = [dart, ...rest]
        }

        if (!candidate) continue
        const signature = formatPath(candidate)
        if (seen.has(signature)) continue
        seen.add(signature)
        paths.push(candidate)
      }

      return paths.sort((a, b) => comparePaths(a, b, preferenceRank)).slice(0, limit)
    },
  }
}

/** Solveur par défaut : *double out*, préférence de doubles standard. */
export const defaultCheckoutSolver: CheckoutSolver = createCheckoutSolver({ outMode: 'double' })

/**
 * Seuil d'affichage des suggestions — §4.3 : « quand le score restant est ≤ 170 ».
 * 170 est le maximum finissable en 3 fléchettes en *double out* (T20 T20 BULL).
 */
export const CHECKOUT_SUGGESTION_THRESHOLD = 170
