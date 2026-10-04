// /api/draft/state · ready · action · timeout
// El navegador nunca escribe picks/bans: todo pasa por aquí y por shared/room-service.js.
// Cada cambio responde con la sala ya actualizada, así la ventana no necesita otra petición.
import { handler, lazyUser, parse, rateLimit, z } from '../_lib/core.js'
import { roomService, resolveActor, mutate } from '../_lib/room.js'

const base = { matchId: z.string().uuid(), token: z.string().min(20).max(100).optional() }
const champion = z.string().regex(/^[A-Za-z]{2,24}$/)

export default handler({
  state: {
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      const actor = await resolveActor({ matchId: b.matchId, token: b.token, getUser: lazyUser(req) })
      return roomService().getRoom(b.matchId, actor)
    },
  },
  ready: {
    run: async ({ req, body }) => {
      const b = parse(z.object({ ...base, ready: z.boolean().default(true) }), body)
      return mutate(req, b, (svc, actor) => svc.setReady(b.matchId, actor, b.ready))
    },
  },
  action: {
    run: async ({ req, body }) => {
      const b = parse(z.object({ ...base, championId: champion }), body)
      return mutate(req, b, (svc, actor) => svc.lock(b.matchId, actor, b.championId), () => rateLimit(req, 'draft', 40, 60))
    },
  },
  timeout: {
    // Cualquier ventana de la sala puede llamarlo; el servidor confirma now() > deadline_at.
    run: async ({ req, body }) => {
      const b = parse(z.object(base), body)
      return mutate(req, b, (svc) => svc.timeout(b.matchId), () => rateLimit(req, 'timeout', 60, 60))
    },
  },
})
