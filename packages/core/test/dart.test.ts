import { describe, expect, it } from 'vitest'
import {
  BULL,
  MAX_TURN_TOTAL,
  allPossibleDarts,
  dartValue,
  formatDart,
  impossibleTurnTotals,
  isDouble,
  isPhysicallyPossible,
  isReachableTurnTotal,
  isTriple,
} from '../src/dart.js'
import type { Dart } from '../src/dart.js'

const dart = (segment: number, multiplier: 1 | 2 | 3): Dart => ({ segment, multiplier }) as Dart

describe('valeur d’une fléchette', () => {
  it('multiplie le secteur par le multiplicateur', () => {
    expect(dartValue(dart(20, 3))).toBe(60)
    expect(dartValue(dart(19, 2))).toBe(38)
    expect(dartValue(dart(7, 1))).toBe(7)
  })

  it('compte le bull 25 et le double bull 50', () => {
    expect(dartValue(dart(BULL, 1))).toBe(25)
    expect(dartValue(dart(BULL, 2))).toBe(50)
  })

  it('compte le hors-cible pour zéro', () => {
    expect(dartValue(dart(0, 1))).toBe(0)
  })
})

describe('fléchettes physiquement possibles', () => {
  it('refuse le triple bull, qui n’existe pas sur une cible', () => {
    expect(isPhysicallyPossible(dart(BULL, 3))).toBe(false)
    expect(isPhysicallyPossible(dart(BULL, 2))).toBe(true)
    expect(isPhysicallyPossible(dart(BULL, 1))).toBe(true)
  })

  it('accepte les trois multiplicateurs sur les secteurs numérotés', () => {
    for (let segment = 1; segment <= 20; segment += 1) {
      for (const multiplier of [1, 2, 3] as const) {
        expect(isPhysicallyPossible(dart(segment, multiplier))).toBe(true)
      }
    }
  })

  it('énumère 62 fléchettes distinctes, hors-cible compris', () => {
    // 20 secteurs × 3 multiplicateurs + bull + double bull + hors-cible
    expect(allPossibleDarts()).toHaveLength(20 * 3 + 2 + 1)
    expect(allPossibleDarts().every(isPhysicallyPossible)).toBe(true)
  })

  it('distingue doubles et triples, hors-cible exclu', () => {
    expect(isDouble(dart(16, 2))).toBe(true)
    expect(isDouble(dart(0, 1))).toBe(false)
    expect(isTriple(dart(20, 3))).toBe(true)
    expect(isTriple(dart(20, 2))).toBe(false)
  })
})

describe('notation', () => {
  it('utilise la notation courte des joueurs', () => {
    expect(formatDart(dart(20, 3))).toBe('T20')
    expect(formatDart(dart(16, 2))).toBe('D16')
    expect(formatDart(dart(5, 1))).toBe('S5')
    expect(formatDart(dart(BULL, 2))).toBe('BULL')
    expect(formatDart(dart(BULL, 1))).toBe('25')
    expect(formatDart(dart(0, 1))).toBe('-')
  })
})

describe('totaux de volée impossibles (§4.3)', () => {
  // Les seuls totaux réellement inatteignables avec trois fléchettes.
  const impossiblesReels = [179, 178, 176, 175, 173, 172, 169, 166, 163]

  // Le cahier des charges en cite cinq de plus. Ce test verrouille le fait
  // qu'ils sont atteignables : les rejeter empêcherait la saisie de scores
  // courants. Voir l'issue « la liste des scores impossibles du CDC est fausse ».
  const listesAuCdcMaisAtteignables: [number, string][] = [
    [159, 'T20 T20 T13'],
    [155, 'T20 T19 D19'],
    [153, 'T20 T19 D18'],
    [149, 'T20 T17 D19'],
    [147, 'T20 T20 T9'],
  ]

  it('calcule exactement les neuf totaux impossibles', () => {
    expect(impossibleTurnTotals()).toEqual(impossiblesReels)
  })

  it.each(listesAuCdcMaisAtteignables)(
    'accepte %i, listé comme impossible au CDC mais atteignable (%s)',
    (total) => {
      expect(isReachableTurnTotal(total)).toBe(true)
    },
  )

  it('accepte 0, 180 et les totaux courants', () => {
    for (const total of [0, 26, 41, 45, 60, 100, 140, 167, 170, 177, 180]) {
      expect(isReachableTurnTotal(total), `${total} devrait être possible`).toBe(true)
    }
  })

  it('rejette tout ce qui dépasse 180', () => {
    expect(isReachableTurnTotal(MAX_TURN_TOTAL + 1)).toBe(false)
    expect(isReachableTurnTotal(250)).toBe(false)
  })

  it('rejette les valeurs négatives et non entières', () => {
    expect(isReachableTurnTotal(-1)).toBe(false)
    expect(isReachableTurnTotal(60.5)).toBe(false)
  })

  it('n’est atteignable que par une combinaison réelle de trois fléchettes', () => {
    // Vérification croisée : on rejoue toutes les combinaisons et on compare.
    const values = [...new Set(allPossibleDarts().map(dartValue))]
    const reachable = new Set<number>()
    for (const a of values) for (const b of values) for (const c of values) reachable.add(a + b + c)

    for (let total = 0; total <= MAX_TURN_TOTAL; total += 1) {
      expect(isReachableTurnTotal(total)).toBe(reachable.has(total))
    }
  })
})
