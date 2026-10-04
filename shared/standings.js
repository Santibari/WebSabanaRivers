// Tabla de posiciones y bracket. Misma regla que la vista SQL `standings` y `generar_bracket`.
import { resultKey } from './draft-engine.js'

/** Puntuación por defecto; el admin la edita por torneo en scoring_rules. */
export const DEFAULT_SCORING = {
  bo1_1_0: { winner: 3, loser: 0 },
  bo3_2_0: { winner: 3, loser: 0 },
  bo3_2_1: { winner: 2, loser: 0 },
  bo5_3_0: { winner: 3, loser: 0 },
  bo5_3_1: { winner: 3, loser: 0 },
  bo5_3_2: { winner: 2, loser: 1 },
  draw: { winner: 1, loser: 1 },
}

/** Puntos que da una serie cerrada a cada equipo. */
export function matchPoints(match, scoring = DEFAULT_SCORING) {
  const { score_a: a = 0, score_b: b = 0, best_of } = match
  const rule = scoring[resultKey(best_of, Math.max(a, b), Math.min(a, b))] ?? { winner: 0, loser: 0 }
  if (a === b) return { a: rule.winner, b: rule.loser }
  return a > b ? { a: rule.winner, b: rule.loser } : { a: rule.loser, b: rule.winner }
}

/**
 * Orden: puntos → dragones de la fase → torres de la fase → enfrentamiento directo.
 * teams: [{ id, … }]; matches: series del grupo; games: partidas confirmadas con objetivos.
 */
export function computeStandings({ teams, matches, games = [], scoring = DEFAULT_SCORING }) {
  const rows = new Map(
    teams.map((t) => [t.id, { team: t, played: 0, won: 0, drawn: 0, lost: 0, points: 0, dragons: 0, towers: 0 }]),
  )
  const closed = matches.filter((m) => m.status === 'finalizado')
  for (const m of closed) {
    const ra = rows.get(m.team_a), rb = rows.get(m.team_b)
    if (!ra || !rb) continue
    const p = matchPoints(m, scoring)
    ra.played++, rb.played++
    ra.points += p.a, rb.points += p.b
    if (m.score_a === m.score_b) ra.drawn++, rb.drawn++
    else if (m.score_a > m.score_b) ra.won++, rb.lost++
    else rb.won++, ra.lost++
  }
  const matchIds = new Set(matches.map((m) => m.id))
  for (const g of games) {
    if (g.result_status !== 'confirmado' || (g.match_id && !matchIds.has(g.match_id))) continue
    const blue = rows.get(g.blue_team), red = rows.get(g.red_team)
    if (blue) blue.dragons += g.blue_dragons ?? 0, blue.towers += g.blue_towers ?? 0
    if (red) red.dragons += g.red_dragons ?? 0, red.towers += g.red_towers ?? 0
  }
  const h2h = (x, y) => {
    let px = 0, py = 0
    for (const m of closed) {
      const p = matchPoints(m, scoring)
      if (m.team_a === x && m.team_b === y) px += p.a, py += p.b
      if (m.team_a === y && m.team_b === x) px += p.b, py += p.a
    }
    return py - px
  }
  return [...rows.values()].sort(
    (x, y) =>
      y.points - x.points || y.dragons - x.dragons || y.towers - x.towers || h2h(x.team.id, y.team.id),
  )
}

/** Orden estándar de siembra para un bracket de tamaño potencia de 2 (1 vs N, 2 vs N-1…). */
function seedOrder(size) {
  let order = [1]
  while (order.length < size) {
    const n = order.length * 2
    order = order.flatMap((s) => [s, n + 1 - s])
  }
  return order
}

/**
 * Genera las llaves de la eliminatoria.
 * groups: [[1.º, 2.º, …] por grupo] (IDs ya ordenados por la tabla).
 * Con 2 grupos y 2 clasificados queda 1.º A vs 2.º B y 1.º B vs 2.º A.
 * Si los clasificados no son potencia de 2, los mejores sembrados pasan directo (bye).
 * Devuelve rondas: [[{ a, b, seedA, seedB, labelA, labelB }…], …].
 */
export function generateBracket(groups, qualifiersPerGroup, groupNames = []) {
  const seeds = []
  for (let pos = 0; pos < qualifiersPerGroup; pos++) {
    groups.forEach((g, gi) => {
      seeds.push({ team: g[pos] ?? null, seed: seeds.length + 1, label: `${pos + 1}.º ${groupNames[gi] ?? `Grupo ${gi + 1}`}` })
    })
  }
  let size = 1
  while (size < seeds.length) size *= 2
  const order = seedOrder(size)
  const first = []
  for (let i = 0; i < size; i += 2) {
    const sa = seeds[order[i] - 1] ?? null
    const sb = seeds[order[i + 1] - 1] ?? null
    first.push({
      a: sa?.team ?? null, b: sb?.team ?? null,
      seedA: sa?.seed ?? null, seedB: sb?.seed ?? null,
      labelA: sa?.label ?? 'Bye', labelB: sb?.label ?? 'Bye',
      bye: !sa || !sb,
    })
  }
  const rounds = [first]
  let prev = first
  while (prev.length > 1) {
    const next = []
    for (let i = 0; i < prev.length; i += 2) {
      const r = rounds.length
      next.push({ a: null, b: null, seedA: null, seedB: null, labelA: `Ganador ${roundCode(rounds.length - 1, prev.length)}${i + 1}`, labelB: `Ganador ${roundCode(rounds.length - 1, prev.length)}${i + 2}`, round: r })
    }
    rounds.push(next)
    prev = next
  }
  return rounds
}

/** Nombre de la ronda según cuántas llaves tiene. */
export function roundName(matchesInRound) {
  return { 1: 'Final', 2: 'Semifinal', 4: 'Cuartos de final', 8: 'Octavos de final' }[matchesInRound] ?? `Ronda de ${matchesInRound * 2}`
}

function roundCode(_roundIndex, matchesInRound) {
  return { 2: 'SF', 4: 'QF', 8: 'R16-' }[matchesInRound] ?? `R${matchesInRound * 2}-`
}
