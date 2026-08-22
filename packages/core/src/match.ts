/**
 * Legs et sets — §4.4, #28.
 *
 * « Legs et sets paramétrables (ex. : au meilleur des 5 legs, au meilleur des
 *   3 sets) » et « alternance du joueur qui commence à chaque leg ».
 *
 * Le choix de conception : **le match est lui-même une règle de jeu**. Plutôt
 * que d'apprendre les legs et les sets à chaque mode — ce qui les dupliquerait
 * quatre fois aujourd'hui et une fois de plus à chaque règle maison (§4.2) —
 * on enveloppe une règle existante dans une règle qui en enchaîne les manches.
 *
 * Tout ce qui vaut pour une règle vaut donc pour un match, gratuitement :
 * l'undo multi-niveaux (§4.3), la reprise après fermeture (§4.4) et la
 * persistance du journal (#18) fonctionnent sans une ligne de plus, parce que
 * le journal reste une suite de fléchettes rejouée de bout en bout.
 */

import type {
  ApplyResult,
  DartValidation,
  GameEffect,
  GameRule,
  GameView,
  PlayerId,
  PlayerRef,
  PlayerView,
} from './rule.js'

/** Préfixe des identifiants de règles enveloppées dans un match. */
export const MATCH_RULE_PREFIX = 'match:'

export interface MatchConfig<TRuleConfig> {
  /** Configuration de la règle sous-jacente (X01, Cricket…). */
  readonly ruleConfig: TRuleConfig
  /** Legs à gagner pour remporter un set. 3 = « au meilleur des 5 legs ». */
  readonly legsToWin: number
  /** Sets à gagner pour remporter le match. 1 = match joué en legs simples. */
  readonly setsToWin: number
  /** §4.4 — le joueur qui commence change à chaque leg. */
  readonly alternateStart: boolean
}

export interface MatchState<TRuleConfig, TLegState> {
  readonly config: MatchConfig<TRuleConfig>
  /** Ordre canonique des joueurs, celui de l'affichage. */
  readonly players: readonly PlayerRef[]
  /** État de la règle sous-jacente pour le leg en cours. */
  readonly leg: TLegState
  /** Index, dans l'ordre canonique, du joueur qui a commencé ce leg. */
  readonly startIndex: number
  readonly legNumber: number
  readonly setNumber: number
  /** Legs gagnés dans le set en cours. */
  readonly legsWon: Readonly<Record<PlayerId, number>>
  readonly setsWon: Readonly<Record<PlayerId, number>>
  readonly winnerId: PlayerId | null
  readonly lastMessage?: string
}

/**
 * « Au meilleur des N » → nombre de manches à gagner.
 * Au meilleur des 5 : 3 legs. Au meilleur des 1 : 1 leg.
 */
export function bestOf(rounds: number): number {
  return Math.max(1, Math.ceil(Math.max(1, Math.trunc(rounds)) / 2))
}

/** Le match se réduit-il à une seule manche ? */
export function isSingleLeg(config: MatchConfig<unknown>): boolean {
  return config.legsToWin <= 1 && config.setsToWin <= 1
}

/** Décale la liste pour que le joueur d'index `by` se retrouve en tête. */
function rotate<T>(items: readonly T[], by: number): T[] {
  const count = items.length
  if (count === 0) return []
  const offset = ((by % count) + count) % count
  return items.map((_, index) => items[(index + offset) % count] as T)
}

function zeroed(players: readonly PlayerRef[]): Record<PlayerId, number> {
  return Object.fromEntries(players.map((player) => [player.id, 0]))
}

/** L'identifiant désigne-t-il une règle enveloppée dans un match ? */
export function isMatchRuleId(ruleId: string): boolean {
  return ruleId.startsWith(MATCH_RULE_PREFIX)
}

/**
 * Identifiant de la règle sous-jacente : `match:x01` → `x01`.
 *
 * Indispensable partout où l'interface adapte son affichage au mode de jeu —
 * suggestions de sortie, tableau de marques du Cricket. Sans cela, envelopper
 * une règle dans un match la rend méconnaissable et fait disparaître ces
 * affichages sans erreur visible.
 */
export function baseRuleId(ruleId: string): string {
  return isMatchRuleId(ruleId) ? ruleId.slice(MATCH_RULE_PREFIX.length) : ruleId
}

/**
 * État de la manche en cours, que la règle soit un match ou une règle nue.
 *
 * Permet aux fonctions qui raisonnent sur une manche — `suggestCheckout` par
 * exemple — de fonctionner indifféremment dans les deux cas.
 */
export function legStateOf<TLegState>(ruleId: string, state: unknown): TLegState {
  if (!isMatchRuleId(ruleId)) return state as TLegState
  return (state as MatchState<unknown, TLegState>).leg
}

/**
 * Construit une règle de match à partir d'une règle de manche.
 *
 * L'identifiant est préfixé (`match:x01`) pour que le registre sache
 * reconstruire l'enveloppe à la reprise d'une partie enregistrée (§4.4).
 */
export function createMatchRule<TRuleConfig, TLegState>(
  base: GameRule<TRuleConfig, TLegState>,
): GameRule<MatchConfig<TRuleConfig>, MatchState<TRuleConfig, TLegState>> {
  type State = MatchState<TRuleConfig, TLegState>

  /** Crée l'état d'un nouveau leg, en faisant commencer le bon joueur. */
  function createLeg(
    config: MatchConfig<TRuleConfig>,
    players: readonly PlayerRef[],
    startIndex: number,
  ): TLegState {
    return base.createState(config.ruleConfig, rotate(players, startIndex))
  }

  /**
   * Enchaîne sur la manche suivante après un leg gagné.
   *
   * Le leg suivant démarre immédiatement : §5 interdit toute fenêtre modale
   * pendant une partie. Le résultat du leg est annoncé par un message court et
   * par les effets, que l'interface peut sonoriser (§4.9).
   */
  function advance(state: State, legWinnerId: PlayerId, effects: GameEffect[]): State {
    const { config, players } = state
    const legsWon = { ...state.legsWon, [legWinnerId]: (state.legsWon[legWinnerId] ?? 0) + 1 }
    effects.push({ type: 'leg-won', playerId: legWinnerId })

    const winnerName = players.find((player) => player.id === legWinnerId)?.name ?? ''
    const nextStartIndex = config.alternateStart
      ? (state.startIndex + 1) % Math.max(1, players.length)
      : state.startIndex

    const setWon = (legsWon[legWinnerId] ?? 0) >= config.legsToWin
    if (!setWon) {
      return {
        ...state,
        leg: createLeg(config, players, nextStartIndex),
        startIndex: nextStartIndex,
        legNumber: state.legNumber + 1,
        legsWon,
        lastMessage: `${winnerName} remporte le leg.`,
      }
    }

    const setsWon = { ...state.setsWon, [legWinnerId]: (state.setsWon[legWinnerId] ?? 0) + 1 }
    effects.push({ type: 'set-won', playerId: legWinnerId })

    const matchWon = (setsWon[legWinnerId] ?? 0) >= config.setsToWin
    if (matchWon) {
      effects.push({ type: 'game-won', playerId: legWinnerId })
      return {
        ...state,
        legsWon,
        setsWon,
        winnerId: legWinnerId,
        lastMessage: `${winnerName} remporte le match.`,
      }
    }

    // Nouveau set : le compte des legs repart de zéro.
    return {
      ...state,
      leg: createLeg(config, players, nextStartIndex),
      startIndex: nextStartIndex,
      legNumber: 1,
      setNumber: state.setNumber + 1,
      legsWon: zeroed(players),
      setsWon,
      lastMessage: `${winnerName} remporte le set.`,
    }
  }

  /**
   * Traduit les effets de la manche vers le match.
   *
   * La règle sous-jacente annonce `game-won` quand **son** leg est terminé.
   * Au niveau du match, ce n'est pas la fin de la partie : c'est `advance` qui
   * décide s'il y a un leg, un set ou un match de gagné.
   */
  function translate(effects: readonly GameEffect[]): GameEffect[] {
    return effects.filter((effect) => effect.type !== 'leg-won' && effect.type !== 'game-won')
  }

  function applyToLeg(state: State, apply: () => ApplyResult<TLegState>): ApplyResult<State> {
    if (state.winnerId !== null) return { state, effects: [] }

    const result = apply()
    const effects = translate(result.effects)
    const legWinnerId = base.getWinner(result.state)

    // Le message du leg précédent est périmé dès qu'une fléchette est lancée.
    const { lastMessage: _, ...rest } = state
    const advanced: State = { ...rest, leg: result.state }

    if (legWinnerId === null) return { state: advanced, effects }
    return { state: advance(advanced, legWinnerId, effects), effects }
  }

  return {
    id: `${MATCH_RULE_PREFIX}${base.id}`,
    label: base.label,
    requiresDartDetail: base.requiresDartDetail,
    defaultConfig: {
      ruleConfig: base.defaultConfig,
      legsToWin: 1,
      setsToWin: 1,
      alternateStart: true,
    },

    createState(config, players) {
      return {
        config,
        players,
        leg: createLeg(config, players, 0),
        startIndex: 0,
        legNumber: 1,
        setNumber: 1,
        legsWon: zeroed(players),
        setsWon: zeroed(players),
        winnerId: null,
      }
    },

    validateDart(state, dart): DartValidation {
      if (state.winnerId !== null) return { ok: false, reason: 'Le match est terminé.' }
      return base.validateDart(state.leg, dart)
    },

    applyDart(state, dart) {
      return applyToLeg(state, () => base.applyDart(state.leg, dart))
    },

    ...(base.applyTurnTotal
      ? {
          applyTurnTotal(state: State, total: number, dartsUsed?: number) {
            return applyToLeg(state, () =>
              // Présence garantie par la condition ci-dessus.
              base.applyTurnTotal!(state.leg, total, dartsUsed),
            )
          },
        }
      : {}),

    getWinner(state) {
      return state.winnerId
    },

    view(state): GameView {
      const legView = base.view(state.leg)
      const withSets = state.config.setsToWin > 1

      // La règle sous-jacente voit les joueurs dans l'ordre du leg, qui tourne
      // à chaque manche. L'affichage, lui, doit rester stable.
      const byId = new Map(legView.players.map((player) => [player.playerId, player]))
      const players: PlayerView[] = state.players.map((player) => {
        const projected = byId.get(player.id)
        const base: PlayerView = projected ?? {
          playerId: player.id,
          name: player.name,
          primary: '—',
          secondary: [],
          isActive: false,
          isFinished: false,
        }
        return {
          ...base,
          isActive: state.winnerId === null && base.isActive,
          secondary: [
            ...(withSets ? [{ label: 'Sets', value: String(state.setsWon[player.id] ?? 0) }] : []),
            { label: 'Legs', value: String(state.legsWon[player.id] ?? 0) },
            ...base.secondary,
          ],
        }
      })

      return {
        ...legView,
        ruleId: `${MATCH_RULE_PREFIX}${legView.ruleId}`,
        players,
        activePlayerId: state.winnerId === null ? legView.activePlayerId : null,
        isFinished: state.winnerId !== null,
        winnerId: state.winnerId,
        ...(state.lastMessage !== undefined
          ? { message: state.lastMessage }
          : legView.message !== undefined
            ? { message: legView.message }
            : {}),
      }
    },
  }
}
