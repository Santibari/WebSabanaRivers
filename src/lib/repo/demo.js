// MODO DEMO: toda la app funciona sin backend.
// - Datos en localStorage; la sesión es por pestaña (sessionStorage) para jugar azul y rojo en dos ventanas.
// - La lógica del draft es la MISMA que usa /api (shared/room-service.js).
// - Las pestañas se sincronizan con BroadcastChannel (equivalente local de Supabase Realtime).
import { createRoomService, createGame } from '../../../shared/room-service.js'
import { createMemoryDb } from '../../../shared/memory-db.js'
import { computeStandings, generateBracket, roundName } from '../../../shared/standings.js'
import { roundRobin } from '../../../shared/draft-engine.js'
import { loadChampions } from '../ddragon.js'
import { demoSeed } from './demo-data.js'

const KEY = 'sr-demo-v1'
const SESSION_KEY = 'sr-demo-session'
const tabId = Math.random().toString(36).slice(2)
const channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sr-demo') : null
const listeners = new Set()

const uid = (p = 'id') => `${p}-${crypto.randomUUID().slice(0, 8)}`
const fail = (message, status = 400) => {
  const e = new Error(message)
  e.status = status
  throw e
}

function read() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY) ?? 'null')
    if (s?.version === 1) return s
  } catch {}
  const seed = demoSeed()
  localStorage.setItem(KEY, JSON.stringify(seed))
  return seed
}

function emit(msg) {
  for (const l of listeners) l(msg)
  channel?.postMessage(msg)
}
channel?.addEventListener('message', (e) => {
  for (const l of listeners) l(e.data)
})

function write(store, matchId = null) {
  localStorage.setItem(KEY, JSON.stringify(store))
  emit({ type: 'store', matchId })
}

/** Lee el almacén, aplica `fn` y guarda. Cada mutación parte del estado más reciente (otras pestañas). */
async function mutate(fn, matchId) {
  const store = read()
  const out = await fn(store)
  write(store, matchId)
  return out
}

function audit(store, action, entity, entity_id, after) {
  store.audit.unshift({ id: uid('a'), actor_id: currentUser()?.id ?? null, action, entity, entity_id, after, created_at: new Date().toISOString() })
  store.audit = store.audit.slice(0, 300)
}

// ───────────── Sesión ─────────────
function currentUser() {
  try {
    const id = sessionStorage.getItem(SESSION_KEY)
    return id ? read().profiles.find((p) => p.id === id) ?? null : null
  } catch {
    return null
  }
}
const authListeners = new Set()
const setSession = (id) => {
  if (id) sessionStorage.setItem(SESSION_KEY, id)
  else sessionStorage.removeItem(SESSION_KEY)
  for (const l of authListeners) l(currentUser())
}
const isAdmin = (u) => u && ['admin', 'superadmin'].includes(u.role)
const isEditor = (u) => u && ['admin', 'superadmin', 'editor'].includes(u.role)
function requireUser() {
  const u = currentUser()
  if (!u) fail('Inicia sesión', 401)
  return u
}
function requireAdmin() {
  const u = requireUser()
  if (!isAdmin(u)) fail('Solo admin', 403)
  return u
}

// ───────────── Lecturas compartidas ─────────────
const teamView = (store, id) => {
  const t = store.teams.find((x) => x.id === id)
  return t ? { id: t.id, name: t.name, tag: t.tag, logo_url: t.logo_url, status: t.status } : null
}

function gamesWithTeams(store, matchIds) {
  return store.games
    .filter((g) => matchIds.has(g.match_id))
    .map((g) => {
      const m = store.matches.find((x) => x.id === g.match_id)
      const blue = g.blue_slot === 'a' ? m.team_a : m.team_b
      const red = g.blue_slot === 'a' ? m.team_b : m.team_a
      return { ...g, blue_team: blue, red_team: red }
    })
}

function tournamentDetail(store, t) {
  const phases = store.phases.filter((p) => p.tournament_id === t.id).sort((a, b) => a.position - b.position)
  const matches = store.matches
    .filter((m) => m.tournament_id === t.id)
    .map((m) => ({ ...m, teamA: teamView(store, m.team_a), teamB: teamView(store, m.team_b) }))
  const scoring = store.scoring_rules[t.id]
  const groups = store.groups
    .filter((g) => g.tournament_id === t.id)
    .sort((a, b) => a.position - b.position)
    .map((g) => {
      const teams = store.tournament_teams
        .filter((tt) => tt.group_id === g.id && tt.status === 'aprobado')
        .map((tt) => teamView(store, tt.team_id))
        .filter(Boolean)
      const gm = matches.filter((m) => m.group_id === g.id)
      const games = gamesWithTeams(store, new Set(gm.map((m) => m.id)))
      return { ...g, standings: computeStandings({ teams, matches: gm, games, scoring }) }
    })
  const registered = store.tournament_teams.filter((tt) => tt.tournament_id === t.id && tt.status === 'aprobado').length
  return { tournament: { ...t, teamsCount: registered }, phases, groups, matches, scoring }
}

// ───────────── Sala del draft ─────────────
async function room(fn, matchId, { readOnly = false } = {}) {
  const store = read()
  const db = createMemoryDb(store)
  const { byId } = await loadChampions()
  const svc = createRoomService(db, { championIds: async () => new Set(Object.keys(byId)) })
  const out = await fn(svc, store, db)
  if (!readOnly) write(store, matchId)
  return out
}

function resolveActor(store, matchId, token) {
  const match = store.matches.find((m) => m.id === matchId)
  if (!match) fail('Match no encontrado', 404)
  const user = currentUser()
  if (token) {
    const row = store.match_tokens.find((t) => t.match_id === matchId && t.token === token)
    if (!row) fail('Enlace inválido o vencido', 403)
    return { role: row.role, userId: user?.id ?? null }
  }
  if (isAdmin(user)) return { role: 'admin', userId: user.id }
  if (user) {
    const mine = store.team_members.filter((tm) => tm.user_id === user.id).map((tm) => tm.team_id)
    if (mine.includes(match.team_a)) return { role: 'a', userId: user.id }
    if (mine.includes(match.team_b)) return { role: 'b', userId: user.id }
  }
  fail('Necesitas el enlace de tu equipo para entrar a esta sala', 403)
}

const newToken = () => Array.from(crypto.getRandomValues(new Uint8Array(24)), (b) => b.toString(16).padStart(2, '0')).join('')

async function resizeToDataUrl(file, size = 256) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) fail('Solo PNG, JPG o WEBP')
  if (file.size > 2 * 1024 * 1024) fail('Máximo 2 MB')
  const bmp = await createImageBitmap(file)
  const c = document.createElement('canvas')
  c.width = c.height = size
  const s = Math.min(bmp.width, bmp.height)
  c.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size)
  return c.toDataURL('image/webp', 0.85)
}

export const demoRepo = {
  mode: 'demo',

  auth: {
    current: async () => currentUser(),
    onChange: (cb) => (authListeners.add(cb), () => authListeners.delete(cb)),
    signIn: async (email) => {
      const u = read().profiles.find((p) => p.email.toLowerCase() === email.trim().toLowerCase())
      if (!u) fail('No existe una cuenta con ese correo')
      setSession(u.id)
      return u
    },
    signUp: async (email, _password, username) => {
      const u = await mutate((s) => {
        if (s.profiles.some((p) => p.email.toLowerCase() === email.toLowerCase())) fail('Ese correo ya tiene cuenta')
        const p = { id: uid('u'), email: email.trim(), username: username?.trim() || email.split('@')[0], role: 'user' }
        s.profiles.push(p)
        return p
      })
      setSession(u.id)
      return { user: u, needsConfirmation: false }
    },
    signOut: async () => setSession(null),
    demoUsers: () => read().profiles,
    signInAs: async (id) => setSession(id),
    resetDemo: async () => {
      localStorage.removeItem(KEY)
      write(read())
      setSession(null)
    },
  },

  // ───── Contenido ─────
  getPage: async (slug, { all = false } = {}) => {
    const blocks = read().pages[slug] ?? []
    return blocks.filter((b) => all || (b.visible && b.status === 'publicado')).sort((a, b) => a.position - b.position)
  },
  savePage: async (slug, blocks) => {
    const u = requireUser()
    if (!isEditor(u)) fail('Solo editores', 403)
    await mutate((s) => {
      s.pages[slug] = blocks.map((b, i) => ({ ...b, id: b.id ?? uid('b'), position: i }))
      audit(s, 'page.update', 'page', slug)
    })
  },
  listEvents: async ({ upcoming = true, limit = 50 } = {}) => {
    const now = Date.now() - 6 * 3600_000
    return read().events
      .filter((e) => e.published && (!upcoming || !e.starts_at || new Date(e.starts_at).getTime() >= now))
      .sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? ''))
      .slice(0, limit)
  },
  allEvents: async () => [...read().events].sort((a, b) => (a.starts_at ?? '').localeCompare(b.starts_at ?? '')),
  saveEvent: async (ev) => {
    const u = requireUser()
    if (!isEditor(u)) fail('Solo editores', 403)
    await mutate((s) => {
      if (ev.id) Object.assign(s.events.find((e) => e.id === ev.id), ev)
      else s.events.push({ ...ev, id: uid('ev'), published: ev.published ?? true })
      audit(s, 'event.save', 'event', ev.id ?? 'nuevo', ev)
    })
  },
  deleteEvent: async (id) => {
    requireUser()
    await mutate((s) => {
      s.events = s.events.filter((e) => e.id !== id)
      audit(s, 'event.delete', 'event', id)
    })
  },

  // ───── Torneos ─────
  listTournaments: async () => {
    const s = read()
    const admin = isAdmin(currentUser())
    return s.tournaments.filter((t) => admin || t.status !== 'borrador').map((t) => tournamentDetail(s, t).tournament)
  },
  getTournament: async (slug) => {
    const s = read()
    const t = s.tournaments.find((x) => x.slug === slug)
    if (!t || (t.status === 'borrador' && !isAdmin(currentUser()))) return null
    return tournamentDetail(s, t)
  },
  activeTournaments: async () => {
    const s = read()
    return s.tournaments.filter((t) => t.status === 'activo' && t.show_on_home).map((t) => tournamentDetail(s, t))
  },
  createTournament: async (data) => {
    requireAdmin()
    return mutate((s) => {
      if (s.tournaments.some((t) => t.slug === data.tournament.slug)) fail('Ya existe un torneo con ese slug')
      const max = Math.min(data.tournament.max_teams, s.settings.max_teams_global)
      const t = { ...data.tournament, id: uid('tor'), max_teams: max }
      s.tournaments.push(t)
      data.phases.forEach((p, i) => {
        const ph = { ...p, id: uid('ph'), tournament_id: t.id, position: i, status: 'pendiente' }
        s.phases.push(ph)
        if (p.type === 'groups')
          for (let g = 0; g < (p.groups_count ?? 1); g++)
            s.groups.push({ id: uid('g'), tournament_id: t.id, phase_id: ph.id, name: `Grupo ${g + 1}`, position: g })
      })
      s.scoring_rules[t.id] = data.scoring
      audit(s, 'tournament.create', 'tournament', t.id, { name: t.name })
      return t
    })
  },
  updateTournament: async (id, patch) => {
    requireAdmin()
    await mutate((s) => {
      Object.assign(s.tournaments.find((t) => t.id === id), patch)
      audit(s, 'tournament.update', 'tournament', id, patch)
    })
  },
  saveScoring: async (tournamentId, rules) => {
    requireAdmin()
    await mutate((s) => {
      audit(s, 'scoring.update', 'tournament', tournamentId, rules)
      s.scoring_rules[tournamentId] = rules
    })
  },
  registrations: async (tournamentId) => {
    const s = read()
    return s.tournament_teams
      .filter((tt) => tt.tournament_id === tournamentId)
      .map((tt) => ({ ...tt, team: teamView(s, tt.team_id) }))
  },
  setRegistration: async (tournamentId, teamId, patch) => {
    requireAdmin()
    await mutate((s) => {
      const tt = s.tournament_teams.find((x) => x.tournament_id === tournamentId && x.team_id === teamId)
      if (patch.status === 'aprobado') {
        const t = s.tournaments.find((x) => x.id === tournamentId)
        const approved = s.tournament_teams.filter((x) => x.tournament_id === tournamentId && x.status === 'aprobado' && x.team_id !== teamId).length
        if (approved >= t.max_teams) fail(`El torneo ya tiene ${t.max_teams} equipos`)
      }
      Object.assign(tt, patch)
      audit(s, 'registration.update', 'team', teamId, patch)
    })
  },
  generateSchedule: async (phaseId) => {
    requireAdmin()
    return mutate((s) => {
      const phase = s.phases.find((p) => p.id === phaseId)
      const t = s.tournaments.find((x) => x.id === phase.tournament_id)
      if (s.matches.some((m) => m.phase_id === phaseId)) fail('Esta fase ya tiene calendario')
      let n = 0
      for (const g of s.groups.filter((x) => x.phase_id === phaseId)) {
        const ids = s.tournament_teams.filter((tt) => tt.group_id === g.id && tt.status === 'aprobado').map((tt) => tt.team_id)
        roundRobin(ids, phase.double_round).forEach((pairs, r) =>
          pairs.forEach(([a, b]) => {
            n++
            s.matches.push({
              id: uid('m'), tournament_id: t.id, phase_id: phaseId, group_id: g.id, team_a: a, team_b: b,
              best_of: phase.best_of, fearless_mode: t.fearless_mode, pick_seconds: t.pick_seconds, side_method: 'auto',
              require_login: true, scheduled_at: null, status: 'programado', score_a: 0, score_b: 0, round: r + 1,
            })
          }),
        )
      }
      phase.status = 'en_curso'
      audit(s, 'phase.schedule', 'tournament_phase', phaseId, { matches: n })
      return { created: n }
    })
  },
  generateBracket: async (phaseId) => {
    requireAdmin()
    return mutate((s) => {
      const phase = s.phases.find((p) => p.id === phaseId)
      if (s.matches.some((m) => m.phase_id === phaseId)) fail('El bracket ya existe')
      const t = s.tournaments.find((x) => x.id === phase.tournament_id)
      const prev = s.phases.filter((p) => p.tournament_id === t.id && p.type === 'groups' && p.position < phase.position).at(-1)
      if (!prev) fail('No hay fase de grupos previa')
      const detail = tournamentDetail(s, t)
      const groups = detail.groups.filter((g) => g.phase_id === prev.id)
      const rounds = generateBracket(groups.map((g) => g.standings.map((r) => r.team.id)), prev.qualifiers_per_group ?? 2, groups.map((g) => g.name))
      let nextIds = []
      const created = []
      for (let r = rounds.length - 1; r >= 0; r--) {
        const bestOf = phase.config?.rounds?.[roundName(rounds[r].length)] ?? phase.best_of
        nextIds = rounds[r].map((m, i) => {
          const row = {
            id: uid('m'), tournament_id: t.id, phase_id: phaseId, group_id: null, best_of: bestOf,
            fearless_mode: t.fearless_mode, pick_seconds: t.pick_seconds, side_method: 'auto', require_login: true,
            team_a: m.a, team_b: m.b, seed_a: m.seedA, seed_b: m.seedB, label_a: m.labelA, label_b: m.labelB,
            round: r + 1, bracket_position: i, next_match_id: nextIds[Math.floor(i / 2)] ?? null, next_slot: i % 2 ? 'b' : 'a',
            status: 'programado', score_a: 0, score_b: 0, scheduled_at: null,
          }
          s.matches.push(row)
          created.push({ ...row, bye: m.bye })
          return row.id
        })
      }
      // Byes: el equipo pasa directo a la siguiente llave.
      for (const c of created.filter((x) => x.bye && x.next_match_id)) {
        const row = s.matches.find((x) => x.id === c.id)
        const slot = row.team_a ? 'a' : 'b'
        Object.assign(row, { status: 'finalizado', winner_slot: slot, winner_id: row[`team_${slot}`] })
        const next = s.matches.find((x) => x.id === row.next_match_id)
        Object.assign(next, { [`team_${row.next_slot}`]: row[`team_${slot}`], [`seed_${row.next_slot}`]: row[`seed_${slot}`] })
      }
      prev.status = 'finalizada'
      phase.status = 'en_curso'
      audit(s, 'phase.bracket', 'tournament_phase', phaseId, { matches: created.length })
      return { created: created.length }
    })
  },
  updateMatch: async (id, patch) => {
    requireAdmin()
    await mutate((s) => {
      Object.assign(s.matches.find((m) => m.id === id), patch)
      audit(s, 'match.update', 'match', id, patch)
    })
  },

  // ───── Equipos ─────
  listTeams: async () => read().teams.map((t) => ({ ...teamView(read(), t.id), captain_id: t.captain_id })),
  myTeams: async () => {
    const u = currentUser()
    if (!u) return []
    const s = read()
    return s.team_members
      .filter((tm) => tm.user_id === u.id)
      .map((tm) => ({
        ...teamView(s, tm.team_id),
        myRole: tm.role,
        members: s.team_members.filter((x) => x.team_id === tm.team_id).map((x) => ({ ...x, profile: s.profiles.find((p) => p.id === x.user_id) })),
        registrations: s.tournament_teams.filter((tt) => tt.team_id === tm.team_id).map((tt) => ({ ...tt, tournament: s.tournaments.find((t) => t.id === tt.tournament_id) })),
      }))
  },
  createTeam: async ({ name, tag }) => {
    const u = requireUser()
    return mutate((s) => {
      if (!/^[A-Za-z0-9]{2,5}$/.test(tag)) fail('El tag tiene de 2 a 5 letras o números')
      if (s.teams.some((t) => t.name.toLowerCase() === name.trim().toLowerCase())) fail('Ya existe un equipo con ese nombre')
      if (s.teams.some((t) => t.tag.toUpperCase() === tag.toUpperCase())) fail('Ese tag ya está en uso')
      const t = { id: uid('t'), name: name.trim(), tag: tag.toUpperCase(), logo_url: null, captain_id: u.id, status: 'activo' }
      s.teams.push(t)
      s.team_members.push({ team_id: t.id, user_id: u.id, role: 'captain' })
      return t
    })
  },
  uploadLogo: async (teamId, file) => {
    const u = requireUser()
    const dataUrl = await resizeToDataUrl(file)
    await mutate((s) => {
      const cap = s.team_members.find((tm) => tm.team_id === teamId && tm.user_id === u.id && tm.role === 'captain')
      if (!cap && !isAdmin(u)) fail('Solo el capitán o un admin', 403)
      s.teams.find((t) => t.id === teamId).logo_url = dataUrl
      audit(s, 'team.logo', 'team', teamId)
    })
  },
  removeLogo: async (teamId) => {
    requireAdmin()
    await mutate((s) => {
      s.teams.find((t) => t.id === teamId).logo_url = null
      audit(s, 'team.logo.remove', 'team', teamId)
    })
  },
  createInvite: async (teamId) => {
    requireUser()
    return mutate((s) => {
      const code = Math.random().toString(36).slice(2, 10).toUpperCase()
      s.team_invites.push({ team_id: teamId, code, expires_at: new Date(Date.now() + 7 * 86400_000).toISOString() })
      return { code, expiresInDays: 7 }
    })
  },
  joinTeam: async (code) => {
    const u = requireUser()
    return mutate((s) => {
      const inv = s.team_invites.find((i) => i.code === code.trim().toUpperCase() && new Date(i.expires_at) > new Date())
      if (!inv) fail('Código inválido o vencido')
      if (!s.team_members.some((tm) => tm.team_id === inv.team_id && tm.user_id === u.id))
        s.team_members.push({ team_id: inv.team_id, user_id: u.id, role: 'player' })
      return { teamId: inv.team_id }
    })
  },
  requestRegistration: async (tournamentId, teamId) => {
    requireUser()
    await mutate((s) => {
      if (s.tournament_teams.some((tt) => tt.tournament_id === tournamentId && tt.team_id === teamId)) fail('El equipo ya está inscrito')
      const t = s.tournaments.find((x) => x.id === tournamentId)
      const approved = s.tournament_teams.filter((tt) => tt.tournament_id === tournamentId && tt.status === 'aprobado').length
      const full = approved >= t.max_teams
      s.tournament_teams.push({
        tournament_id: tournamentId, team_id: teamId, group_id: null, seed: null,
        status: full ? 'lista_espera' : t.approval_mode === 'auto' ? 'aprobado' : 'pendiente',
      })
    })
  },

  // ───── Usuarios y auditoría (admin) ─────
  listUsers: async () => (requireAdmin(), read().profiles),
  setUserRole: async (id, role) => {
    const u = requireAdmin()
    if (u.role !== 'superadmin') fail('Solo el superadmin cambia roles', 403)
    await mutate((s) => {
      s.profiles.find((p) => p.id === id).role = role
      audit(s, 'user.role', 'profile', id, { role })
    })
  },
  listAudit: async () => (requireAdmin(), read().audit),
  profileNames: async (ids) => Object.fromEntries(read().profiles.filter((p) => ids.includes(p.id)).map((p) => [p.id, p.username])),
  settings: async () => read().settings,

  // ───── Draft ─────
  createMatch: async (payload) => {
    const u = currentUser()
    if (payload.matchId || payload.teamA || payload.teamB) requireUser()
    return mutate(async (s) => {
      let match
      if (payload.matchId) {
        if (!isAdmin(u)) fail('Solo el admin abre la sala de un partido del torneo', 403)
        match = s.matches.find((m) => m.id === payload.matchId)
        if (!match?.team_a || !match?.team_b) fail('El partido aún no tiene los dos equipos')
      } else {
        // Draft libre: cualquiera puede crearlo sin cuenta; con cuenta se pueden usar equipos registrados.
        match = {
          id: uid('m'), tournament_id: null, phase_id: null, group_id: null,
          team_a: payload.teamA ?? null, team_b: payload.teamB ?? null,
          team_a_name: payload.teamAName ?? null, team_b_name: payload.teamBName ?? null,
          best_of: payload.bestOf, fearless_mode: payload.fearless, pick_seconds: payload.pickSeconds,
          side_method: payload.sideMethod, require_login: false, status: 'programado', score_a: 0, score_b: 0,
          created_by: u?.id ?? null, created_at: new Date().toISOString(),
        }
        s.matches.push(match)
      }
      const db = createMemoryDb(s)
      if (!s.games.some((g) => g.match_id === match.id)) await createGame(db, match, 1)
      s.match_tokens = s.match_tokens.filter((t) => t.match_id !== match.id)
      const tokens = { a: newToken(), b: newToken(), admin: newToken() }
      for (const [role, token] of Object.entries(tokens)) s.match_tokens.push({ match_id: match.id, role, token })
      audit(s, 'match.links', 'match', match.id)
      return { matchId: match.id, tokens }
    })
  },
  getRoom: async (matchId, token) =>
    room(async (svc, store) => svc.getRoom(matchId, resolveActor(store, matchId, token)), matchId, { readOnly: true }),
  // Igual que /api: cada cambio devuelve { result, room } con la sala ya actualizada.
  roomCall: async (op, matchId, token, extra = {}) =>
    room(async (svc, store) => {
      const actor = resolveActor(store, matchId, token)
      const run = {
        ready: () => svc.setReady(matchId, actor, extra.ready ?? true),
        lock: () => svc.lock(matchId, actor, extra.championId),
        timeout: () => svc.timeout(matchId),
        coin: () => svc.coinToss(matchId, actor),
        side: () => svc.chooseSide(matchId, actor, extra.side),
        end: () => svc.endGame(matchId, actor),
        report: () => svc.report(matchId, actor, extra),
      }[op]
      if (!run) fail('Operación desconocida')
      const result = await run()
      return { result, room: await svc.getRoom(matchId, actor) }
    }, matchId),
  adminDraft: async (matchId, op, payload, token) =>
    room(async (svc, store) => {
      const actor = token ? resolveActor(store, matchId, token) : { role: isAdmin(currentUser()) ? 'admin' : 'none', userId: currentUser()?.id }
      await svc.admin(matchId, actor, op, payload)
      return { room: await svc.getRoom(matchId, actor) }
    }, matchId),
  listLiveMatches: async () => {
    const s = read()
    return s.matches
      .filter((m) => s.games.some((g) => g.match_id === m.id))
      .map((m) => {
        const games = s.games.filter((g) => g.match_id === m.id).sort((a, b) => a.number - b.number)
        return { ...m, teamA: teamView(s, m.team_a) ?? { name: m.team_a_name }, teamB: teamView(s, m.team_b) ?? { name: m.team_b_name }, game: games.at(-1), gamesCount: games.length }
      })
      .sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''))
  },

  /** Sincronización de la sala: refrescos, hover efímero y conectados (Presence). */
  subscribeRoom(matchId, { onRefresh, onHover, onPresence, role }) {
    const seen = new Map()
    const handler = (msg) => {
      if (msg.type === 'store' && (!msg.matchId || msg.matchId === matchId)) onRefresh?.()
      if (msg.matchId !== matchId) return
      if (msg.type === 'hover') onHover?.(msg)
      if (msg.type === 'presence') {
        seen.set(msg.tabId, { role: msg.role, at: Date.now() })
        onPresence?.(countPresence(seen))
      }
    }
    listeners.add(handler)
    const beat = () => {
      seen.set(tabId, { role, at: Date.now() })
      channel?.postMessage({ type: 'presence', matchId, role, tabId })
      onPresence?.(countPresence(seen))
    }
    beat()
    const iv = setInterval(beat, 2500)
    return {
      sendHover: (side, championId) => emit({ type: 'hover', matchId, side, championId }),
      sendPatch: () => {}, // en el demo el aviso 'store' ya llega al instante a las otras pestañas
      close: () => {
        clearInterval(iv)
        listeners.delete(handler)
      },
    }
  },

  /** Cambios de cualquier dato (para refrescar listas). */
  subscribeAll(cb) {
    const h = (msg) => msg.type === 'store' && cb()
    listeners.add(h)
    return () => listeners.delete(h)
  },
}

function countPresence(seen) {
  const now = Date.now()
  const out = { a: 0, b: 0, admin: 0, total: 0 }
  for (const [k, v] of seen) {
    if (now - v.at > 7000) {
      seen.delete(k)
      continue
    }
    out[v.role] = (out[v.role] ?? 0) + 1
    out.total++
  }
  return out
}
