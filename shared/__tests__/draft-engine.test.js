import { describe, it, expect } from 'vitest'
import {
  TOURNAMENT_TEMPLATE as T, buildDraftState, validateAction, fearlessLocked, timeoutChoice,
  phaseLabel, actionLabel, seriesOutcome, resolveReports, sideDecision, roundRobin, resultKey,
} from '../draft-engine.js'
import { computeStandings, generateBracket } from '../standings.js'

const ids = new Set(['Ahri', 'Azir', 'Ornn', 'Sejuani', 'Jinx', 'Thresh'])
const session = { status: 'drafting', paused: false }
const sixBans = T.slice(0, 6).map((s, i) => ({ step: i, team_side: s.side, type: 'ban', champion_id: null }))

describe('orden del draft', () => {
  it('tiene 20 acciones, 5 bans y 5 picks por lado, y empieza con ban azul', () => {
    expect(T).toHaveLength(20)
    for (const side of ['blue', 'red'])
      for (const type of ['ban', 'pick']) expect(T.filter((s) => s.side === side && s.type === type)).toHaveLength(5)
    expect(T[0]).toEqual({ side: 'blue', type: 'ban' })
  })
  it('etiqueta fases y acciones como el diseño', () => {
    expect(phaseLabel(T, 0)).toBe('Bans 1')
    expect(phaseLabel(T, 6)).toBe('Picks 1')
    expect(phaseLabel(T, 13)).toBe('Bans 2')
    expect(actionLabel(T, 13)).toBe('Ban 4')
  })
  it('reconstruye el tablero desde las acciones', () => {
    const s = buildDraftState(T, [...sixBans, { step: 6, team_side: 'blue', type: 'pick', champion_id: 'Ornn' }])
    expect(s.picks.blue).toEqual(['Ornn'])
    expect(s.current).toEqual({ side: 'red', type: 'pick' })
  })
})

describe('validación', () => {
  it('rechaza fuera de turno, campeón usado y desconocido', () => {
    expect(validateAction({ steps: T, actions: [], side: 'red', championId: 'Ahri', championIds: ids, session }).ok).toBe(false)
    expect(validateAction({ steps: T, actions: [], side: 'blue', championId: 'Nope', championIds: ids, session }).ok).toBe(false)
    const actions = [{ step: 0, team_side: 'blue', type: 'ban', champion_id: 'Ahri' }]
    expect(validateAction({ steps: T, actions, side: 'red', championId: 'Ahri', championIds: ids, session }).error).toMatch(/ya fue/)
    expect(validateAction({ steps: T, actions, side: 'red', championId: 'Azir', championIds: ids, session }).ok).toBe(true)
  })
  it('rechaza si el tiempo venció o está en pausa', () => {
    const past = { ...session, deadline_at: new Date(Date.now() - 10_000).toISOString() }
    expect(validateAction({ steps: T, actions: [], side: 'blue', championId: 'Ahri', session: past }).ok).toBe(false)
    expect(validateAction({ steps: T, actions: [], side: 'blue', championId: 'Ahri', session: { ...session, paused: true } }).ok).toBe(false)
  })
})

describe('Fearless', () => {
  const prev = [{ number: 1, blue_team: 'A', red_team: 'B', picks: { blue: ['Ahri'], red: ['Jinx'] } }]
  it('hard bloquea los picks de ambos para ambos', () => {
    expect([...fearlessLocked('hard', prev, 'A').keys()].sort()).toEqual(['Ahri', 'Jinx'])
  })
  it('soft bloquea solo lo propio', () => {
    expect([...fearlessLocked('soft', prev, 'B').keys()]).toEqual(['Jinx'])
  })
  it('un pick bloqueado se rechaza pero un ban no', () => {
    const locked = fearlessLocked('hard', prev, 'A')
    expect(validateAction({ steps: T, actions: [], side: 'blue', championId: 'Ahri', locked, session }).ok).toBe(true)
    expect(validateAction({ steps: T, actions: sixBans, side: 'blue', championId: 'Ahri', locked, session }).error).toMatch(/Fearless/)
  })
  it('al vencer el tiempo: ban vacío y pick aleatorio disponible', () => {
    expect(timeoutChoice({ steps: T, actions: [], championIds: ids }).championId).toBeNull()
    const locked = fearlessLocked('hard', prev, 'A')
    for (let k = 0; k < 20; k++) {
      const c = timeoutChoice({ steps: T, actions: sixBans, locked, championIds: ids }).championId
      expect(['Azir', 'Ornn', 'Sejuani', 'Thresh']).toContain(c)
    }
  })
})

describe('series y resultados', () => {
  const g = (w) => ({ winner_id: w, result_status: 'confirmado' })
  it('BO3 se decide con 2 victorias', () => {
    expect(seriesOutcome(3, [g('A')], 'A', 'B').done).toBe(false)
    expect(seriesOutcome(3, [g('A'), g('B'), g('A')], 'A', 'B')).toMatchObject({ done: true, winner: 'A', a: 2, b: 1 })
    expect(resultKey(3, 2, 1)).toBe('bo3_2_1')
  })
  it('BO2 1-1 es empate', () => {
    expect(seriesOutcome(2, [g('A'), g('B')], 'A', 'B')).toMatchObject({ done: true, winner: null })
  })
  it('reportes: pendiente, disputa o confirmado', () => {
    expect(resolveReports([{ team_side: 'blue', winner_claim: 'blue' }]).status).toBe('pendiente')
    expect(resolveReports([{ team_side: 'blue', winner_claim: 'blue' }, { team_side: 'red', winner_claim: 'red' }]).status).toBe('disputa')
    const ok = resolveReports([
      { team_side: 'blue', winner_claim: 'red', towers: 3, dragons: 1 },
      { team_side: 'red', winner_claim: 'red', towers: 9, dragons: 4 },
    ])
    expect(ok).toMatchObject({ status: 'confirmado', winnerSide: 'red', objectives: { red_dragons: 4, blue_towers: 3 } })
  })
  it('lados: moneda en grupos, mejor sembrado en bracket, perdedor desde la partida 2', () => {
    expect(sideDecision({ number: 1, phaseType: 'groups', teamA: 'A', teamB: 'B' }).method).toBe('coin')
    expect(sideDecision({ number: 1, phaseType: 'bracket', seedA: 3, seedB: 1, teamA: 'A', teamB: 'B' }).chooser).toBe('B')
    expect(sideDecision({ number: 2, phaseType: 'groups', previousGame: { winner_id: 'A' }, teamA: 'A', teamB: 'B' }).chooser).toBe('B')
  })
})

describe('torneo', () => {
  it('todos contra todos con 3 equipos: cada par una vez', () => {
    const pairs = roundRobin(['A', 'B', 'C']).flat().map((p) => [...p].sort().join(''))
    expect(pairs.sort()).toEqual(['AB', 'AC', 'BC'])
  })
  it('con empate en puntos desempata por dragones y luego torres', () => {
    const teams = [{ id: 'A' }, { id: 'B' }, { id: 'C' }]
    const matches = [
      { id: 1, team_a: 'A', team_b: 'B', best_of: 1, status: 'finalizado', score_a: 1, score_b: 0 },
      { id: 2, team_a: 'B', team_b: 'C', best_of: 1, status: 'finalizado', score_a: 1, score_b: 0 },
      { id: 3, team_a: 'C', team_b: 'A', best_of: 1, status: 'finalizado', score_a: 1, score_b: 0 },
    ]
    const games = [
      { match_id: 1, blue_team: 'A', red_team: 'B', blue_dragons: 1, red_dragons: 3, blue_towers: 5, red_towers: 2, result_status: 'confirmado' },
      { match_id: 2, blue_team: 'B', red_team: 'C', blue_dragons: 1, red_dragons: 1, blue_towers: 1, red_towers: 9, result_status: 'confirmado' },
      { match_id: 3, blue_team: 'C', red_team: 'A', blue_dragons: 2, red_dragons: 2, blue_towers: 1, red_towers: 1, result_status: 'confirmado' },
    ]
    // Todos 3 pts. Dragones: B 4, A 3, C 3. Torres: A 6, C 10 → C sobre A.
    expect(computeStandings({ teams, matches, games }).map((r) => r.team.id)).toEqual(['B', 'C', 'A'])
  })
  it('bracket 2 grupos × 2: 1.º A vs 2.º B y 1.º B vs 2.º A', () => {
    const [semis, final] = generateBracket([['A1', 'A2'], ['B1', 'B2']], 2, ['Grupo 1', 'Grupo 2'])
    expect(semis.map((m) => [m.a, m.b])).toEqual([['A1', 'B2'], ['B1', 'A2']])
    expect(final).toHaveLength(1)
  })
  it('bracket con 6 clasificados da byes a los mejores', () => {
    const [first] = generateBracket([['A1', 'A2', 'A3'], ['B1', 'B2', 'B3']], 3)
    expect(first.filter((m) => m.bye).map((m) => m.a)).toEqual(['A1', 'B1'])
  })
})
