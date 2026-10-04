// Adaptador Supabase del servicio de sala + resolución de quién es quién en un match.
import { createRoomService } from '../../shared/room-service.js'
import { HttpError, supabaseAdmin, sha256, isAdminRole } from './core.js'

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

function one({ data, error }) {
  if (error) throw error
  return data
}

export function logoUrl(path) {
  if (!path) return null
  return supabaseAdmin().storage.from('team-logos').getPublicUrl(path).data.publicUrl
}

export function supabaseRoomDb() {
  const sb = supabaseAdmin()
  const upd = async (table, id, patch, guard) => {
    let q = sb.from(table).update(patch).eq('id', id)
    for (const [k, v] of Object.entries(guard ?? {})) q = v === null ? q.is(k, null) : q.eq(k, v)
    return one(await q.select().maybeSingle())
  }
  const ins = async (table, row) => one(await sb.from(table).insert(row).select().single())

  return {
    match: async (id) => one(await sb.from('matches').select('*').eq('id', id).maybeSingle()),
    updateMatch: (id, patch, guard) => upd('matches', id, patch, guard),
    games: async (matchId) => one(await sb.from('games').select('*').eq('match_id', matchId)),
    insertGame: (row) => ins('games', row),
    updateGame: (id, patch, guard) => upd('games', id, patch, guard),
    session: async (gameId) => one(await sb.from('draft_sessions').select('*').eq('game_id', gameId).maybeSingle()),
    insertSession: (row) => ins('draft_sessions', row),
    updateSession: (id, patch, guard) => upd('draft_sessions', id, patch, guard),
    actions: async (sessionId) => one(await sb.from('draft_actions').select('*').eq('session_id', sessionId)),
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
    coin: async (matchId, n) =>
      one(await sb.from('coin_tosses').select('*').eq('match_id', matchId).eq('game_number', n).order('created_at', { ascending: false }).limit(1).maybeSingle()),
    teams: async (ids) => {
      const real = ids.filter(Boolean)
      const rows = real.length ? one(await sb.from('teams').select('id, name, tag, logo_path').in('id', real)) : []
      return ids.map((id) => {
        const t = rows.find((r) => r.id === id)
        return t ? { ...t, logo_url: logoUrl(t.logo_path) } : null
      })
    },
    phase: async (id) => one(await sb.from('tournament_phases').select('*').eq('id', id).maybeSingle()),
    group: async (id) => one(await sb.from('groups').select('*').eq('id', id).maybeSingle()),
    tournament: async (id) => one(await sb.from('tournaments').select('id, name, slug').eq('id', id).maybeSingle()),
    template: async () => (await sb.from('draft_templates').select('steps').eq('is_default', true).maybeSingle()).data?.steps ?? null,
    patch: async () => (await championData()).version,
    audit: async (row) => one(await sb.from('audit_log').insert(row)),
    broadcast: async (matchId, msg) => {
      await sb.channel(`room:${matchId}`).httpSend('refresh', msg).catch(() => {})
    },
  }
}

export function roomService() {
  return createRoomService(supabaseRoomDb(), { championIds: async () => (await championData()).ids })
}

/**
 * Quién actúa en la sala:
 *  - token del enlace (tiene prioridad: un admin puede abrir el enlace de un capitán) → hash en match_tokens → 'a' | 'b' | 'admin'
 *  - admin/superadmin con sesión y sin token → 'admin'
 *    En torneos oficiales (require_login), además debe ser miembro de ese equipo.
 *  - miembro de uno de los equipos sin token → su slot
 */
export async function resolveActor({ matchId, token, user }) {
  const sb = supabaseAdmin()
  if (!token && user && isAdminRole(user.role)) return { role: 'admin', userId: user.id }
  const match = one(await sb.from('matches').select('id, team_a, team_b, require_login, tournament_id, status').eq('id', matchId).maybeSingle())
  if (!match) throw new HttpError(404, 'Match no encontrado')

  if (token) {
    const row = one(
      await sb.from('match_tokens').select('role, expires_at').eq('match_id', matchId).eq('token_hash', sha256(token)).maybeSingle(),
    )
    if (!row || new Date(row.expires_at) < new Date()) throw new HttpError(403, 'Enlace inválido o vencido')
    if (row.role === 'admin') return { role: 'admin', userId: user?.id ?? null }
    const teamId = match[`team_${row.role}`]
    if (match.require_login && match.tournament_id && teamId && !isAdminRole(user?.role)) {
      if (!user) throw new HttpError(401, 'Inicia sesión con la cuenta de tu equipo para jugar este match')
      const member = one(await sb.from('team_members').select('user_id').eq('team_id', teamId).eq('user_id', user.id).maybeSingle())
      if (!member) throw new HttpError(403, 'Tu cuenta no pertenece a este equipo')
    }
    return { role: row.role, userId: user?.id ?? null }
  }

  if (user) {
    const { data } = await sb.from('team_members').select('team_id').eq('user_id', user.id).in('team_id', [match.team_a, match.team_b].filter(Boolean))
    if (data?.[0]) return { role: data[0].team_id === match.team_a ? 'a' : 'b', userId: user.id }
  }
  throw new HttpError(403, 'Necesitas el enlace de tu equipo para entrar a esta sala')
}
