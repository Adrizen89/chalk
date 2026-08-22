/**
 * Statistiques cumulées — §4.7, #43.
 *
 * Le calcul par partie vit dans le moteur (`computeGameStats`), qui rejoue le
 * journal. Ce module ne fait que lire la base et agréger : c'est ce qui permet
 * à l'affichage de ne pas rejouer l'historique entier, comme le demande le
 * §4.7.
 */

import type { GameStats, PlayerCareerStats, PlayerId } from '@chalk/core'
import { aggregateStats } from '@chalk/core'
import { db } from './database.js'
import { statsForGame } from './games.js'
import type { StoredGame } from './schema.js'

/** Une partie compte-t-elle dans les statistiques ? */
const isCounted = (game: StoredGame) => game.status === 'finished'

/**
 * Statistiques d'une partie, calculées à la volée si elles manquent.
 *
 * Les parties enregistrées avant #43 n'en ont pas : elles sont recalculées à
 * la première lecture, puis conservées.
 */
export async function ensureGameStats(game: StoredGame): Promise<GameStats | undefined> {
  if (game.stats) return game.stats
  const stats = statsForGame(game)
  if (!stats) return undefined
  try {
    await db().games.update(game.id, { stats })
  } catch {
    // L'écriture du cache peut échouer sans conséquence : la valeur est bonne.
  }
  return stats
}

/** Statistiques de toutes les parties terminées, les plus récentes en tête. */
export async function finishedGamesWithStats(
  limit = 500,
): Promise<{ game: StoredGame; stats: GameStats }[]> {
  const games = (await db().games.orderBy('updatedAt').reverse().limit(limit).toArray()).filter(
    isCounted,
  )

  const result: { game: StoredGame; stats: GameStats }[] = []
  for (const game of games) {
    const stats = await ensureGameStats(game)
    if (stats) result.push({ game, stats })
  }
  return result
}

/** §4.7 — statistiques d'un joueur, cumulées dans le temps. */
export async function careerStats(playerId: PlayerId): Promise<PlayerCareerStats | null> {
  const entries = await finishedGamesWithStats()
  return aggregateStats(
    entries.map((entry) => entry.stats),
    playerId,
  )
}

/** Joueurs ayant au moins une partie terminée. */
export async function playersWithHistory(): Promise<{ id: PlayerId; name: string }[]> {
  const entries = await finishedGamesWithStats()
  const seen = new Map<PlayerId, string>()
  for (const { stats } of entries) {
    for (const player of stats.players)
      if (!seen.has(player.playerId)) seen.set(player.playerId, player.name)
  }
  return [...seen].map(([id, name]) => ({ id, name }))
}

/**
 * §4.7 — évolution de la moyenne dans le temps.
 *
 * Une entrée par partie, de la plus ancienne à la plus récente, pour la courbe
 * d'évolution. Les parties saisies par volée y figurent : la moyenne 3
 * fléchettes ne demande pas le détail par fléchette.
 */
export async function averageOverTime(
  playerId: PlayerId,
): Promise<{ at: number; average: number }[]> {
  const entries = await finishedGamesWithStats()
  return entries
    .map(({ game, stats }) => {
      const player = stats.players.find((entry) => entry.playerId === playerId)
      return player && player.dartsThrown > 0
        ? { at: game.updatedAt, average: player.threeDartAverage }
        : null
    })
    .filter((entry): entry is { at: number; average: number } => entry !== null)
    .reverse()
}

/**
 * §4.7 — bilan des confrontations entre deux joueurs.
 *
 * Ne retient que les parties où les deux ont joué l'un contre l'autre.
 */
export async function headToHead(
  playerA: PlayerId,
  playerB: PlayerId,
): Promise<{ games: number; winsA: number; winsB: number; averageA: number; averageB: number }> {
  const entries = await finishedGamesWithStats()
  let games = 0
  let winsA = 0
  let winsB = 0
  let dartsA = 0
  let pointsA = 0
  let dartsB = 0
  let pointsB = 0

  for (const { stats } of entries) {
    const a = stats.players.find((player) => player.playerId === playerA)
    const b = stats.players.find((player) => player.playerId === playerB)
    if (!a || !b) continue

    games += 1
    if (a.won) winsA += 1
    if (b.won) winsB += 1
    dartsA += a.dartsThrown
    pointsA += a.pointsScored
    dartsB += b.dartsThrown
    pointsB += b.pointsScored
  }

  return {
    games,
    winsA,
    winsB,
    averageA: dartsA === 0 ? 0 : (pointsA / dartsA) * 3,
    averageB: dartsB === 0 ? 0 : (pointsB / dartsB) * 3,
  }
}
