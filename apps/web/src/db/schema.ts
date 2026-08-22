/**
 * Schéma de la base locale — §3.4, #18.
 *
 * Tout ce que Chalk sait vit d'abord ici. Le §3.1 est sans ambiguïté : « le
 * mode local doit être pleinement fonctionnel hors ligne », et une partie
 * commencée hors ligne doit pouvoir se terminer puis se synchroniser au retour
 * du réseau. IndexedDB n'est donc pas un cache du serveur — c'est la source de
 * vérité, et le serveur (lot 2) en sera la copie.
 *
 * Ce que l'on stocke d'une partie, ce n'est pas son état mais son **journal
 * d'entrées** (cf. ADR 0002). Un journal est compact, rejouable, et se
 * réconcilie beaucoup mieux qu'un état mutable — ce qui prépare la
 * synchronisation multi-appareil (#40) et la résolution de conflits (#4).
 */

import type {
  CustomExerciseDefinition,
  ExerciseMetric,
  GameInput,
  GameStats,
  PlayerId,
  PlayerRef,
} from '@chalk/core'

export type GameStatus = 'in-progress' | 'finished' | 'abandoned'

/** §4.3 — mode de saisie choisi au lancement de la partie. */
export type StoredInputMode = 'turn' | 'dart'

export interface StoredGame {
  readonly id: string
  readonly ruleId: string
  readonly config: unknown
  readonly players: readonly PlayerRef[]
  /** Le journal, seul état persisté. Rejoué au chargement (cf. ADR 0002). */
  readonly inputs: readonly GameInput[]
  readonly inputMode: StoredInputMode
  readonly status: GameStatus
  readonly winnerId: PlayerId | null
  readonly createdAt: number
  readonly updatedAt: number
  /**
   * Statistiques de la partie — §4.7, #43.
   *
   * Calculées une fois, à la fin de la partie, puis conservées : le §4.7
   * demande que « l'affichage ne recalcule pas l'intégralité de l'historique ».
   * Absentes des parties en cours, et des parties enregistrées avant #43 — le
   * champ n'étant pas indexé, aucune migration de schéma n'est nécessaire, et
   * les anciennes parties se recalculent à la première lecture.
   */
  readonly stats?: GameStats
}

/**
 * Carnet de joueurs — §4.1, #33.
 *
 * `lastPlayedAt` et `gamesPlayed` servent au tri par fréquence récente : au
 * lancement d'une partie, les joueurs habituels doivent être en tête, c'est le
 * levier de l'objectif des 15 secondes (§1).
 */
export interface StoredPlayer {
  readonly id: PlayerId
  readonly name: string
  readonly createdAt: number
  readonly lastPlayedAt: number
  readonly gamesPlayed: number
}

export interface StoredSetting {
  readonly key: string
  readonly value: unknown
}

/**
 * File d'attente de synchronisation — §3.1.
 *
 * Rien ne la consomme encore : le serveur arrive au lot 2 (#35, #40). Elle
 * existe dès maintenant parce qu'une partie jouée hors ligne aujourd'hui devra
 * pouvoir remonter demain, et qu'ajouter la table après coup obligerait à
 * deviner ce qui n'a pas été enregistré entre-temps.
 */
export interface PendingSync {
  readonly id?: number
  readonly entity: 'game' | 'player'
  readonly entityId: string
  readonly queuedAt: number
}

/**
 * Résultat d'un exercice — §4.5, #50.
 *
 * « Historique par exercice, avec record personnel mis en évidence. » Le
 * résultat porte sa propre métrique : selon l'exercice, le meilleur score est
 * le plus élevé (Bob's 27) ou le plus bas (Tour des doubles). Sans cette
 * information, comparer deux résultats serait impossible.
 */
export interface StoredExerciseResult {
  readonly id: string
  readonly exerciseId: string
  readonly at: number
  readonly metric: ExerciseMetric
  readonly metricValue: number
  readonly higherIsBetter: boolean
  readonly score: number
  readonly dartsThrown: number
  readonly hits: number
  readonly attempts: number
  readonly bestStreak: number
  /** Durée en secondes, pour les exercices chronométrés (§4.5). */
  readonly durationSeconds?: number
}

/** Exercice créé par l'utilisateur — §4.5, #47. */
export interface StoredCustomExercise {
  readonly id: string
  readonly definition: CustomExerciseDefinition
  readonly createdAt: number
  readonly updatedAt: number
}

/**
 * Séance d'entraînement — §4.5, #48.
 *
 * « Composition d'une séance : enchaînement de plusieurs exercices, avec durée
 *   estimée. »
 *
 * La séance n'est qu'une liste ordonnée d'identifiants d'exercices : les
 * résultats restent enregistrés exercice par exercice, ce qui évite d'avoir
 * deux historiques à réconcilier.
 */
export interface StoredSession {
  readonly id: string
  readonly name: string
  readonly exerciseIds: readonly string[]
  readonly createdAt: number
  readonly updatedAt: number
  readonly lastRunAt?: number
  readonly runs: number
}

/**
 * Version du schéma.
 *
 * Toute évolution ajoute une version et une migration — jamais une
 * modification en place : les utilisateurs ont déjà des parties en base, et
 * §4.4 promet de les retrouver.
 */
export const SCHEMA_VERSION = 3

/** Schéma initial. Conservé tel quel : Dexie rejoue les versions dans l'ordre. */
export const STORES_V1 = {
  games: 'id, status, updatedAt, [status+updatedAt]',
  players: 'id, name, lastPlayedAt',
  settings: 'key',
  syncQueue: '++id, entity, entityId, queuedAt',
} as const

/** Version 2 — module Entraînement (§4.5). */
export const STORES_V2 = {
  exerciseResults: 'id, exerciseId, at, [exerciseId+at]',
  customExercises: 'id, updatedAt',
} as const

/** Version 3 — séances d'entraînement (§4.5, #48). */
export const STORES_V3 = {
  trainingSessions: 'id, updatedAt',
} as const

export const STORES = { ...STORES_V1, ...STORES_V2, ...STORES_V3 } as const
