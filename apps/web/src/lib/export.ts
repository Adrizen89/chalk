/**
 * Export des données — §4.7 et §6.
 *
 * Trois jeux de données, plus un export complet qui sert la demande RGPD du
 * §6 : « export et suppression du compte et des données à la demande ».
 *
 * Tout est lu depuis la base locale : l'export fonctionne hors ligne, comme
 * le reste du mode local (§3.1).
 */

import { dartValue, findRule, formatDart } from '@chalk/core'
import type { GameInput } from '@chalk/core'
import { finishedGamesWithStats, listGames } from '@/db'
import { exerciseHistory, practisedExerciseIds } from '@/db/training'
import type { StoredExerciseResult, StoredGame } from '@/db'
import { csvDate, downloadCsv, toCsv } from './csv'

/** Une ligne par joueur et par partie — le niveau utile pour un tableur. */
async function gameRows() {
  const entries = await finishedGamesWithStats()
  return entries.flatMap(({ game, stats }) =>
    stats.players.map((player) => ({
      date: csvDate(game.updatedAt),
      mode: findRule(stats.baseRuleId)?.label ?? stats.baseRuleId,
      joueur: player.name,
      vainqueur: player.won ? 'oui' : 'non',
      moyenne3Flechettes: player.threeDartAverage,
      moyenne9Premieres: player.firstNineAverage,
      flechettes: player.dartsThrown,
      pointsMarques: player.pointsScored,
      legsGagnes: player.legsWon,
      meilleurLeg: player.bestLegDarts,
      meilleurCheckout: player.bestCheckout,
      doublesTentes: player.hasDartDetail ? player.checkoutAttempts : null,
      doublesReussis: player.hasDartDetail ? player.checkoutHits : null,
      compte180: player.count180,
      compte140plus: player.count140plus,
      compte100plus: player.count100plus,
      saisieDetaillee: player.hasDartDetail ? 'oui' : 'non',
      identifiantPartie: game.id,
    })),
  )
}

export async function exportGames(): Promise<number> {
  const rows = await gameRows()
  downloadCsv(
    'chalk-parties.csv',
    toCsv(rows, [
      { header: 'Date', value: (row) => row.date },
      { header: 'Mode', value: (row) => row.mode },
      { header: 'Joueur', value: (row) => row.joueur },
      { header: 'Vainqueur', value: (row) => row.vainqueur },
      { header: 'Moyenne 3 fléchettes', value: (row) => row.moyenne3Flechettes },
      { header: 'Moyenne 9 premières', value: (row) => row.moyenne9Premieres },
      { header: 'Fléchettes', value: (row) => row.flechettes },
      { header: 'Points marqués', value: (row) => row.pointsMarques },
      { header: 'Legs gagnés', value: (row) => row.legsGagnes },
      { header: 'Meilleur leg', value: (row) => row.meilleurLeg },
      { header: 'Meilleur checkout', value: (row) => row.meilleurCheckout },
      { header: 'Doubles tentés', value: (row) => row.doublesTentes },
      { header: 'Doubles réussis', value: (row) => row.doublesReussis },
      { header: '180', value: (row) => row.compte180 },
      { header: '140+', value: (row) => row.compte140plus },
      { header: '100+', value: (row) => row.compte100plus },
      { header: 'Saisie détaillée', value: (row) => row.saisieDetaillee },
      { header: 'Identifiant partie', value: (row) => row.identifiantPartie },
    ]),
  )
  return rows.length
}

/**
 * Une ligne par fléchette — §6, l'export RGPD doit être complet.
 *
 * C'est aussi la matière première du modèle de dispersion du coach (§4.6) :
 * pouvoir la sortir permet de l'analyser hors de l'application.
 */
function dartRows(game: StoredGame) {
  const label = findRule(game.ruleId)?.label ?? game.ruleId
  const rows: {
    date: string
    mode: string
    partie: string
    numero: number
    saisie: string
    segment: number | null
    multiplicateur: number | null
    valeur: number
    viseSegment: number | null
    viseMultiplicateur: number | null
  }[] = []

  game.inputs.forEach((input: GameInput, index) => {
    if (input.kind === 'dart') {
      rows.push({
        date: csvDate(game.updatedAt),
        mode: label,
        partie: game.id,
        numero: index + 1,
        saisie: formatDart(input.dart),
        segment: input.dart.segment,
        multiplicateur: input.dart.multiplier,
        valeur: dartValue(input.dart),
        viseSegment: input.dart.aimedAt?.segment ?? null,
        viseMultiplicateur: input.dart.aimedAt?.multiplier ?? null,
      })
    } else {
      rows.push({
        date: csvDate(game.updatedAt),
        mode: label,
        partie: game.id,
        numero: index + 1,
        saisie: `volée ${input.total}`,
        segment: null,
        multiplicateur: null,
        valeur: input.total,
        viseSegment: null,
        viseMultiplicateur: null,
      })
    }
  })
  return rows
}

export async function exportDarts(): Promise<number> {
  const games = await listGames(500)
  const rows = games.flatMap(dartRows)
  downloadCsv(
    'chalk-flechettes.csv',
    toCsv(rows, [
      { header: 'Date', value: (row) => row.date },
      { header: 'Mode', value: (row) => row.mode },
      { header: 'Partie', value: (row) => row.partie },
      { header: 'N°', value: (row) => row.numero },
      { header: 'Saisie', value: (row) => row.saisie },
      { header: 'Segment', value: (row) => row.segment },
      { header: 'Multiplicateur', value: (row) => row.multiplicateur },
      { header: 'Valeur', value: (row) => row.valeur },
      { header: 'Segment visé', value: (row) => row.viseSegment },
      { header: 'Multiplicateur visé', value: (row) => row.viseMultiplicateur },
    ]),
  )
  return rows.length
}

export async function exportTraining(): Promise<number> {
  const ids = await practisedExerciseIds()
  const results: StoredExerciseResult[] = []
  for (const id of ids) results.push(...(await exerciseHistory(id, 500)))
  results.sort((a, b) => b.at - a.at)

  downloadCsv(
    'chalk-entrainement.csv',
    toCsv(results, [
      { header: 'Date', value: (row) => csvDate(row.at) },
      { header: 'Exercice', value: (row) => row.exerciseId },
      { header: 'Résultat', value: (row) => row.metricValue },
      { header: 'Métrique', value: (row) => row.metric },
      { header: 'Meilleur = plus élevé', value: (row) => (row.higherIsBetter ? 'oui' : 'non') },
      { header: 'Score', value: (row) => row.score },
      { header: 'Fléchettes', value: (row) => row.dartsThrown },
      { header: 'Réussis', value: (row) => row.hits },
      { header: 'Tentatives', value: (row) => row.attempts },
      { header: 'Meilleure série', value: (row) => row.bestStreak },
      { header: 'Durée (s)', value: (row) => row.durationSeconds ?? null },
    ]),
  )
  return results.length
}

/** §6 — export complet, pour répondre à une demande RGPD. */
export async function exportEverything(): Promise<{
  parties: number
  flechettes: number
  entrainement: number
}> {
  const parties = await exportGames()
  const flechettes = await exportDarts()
  const entrainement = await exportTraining()
  return { parties, flechettes, entrainement }
}
