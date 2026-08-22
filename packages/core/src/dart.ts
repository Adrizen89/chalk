/**
 * Représentation d'une fléchette et de la cible.
 *
 * Une fléchette est la plus petite unité de données du projet. Tout en dépend :
 * les règles de jeu, les statistiques (§4.7) et le modèle de dispersion du coach
 * de ciblage (§4.6). Elle est donc volontairement minimale et immuable.
 */

/** Secteurs numérotés de la cible, dans le sens horaire en partant du 20. */
export const BOARD_SECTORS = [
  20, 1, 18, 4, 13, 6, 10, 15, 2, 17, 3, 19, 7, 16, 8, 11, 14, 9, 12, 5,
] as const

/** Segment touché : 0 = hors cible, 1 à 20 = secteur numéroté, 25 = bull. */
export type Segment =
  0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13 | 14 | 15 | 16 | 17 | 18 | 19 | 20 | 25

/** Simple, double ou triple. Le hors-cible porte le multiplicateur 1. */
export type Multiplier = 1 | 2 | 3

export const BULL: Segment = 25
export const MISS = { segment: 0, multiplier: 1 } as const satisfies Dart

/**
 * Point de visée déclaré au moment du lancer.
 *
 * §4.6 : le coach de ciblage mesure la dispersion du joueur comme l'écart entre
 * la cible visée et le segment touché. Sans cette information enregistrée dès le
 * lot 1, le modèle de dispersion du lot 3 n'a aucune donnée d'entrée — c'est la
 * raison pour laquelle ce champ existe si tôt dans le projet.
 */
export interface AimPoint {
  readonly segment: Segment
  readonly multiplier: Multiplier
}

export interface Dart {
  readonly segment: Segment
  readonly multiplier: Multiplier
  /** Cible visée, quand elle est connue (coach actif, exercice ciblé). */
  readonly aimedAt?: AimPoint
}

/** Points rapportés par une fléchette. */
export function dartValue(dart: Dart): number {
  if (dart.segment === 0) return 0
  return dart.segment * dart.multiplier
}

/**
 * Une fléchette est-elle physiquement possible ?
 *
 * Le bull n'a pas de triple : la cible ne comporte qu'un simple bull (25) et un
 * double bull (50). Les secteurs numérotés acceptent les trois multiplicateurs.
 */
export function isPhysicallyPossible(dart: Dart): boolean {
  if (dart.segment === 0) return dart.multiplier === 1
  if (dart.segment === BULL) return dart.multiplier === 1 || dart.multiplier === 2
  return dart.segment >= 1 && dart.segment <= 20 && Number.isInteger(dart.segment)
}

export function isDouble(dart: Dart): boolean {
  return dart.segment !== 0 && dart.multiplier === 2
}

export function isTriple(dart: Dart): boolean {
  return dart.segment !== 0 && dart.multiplier === 3
}

/** Notation courte : `T20`, `D16`, `S5`, `BULL`, `25`, `-`. */
export function formatDart(dart: Dart): string {
  if (dart.segment === 0) return '-'
  if (dart.segment === BULL) {
    if (dart.multiplier === 2) return 'BULL'
    // Le triple bull n'existe pas, mais la notation doit rester parlante quand
    // on rejette une saisie erronée.
    return dart.multiplier === 3 ? 'T25' : '25'
  }
  return `${dart.multiplier === 3 ? 'T' : dart.multiplier === 2 ? 'D' : 'S'}${dart.segment}`
}

/** Toutes les fléchettes possibles, hors-cible compris. Utilisé par le solveur de sorties. */
export function allPossibleDarts(): Dart[] {
  const darts: Dart[] = [MISS]
  for (let segment = 1 as number; segment <= 20; segment += 1) {
    for (const multiplier of [1, 2, 3] as const) {
      darts.push({ segment: segment as Segment, multiplier })
    }
  }
  darts.push({ segment: BULL, multiplier: 1 }, { segment: BULL, multiplier: 2 })
  return darts
}

/**
 * Tous les totaux atteignables avec `dartCount` fléchettes.
 *
 * §4.3 : la saisie par volée doit rejeter les scores impossibles. La liste est
 * calculée, pas recopiée — et c'est heureux : celle du cahier des charges est
 * inexacte. Elle cite 159, 155, 153, 149 et 147 comme impossibles alors que
 * les cinq sont atteignables (147 = T20 T20 T9, 159 = T20 T20 T13, …). Les
 * refuser aurait rendu impossible la saisie de scores parfaitement courants.
 *
 * Les seuls totaux réellement impossibles en 3 fléchettes sont :
 * 163, 166, 169, 172, 173, 175, 176, 178, 179 — et tout ce qui dépasse 180.
 */
function computeReachableTotals(dartCount: number): ReadonlySet<number> {
  const values = [...new Set(allPossibleDarts().map(dartValue))]
  let reachable = new Set([0])
  for (let i = 0; i < dartCount; i += 1) {
    const next = new Set<number>()
    for (const total of reachable) {
      for (const value of values) next.add(total + value)
    }
    reachable = next
  }
  return reachable
}

const REACHABLE_WITH_THREE = computeReachableTotals(3)

/** Le total d'une volée de 3 fléchettes est-il atteignable ? */
export function isReachableTurnTotal(total: number): boolean {
  return Number.isInteger(total) && total >= 0 && REACHABLE_WITH_THREE.has(total)
}

/**
 * Totaux impossibles en 3 fléchettes, dans l'ordre décroissant.
 * 179, 178, 176, 175, 173, 172, 169, 166, 163.
 */
export function impossibleTurnTotals(): number[] {
  const impossible: number[] = []
  for (let total = 180; total >= 0; total -= 1) {
    if (!REACHABLE_WITH_THREE.has(total)) impossible.push(total)
  }
  return impossible
}

/** Score maximal d'une volée de 3 fléchettes. */
export const MAX_TURN_TOTAL = 180
