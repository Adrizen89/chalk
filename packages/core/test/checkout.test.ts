import { describe, expect, it } from 'vitest'
import {
  BOGEY_NUMBERS,
  CHECKOUT_SUGGESTION_THRESHOLD,
  createCheckoutSolver,
  formatPath,
  isBogeyNumber,
  isFinishingDart,
} from '../src/checkout.js'
import type { DartsRemaining, OutMode } from '../src/checkout.js'
import { dartValue, isReachableTurnTotal } from '../src/dart.js'

const solvers: Record<OutMode, ReturnType<typeof createCheckoutSolver>> = {
  double: createCheckoutSolver({ outMode: 'double' }),
  master: createCheckoutSolver({ outMode: 'master' }),
  straight: createCheckoutSolver({ outMode: 'straight' }),
}

describe('propriétés du solveur de sorties', () => {
  const modes: OutMode[] = ['double', 'master', 'straight']
  const dartCounts: DartsRemaining[] = [1, 2, 3]

  it.each(modes)('en %s, tout chemin proposé est correct et légal', (mode) => {
    const solver = solvers[mode]
    for (let score = 1; score <= 180; score += 1) {
      for (const darts of dartCounts) {
        const path = solver.find(score, darts)
        if (!path) continue

        expect(path.length, `${score} en ${darts} fléchettes`).toBeLessThanOrEqual(darts)
        expect(
          path.reduce((sum, d) => sum + dartValue(d), 0),
          `${formatPath(path)} doit totaliser ${score}`,
        ).toBe(score)

        const last = path[path.length - 1]!
        expect(isFinishingDart(last, mode), `${formatPath(path)} finit sur ${mode}`).toBe(true)

        // Aucune fléchette intermédiaire ne doit atteindre ou dépasser le score.
        let left = score
        for (const d of path.slice(0, -1)) {
          left -= dartValue(d)
          expect(left).toBeGreaterThan(0)
        }
      }
    }
  })

  it.each(modes)('en %s, les alternatives sont distinctes et toutes valides', (mode) => {
    const solver = solvers[mode]
    for (const score of [170, 141, 100, 81, 60, 40, 32, 2]) {
      const alternatives = solver.findAlternatives(score, 3, 3)
      const signatures = alternatives.map(formatPath)
      expect(new Set(signatures).size).toBe(signatures.length)
      for (const path of alternatives) {
        expect(path.reduce((sum, d) => sum + dartValue(d), 0)).toBe(score)
        expect(isFinishingDart(path[path.length - 1]!, mode)).toBe(true)
      }
    }
  })
})

describe('sorties classiques en double out', () => {
  const solver = solvers.double
  const find = (score: number, darts: DartsRemaining = 3) => {
    const path = solver.find(score, darts)
    return path ? formatPath(path) : null
  }

  it('résout les sorties maximales, qui n’ont qu’une seule combinaison', () => {
    expect(find(170)).toBe('T20 T20 BULL')
    expect(find(167)).toBe('T20 T19 BULL')
    expect(find(164)).toBe('T20 T18 BULL')
    expect(find(161)).toBe('T20 T17 BULL')
    expect(find(160)).toBe('T20 T20 D20')
  })

  it('résout les sorties en une fléchette', () => {
    expect(find(40, 1)).toBe('D20')
    expect(find(32, 1)).toBe('D16')
    expect(find(50, 1)).toBe('BULL')
    expect(find(2, 1)).toBe('D1')
  })

  it('préfère une préparation en simple plutôt qu’en double', () => {
    // 60 : [S20, D20] plutôt que [D14, D16] — on ne prépare pas sur un double.
    expect(find(60)).toBe('S20 D20')
  })

  it('préfère un simple à un triple de même valeur en préparation', () => {
    // 41 : S9 D16 plutôt que T3 D16.
    expect(find(41)).toBe('S9 D16')
  })

  it('adapte le chemin au nombre de fléchettes restantes (§4.3)', () => {
    expect(find(100, 3)).toBe('T20 D20')
    expect(find(100, 2)).toBe('T20 D20')
    expect(find(100, 1)).toBeNull()
  })
})

describe('scores non finissables', () => {
  const solver = solvers.double

  it('ne propose rien au-delà de 170 en double out', () => {
    expect(solver.find(171, 3)).toBeNull()
    expect(solver.find(180, 3)).toBeNull()
    expect(CHECKOUT_SUGGESTION_THRESHOLD).toBe(170)
  })

  it('ne propose rien sur un bogey number (§4.6.4)', () => {
    for (const score of BOGEY_NUMBERS) {
      expect(solver.find(score, 3), `${score} ne devrait pas être finissable`).toBeNull()
      expect(isBogeyNumber(score)).toBe(true)
    }
  })

  it('recense exactement les bogey numbers sous le seuil de 170', () => {
    const computed: number[] = []
    for (let score = 2; score <= 170; score += 1) {
      if (!solver.canFinish(score, 3)) computed.push(score)
    }
    expect(computed).toEqual([...BOGEY_NUMBERS])
  })

  it('ne propose rien sur 1, qui est un bust en double out', () => {
    expect(solver.find(1, 3)).toBeNull()
  })
})

describe('modes de sortie alternatifs', () => {
  it('en straight out, 1 se termine sur un simple', () => {
    expect(formatPath(solvers.straight.find(1, 1)!)).toBe('S1')
  })

  it('en master out, un triple conclut', () => {
    expect(isFinishingDart({ segment: 20, multiplier: 3 }, 'master')).toBe(true)
    expect(isFinishingDart({ segment: 20, multiplier: 3 }, 'double')).toBe(false)
    expect(solvers.master.find(60, 1)).not.toBeNull()
    expect(solvers.double.find(60, 1)).toBeNull()
  })

  it('en straight out, les bogey numbers atteignables se terminent', () => {
    // 163, 166 et 169 ne sont pas seulement infinissables : ils ne sont pas
    // même atteignables avec trois fléchettes. Aucun mode de sortie n'y change
    // quoi que ce soit.
    for (const score of BOGEY_NUMBERS.filter(isReachableTurnTotal)) {
      expect(solvers.straight.canFinish(score, 3), `${score} en straight out`).toBe(true)
    }
    for (const score of BOGEY_NUMBERS.filter((s) => !isReachableTurnTotal(s))) {
      expect(solvers.straight.canFinish(score, 3), `${score} est inatteignable`).toBe(false)
    }
  })
})

describe('doubles préférés (§4.6.5)', () => {
  // 68 se termine en deux fléchettes par plusieurs routes sans double de
  // préparation : T20 D4, T16 D10, T12 D16, S18 BULL. Le double final retenu
  // doit donc suivre la préférence du joueur, et elle seule.
  it('privilégie les chemins finissant sur le double préféré du joueur', () => {
    const aimeD16 = createCheckoutSolver({ outMode: 'double', doublePreference: [16, 10, 4] })
    const aimeD4 = createCheckoutSolver({ outMode: 'double', doublePreference: [4, 10, 16] })
    const aimeD10 = createCheckoutSolver({ outMode: 'double', doublePreference: [10, 16, 4] })

    expect(formatPath(aimeD16.find(68, 2)!)).toBe('T12 D16')
    expect(formatPath(aimeD4.find(68, 2)!)).toBe('T20 D4')
    expect(formatPath(aimeD10.find(68, 2)!)).toBe('T16 D10')
  })

  it('ne change jamais le nombre de fléchettes, quelle que soit la préférence', () => {
    const standard = createCheckoutSolver({ outMode: 'double' })
    const exotique = createCheckoutSolver({
      outMode: 'double',
      doublePreference: [1, 3, 5, 7, 9, 11, 13, 15, 17, 19],
    })
    for (let score = 2; score <= 170; score += 1) {
      expect(standard.find(score, 3)?.length ?? null).toBe(exotique.find(score, 3)?.length ?? null)
    }
  })
})
