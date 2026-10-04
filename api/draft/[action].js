// /api/draft/state · ready · action · timeout
// El navegador nunca escribe picks/bans: todo pasa por aquí y por shared/room-service.js.
import { handler, getUser, parse, rateLimit, z } from '../_lib/core.js'
import { roomService, resolveActor } from '../_lib/room.js'

const base = { matchId: z.string().uuid(), token: z.string().min(20).max(100).optional() }
const champion = z.string().regex(/^[A-Za-z]{2,24}$/)

async function actorFor(req, body) {
  const user = await getUser(req)
  const actor = await resolveActor({ matchId: body.matchId, token: body.token, user })
  return { user, actor }
}

export default handler({
  state: {
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      const { actor } = await actorFor(req, b)
      return roomService().getRoom(b.matchId, actor)
    },
  },
  ready: {
    run: async ({ req, body }) => {
      const b = parse(z.object({ ...base, ready: z.boolean().default(true) }), body)
      const { actor } = await actorFor(req, b)
      await roomService().setReady(b.matchId, actor, b.ready)
    },
  },
  action: {
    run: async ({ req, body }) => {
      const b = parse(z.object({ ...base, championId: champion }), body)
      const { actor, user } = await actorFor(req, b)
      await rateLimit(req, 'draft', 30, 60, user?.id)
      await roomService().lock(b.matchId, actor, b.championId)
    },
  },
  timeout: {
    // Cualquier ventana de la sala puede llamarlo; el servidor confirma now() > deadline_at.
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      await actorFor(req, b)
      await rateLimit(req, 'timeout', 60, 60)
      return roomService().timeout(b.matchId)
    },
  },
})
