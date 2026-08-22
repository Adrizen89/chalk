/**
 * Module Entraînement — §4.5, #45 à #47.
 *
 * L'exigence structurante du §4.5 est la même que celle du §4.2 pour les modes
 * de jeu : l'utilisateur doit pouvoir créer ses propres exercices. Ces tests
 * vérifient que les exercices intégrés et les exercices personnalisés passent
 * par exactement le même chemin.
 */

import { describe, expect, it } from 'vitest'
import type { Dart } from '../src/dart.js'
import { BULL } from '../src/dart.js'
import { ExerciseSession } from '../src/training/exercise.js'
import { builtInExercises, findBuiltInExercise } from '../src/training/library.js'
import {
  InvalidExerciseError,
  createCustomExercise,
  decodeSharedExercise,
  encodeSharedExercise,
  validateCustomExercise,
} from '../src/training/custom.js'
import type { CustomExerciseDefinition } from '../src/training/custom.js'
import { createBobs27 } from '../src/training/bobs27.js'
import { drawCheckoutScores } from '../src/training/checkout-practice.js'

const S = (n: number): Dart => ({ segment: n, multiplier: 1 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart
const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart
const MISS: Dart = { segment: 0, multiplier: 1 }

/** Générateur déterministe, pour que les tirages soient reproductibles. */
const fixedRandom = (value: number) => () => value

describe('bibliothèque intégrée (§4.5, #46)', () => {
  it('expose les huit exercices du cahier des charges', () => {
    const ids = builtInExercises(fixedRandom(0.5)).map((exercise) => exercise.id)
    expect(ids).toEqual([
      'bobs-27',
      'tour-des-doubles',
      'chasse-triple-20',
      'around-the-clock-chrono',
      'entrainement-sorties',
      'leg-solo',
      'catch-40',
      'ton-machine',
    ])
  })

  it('donne à chacun un objectif travaillé et une métrique', () => {
    for (const exercise of builtInExercises(fixedRandom(0.5))) {
      expect(exercise.name).toMatch(/\S/)
      expect(exercise.description).toMatch(/\S/)
      expect(['doubles', 'scoring', 'checkout', 'precision']).toContain(exercise.skill)
      expect(['score', 'darts', 'hits', 'streak']).toContain(exercise.metric)
      expect(exercise.custom).toBe(false)
    }
  })

  it('retrouve un exercice par son identifiant', () => {
    expect(findBuiltInExercise('catch-40')?.name).toBe('Catch 40')
    expect(findBuiltInExercise('inexistant')).toBeUndefined()
  })
})

describe.each(builtInExercises(fixedRandom(0.5)).map((e) => [e.name, e] as const))(
  'contrat d’exercice : %s',
  (_name, exercise) => {
    it('démarre non terminé, avec une cible et une progression', () => {
      const state = exercise.createState()
      expect(exercise.isFinished(state)).toBe(false)
      const view = exercise.view(state)
      expect(view.exerciseId).toBe(exercise.id)
      expect(view.targetLabel).toMatch(/\S/)
      expect(view.progress.done).toBe(0)
    })

    it('produit un état sérialisable (§4.5 — reprise de séance)', () => {
      const state = exercise.createState()
      expect(JSON.parse(JSON.stringify(state))).toEqual(state)
    })

    it('ne mute pas l’état qu’on lui passe', () => {
      const state = exercise.createState()
      const avant = JSON.stringify(state)
      exercise.applyDart(state, T(20))
      exercise.applyDart(state, MISS)
      expect(JSON.stringify(state)).toBe(avant)
    })

    it('s’annule et se rejoue à l’identique', () => {
      const session = new ExerciseSession(exercise)
      session.applyDart(D(1))
      const avant = JSON.stringify(session.state)
      session.applyDart(T(20))
      session.undo()
      expect(JSON.stringify(session.state)).toBe(avant)
    })

    it('se restaure depuis son instantané (§4.5)', () => {
      const session = new ExerciseSession(exercise)
      for (const dart of [D(1), T(20), MISS, D(20)]) session.applyDart(dart)
      const restored = ExerciseSession.restore(
        exercise,
        JSON.parse(JSON.stringify(session.toSnapshot())),
      )
      expect(restored.state).toEqual(session.state)
    })

    it('déclare un résultat cohérent avec sa métrique', () => {
      const session = new ExerciseSession(exercise)
      session.applyDart(D(1))
      const result = session.result
      expect(result.metric).toBe(exercise.metric)
      expect(result.higherIsBetter).toBe(exercise.higherIsBetter)
      expect(result.dartsThrown).toBe(1)
    })
  },
)

describe("Bob's 27 (§4.5, §4.2)", () => {
  it('démarre à 27 points sur le D1', () => {
    const session = new ExerciseSession(createBobs27())
    expect(session.view.primary).toBe('27')
    expect(session.view.targetLabel).toBe('D1')
  })

  it('marque la valeur du double par touché, à la fin de la manche', () => {
    const session = new ExerciseSession(createBobs27())
    session.applyDart(D(1))
    session.applyDart(D(1))
    expect(session.view.primary).toBe('27') // rien n'est acquis avant la fin
    session.applyDart(MISS)
    expect(session.view.primary).toBe(String(27 + 2 * 2)) // deux touchés × D1
  })

  it('retire la valeur du double sur une manche vierge', () => {
    const session = new ExerciseSession(createBobs27())
    session.applyDart(MISS)
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(session.view.primary).toBe('25') // 27 − 2
  })

  it('passe au double suivant après trois fléchettes', () => {
    const session = new ExerciseSession(createBobs27())
    for (let i = 0; i < 3; i += 1) session.applyDart(MISS)
    expect(session.view.targetLabel).toBe('D2')
  })

  it('s’arrête quand le score passe sous zéro', () => {
    const session = new ExerciseSession(createBobs27({ stopOnNegative: true }))
    // On rate tout : le coût des doubles croît et finit par dépasser 27.
    let garde = 0
    while (!session.isFinished && garde < 200) {
      session.applyDart(MISS)
      garde += 1
    }
    expect(session.isFinished).toBe(true)
    expect(session.result.score).toBeLessThan(0)
  })

  it('finit sur le bull quand on ne tombe jamais à zéro', () => {
    const session = new ExerciseSession(createBobs27({ stopOnNegative: false }))
    for (let round = 0; round < 21; round += 1) {
      const segment = session.view.target?.segment ?? BULL
      session.applyDart(D(segment))
      session.applyDart(D(segment))
      session.applyDart(D(segment))
    }
    expect(session.isFinished).toBe(true)
    expect(session.result.score).toBeGreaterThan(27)
  })
})

describe('Tour des doubles', () => {
  it('reste sur le double jusqu’à le toucher', () => {
    const exercise = findBuiltInExercise('tour-des-doubles')!
    const session = new ExerciseSession(exercise)
    session.applyDart(MISS)
    session.applyDart(MISS)
    expect(session.view.targetLabel).toBe('D1')
    session.applyDart(D(1))
    expect(session.view.targetLabel).toBe('D2')
  })

  it('mesure la performance au nombre de fléchettes, le moins étant le mieux', () => {
    const exercise = findBuiltInExercise('tour-des-doubles')!
    expect(exercise.metric).toBe('darts')
    expect(exercise.higherIsBetter).toBe(false)
  })

  it('se termine après le bull', () => {
    const exercise = findBuiltInExercise('tour-des-doubles')!
    const session = new ExerciseSession(exercise)
    for (let i = 1; i <= 20; i += 1) session.applyDart(D(i))
    expect(session.isFinished).toBe(false)
    session.applyDart(D(BULL))
    expect(session.isFinished).toBe(true)
    expect(session.result.dartsThrown).toBe(21)
  })
})

describe('Catch 40 — série sous pression', () => {
  it('ne retient que la plus longue série', () => {
    const exercise = findBuiltInExercise('catch-40')!
    const session = new ExerciseSession(exercise)
    session.applyDart(D(20))
    session.applyDart(D(20))
    session.applyDart(MISS) // série cassée à 2
    session.applyDart(D(20))
    expect(session.result.bestStreak).toBe(2)
    expect(session.result.metricValue).toBe(2)
  })
})

describe('Ton machine — volées à 100+', () => {
  it('ne compte une volée qu’à la troisième fléchette', () => {
    const exercise = findBuiltInExercise('ton-machine')!
    const session = new ExerciseSession(exercise)
    session.applyDart(T(20))
    session.applyDart(T(20))
    expect(session.result.hits).toBe(0)
    session.applyDart(S(1)) // 121 : au-dessus du seuil
    expect(session.result.hits).toBe(1)
  })

  it('ignore une volée sous le seuil', () => {
    const exercise = findBuiltInExercise('ton-machine')!
    const session = new ExerciseSession(exercise)
    session.applyDart(S(20))
    session.applyDart(S(20))
    session.applyDart(S(20)) // 60
    expect(session.result.hits).toBe(0)
  })
})

describe('Entraînement aux sorties (§4.5)', () => {
  it('ne tire que des scores finissables en trois fléchettes', () => {
    const scores = drawCheckoutScores(200, { random: Math.random })
    // Les bogey numbers rendraient l'exercice impossible sans explication.
    for (const score of scores) {
      expect([159, 162, 163, 165, 166, 168, 169]).not.toContain(score)
      expect(score).toBeGreaterThanOrEqual(41)
      expect(score).toBeLessThanOrEqual(170)
    }
  })

  it('est reproductible à générateur constant — la séance reste rejouable', () => {
    expect(drawCheckoutScores(5, { random: fixedRandom(0.42) })).toEqual(
      drawCheckoutScores(5, { random: fixedRandom(0.42) }),
    )
  })

  it('compte une sortie réussie', () => {
    const exercise = findBuiltInExercise('entrainement-sorties', fixedRandom(0))!
    const session = new ExerciseSession(exercise)
    const cible = Number(session.view.targetLabel.replace('Sortir ', ''))
    expect(cible).toBe(41) // premier score finissable avec ce tirage

    session.applyDart(S(9)) // 41 → 32
    session.applyDart(D(16)) // 32 → 0
    expect(session.result.hits).toBe(1)
  })

  it('traite le bust comme une sortie manquée et passe à la suivante', () => {
    const exercise = findBuiltInExercise('entrainement-sorties', fixedRandom(0))!
    const session = new ExerciseSession(exercise)
    expect(session.view.progress.done).toBe(0)

    session.applyDart(T(20)) // 41 − 60 : bust immédiat
    expect(session.result.hits).toBe(0)
    // La manche est close : on ne s'acharne pas sur une sortie devenue
    // impossible, on passe à la suivante.
    expect(session.view.progress.done).toBe(1)
    expect(session.view.dartsRemainingInRound).toBe(3)
  })
})

describe('réutilisation des modes de jeu (§4.5)', () => {
  it('Leg solo est un 501, compté en fléchettes', () => {
    const exercise = findBuiltInExercise('leg-solo')!
    expect(exercise.metric).toBe('darts')
    expect(exercise.higherIsBetter).toBe(false)

    const session = new ExerciseSession(exercise)
    session.applyDart(T(20))
    expect(session.view.targetLabel).toBe('441')
  })

  it('Around the Clock chronométré suit la progression du mode de jeu', () => {
    const exercise = findBuiltInExercise('around-the-clock-chrono')!
    const session = new ExerciseSession(exercise)
    expect(session.view.targetLabel).toBe('1')
    session.applyDart(S(1))
    expect(session.view.targetLabel).toBe('2')
  })
})

describe('exercices personnalisés (§4.5, #47)', () => {
  const valide: CustomExerciseDefinition = {
    kind: 'targets',
    id: 'perso-1',
    name: 'Mes triples',
    description: 'T19 et T20 en alternance.',
    skill: 'scoring',
    targets: [
      { segment: 20, multiplier: 3 },
      { segment: 19, multiplier: 3 },
    ],
    dartsPerTarget: 3,
    advanceOnHit: false,
    laps: 5,
    scoring: 'value',
    match: 'exact',
    trackStreak: false,
    metric: 'score',
    higherIsBetter: true,
  }

  it('s’exécute exactement comme un exercice intégré', () => {
    const exercise = createCustomExercise(valide)
    expect(exercise.custom).toBe(true)

    const session = new ExerciseSession(exercise)
    expect(session.view.targetLabel).toBe('T20')
    session.applyDart(T(20))
    expect(session.result.score).toBe(60)
  })

  it('accepte les trois formes d’exercice', () => {
    expect(createCustomExercise(valide).id).toBe('perso-1')
    expect(
      createCustomExercise({
        kind: 'scoring',
        id: 'p2',
        name: 'Séries',
        description: '',
        turns: 5,
        threshold: 60,
      }).id,
    ).toBe('p2')
    expect(
      createCustomExercise(
        {
          kind: 'checkout',
          id: 'p3',
          name: 'Sorties courtes',
          description: '',
          rounds: 5,
          min: 41,
          max: 80,
        },
        fixedRandom(0),
      ).id,
    ).toBe('p3')
  })
})

describe('validation d’un exercice reçu de l’extérieur (§6)', () => {
  const base = {
    kind: 'targets',
    id: 'x',
    name: 'Test',
    targets: [{ segment: 20, multiplier: 3 }],
    dartsPerTarget: 3,
    advanceOnHit: false,
    laps: 1,
    scoring: 'value',
    match: 'exact',
    metric: 'score',
  }

  it('accepte une définition correcte', () => {
    expect(validateCustomExercise(base).name).toBe('Test')
  })

  it('refuse une cible impossible sur une cible de fléchettes', () => {
    expect(() =>
      validateCustomExercise({ ...base, targets: [{ segment: 25, multiplier: 3 }] }),
    ).toThrow(InvalidExerciseError)
  })

  it('refuse le hors-cible comme cible', () => {
    expect(() =>
      validateCustomExercise({ ...base, targets: [{ segment: 0, multiplier: 1 }] }),
    ).toThrow(/hors-cible/)
  })

  /**
   * Sans limite de fléchettes ni avance au touché, le joueur resterait bloqué
   * sur la première cible indéfiniment. Un exercice partagé ne doit pas pouvoir
   * produire cette situation.
   */
  it('refuse un exercice qui ne pourrait jamais se terminer', () => {
    expect(() =>
      validateCustomExercise({ ...base, dartsPerTarget: null, advanceOnHit: false }),
    ).toThrow(/jamais se terminer/)
  })

  it('refuse les valeurs hors bornes', () => {
    expect(() => validateCustomExercise({ ...base, laps: 0 })).toThrow(/passages/)
    expect(() => validateCustomExercise({ ...base, targets: [] })).toThrow(/Aucune cible/)
    expect(() => validateCustomExercise({ ...base, name: '   ' })).toThrow(/Nom manquant/)
    expect(() =>
      validateCustomExercise({ kind: 'scoring', id: 'x', name: 'T', turns: 5, threshold: 999 }),
    ).toThrow(/Seuil/)
  })

  it('refuse un type inconnu', () => {
    expect(() => validateCustomExercise({ ...base, kind: 'quelque-chose' })).toThrow(/inconnu/)
    expect(() => validateCustomExercise(null)).toThrow(/illisible/)
  })

  it('tronque une description trop longue plutôt que de refuser', () => {
    const long = 'a'.repeat(1000)
    expect(validateCustomExercise({ ...base, description: long }).description).toHaveLength(300)
  })
})

describe('partage par lien (§4.5)', () => {
  const definition: CustomExerciseDefinition = {
    kind: 'scoring',
    id: 'partage-1',
    name: 'Séries à 100',
    description: 'Dix volées, seuil à 100.',
    turns: 10,
    threshold: 100,
  }

  it('fait un aller-retour sans perte', () => {
    expect(decodeSharedExercise(encodeSharedExercise(definition))).toEqual(definition)
  })

  it('produit un texte utilisable dans une URL', () => {
    expect(encodeSharedExercise(definition)).toMatch(/^[A-Za-z0-9_-]+$/)
  })

  it('survit aux accents', () => {
    const accentue = { ...definition, name: 'Précision à l’entraînement' }
    expect(decodeSharedExercise(encodeSharedExercise(accentue)).name).toBe(accentue.name)
  })

  it('refuse un lien illisible', () => {
    expect(() => decodeSharedExercise('pas-du-base64!!')).toThrow(InvalidExerciseError)
  })

  it('refuse un lien d’une autre version', () => {
    const forge = btoa(JSON.stringify({ v: 99, e: definition }))
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
    expect(() => decodeSharedExercise(forge)).toThrow(/version incompatible/)
  })

  it('revalide le contenu du lien, il n’est jamais exécuté sur parole', () => {
    const malveillant = btoa(
      JSON.stringify({ v: 1, e: { kind: 'targets', id: 'x', name: 'X', targets: [], laps: 1 } }),
    )
      .replaceAll('+', '-')
      .replaceAll('/', '_')
      .replace(/=+$/, '')
    expect(() => decodeSharedExercise(malveillant)).toThrow(InvalidExerciseError)
  })
})

describe('cas limites de la session', () => {
  it('ignore une fléchette lancée après la fin', () => {
    const exercise = findBuiltInExercise('ton-machine')!
    const session = new ExerciseSession(exercise)
    // 20 volées de 3 fléchettes.
    for (let i = 0; i < 60; i += 1) session.applyDart(S(20))
    expect(session.isFinished).toBe(true)

    const avant = JSON.stringify(session.state)
    session.applyDart(T(20))
    expect(JSON.stringify(session.state)).toBe(avant)
    expect(session.undoDepth).toBe(60)
  })

  it('n’annule rien quand rien n’a été lancé', () => {
    expect(new ExerciseSession(findBuiltInExercise('catch-40')!).undo()).toBe(false)
  })

  it('expose le journal des fléchettes', () => {
    const session = new ExerciseSession(findBuiltInExercise('catch-40')!)
    session.applyDart(D(20))
    session.applyDart(MISS)
    expect(session.history).toHaveLength(2)
  })

  it('applique aussi une fléchette directement sur la règle, hors session', () => {
    const exercise = findBuiltInExercise('catch-40')!
    const state = exercise.createState()
    const { state: next } = exercise.applyDart(state, D(20))
    expect(exercise.result(next).hits).toBe(1)
  })
})

describe('adaptateur de règle de jeu — cas limites', () => {
  it('ignore une fléchette impossible sur une cible', () => {
    const exercise = findBuiltInExercise('leg-solo')!
    const session = new ExerciseSession(exercise)
    session.applyDart({ segment: BULL, multiplier: 3 } as Dart)
    // La fléchette est refusée par la règle : rien n'avance.
    expect(session.result.dartsThrown).toBe(0)
  })

  it('ignore une fléchette lancée après la victoire', () => {
    const exercise = findBuiltInExercise('around-the-clock-chrono')!
    const session = new ExerciseSession(exercise)
    for (let i = 1; i <= 20; i += 1) session.applyDart(S(i))
    session.applyDart(S(BULL))
    expect(session.isFinished).toBe(true)

    const avant = session.result.dartsThrown
    session.applyDart(S(1))
    expect(session.result.dartsThrown).toBe(avant)
  })

  it('affiche la progression du mode sous-jacent', () => {
    const exercise = findBuiltInExercise('around-the-clock-chrono')!
    const session = new ExerciseSession(exercise)
    session.applyDart(S(1))
    session.applyDart(S(2))
    expect(session.view.progress.done).toBe(2)
    expect(session.view.progress.total).toBe(21)
  })

  it('n’expose pas de progression pour un mode qui n’en a pas', () => {
    const session = new ExerciseSession(findBuiltInExercise('leg-solo')!)
    expect(session.view.progress.total).toBe(0)
  })
})

describe('travail de cibles — variantes de barème', () => {
  it('compte un point par touché avec le barème « hits »', () => {
    const exercise = createCustomExercise({
      kind: 'targets',
      id: 'c1',
      name: 'Hits',
      description: '',
      skill: 'precision',
      targets: [{ segment: 20, multiplier: 3 }],
      dartsPerTarget: 3,
      advanceOnHit: false,
      laps: 1,
      scoring: 'hits',
      match: 'exact',
      trackStreak: false,
      metric: 'hits',
      higherIsBetter: true,
    })
    const session = new ExerciseSession(exercise)
    session.applyDart(T(20))
    session.applyDart(T(20))
    expect(session.result.score).toBe(2)
    expect(session.result.metricValue).toBe(2)
  })

  it('accepte n’importe quel multiplicateur avec la correspondance « segment »', () => {
    const exercise = createCustomExercise({
      kind: 'targets',
      id: 'c2',
      name: 'Le 20 sous toutes ses formes',
      description: '',
      skill: 'scoring',
      targets: [{ segment: 20, multiplier: 3 }],
      dartsPerTarget: 3,
      advanceOnHit: false,
      laps: 1,
      scoring: 'value',
      match: 'segment',
      trackStreak: false,
      metric: 'score',
      higherIsBetter: true,
    })
    const session = new ExerciseSession(exercise)
    session.applyDart(S(20))
    session.applyDart(D(20))
    session.applyDart(T(20))
    expect(session.result.score).toBe(20 + 40 + 60)
  })

  it('mesure au nombre de touchés quand la métrique le demande', () => {
    const exercise = createCustomExercise({
      kind: 'targets',
      id: 'c3',
      name: 'Touchés',
      description: '',
      skill: 'precision',
      targets: [{ segment: 19, multiplier: 1 }],
      dartsPerTarget: 2,
      advanceOnHit: false,
      laps: 1,
      scoring: 'none',
      match: 'exact',
      trackStreak: false,
      metric: 'hits',
      higherIsBetter: true,
    })
    const session = new ExerciseSession(exercise)
    session.applyDart(S(19))
    session.applyDart(MISS)
    expect(session.result.metricValue).toBe(1)
    expect(session.isFinished).toBe(true)
  })

  it('ignore une fléchette une fois toutes les cibles parcourues', () => {
    const exercise = createCustomExercise({
      kind: 'targets',
      id: 'c4',
      name: 'Une seule cible',
      description: '',
      skill: 'precision',
      targets: [{ segment: 5, multiplier: 1 }],
      dartsPerTarget: 1,
      advanceOnHit: false,
      laps: 1,
      scoring: 'hits',
      match: 'exact',
      trackStreak: false,
      metric: 'hits',
      higherIsBetter: true,
    })
    const state = exercise.applyDart(exercise.createState(), S(5)).state
    expect(exercise.isFinished(state)).toBe(true)
    expect(exercise.applyDart(state, S(5)).effects).toHaveLength(0)
    expect(exercise.view(state).targetLabel).toBe('Terminé')
  })
})

describe('validation — bornes restantes', () => {
  const checkout = { kind: 'checkout', id: 'x', name: 'Sorties', rounds: 5, min: 41, max: 170 }

  it('refuse un score maximal inférieur au minimum', () => {
    expect(() => validateCustomExercise({ ...checkout, min: 100, max: 50 })).toThrow(/maximal/)
  })

  it('refuse un nombre de sorties hors bornes', () => {
    expect(() => validateCustomExercise({ ...checkout, rounds: 0 })).toThrow(/sorties/)
    expect(() => validateCustomExercise({ ...checkout, rounds: 500 })).toThrow(/sorties/)
  })

  it('refuse un score minimal impossible', () => {
    expect(() => validateCustomExercise({ ...checkout, min: 1 })).toThrow(/minimal/)
  })

  it('applique les valeurs par défaut du mode sorties', () => {
    const parsed = validateCustomExercise({ kind: 'checkout', id: 'x', name: 'S', rounds: 3 })
    expect(parsed).toMatchObject({ min: 41, max: 170 })
  })

  it('refuse un nombre de volées hors bornes', () => {
    expect(() =>
      validateCustomExercise({ kind: 'scoring', id: 'x', name: 'S', turns: 0, threshold: 100 }),
    ).toThrow(/volées/)
  })

  it('refuse trop de cibles', () => {
    const targets = Array.from({ length: 40 }, () => ({ segment: 20, multiplier: 1 }))
    expect(() =>
      validateCustomExercise({ kind: 'targets', id: 'x', name: 'T', targets, dartsPerTarget: 3 }),
    ).toThrow(/Trop de cibles/)
  })

  it('refuse un nombre de fléchettes par cible aberrant', () => {
    const base = { kind: 'targets', id: 'x', name: 'T', targets: [{ segment: 20, multiplier: 1 }] }
    expect(() => validateCustomExercise({ ...base, dartsPerTarget: 0 })).toThrow(/fléchettes/)
    expect(() => validateCustomExercise({ ...base, dartsPerTarget: 99 })).toThrow(/fléchettes/)
  })

  it('refuse une cible illisible', () => {
    const base = { kind: 'targets', id: 'x', name: 'T', dartsPerTarget: 3 }
    expect(() => validateCustomExercise({ ...base, targets: [null] })).toThrow(/illisible/)
    expect(() => validateCustomExercise({ ...base, targets: [{ multiplier: 2 }] })).toThrow(
      /segment/,
    )
    expect(() => validateCustomExercise({ ...base, targets: [{ segment: 20 }] })).toThrow(
      /multiplicateur/,
    )
  })

  it('refuse un nom trop long', () => {
    expect(() =>
      validateCustomExercise({
        kind: 'scoring',
        id: 'x',
        name: 'n'.repeat(100),
        turns: 5,
        threshold: 60,
      }),
    ).toThrow(/trop long/)
  })

  it('refuse une définition sans identifiant', () => {
    expect(() => validateCustomExercise({ kind: 'scoring', name: 'S' })).toThrow(/Identifiant/)
  })

  it('retombe sur des valeurs sûres pour un objectif ou une métrique inconnus', () => {
    const parsed = validateCustomExercise({
      kind: 'targets',
      id: 'x',
      name: 'T',
      targets: [{ segment: 20, multiplier: 1 }],
      dartsPerTarget: 3,
      skill: 'inconnu',
      metric: 'inconnue',
      scoring: 'hits',
    })
    expect(parsed).toMatchObject({ skill: 'precision', metric: 'score', higherIsBetter: true })
  })
})

describe("Bob's 27 — cas limites", () => {
  it('ignore une fléchette après la fin', () => {
    const rule = createBobs27()
    const session = new ExerciseSession(rule)
    let garde = 0
    while (!session.isFinished && garde < 200) {
      session.applyDart(MISS)
      garde += 1
    }
    const avant = JSON.stringify(session.state)
    expect(rule.applyDart(session.state, D(1)).effects).toHaveLength(0)
    expect(JSON.stringify(session.state)).toBe(avant)
  })

  it('affiche le bull en fin de parcours', () => {
    const rule = createBobs27({ stopOnNegative: false })
    let state = rule.createState()
    // 20 doubles ratés puis on arrive au bull.
    for (let round = 0; round < 20; round += 1) {
      for (let dart = 0; dart < 3; dart += 1) state = rule.applyDart(state, MISS).state
    }
    expect(rule.view(state).targetLabel).toBe('BULL')
  })
})
