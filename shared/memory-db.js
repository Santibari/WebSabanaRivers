// Adaptador de datos en memoria para el servicio de sala.
// Lo usan el modo demo (persistido en localStorage) y las pruebas.
// Las "guardas" imitan un UPDATE … WHERE: si la fila ya cambió, no se aplica y devuelve null.

const uid = () =>
  globalThis.crypto?.randomUUID?.() ?? `id-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`

export const emptyStore = () => ({
  tournaments: [], phases: [], groups: [], teams: [], matches: [], games: [], sessions: [],
  actions: [], reports: [], coins: [], audit: [],
})

const matches = (row, guard) => !guard || Object.entries(guard).every(([k, v]) => row[k] === v)

export function createMemoryDb(store, { onChange, broadcast } = {}) {
  const save = () => onChange?.(store)
  const update = (table, id, patch, guard) => {
    const row = store[table].find((r) => r.id === id)
    if (!row || !matches(row, guard)) return null
    Object.assign(row, patch)
    save()
    return { ...row }
  }
  const insert = (table, row) => {
    const r = { id: uid(), ...row }
    store[table].push(r)
    save()
    return { ...r }
  }
  const clone = (x) => (x ? structuredClone(x) : x ?? null)

  return {
    store,
    match: async (id) => clone(store.matches.find((m) => m.id === id)),
    updateMatch: async (id, patch, guard) => update('matches', id, patch, guard),
    games: async (matchId) => clone(store.games.filter((g) => g.match_id === matchId)),
    insertGame: async (row) => insert('games', row),
    updateGame: async (id, patch, guard) => update('games', id, patch, guard),
    session: async (gameId) => clone(store.sessions.find((s) => s.game_id === gameId)),
    insertSession: async (row) => insert('sessions', row),
    updateSession: async (id, patch, guard) => update('sessions', id, patch, guard),
    actions: async (sessionId) => clone(store.actions.filter((a) => a.session_id === sessionId)),
    insertAction: async (row) => {
      if (store.actions.some((a) => a.session_id === row.session_id && a.step === row.step)) return null
      return insert('actions', row)
    },
    deleteAction: async (id) => {
      store.actions = store.actions.filter((a) => a.id !== id)
      save()
    },
    reports: async (gameId) => clone(store.reports.filter((r) => r.game_id === gameId)),
    upsertReport: async (row) => {
      store.reports = store.reports.filter((r) => !(r.game_id === row.game_id && r.team_side === row.team_side))
      return insert('reports', row)
    },
    insertCoin: async (row) => insert('coins', row),
    coin: async (matchId, n) => clone(store.coins.findLast((c) => c.match_id === matchId && c.game_number === n)),
    teams: async (ids) => ids.map((id) => clone(store.teams.find((t) => t.id === id)) ?? null),
    phase: async (id) => clone(store.phases.find((p) => p.id === id)),
    group: async (id) => clone(store.groups.find((g) => g.id === id)),
    tournament: async (id) => clone(store.tournaments.find((t) => t.id === id)),
    audit: async (row) => insert('audit', { ...row, created_at: new Date().toISOString() }),
    broadcast: async (matchId, msg) => broadcast?.(matchId, msg),
  }
}
