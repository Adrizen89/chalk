/**
 * Persistance locale — #18 et #31.
 *
 * Ces tests couvrent ce que §4.4 promet à l'utilisateur : une partie
 * interrompue se retrouve, et se reprend à l'état exact.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { GameSession, X01_DEFAULT_CONFIG, x01Rule } from '@chalk/core'
import type { Dart, GameSnapshot } from '@chalk/core'
import { ChalkDatabase, useDatabaseForTests } from '@/db/database'
import {
  abandonGame,
  countGames,
  deleteGame,
  findResumableGames,
  getGame,
  lastGamePlayers,
  listGames,
  pruneOldGames,
  saveGame,
} from '@/db/games'
import { addPlayer, listPlayers, markPlayed, migrateLegacyPlayers } from '@/db/players'
import { getSetting, setSetting } from '@/db/settings'
import {
  averageOverTime,
  careerStats,
  ensureGameStats,
  finishedGamesWithStats,
  headToHead,
  playersWithHistory,
} from '@/db/stats'
import { SCHEMA_VERSION, STORES } from '@/db/schema'
import { randomId } from '@/lib/id'

const T = (n: number): Dart => ({ segment: n, multiplier: 3 }) as Dart
const D = (n: number): Dart => ({ segment: n, multiplier: 2 }) as Dart

const PLAYERS = [
  { id: 'a', name: 'Adrien' },
  { id: 'b', name: 'Bruno' },
]

let database: ChalkDatabase
let dbCounter = 0

beforeEach(async () => {
  dbCounter += 1
  database = new ChalkDatabase(`chalk-test-${dbCounter}`)
  useDatabaseForTests(database)
  await database.open()
})

afterEach(async () => {
  await database.delete()
  useDatabaseForTests(null)
})

function newSession(startingScore = 501) {
  return new GameSession(x01Rule, { ...X01_DEFAULT_CONFIG, startingScore }, PLAYERS)
}

const persist = (id: string, session: ReturnType<typeof newSession>) =>
  saveGame({
    id,
    snapshot: session.toSnapshot() as GameSnapshot<unknown>,
    inputMode: 'dart',
    status: session.isFinished ? 'finished' : 'in-progress',
    winnerId: session.winnerId,
  })

describe('schéma', () => {
  it('déclare les tables attendues', () => {
    expect(Object.keys(STORES).sort()).toEqual([
      'customExercises',
      'exerciseResults',
      'games',
      'players',
      'settings',
      'syncQueue',
      'trainingSessions',
    ])
  })

  it('ouvre la base à la version courante', () => {
    expect(database.verno).toBe(SCHEMA_VERSION)
  })

  it('prévoit dès maintenant la file de synchronisation du lot 2', async () => {
    await database.syncQueue.add({ entity: 'game', entityId: 'x', queuedAt: Date.now() })
    expect(await database.syncQueue.count()).toBe(1)
  })
})

describe('enregistrement d’une partie', () => {
  it('écrit le journal, pas l’état', async () => {
    const session = newSession()
    session.applyDart(T(20))
    await persist('g1', session)

    const stored = await getGame('g1')
    expect(stored?.inputs).toHaveLength(1)
    expect(stored?.ruleId).toBe('x01')
    expect(stored?.status).toBe('in-progress')
    expect(stored?.winnerId).toBeNull()
  })

  it('met à jour la même partie plutôt que d’en créer une nouvelle', async () => {
    const session = newSession()
    for (const dart of [T(20), T(20), T(20)]) {
      session.applyDart(dart)
      await persist('g1', session)
    }
    expect(await countGames()).toBe(1)
    expect((await getGame('g1'))?.inputs).toHaveLength(3)
  })

  it('préserve la date de création à travers les mises à jour', async () => {
    const session = newSession()
    session.applyDart(T(20))
    await persist('g1', session)
    const initial = (await getGame('g1'))!.createdAt

    await new Promise((resolve) => setTimeout(resolve, 5))
    session.applyDart(T(20))
    await persist('g1', session)
    const after = (await getGame('g1'))!

    expect(after.createdAt).toBe(initial)
    expect(after.updatedAt).toBeGreaterThanOrEqual(initial)
  })

  it('bascule en « terminée » avec son vainqueur', async () => {
    const session = newSession(40)
    session.applyDart(D(20))
    await persist('g1', session)

    const stored = await getGame('g1')
    expect(stored?.status).toBe('finished')
    expect(stored?.winnerId).toBe('a')
  })
})

describe('reprise d’une partie interrompue (§4.4)', () => {
  it('restaure l’état exact depuis le journal enregistré', async () => {
    const session = newSession(501)
    for (const dart of [T(20), T(20), T(19), D(10)]) session.applyDart(dart)
    await persist('g1', session)

    const stored = (await getGame('g1'))!
    const restored = GameSession.restore(x01Rule, {
      ruleId: stored.ruleId,
      config: stored.config,
      players: stored.players,
      inputs: stored.inputs,
    })

    expect(restored.state).toEqual(session.state)
    expect(restored.view.activePlayerId).toBe(session.view.activePlayerId)
  })

  it('conserve la possibilité d’annuler après reprise (§4.3)', async () => {
    const session = newSession(501)
    session.applyDart(T(20))
    session.applyDart(T(20))
    await persist('g1', session)

    const stored = (await getGame('g1'))!
    const restored = GameSession.restore(x01Rule, {
      ruleId: stored.ruleId,
      config: stored.config,
      players: stored.players,
      inputs: stored.inputs,
    })

    expect(restored.undo()).toBe(true)
    expect(restored.state.players[0]!.score).toBe(441)
  })

  it('ne perd aucune volée validée en cas de fermeture brutale', async () => {
    // On simule : chaque fléchette est écrite, puis la « session » disparaît.
    const session = newSession(501)
    const darts = [T(20), T(20), T(20), T(19), T(19), T(19)]
    for (const dart of darts) {
      session.applyDart(dart)
      await persist('g1', session)
    }

    const stored = (await getGame('g1'))!
    expect(stored.inputs).toHaveLength(darts.length)

    const restored = GameSession.restore(x01Rule, {
      ruleId: stored.ruleId,
      config: stored.config,
      players: stored.players,
      inputs: stored.inputs,
    })
    expect(restored.state.players[0]!.score).toBe(501 - 180)
    expect(restored.state.players[1]!.score).toBe(501 - 171)
  })

  it('propose les parties en cours, la plus récente en tête', async () => {
    const première = newSession()
    première.applyDart(T(20))
    await persist('ancienne', première)

    await new Promise((resolve) => setTimeout(resolve, 5))

    const seconde = newSession()
    seconde.applyDart(T(19))
    await persist('recente', seconde)

    const resumables = await findResumableGames()
    expect(resumables.map((game) => game.id)).toEqual(['recente', 'ancienne'])
  })

  it('ne propose ni les parties terminées ni les abandonnées', async () => {
    const terminée = newSession(40)
    terminée.applyDart(D(20))
    await persist('terminee', terminée)

    const abandonnée = newSession()
    abandonnée.applyDart(T(20))
    await persist('abandonnee', abandonnée)
    await abandonGame('abandonnee')

    const enCours = newSession()
    enCours.applyDart(T(20))
    await persist('en-cours', enCours)

    expect((await findResumableGames()).map((g) => g.id)).toEqual(['en-cours'])
  })

  it('gère plusieurs parties interrompues sans qu’aucune n’écrase l’autre', async () => {
    for (const id of ['maison', 'club', 'tournoi']) {
      const session = newSession()
      session.applyDart(T(20))
      await persist(id, session)
    }
    expect(await findResumableGames()).toHaveLength(3)
  })

  it('conserve une partie abandonnée au lieu de l’effacer', async () => {
    const session = newSession()
    session.applyDart(T(20))
    await persist('g1', session)
    await abandonGame('g1')

    expect((await getGame('g1'))?.status).toBe('abandoned')
    expect(await countGames()).toBe(1)
  })
})

describe('historique et ménage', () => {
  it('liste les parties, la plus récente en tête', async () => {
    for (const id of ['a', 'b', 'c']) {
      const session = newSession()
      session.applyDart(T(20))
      await persist(id, session)
      await new Promise((resolve) => setTimeout(resolve, 3))
    }
    expect((await listGames()).map((g) => g.id)).toEqual(['c', 'b', 'a'])
  })

  it('supprime une partie à la demande', async () => {
    const session = newSession()
    await persist('g1', session)
    await deleteGame('g1')
    expect(await getGame('g1')).toBeUndefined()
  })

  it('ne supprime jamais une partie en cours en faisant de la place', async () => {
    const enCours = newSession()
    enCours.applyDart(T(20))
    await persist('en-cours', enCours)

    for (let i = 0; i < 5; i += 1) {
      const finie = newSession(40)
      finie.applyDart(D(20))
      await persist(`finie-${i}`, finie)
    }

    const supprimées = await pruneOldGames(2)
    expect(supprimées).toBe(3)
    expect(await getGame('en-cours')).toBeDefined()
    expect(await findResumableGames()).toHaveLength(1)
  })

  it('ne supprime rien quand le quota de conservation n’est pas atteint', async () => {
    const finie = newSession(40)
    finie.applyDart(D(20))
    await persist('finie', finie)
    expect(await pruneOldGames(100)).toBe(0)
  })
})

describe('derniers joueurs (§4.1, §1)', () => {
  it('ne propose personne quand aucune partie n’a été jouée', async () => {
    expect(await lastGamePlayers()).toEqual([])
  })

  it('rend les joueurs de la dernière partie, dans l’ordre de jeu', async () => {
    await persist('g1', newSession())
    expect(await lastGamePlayers()).toEqual(PLAYERS)
  })

  it('suit la partie touchée en dernier, et non la plus ancienne', async () => {
    const ancienne = new GameSession(x01Rule, X01_DEFAULT_CONFIG, [
      { id: 'c', name: 'Claire' },
      { id: 'd', name: 'Denis' },
    ])
    await persist('ancienne', ancienne)
    await new Promise((resolve) => setTimeout(resolve, 3))
    await persist('recente', newSession())

    expect((await lastGamePlayers()).map((player) => player.name)).toEqual(['Adrien', 'Bruno'])
  })

  it('compte une partie reprise après coup comme la plus récente', async () => {
    await persist('reprise', newSession())
    await new Promise((resolve) => setTimeout(resolve, 3))

    const autre = new GameSession(x01Rule, X01_DEFAULT_CONFIG, [{ id: 'c', name: 'Claire' }])
    await persist('autre', autre)
    await new Promise((resolve) => setTimeout(resolve, 3))

    // On rejoue une volée sur la première : c'est elle qu'on vient de jouer.
    const reprise = newSession()
    reprise.applyDart(T(20))
    await persist('reprise', reprise)

    expect((await lastGamePlayers()).map((player) => player.name)).toEqual(['Adrien', 'Bruno'])
  })

  it('compte aussi une partie abandonnée : on a bien joué avec ces personnes', async () => {
    await persist('abandonnee', newSession())
    await abandonGame('abandonnee')
    expect((await lastGamePlayers()).map((player) => player.name)).toEqual(['Adrien', 'Bruno'])
  })
})

describe('carnet de joueurs (§4.1)', () => {
  it('ajoute un joueur et évite les doublons de nom', async () => {
    const premier = await addPlayer('Adrien')
    const second = await addPlayer('  adrien  ')
    expect(premier?.id).toBe(second?.id)
    expect(await listPlayers()).toHaveLength(1)
  })

  it('refuse un nom vide', async () => {
    expect(await addPlayer('   ')).toBeNull()
    expect(await listPlayers()).toHaveLength(0)
  })

  it('trie par usage récent — les habitués en tête (§1)', async () => {
    const rare = (await addPlayer('Rare'))!
    const habitue = (await addPlayer('Habitué'))!

    await markPlayed([{ id: rare.id, name: rare.name }])
    await new Promise((resolve) => setTimeout(resolve, 5))
    await markPlayed([{ id: habitue.id, name: habitue.name }])

    expect((await listPlayers()).map((p) => p.name)).toEqual(['Habitué', 'Rare'])
  })

  it('compte les parties jouées', async () => {
    const player = (await addPlayer('Adrien'))!
    await markPlayed([{ id: player.id, name: player.name }])
    await markPlayed([{ id: player.id, name: player.name }])
    expect((await listPlayers())[0]?.gamesPlayed).toBe(2)
  })

  it('ignore un joueur inconnu sans échouer', async () => {
    await expect(markPlayed([{ id: 'fantome', name: 'Fantôme' }])).resolves.toBeUndefined()
  })
})

describe('migration du carnet écrit en localStorage', () => {
  const KEY = 'chalk.players.v1'

  afterEach(() => {
    globalThis.localStorage?.removeItem(KEY)
  })

  it('reprend les joueurs existants puis efface l’ancienne clé', async () => {
    globalThis.localStorage.setItem(
      KEY,
      JSON.stringify([
        { id: 'x', name: 'Adrien' },
        { id: 'y', name: 'Bruno' },
      ]),
    )

    expect(await migrateLegacyPlayers()).toBe(2)
    expect((await listPlayers()).map((p) => p.name).sort()).toEqual(['Adrien', 'Bruno'])
    expect(globalThis.localStorage.getItem(KEY)).toBeNull()
  })

  it('est idempotente : rejouée, elle ne duplique rien', async () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify([{ id: 'x', name: 'Adrien' }]))
    await migrateLegacyPlayers()
    await migrateLegacyPlayers()
    expect(await listPlayers()).toHaveLength(1)
  })

  it('écarte un contenu illisible sans bloquer le démarrage (§2)', async () => {
    globalThis.localStorage.setItem(KEY, 'ceci n’est pas du JSON')
    expect(await migrateLegacyPlayers()).toBe(0)
    expect(globalThis.localStorage.getItem(KEY)).toBeNull()
  })

  it('ignore les entrées malformées', async () => {
    globalThis.localStorage.setItem(KEY, JSON.stringify([{ id: 'x' }, null, { name: 'Sans id' }]))
    expect(await migrateLegacyPlayers()).toBe(0)
  })
})

describe('réglages (§4.9)', () => {
  it('lit une valeur par défaut quand rien n’est enregistré', async () => {
    expect(await getSetting('theme', 'dark')).toBe('dark')
  })

  it('écrit puis relit une valeur', async () => {
    await setSetting('scoreSize', 'large')
    expect(await getSetting('scoreSize', 'normal')).toBe('large')
  })
})

describe('robustesse aux proxies réactifs de Vue', () => {
  /**
   * Régression : une partie lue en base puis exposée par un `ref()` de Vue
   * devient un Proxy réactif. `structuredClone`, sur lequel repose IndexedDB,
   * ne sait pas cloner un Proxy — l'écriture échouait avec un `DataCloneError`
   * exactement sur le chemin de la reprise (#31), c'est-à-dire au moment où
   * perdre une partie fait le plus de dégâts.
   */
  it('enregistre une partie dont l’instantané est passé par un ref() Vue', async () => {
    const session = newSession(501)
    session.applyDart(T(20))
    await persist('g1', session)

    const stored = (await getGame('g1'))!
    const reactif = ref(stored)

    const restored = GameSession.restore(x01Rule, {
      ruleId: reactif.value.ruleId,
      config: reactif.value.config,
      players: reactif.value.players,
      inputs: reactif.value.inputs,
    })
    restored.applyDart(T(19))

    await expect(persist('g1', restored)).resolves.toBeUndefined()
    expect((await getGame('g1'))?.inputs).toHaveLength(2)
  })

  it('persiste une annulation faite après reprise (§4.3)', async () => {
    const session = newSession(501)
    session.applyDart(T(20))
    session.applyDart(T(20))
    await persist('g1', session)

    const stored = ref((await getGame('g1'))!)
    const restored = GameSession.restore(x01Rule, {
      ruleId: stored.value.ruleId,
      config: stored.value.config,
      players: stored.value.players,
      inputs: stored.value.inputs,
    })

    expect(restored.undo()).toBe(true)
    await persist('g1', restored)
    expect((await getGame('g1'))?.inputs).toHaveLength(1)
  })
})

describe('génération d’identifiants hors contexte sécurisé', () => {
  /**
   * `crypto.randomUUID` n'existe qu'en contexte sécurisé (HTTPS ou localhost).
   * Ouvrir l'application depuis un téléphone du réseau local — exactement ce
   * que demande le test terrain (#78) — la prive de cette fonction, et sans
   * repli il devenait impossible d'ajouter un joueur.
   */
  it('produit un identifiant valide sans crypto.randomUUID', () => {
    const vrai = crypto.randomUUID
    // @ts-expect-error simulation d'un contexte non sécurisé
    delete crypto.randomUUID
    try {
      const id = randomId()
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
      expect(randomId()).not.toBe(id)
    } finally {
      crypto.randomUUID = vrai
    }
  })

  it('permet d’ajouter un joueur sans crypto.randomUUID', async () => {
    const vrai = crypto.randomUUID
    // @ts-expect-error simulation d'un contexte non sécurisé
    delete crypto.randomUUID
    try {
      const player = await addPlayer('Adrien')
      expect(player?.id).toBeTruthy()
    } finally {
      crypto.randomUUID = vrai
    }
  })
})

describe('statistiques persistées (§4.7, #43)', () => {
  /** Joue un 40 gagné par le joueur `a` et l'enregistre comme terminé. */
  async function partieTerminee(id: string, startingScore = 40) {
    const session = newSession(startingScore)
    session.applyDart(D(startingScore / 2))
    await persist(id, session)
    return session
  }

  it('calcule et conserve les statistiques à la fin de la partie', async () => {
    await partieTerminee('g1')
    const stored = await getGame('g1')
    expect(stored?.status).toBe('finished')
    expect(stored?.stats).toBeDefined()
    expect(stored?.stats?.winnerId).toBe('a')
  })

  it('ne calcule rien tant que la partie est en cours', async () => {
    const session = newSession(501)
    session.applyDart(T(20))
    await persist('g1', session)
    expect((await getGame('g1'))?.stats).toBeUndefined()
  })

  it('recalcule les statistiques d’une partie enregistrée avant #43', async () => {
    await partieTerminee('g1')
    // On simule une partie d'avant : on retire les statistiques stockées.
    const stored = (await getGame('g1'))!
    const { stats: _, ...sansStats } = stored
    await database.games.put(sansStats as typeof stored)
    expect((await getGame('g1'))?.stats).toBeUndefined()

    const recalcule = await ensureGameStats((await getGame('g1'))!)
    expect(recalcule?.winnerId).toBe('a')
    // Et la valeur est désormais conservée.
    expect((await getGame('g1'))?.stats).toBeDefined()
  })

  it('agrège la carrière d’un joueur à travers les parties', async () => {
    await partieTerminee('g1', 40)
    await partieTerminee('g2', 32)

    const career = await careerStats('a')
    expect(career?.gamesPlayed).toBe(2)
    expect(career?.gamesWon).toBe(2)
    expect(career?.bestCheckout).toBe(40)
  })

  it('ignore les parties en cours et abandonnées', async () => {
    await partieTerminee('finie')

    const enCours = newSession(501)
    enCours.applyDart(T(20))
    await persist('en-cours', enCours)

    const abandonnee = newSession(501)
    abandonnee.applyDart(T(20))
    await persist('abandonnee', abandonnee)
    await abandonGame('abandonnee')

    expect(await finishedGamesWithStats()).toHaveLength(1)
    expect((await careerStats('a'))?.gamesPlayed).toBe(1)
  })

  it('liste les joueurs ayant un historique', async () => {
    await partieTerminee('g1')
    const players = await playersWithHistory()
    expect(players.map((player) => player.id).sort()).toEqual(['a', 'b'])
  })

  it('construit la courbe d’évolution de la moyenne (§4.7)', async () => {
    await partieTerminee('g1', 40)
    await new Promise((resolve) => setTimeout(resolve, 5))
    await partieTerminee('g2', 32)

    const courbe = await averageOverTime('a')
    expect(courbe).toHaveLength(2)
    expect(courbe[0]!.at).toBeLessThanOrEqual(courbe[1]!.at)
    expect(courbe.every((point) => point.average > 0)).toBe(true)
  })

  it('établit le bilan des confrontations (§4.7)', async () => {
    await partieTerminee('g1', 40)
    await partieTerminee('g2', 32)

    const bilan = await headToHead('a', 'b')
    expect(bilan.games).toBe(2)
    expect(bilan.winsA).toBe(2)
    expect(bilan.winsB).toBe(0)
    expect(bilan.averageA).toBeGreaterThan(0)
  })

  it('ne compte pas une confrontation où l’un des deux n’a pas joué', async () => {
    await partieTerminee('g1')
    expect((await headToHead('a', 'inconnu')).games).toBe(0)
  })
})
