// /api/match/create · coin · side · end · report
import { handler, getUser, parse, rateLimit, z, HttpError, supabaseAdmin, sha256, newToken, isAdminRole } from '../_lib/core.js'
import { roomService, resolveActor, supabaseRoomDb } from '../_lib/room.js'
import { createGame } from '../../shared/room-service.js'

const base = { matchId: z.string().uuid(), token: z.string().min(20).max(100).optional() }

async function actorFor(req, body) {
  const user = await getUser(req)
  return { user, actor: await resolveActor({ matchId: body.matchId, token: body.token, user }) }
}

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
      if (!user) throw new HttpError(401, 'Inicia sesión para crear un match')
      await rateLimit(req, 'match-create', 10, 600, user.id)
      const b = parse(createSchema, body)
      const sb = supabaseAdmin()
      const db = supabaseRoomDb()
      let match

      if (b.matchId) {
        if (!isAdminRole(user.role)) throw new HttpError(403, 'Solo el admin abre la sala de un partido del torneo')
        match = await db.match(b.matchId)
        if (!match) throw new HttpError(404, 'Partido no encontrado')
        if (!match.team_a || !match.team_b) throw new HttpError(409, 'El partido aún no tiene los dos equipos')
      } else {
        // Amistoso: lo crea un admin o un capitán (de uno de los dos equipos si están registrados).
        const { data: caps } = await sb.from('team_members').select('team_id').eq('user_id', user.id).eq('role', 'captain')
        const myTeams = new Set((caps ?? []).map((c) => c.team_id))
        if (!isAdminRole(user.role) && !myTeams.size) throw new HttpError(403, 'Solo un capitán o el admin crea matches')
        if (!isAdminRole(user.role) && b.teamA && b.teamB && !myTeams.has(b.teamA) && !myTeams.has(b.teamB))
          throw new HttpError(403, 'Tu equipo debe jugar el amistoso')
        if (!(b.teamA || b.teamAName) || !(b.teamB || b.teamBName)) throw new HttpError(400, 'Faltan los equipos')
        match = (await sb.from('matches').insert({
          team_a: b.teamA ?? null, team_b: b.teamB ?? null, team_a_name: b.teamAName ?? null, team_b_name: b.teamBName ?? null,
          best_of: b.bestOf, fearless_mode: b.fearless, pick_seconds: b.pickSeconds, side_method: b.sideMethod,
          require_login: false, created_by: user.id,
        }).select().single()).data
      }

      const games = await db.games(match.id)
      if (!games.length) await createGame(db, match, 1)
      const tokens = await issueTokens(match.id)
      await sb.from('audit_log').insert({ actor_id: user.id, action: 'match.links', entity: 'match', entity_id: match.id })
      return { matchId: match.id, tokens }
    },
  },
  coin: {
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      const { actor } = await actorFor(req, b)
      return roomService().coinToss(b.matchId, actor)
    },
  },
  side: {
    run: async ({ req, body }) => {
      const b = parse(z.object({ ...base, side: z.enum(['blue', 'red']) }), body)
      const { actor } = await actorFor(req, b)
      await roomService().chooseSide(b.matchId, actor, b.side)
    },
  },
  end: {
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      const { actor } = await actorFor(req, b)
      await roomService().endGame(b.matchId, actor)
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
      const { actor, user } = await actorFor(req, b)
      await rateLimit(req, 'report', 10, 60, user?.id)
      return roomService().report(b.matchId, actor, b)
    },
  },
})
