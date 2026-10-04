// /api/match/create · coin · side · end · report
import { handler, getUser, parse, rateLimit, z, HttpError, supabaseAdmin, sha256, newToken, isAdminRole } from '../_lib/core.js'
import { supabaseRoomDb, mutate } from '../_lib/room.js'
import { createGame } from '../../shared/room-service.js'

const base = { matchId: z.string().uuid(), token: z.string().min(20).max(100).optional() }

/** Genera enlaces nuevos (solo se guarda el hash). Invalida los anteriores. */
async function issueTokens(matchId) {
  const sb = supabaseAdmin()
  await sb.from('match_tokens').delete().eq('match_id', matchId)
  const tokens = { a: newToken(), b: newToken(), admin: newToken() }
  const { error } = await sb.from('match_tokens').insert(
    Object.entries(tokens).map(([role, t]) => ({ match_id: matchId, role, token_hash: sha256(t) })),
  )
  if (error) throw error
  return tokens
}

const createSchema = z.union([
  z.object({ matchId: z.string().uuid() }), // partido del torneo ya programado
  z.object({
    teamA: z.string().uuid().optional(),
    teamB: z.string().uuid().optional(),
    teamAName: z.string().trim().min(2).max(40).optional(),
    teamBName: z.string().trim().min(2).max(40).optional(),
    bestOf: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(5)]).default(3),
    fearless: z.enum(['hard', 'soft', 'off']).default('hard'),
    pickSeconds: z.number().int().min(10).max(120).default(30),
    sideMethod: z.enum(['auto', 'manual']).default('auto'),
  }),
])

export default handler({
  create: {
    run: async ({ req, body }) => {
      const user = await getUser(req)
      const b = parse(createSchema, body)
      const sb = supabaseAdmin()
      const db = supabaseRoomDb()
      let match

      if (b.matchId) {
        if (!isAdminRole(user?.role)) throw new HttpError(403, 'Solo el admin abre la sala de un partido del torneo')
        match = await db.match(b.matchId)
        if (!match) throw new HttpError(404, 'Partido no encontrado')
        if (!match.team_a || !match.team_b) throw new HttpError(409, 'El partido aún no tiene los dos equipos')
      } else {
        // Amistoso / draft libre: cualquiera puede crearlo, sin cuenta. Con cuenta se pueden usar equipos registrados.
        await rateLimit(req, 'match-create', user ? 15 : 6, 600, user?.id)
        if ((b.teamA || b.teamB) && !user) throw new HttpError(401, 'Inicia sesión para usar equipos registrados')
        if (user && !isAdminRole(user.role) && (b.teamA || b.teamB)) {
          const { data: caps } = await sb.from('team_members').select('team_id').eq('user_id', user.id).eq('role', 'captain')
          const mine = new Set((caps ?? []).map((c) => c.team_id))
          if (!mine.has(b.teamA) && !mine.has(b.teamB)) throw new HttpError(403, 'Tu equipo debe jugar el amistoso')
        }
        if (!(b.teamA || b.teamAName) || !(b.teamB || b.teamBName)) throw new HttpError(400, 'Faltan los nombres de los equipos')
        const { data, error } = await sb.from('matches').insert({
          team_a: b.teamA ?? null, team_b: b.teamB ?? null, team_a_name: b.teamAName ?? null, team_b_name: b.teamBName ?? null,
          best_of: b.bestOf, fearless_mode: b.fearless, pick_seconds: b.pickSeconds, side_method: b.sideMethod,
          require_login: false, created_by: user?.id ?? null,
        }).select().single()
        if (error) throw error
        match = data
      }

      const bundle = await db.bundle(match.id)
      if (!bundle.games.length) await createGame(db, match, 1)
      const tokens = await issueTokens(match.id)
      if (user) await sb.from('audit_log').insert({ actor_id: user.id, action: 'match.links', entity: 'match', entity_id: match.id })
      return { matchId: match.id, tokens }
    },
  },
  coin: {
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      return mutate(req, b, (svc, actor) => svc.coinToss(b.matchId, actor))
    },
  },
  side: {
    run: async ({ req, body }) => {
      const b = parse(z.object({ ...base, side: z.enum(['blue', 'red']) }), body)
      return mutate(req, b, (svc, actor) => svc.chooseSide(b.matchId, actor, b.side))
    },
  },
  end: {
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      return mutate(req, b, (svc, actor) => svc.endGame(b.matchId, actor))
    },
  },
  report: {
    // Cada capitán: quién ganó y cuántas torres/dragones consiguió SU equipo.
    run: async ({ req, body }) => {
      const b = parse(z.object({
        ...base,
        winner: z.enum(['blue', 'red']),
        towers: z.number().int().min(0).max(11),
        dragons: z.number().int().min(0).max(20),
      }), body)
      return mutate(req, b, (svc, actor) => svc.report(b.matchId, actor, b), () => rateLimit(req, 'report', 10, 60))
    },
  },
})
