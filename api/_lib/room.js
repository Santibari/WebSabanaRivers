// Adaptador Supabase del servicio de sala + resolución de quién es quién en un match.
// Pensado para ser rápido: la sala se lee en UNA consulta anidada, los avisos de Realtime no
// frenan la respuesta y lo que casi no cambia (plantilla, tokens, membresías) se cachea por instancia.
import { createRoomService } from '../../shared/room-service.js'
import { HttpError, supabaseAdmin, sha256, isAdminRole, lazyUser } from './core.js'

const DDRAGON = 'https://ddragon.leagueoflegends.com'
let champCache = { at: 0, ids: null, version: null }

/** IDs válidos de campeón (champion.json), con caché de 6 h por instancia. */
export async function championData() {
  if (champCache.ids && Date.now() - champCache.at < 6 * 3600_000) return champCache
  const versions = await (await fetch(`${DDRAGON}/api/versions.json`)).json()
  const version = versions[0]
  const data = await (await fetch(`${DDRAGON}/cdn/${version}/data/es_MX/champion.json`)).json()
  champCache = { at: Date.now(), ids: new Set(Object.keys(data.data)), version }
  return champCache
}

/** Caché simple con vencimiento, por instancia de la función. */
function ttlCache(ms) {
  const m = new Map()
  return {
    get: (k) => {
      const hit = m.get(k)
      if (hit && hit.until > Date.now()) return hit.value
      m.delete(k)
      return undefined
    },
    set: (k, value) => (m.set(k, { value, until: Date.now() + ms }), value),
  }
}
const tokenCache = ttlCache(60_000)
const memberCache = ttlCache(60_000)
let templateCache = { at: 0, steps: null }

function one({ data, error }) {
  if (error) throw error
  return data
}

export function logoUrl(path) {
  if (!path) return null
  return supabaseAdmin().storage.from('team-logos').getPublicUrl(path).data.publicUrl
}

const withLogo = (t) => (t ? { ...t, logo_url: logoUrl(t.logo_path) } : null)
const asOne = (x) => (Array.isArray(x) ? x[0] ?? null : x ?? null)

// Avisos de Realtime pendientes: se envían en paralelo con la respuesta (ver flushBroadcasts).
const pending = new Set()
export async function flushBroadcasts() {
  await Promise.allSettled([...pending])
}

const BUNDLE = `*,
  ta:team_a(id, name, tag, logo_path), tb:team_b(id, name, tag, logo_path),
  phase:phase_id(*), grp:group_id(id, name), tour:tournament_id(id, name, slug),
  coin_tosses(*),
  games(*, draft_sessions(*, draft_actions(*)), game_reports(*))`

export function supabaseRoomDb() {
  const sb = supabaseAdmin()
  const upd = async (table, id, patch, guard) => {
    let q = sb.from(table).update(patch).eq('id', id)
    for (const [k, v] of Object.entries(guard ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v)
    return one(await q.select().maybeSingle())
  }
  const ins = async (table, row) => one(await sb.from(table).insert(row).select().single())

  return {
    bundle: async (matchId) => {
      const row = one(await sb.from('matches').select(BUNDLE).eq('id', matchId).maybeSingle())
      if (!row) return null
      const { ta, tb, phase, grp, tour, coin_tosses, games, ...match } = row
      return {
        match, teamA: withLogo(ta), teamB: withLogo(tb), phase, group: grp, tournament: tour, coins: coin_tosses ?? [],
        games: (games ?? []).map(({ draft_sessions, game_reports, ...g }) => {
          const s = asOne(draft_sessions)
          const { draft_actions, ...session } = s ?? {}
          return { ...g, session: s ? session : null, actions: draft_actions ?? [], reports: game_reports ?? [] }
        }),
      }
    },
    match: async (id) => one(await sb.from('matches').select('*').eq('id', id).maybeSingle()),
    updateMatch: (id, patch, guard) => upd('matches', id, patch, guard),
    insertGame: (row) => ins('games', row),
    updateGame: (id, patch, guard) => upd('games', id, patch, guard),
    insertSession: (row) => ins('draft_sessions', row),
    updateSession: (id, patch, guard) => upd('draft_sessions', id, patch, guard),
    insertAction: async (row) => {
      const { data, error } = await sb.from('draft_actions').insert(row).select().single()
      if (error?.code === '23505') return null // otra petición ya ocupó este paso
      if (error) throw error
      return data
    },
    deleteAction: async (id) => one(await sb.from('draft_actions').delete().eq('id', id)),
    reports: async (gameId) => one(await sb.from('game_reports').select('*').eq('game_id', gameId)),
    upsertReport: async (row) => one(await sb.from('game_reports').upsert(row, { onConflict: 'game_id,team_side' }).select().single()),
    insertCoin: (row) => ins('coin_tosses', row),
    phase: async (id) => one(await sb.from('tournament_phases').select('*').eq('id', id).maybeSingle()),
    template: async () => {
      if (templateCache.steps && Date.now() - templateCache.at < 600_000) return templateCache.steps
      const steps = (await sb.from('draft_templates').select('steps').eq('is_default', true).maybeSingle()).data?.steps ?? null
      templateCache = { at: Date.now(), steps }
      return steps
    },
    patch: async () => (await championData()).version,
    audit: async (row) => one(await sb.from('audit_log').insert(row)),
    broadcast: (matchId, msg) => {
      const p = sb.channel(`room:${matchId}`).httpSend('refresh', msg).catch(() => {}).finally(() => pending.delete(p))
      pending.add(p)
    },
  }
}

export function roomService() {
  return createRoomService(supabaseRoomDb(), { championIds: async () => (await championData()).ids })
}

async function isMember(teamId, userId) {
  const key = `${teamId}:${userId}`
  const hit = memberCache.get(key)
  if (hit !== undefined) return hit
  const { data } = await supabaseAdmin().from('team_members').select('user_id').eq('team_id', teamId).eq('user_id', userId).maybeSingle()
  return memberCache.set(key, !!data)
}

/**
 * Quién actúa en la sala. `getUser` es perezoso: solo se verifica la sesión cuando hace falta.
 *  - token del enlace (prioridad; un admin puede abrir el enlace de un capitán) → 'a' | 'b' | 'admin'
 *    En torneos oficiales (require_login) el capitán además debe tener sesión y ser del equipo.
 *  - sin token: admin con sesión → 'admin'; miembro de uno de los equipos → su slot
 */
export async function resolveActor({ matchId, token, getUser }) {
  const sb = supabaseAdmin()
  if (token) {
    const key = `${matchId}:${sha256(token)}`
    let info = tokenCache.get(key)
    if (!info) {
      const [tok, match] = await Promise.all([
        sb.from('match_tokens').select('role, expires_at').eq('match_id', matchId).eq('token_hash', sha256(token)).maybeSingle().then(one),
        sb.from('matches').select('team_a, team_b, require_login, tournament_id').eq('id', matchId).maybeSingle().then(one),
      ])
      if (!match) throw new HttpError(404, 'Match no encontrado')
      if (!tok || new Date(tok.expires_at) < new Date()) throw new HttpError(403, 'Enlace inválido o vencido')
      info = tokenCache.set(key, { role: tok.role, match })
    }
    const { role, match } = info
    if (role === 'admin') return { role: 'admin', userId: null }
    const teamId = match[`team_${role}`]
    if (match.require_login && match.tournament_id && teamId) {
      const user = await getUser()
      if (!user) throw new HttpError(401, 'Inicia sesión con la cuenta de tu equipo para jugar este match')
      if (!isAdminRole(user.role) && !(await isMember(teamId, user.id))) throw new HttpError(403, 'Tu cuenta no pertenece a este equipo')
      return { role, userId: user.id }
    }
    return { role, userId: null }
  }

  const user = await getUser()
  if (user && isAdminRole(user.role)) return { role: 'admin', userId: user.id }
  if (user) {
    const match = one(await sb.from('matches').select('team_a, team_b').eq('id', matchId).maybeSingle())
    if (!match) throw new HttpError(404, 'Match no encontrado')
    const { data } = await sb.from('team_members').select('team_id').eq('user_id', user.id).in('team_id', [match.team_a, match.team_b].filter(Boolean))
    if (data?.[0]) return { role: data[0].team_id === match.team_a ? 'a' : 'b', userId: user.id }
  }
  throw new HttpError(403, 'Necesitas el enlace de tu equipo para entrar a esta sala')
}

/** Resuelve el actor, ejecuta el cambio y devuelve la sala nueva mientras salen los avisos de Realtime. */
export async function mutate(req, b, fn, limit) {
  const getUser = lazyUser(req)
  const [actor] = await Promise.all([resolveActor({ matchId: b.matchId, token: b.token, getUser }), limit?.()])
  const svc = roomService()
  const result = await fn(svc, actor)
  const [room] = await Promise.all([svc.getRoom(b.matchId, actor), flushBroadcasts()])
  return { ...(result && typeof result === 'object' ? { result } : {}), room }
}

