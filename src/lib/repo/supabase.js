// Implementación real: lecturas con supabase-js (protegidas por RLS) y escrituras delicadas por /api.
// La sala del draft se sincroniza con Supabase Realtime: Broadcast (refrescos y hover) + Presence (conectados).
import { createClient } from '@supabase/supabase-js'
import { computeStandings } from '../../../shared/standings.js'

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)

const fail = (message, status = 400) => {
  const e = new Error(message)
  e.status = status
  throw e
}
const one = ({ data, error }) => {
  if (error) fail(error.message)
  return data
}
const publicUrl = (bucket, path) => (path ? sb.storage.from(bucket).getPublicUrl(path).data.publicUrl : null)
const teamView = (t) => (t ? { id: t.id, name: t.name, tag: t.tag, status: t.status, logo_url: publicUrl('team-logos', t.logo_path) } : null)

async function api(path, body) {
  const { data } = await sb.auth.getSession()
  const res = await fetch(`/api/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(data.session ? { Authorization: `Bearer ${data.session.access_token}` } : {}) },
    body: JSON.stringify(body ?? {}),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) fail(json.error ?? 'Error de red', res.status)
  return json
}

async function profile() {
  const { data } = await sb.auth.getUser()
  if (!data.user) return null
  const p = (await sb.from('profiles').select('*').eq('id', data.user.id).maybeSingle()).data
  return { id: data.user.id, email: data.user.email, username: p?.username, role: p?.role ?? 'user' }
}

async function scoringFor(tournamentId) {
  const rows = one(await sb.from('scoring_rules').select('*').eq('tournament_id', tournamentId))
  return Object.fromEntries(rows.map((r) => [r.result_key, { winner: r.points_winner, loser: r.points_loser }]))
}

async function tournamentDetail(t) {
  const [phases, groups, tts, matches, games, scoring] = await Promise.all([
    sb.from('tournament_phases').select('*').eq('tournament_id', t.id).order('position').then(one),
    sb.from('groups').select('*').eq('tournament_id', t.id).order('position').then(one),
    sb.from('tournament_teams').select('*, teams(*)').eq('tournament_id', t.id).then(one),
    sb.from('matches').select('*, ta:team_a(*), tb:team_b(*)').eq('tournament_id', t.id).order('scheduled_at').then(one),
    sb.from('games').select('*, matches!inner(tournament_id, team_a, team_b)').eq('matches.tournament_id', t.id).then(one),
    scoringFor(t.id),
  ])
  const ms = matches.map(({ ta, tb, ...m }) => ({ ...m, teamA: teamView(ta), teamB: teamView(tb) }))
  const gs = games.map(({ matches: m, ...g }) => ({
    ...g, blue_team: g.blue_slot === 'a' ? m.team_a : m.team_b, red_team: g.blue_slot === 'a' ? m.team_b : m.team_a,
  }))
  return {
    tournament: { ...t, image_url: publicUrl('tournament-assets', t.image_path), teamsCount: tts.filter((x) => x.status === 'aprobado').length },
    phases,
    scoring,
    matches: ms,
    groups: groups.map((g) => {
      const teams = tts.filter((x) => x.group_id === g.id && x.status === 'aprobado').map((x) => teamView(x.teams))
      const gm = ms.filter((m) => m.group_id === g.id)
      return { ...g, standings: computeStandings({ teams, matches: gm, games: gs, scoring }) }
    }),
  }
}

export const supabaseRepo = {
  mode: 'supabase',

  auth: {
    current: profile,
    onChange: (cb) => {
      const { data } = sb.auth.onAuthStateChange(async () => cb(await profile()))
      return () => data.subscription.unsubscribe()
    },
    signIn: async (email, password) => {
      one(await sb.auth.signInWithPassword({ email, password }))
      return profile()
    },
    signUp: async (email, password, username) => {
      const data = one(await sb.auth.signUp({ email, password, options: { data: { username }, emailRedirectTo: `${location.origin}/equipo` } }))
      return { user: data.user, needsConfirmation: !data.session }
    },
    signOut: async () => void (await sb.auth.signOut()),
  },

  // ───── Contenido ─────
  getPage: async (slug, { all = false } = {}) => {
    const page = one(await sb.from('pages').select('id').eq('slug', slug).maybeSingle())
    if (!page) return []
    let q = sb.from('page_blocks').select('*').eq('page_id', page.id).order('position')
    if (!all) q = q.eq('status', 'publicado').eq('visible', true)
    return one(await q).map((b) => (all && b.draft_content ? { ...b, content: b.draft_content } : b))
  },
  savePage: async (slug, blocks) => {
    const page = one(await sb.from('pages').select('id').eq('slug', slug).single())
    const existing = one(await sb.from('page_blocks').select('id').eq('page_id', page.id)).map((b) => b.id)
    const keep = new Set(blocks.filter((b) => b.id && !b.id.startsWith('new-')).map((b) => b.id))
    const removed = existing.filter((id) => !keep.has(id))
    if (removed.length) one(await sb.from('page_blocks').delete().in('id', removed))
    for (const [i, b] of blocks.entries()) {
      const row = {
        page_id: page.id, type: b.type, position: i, visible: b.visible, status: b.status,
        content: b.status === 'publicado' ? b.content : b.published_content ?? b.content,
        draft_content: b.status === 'publicado' ? null : b.content, updated_at: new Date().toISOString(),
      }
      if (keep.has(b.id)) one(await sb.from('page_blocks').update(row).eq('id', b.id))
      else one(await sb.from('page_blocks').insert(row))
    }
    const u = await profile()
    await sb.from('audit_log').insert({ actor_id: u.id, action: 'page.update', entity: 'page', entity_id: slug })
  },
  listEvents: async ({ upcoming = true, limit = 50 } = {}) => {
    let q = sb.from('events').select('*').eq('published', true).order('starts_at').limit(limit)
    if (upcoming) q = q.gte('starts_at', new Date(Date.now() - 6 * 3600_000).toISOString())
    return one(await q)
  },
  allEvents: async () => one(await sb.from('events').select('*').order('starts_at')),
  saveEvent: async (ev) => {
    const { id, ...row } = ev
    if (id) one(await sb.from('events').update(row).eq('id', id))
    else one(await sb.from('events').insert(row))
  },
  deleteEvent: async (id) => one(await sb.from('events').delete().eq('id', id)),

  // ───── Torneos ─────
  listTournaments: async () => {
    const rows = one(await sb.from('tournaments').select('*, tournament_teams(status)').order('starts_at', { ascending: false }))
    return rows.map(({ tournament_teams, ...t }) => ({ ...t, teamsCount: tournament_teams.filter((x) => x.status === 'aprobado').length }))
  },
  getTournament: async (slug) => {
    const t = one(await sb.from('tournaments').select('*').eq('slug', slug).maybeSingle())
    return t ? tournamentDetail(t) : null
  },
  activeTournaments: async () => {
    const rows = one(await sb.from('tournaments').select('*').eq('status', 'activo').eq('show_on_home', true))
    return Promise.all(rows.map(tournamentDetail))
  },
  createTournament: async (data) => {
    const t = one(await sb.from('tournaments').insert(data.tournament).select().single())
    for (const [i, p] of data.phases.entries()) {
      const ph = one(await sb.from('tournament_phases').insert({ ...p, tournament_id: t.id, position: i }).select().single())
      if (p.type === 'groups') {
        const rows = Array.from({ length: p.groups_count ?? 1 }, (_, g) => ({ tournament_id: t.id, phase_id: ph.id, name: `Grupo ${g + 1}`, position: g }))
        one(await sb.from('groups').insert(rows))
      }
    }
    await api('admin/scoring', { tournamentId: t.id, rules: data.scoring })
    return t
  },
  updateTournament: async (id, patch) => one(await sb.from('tournaments').update(patch).eq('id', id)),
  saveScoring: (tournamentId, rules) => api('admin/scoring', { tournamentId, rules }),
  registrations: async (tournamentId) =>
    one(await sb.from('tournament_teams').select('*, teams(*)').eq('tournament_id', tournamentId)).map(({ teams, ...tt }) => ({ ...tt, team: teamView(teams) })),
  setRegistration: async (tournamentId, teamId, patch) =>
    one(await sb.from('tournament_teams').update(patch).eq('tournament_id', tournamentId).eq('team_id', teamId)),
  generateSchedule: (phaseId) => api('admin/schedule', { phaseId }),
  generateBracket: (phaseId) => api('admin/bracket', { phaseId }),
  updateMatch: async (id, patch) => one(await sb.from('matches').update(patch).eq('id', id)),

  // ───── Equipos ─────
  listTeams: async () => one(await sb.from('teams').select('*').order('name')).map(teamView),
  myTeams: async () => {
    const u = await profile()
    if (!u) return []
    const mine = one(await sb.from('team_members').select('team_id, role').eq('user_id', u.id))
    return Promise.all(mine.map(async (tm) => {
      const t = one(await sb.from('teams').select('*').eq('id', tm.team_id).single())
      const members = one(await sb.from('team_members').select('*').eq('team_id', tm.team_id))
      const registrations = one(await sb.from('tournament_teams').select('*, tournament:tournaments(*)').eq('team_id', tm.team_id))
      return { ...teamView(t), myRole: tm.role, members, registrations }
    }))
  },
  createTeam: async ({ name, tag }) => {
    const u = await profile()
    return one(await sb.from('teams').insert({ name: name.trim(), tag: tag.toUpperCase(), captain_id: u.id }).select().single())
  },
  uploadLogo: async (teamId, file) => {
    if (file.size > 2 * 1024 * 1024) fail('Máximo 2 MB')
    const dataUrl = await new Promise((resolve, reject) => {
      const r = new FileReader()
      r.onload = () => resolve(r.result)
      r.onerror = reject
      r.readAsDataURL(file)
    })
    return api('teams/logo', { teamId, dataUrl })
  },
  removeLogo: async (teamId) => one(await sb.from('teams').update({ logo_path: null }).eq('id', teamId)),
  createInvite: (teamId) => api('teams/invite', { teamId }),
  joinTeam: (code) => api('teams/join', { code }),
  requestRegistration: async (tournamentId, teamId) => {
    const t = one(await sb.from('tournaments').select('max_teams').eq('id', tournamentId).single())
    const { count } = await sb.from('tournament_teams').select('*', { count: 'exact', head: true }).eq('tournament_id', tournamentId).eq('status', 'aprobado')
    one(await sb.from('tournament_teams').insert({ tournament_id: tournamentId, team_id: teamId, status: count >= t.max_teams ? 'lista_espera' : 'pendiente' }))
  },

  // ───── Usuarios y auditoría ─────
  listUsers: async () => one(await sb.from('profiles').select('*').order('created_at')),
  setUserRole: async (id, role) => one(await sb.from('profiles').update({ role }).eq('id', id)),
  listAudit: async () => one(await sb.from('audit_log').select('*').order('created_at', { ascending: false }).limit(300)),
  settings: async () => Object.fromEntries(one(await sb.from('settings').select('*')).map((r) => [r.key, r.value])),

  // ───── Draft ─────
  createMatch: (payload) => api('match/create', payload),
  getRoom: (matchId, token) => api('draft/state', { matchId, token }),
  roomCall: (op, matchId, token, extra = {}) => {
    const path = { ready: 'draft/ready', lock: 'draft/action', timeout: 'draft/timeout', coin: 'match/coin', side: 'match/side', end: 'match/end', report: 'match/report' }[op]
    return api(path, { matchId, token, ...extra })
  },
  adminDraft: (matchId, op, payload) => api('admin/draft', { matchId, op, payload }),
  listLiveMatches: async () => {
    const rows = one(await sb.from('matches').select('*, ta:team_a(*), tb:team_b(*), games(*)').order('created_at', { ascending: false }).limit(50))
    return rows.filter((m) => m.games.length).map(({ ta, tb, games, ...m }) => {
      const sorted = games.sort((a, b) => a.number - b.number)
      return { ...m, teamA: teamView(ta) ?? { name: m.team_a_name }, teamB: teamView(tb) ?? { name: m.team_b_name }, game: sorted.at(-1), gamesCount: sorted.length }
    })
  },

  subscribeRoom(matchId, { onRefresh, onHover, onPresence, role }) {
    const ch = sb.channel(`room:${matchId}`, { config: { presence: { key: `${role}-${Math.random().toString(36).slice(2)}` } } })
    ch.on('broadcast', { event: 'refresh' }, () => onRefresh?.())
      .on('broadcast', { event: 'hover' }, ({ payload }) => onHover?.(payload))
      .on('presence', { event: 'sync' }, () => {
        const out = { a: 0, b: 0, admin: 0, total: 0 }
        for (const metas of Object.values(ch.presenceState())) {
          for (const m of metas) (out[m.role] = (out[m.role] ?? 0) + 1), out.total++
        }
        onPresence?.(out)
      })
      .subscribe((status) => status === 'SUBSCRIBED' && ch.track({ role }))
    return {
      sendHover: (side, championId) => ch.send({ type: 'broadcast', event: 'hover', payload: { side, championId } }),
      close: () => sb.removeChannel(ch),
    }
  },

  subscribeAll(cb) {
    const ch = sb.channel('public-updates')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'matches' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'games' }, cb)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_teams' }, cb)
      .subscribe()
    return () => sb.removeChannel(ch)
  },
}
