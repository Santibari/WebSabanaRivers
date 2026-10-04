// Motor del draft: lógica pura, sin E/S. Lo usan /api (autoritativo) y el modo demo local.
// Todo lo que decide quién puede hacer qué vive aquí para que ambos lados apliquen la misma regla.

/** Orden de torneo: 20 acciones (5 bans y 5 picks por equipo). Se guarda en draft_templates. */
export const TOURNAMENT_TEMPLATE = [
  // Bans 1
  { side: 'blue', type: 'ban' }, { side: 'red', type: 'ban' },
  { side: 'blue', type: 'ban' }, { side: 'red', type: 'ban' },
  { side: 'blue', type: 'ban' }, { side: 'red', type: 'ban' },
  // Picks 1
  { side: 'blue', type: 'pick' }, { side: 'red', type: 'pick' },
  { side: 'red', type: 'pick' }, { side: 'blue', type: 'pick' },
  { side: 'blue', type: 'pick' }, { side: 'red', type: 'pick' },
  // Bans 2
  { side: 'red', type: 'ban' }, { side: 'blue', type: 'ban' },
  { side: 'red', type: 'ban' }, { side: 'blue', type: 'ban' },
  // Picks 2
  { side: 'red', type: 'pick' }, { side: 'blue', type: 'pick' },
  { side: 'blue', type: 'pick' }, { side: 'red', type: 'pick' },
]

export const DEFAULT_PICK_SECONDS = 30
export const otherSide = (side) => (side === 'blue' ? 'red' : 'blue')

/** Reconstruye el tablero a partir de las filas de draft_actions. */
export function buildDraftState(steps, actions) {
  const sorted = [...actions].sort((a, b) => a.step - b.step)
  const bans = { blue: [], red: [] }
  const picks = { blue: [], red: [] }
  for (const a of sorted) (a.type === 'ban' ? bans : picks)[a.team_side].push(a.champion_id ?? null)
  const currentStep = sorted.length
  return {
    bans,
    picks,
    currentStep,
    current: steps[currentStep] ?? null,
    done: currentStep >= steps.length,
    used: new Set(sorted.map((a) => a.champion_id).filter(Boolean)),
  }
}

/** "Bans 1", "Picks 1", "Bans 2"… agrupando acciones consecutivas del mismo tipo. */
export function phaseLabel(steps, stepIndex) {
  if (stepIndex >= steps.length) return 'Draft cerrado'
  let n = { ban: 0, pick: 0 }
  for (let i = 0; i <= stepIndex; i++) {
    if (i === 0 || steps[i].type !== steps[i - 1].type) n[steps[i].type]++
  }
  const type = steps[stepIndex].type
  return `${type === 'ban' ? 'Bans' : 'Picks'} ${n[type]}`
}

/** "Ban 4" / "Pick 2": número de esa acción para el lado que la hace. */
export function actionLabel(steps, stepIndex) {
  const s = steps[stepIndex]
  if (!s) return ''
  let n = 0
  for (let i = 0; i <= stepIndex; i++) if (steps[i].side === s.side && steps[i].type === s.type) n++
  return `${s.type === 'ban' ? 'Ban' : 'Pick'} ${n}`
}

/**
 * Campeones bloqueados por Fearless para un equipo.
 * previousGames: partidas cerradas de la serie [{ number, blue_team, red_team, picks: { blue: [], red: [] } }]
 * Hard: lo pickeado por cualquiera queda bloqueado para ambos. Soft: solo para quien lo pickeó.
 * Los bans nunca se arrastran.
 * Devuelve Map<championId, { game, teamId }>.
 */
export function fearlessLocked(mode, previousGames, teamId) {
  const locked = new Map()
  if (mode !== 'hard' && mode !== 'soft') return locked
  for (const g of previousGames) {
    for (const side of ['blue', 'red']) {
      const owner = side === 'blue' ? g.blue_team : g.red_team
      if (mode === 'soft' && owner !== teamId) continue
      for (const c of g.picks?.[side] ?? []) if (c) locked.set(c, { game: g.number, teamId: owner })
    }
  }
  return locked
}

/**
 * Valida una acción de draft. Devuelve { ok: true } o { ok: false, error }.
 * championIds: Set con los IDs válidos de champion.json (validación de existencia).
 */
export function validateAction({ steps, actions, side, championId, locked, championIds, session, now = Date.now() }) {
  if (session?.status !== 'drafting') return { ok: false, error: 'El draft no está en curso' }
  if (session?.paused) return { ok: false, error: 'El draft está en pausa' }
  const state = buildDraftState(steps, actions)
  if (state.done) return { ok: false, error: 'El draft ya terminó' }
  if (state.current.side !== side) return { ok: false, error: 'No es tu turno' }
  if (session?.deadline_at && now > new Date(session.deadline_at).getTime() + 1500)
    return { ok: false, error: 'Se acabó el tiempo de esta acción' }
  if (!championId) return { ok: false, error: 'Elige un campeón' }
  if (championIds && !championIds.has(championId)) return { ok: false, error: 'Campeón desconocido' }
  if (state.used.has(championId)) return { ok: false, error: 'Ese campeón ya fue baneado o pickeado' }
  if (state.current.type === 'pick' && locked?.has(championId))
    return { ok: false, error: 'Campeón bloqueado por Fearless' }
  return { ok: true, step: state.currentStep, type: state.current.type }
}

/**
 * Acción automática al vencer el tiempo: ban vacío en fase de bans,
 * campeón aleatorio disponible en fase de picks.
 */
export function timeoutChoice({ steps, actions, locked, championIds, random = Math.random }) {
  const state = buildDraftState(steps, actions)
  if (state.done) return null
  if (state.current.type === 'ban') return { step: state.currentStep, type: 'ban', side: state.current.side, championId: null }
  const pool = [...championIds].filter((c) => !state.used.has(c) && !locked?.has(c))
  const championId = pool[Math.floor(random() * pool.length)] ?? null
  return { step: state.currentStep, type: 'pick', side: state.current.side, championId }
}

export const winsNeeded = (bestOf) => Math.floor(bestOf / 2) + 1

/** Marcador de la serie a partir de las partidas confirmadas. */
export function seriesScore(games, teamA, teamB) {
  let a = 0, b = 0
  for (const g of games) {
    if (g.result_status !== 'confirmado' || !g.winner_id) continue
    if (g.winner_id === teamA) a++
    else if (g.winner_id === teamB) b++
  }
  return { a, b }
}

/** Ganador de la serie o null si sigue abierta. En BO2 un 1-1 es empate ('draw'). */
export function seriesOutcome(bestOf, games, teamA, teamB) {
  const { a, b } = seriesScore(games, teamA, teamB)
  const need = winsNeeded(bestOf)
  if (a >= need) return { done: true, winner: teamA, a, b }
  if (b >= need) return { done: true, winner: teamB, a, b }
  if (bestOf % 2 === 0 && a + b >= bestOf) return { done: true, winner: null, a, b }
  return { done: false, winner: null, a, b }
}

/** Llave de scoring_rules para un resultado de serie. */
export function resultKey(bestOf, winnerWins, loserWins) {
  if (winnerWins === loserWins) return 'draw'
  return `bo${bestOf}_${winnerWins}_${loserWins}`
}

/**
 * Cruza los reportes de los dos capitanes (game_reports).
 * reports: [{ team_side, winner_claim ('blue'|'red'), towers, dragons }]
 */
export function resolveReports(reports) {
  const blue = reports.find((r) => r.team_side === 'blue')
  const red = reports.find((r) => r.team_side === 'red')
  if (!blue || !red) return { status: 'pendiente' }
  if (blue.winner_claim !== red.winner_claim) return { status: 'disputa' }
  return {
    status: 'confirmado',
    winnerSide: blue.winner_claim,
    objectives: { blue_towers: blue.towers, blue_dragons: blue.dragons, red_towers: red.towers, red_dragons: red.dragons },
  }
}

/**
 * Quién elige lado en la partida `number` de la serie.
 * Grupos: moneda en la partida 1. Eliminatoria: el mejor sembrado.
 * Desde la partida 2: el perdedor de la anterior.
 */
export function sideDecision({ number, phaseType, sideMethod, previousGame, seedA, seedB, teamA, teamB }) {
  if (number > 1 && previousGame?.winner_id) {
    const loser = previousGame.winner_id === teamA ? teamB : teamA
    return { method: 'choice', chooser: loser }
  }
  if (sideMethod === 'manual') return { method: 'manual', chooser: null }
  if (phaseType === 'bracket') {
    const best = (seedA ?? 99) <= (seedB ?? 99) ? teamA : teamB
    return { method: 'choice', chooser: best }
  }
  return { method: 'coin', chooser: null }
}

/** Calendario todos contra todos (método del círculo). Devuelve [[a, b], …] por jornada. */
export function roundRobin(teamIds, doubleRound = false) {
  const ids = [...teamIds]
  if (ids.length % 2) ids.push(null)
  const n = ids.length
  const rounds = []
  for (let r = 0; r < n - 1; r++) {
    const pairs = []
    for (let i = 0; i < n / 2; i++) {
      const a = ids[i], b = ids[n - 1 - i]
      if (a && b) pairs.push(r % 2 ? [b, a] : [a, b])
    }
    rounds.push(pairs)
    ids.splice(1, 0, ids.pop())
  }
  if (doubleRound) return [...rounds, ...rounds.map((p) => p.map(([a, b]) => [b, a]))]
  return rounds
}
