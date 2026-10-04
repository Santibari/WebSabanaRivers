// Servicio de sala de draft: la lógica autoritativa de una serie.
// Recibe un adaptador de datos (`db`), así corre igual en /api (Supabase con service_role)
// y en el modo demo del navegador (almacenamiento local).
//
// Los equipos se identifican por "slot" del match: 'a' o 'b'. El lado (azul/rojo) cambia
// entre partidas, así que cada partida guarda `blue_slot`.
import {
  TOURNAMENT_TEMPLATE, DEFAULT_PICK_SECONDS, buildDraftState, validateAction, fearlessLocked,
  timeoutChoice, seriesOutcome, resolveReports, sideDecision, otherSide,
} from './draft-engine.js'

export class RoomError extends Error {
  constructor(message, status = 400) {
    super(message)
    this.status = status
  }
}

const slotSide = (game, slot) => (game.blue_slot === slot ? 'blue' : 'red')
const sideSlot = (game, side) => (side === 'blue' ? game.blue_slot : game.blue_slot === 'a' ? 'b' : 'a')

/**
 * db: adaptador (ver README · Arquitectura). opts.championIds(): Promise<Set<string>>.
 */
export function createRoomService(db, { now = () => Date.now(), random = Math.random, championIds } = {}) {
  const iso = (ms) => new Date(ms).toISOString()

  /**
   * Toda la sala en una sola lectura (`db.bundle`): match, equipos, fase, grupo, torneo, monedas
   * y cada partida con su sesión, acciones y reportes. Con Supabase es UNA consulta anidada.
   */
  async function load(matchId) {
    const b = await db.bundle(matchId)
    if (!b?.match) throw new RoomError('Match no encontrado', 404)
    const games = [...b.games].sort((x, y) => x.number - y.number)
    const game = games.at(-1) ?? null
    const session = game?.session ?? null
    return {
      ...b, games, game, session,
      actions: [...(game?.actions ?? [])].sort((x, y) => x.step - y.step),
      reports: game?.reports ?? [],
      steps: session?.steps ?? TOURNAMENT_TEMPLATE,
    }
  }

  /** Picks de las partidas cerradas, para Fearless y para la franja "ya jugados". */
  function previousGames(games, currentGame) {
    return games
      .filter((g) => !currentGame || g.id !== currentGame.id)
      .map((g) => {
        const st = buildDraftState(g.session?.steps ?? TOURNAMENT_TEMPLATE, g.actions ?? [])
        return { number: g.number, blue_team: g.blue_slot, red_team: g.blue_slot === 'a' ? 'b' : 'a', picks: st.picks, bans: st.bans }
      })
  }

  function actorSide(ctx, actor) {
    if (!ctx.game?.blue_slot) return null
    if (actor.role === 'a' || actor.role === 'b') return slotSide(ctx.game, actor.role)
    return null
  }

  function requireTeam(actor) {
    if (actor.role !== 'a' && actor.role !== 'b') throw new RoomError('Solo los capitanes pueden hacer esto', 403)
  }
  function requireAdmin(actor) {
    if (actor.role !== 'admin') throw new RoomError('Solo el admin puede hacer esto', 403)
  }

  /** Aviso a las ventanas de la sala. `patch` permite dibujar el cambio sin esperar a releer. */
  async function changed(matchId, patch = null) {
    await db.broadcast?.(matchId, { type: 'refresh', ...(patch ?? {}) })
  }

  return {
    /** Estado completo de la sala para un actor. */
    async getRoom(matchId, actor) {
      const ctx = await load(matchId)
      const { match, games, game, session, actions, steps, reports } = ctx
      const prev = previousGames(games, game)
      const isAdmin = actor.role === 'admin'
      const coin = game ? (ctx.coins ?? []).filter((c) => c.game_number === game.number).at(-1) ?? null : null
      const strip = ({ session: _s, actions: _a, reports: _r, ...g }) => g
      return {
        serverNow: now(),
        viewer: { role: actor.role, side: actorSide(ctx, actor) },
        match: {
          ...match,
          teamA: ctx.teamA ?? { name: match.team_a_name ?? 'Equipo A' },
          teamB: ctx.teamB ?? { name: match.team_b_name ?? 'Equipo B' },
          phase: ctx.phase ?? null, groupName: ctx.group?.name ?? null,
          tournament: ctx.tournament ? { name: ctx.tournament.name, slug: ctx.tournament.slug } : null,
        },
        games: games.map((g) => ({ ...strip(g), ...(prev.find((p) => p.number === g.number) ?? {}) })),
        game: game ? strip(game) : null, session, steps, actions,
        previous: prev,
        locked: {
          a: [...fearlessLocked(match.fearless_mode, prev, 'a')],
          b: [...fearlessLocked(match.fearless_mode, prev, 'b')],
        },
        coin,
        // Cada capitán ve si el otro ya reportó, pero no qué reportó (evita copiar la respuesta).
        reports: reports.map((r) => (isAdmin || r.team_side === actorSide(ctx, actor) ? r : { team_side: r.team_side })),
      }
    },

    /** Moneda del servidor: asigna azul a un equipo al azar. Solo en partidas con método 'coin'. */
    async coinToss(matchId, actor) {
      const { match, game } = await load(matchId)
      if (!game || game.status !== 'lados') throw new RoomError('Los lados ya están definidos')
      if (game.side_method !== 'coin' && actor.role !== 'admin') throw new RoomError('En esta partida no hay moneda')
      if (actor.role !== 'admin') requireTeam(actor)
      const blue = random() < 0.5 ? 'a' : 'b'
      const updated = await db.updateGame(game.id, { blue_slot: blue, status: 'sala' }, { status: 'lados' })
      if (!updated) return changed(matchId)
      await db.insertCoin?.({ match_id: match.id, game_number: game.number, winner_slot: blue, result_side: 'blue', created_at: iso(now()) })
      await changed(matchId)
      return { blue_slot: blue }
    },

    /** Elección de lado: el que decide `chooser_slot` (mejor sembrado o perdedor anterior), o manual. */
    async chooseSide(matchId, actor, side) {
      const { game } = await load(matchId)
      if (!game || game.status !== 'lados') throw new RoomError('Los lados ya están definidos')
      if (side !== 'blue' && side !== 'red') throw new RoomError('Lado inválido')
      let chooser
      if (actor.role === 'admin') chooser = game.chooser_slot ?? 'a'
      else {
        requireTeam(actor)
        if (game.side_method === 'coin') throw new RoomError('Esta partida se define con moneda')
        if (game.side_method === 'choice' && game.chooser_slot !== actor.role) throw new RoomError('Elige el otro equipo', 403)
        chooser = actor.role
      }
      const blue = side === 'blue' ? chooser : chooser === 'a' ? 'b' : 'a'
      await db.updateGame(game.id, { blue_slot: blue, status: 'sala' }, { status: 'lados' })
      await changed(matchId)
    },

    async setReady(matchId, actor, ready = true) {
      requireTeam(actor)
      const ctx = await load(matchId)
      const { game, session } = ctx
      if (!game || game.status !== 'sala' || session.status !== 'waiting') throw new RoomError('La sala no está esperando')
      const side = actorSide(ctx, actor)
      const patch = { [`${side}_ready`]: !!ready }
      const both = (side === 'blue' ? ready : session.blue_ready) && (side === 'red' ? ready : session.red_ready)
      if (both) {
        Object.assign(patch, { status: 'drafting', current_step: 0, deadline_at: iso(now() + session.pick_seconds * 1000) })
      }
      const updated = await db.updateSession(session.id, patch, { status: 'waiting' })
      if (updated && both) await db.updateGame(game.id, { status: 'draft' })
      await changed(matchId)
    },

    /** Bloquear (ban o pick) en el turno propio. */
    async lock(matchId, actor, championId) {
      requireTeam(actor)
      const ctx = await load(matchId)
      const { match, games, game, session, actions, steps } = ctx
      if (!session) throw new RoomError('No hay draft')
      const side = actorSide(ctx, actor)
      const prev = previousGames(games, game)
      const locked = fearlessLocked(match.fearless_mode, prev, actor.role)
      const ids = championIds ? await championIds() : null
      const v = validateAction({ steps, actions, side, championId, locked, championIds: ids, session, now: now() })
      if (!v.ok) throw new RoomError(v.error, 409)
      await applyAction(ctx, { step: v.step, type: v.type, side, championId, by: actor.userId ?? null })
    },

    /** Lo llama cualquier ventana cuando el contador llega a cero. Idempotente. */
    async timeout(matchId) {
      const ctx = await load(matchId)
      const { match, games, game, session, actions, steps } = ctx
      if (!session || session.status !== 'drafting' || session.paused) return { applied: false }
      if (now() <= new Date(session.deadline_at).getTime()) return { applied: false }
      const prev = previousGames(games, game)
      const st = buildDraftState(steps, actions)
      if (st.done) return { applied: false }
      const owner = sideSlot(game, st.current.side)
      const locked = fearlessLocked(match.fearless_mode, prev, owner)
      const ids = championIds ? await championIds() : new Set()
      const choice = timeoutChoice({ steps, actions, locked, championIds: ids, random })
      const ok = await applyAction(ctx, { step: choice.step, type: choice.type, side: choice.side, championId: choice.championId, by: null })
      return { applied: ok }
    },

    /** "Terminar encuentro": detiene el contador; cada capitán reporta después. */
    async endGame(matchId, actor) {
      requireTeam(actor)
      const { game } = await load(matchId)
      if (!game || game.status !== 'jugando') throw new RoomError('La partida no está en juego')
      await db.updateGame(game.id, { status: 'reporte', ended_at: iso(now()) }, { status: 'jugando' })
      await changed(matchId)
    },

    /** Reporte de un capitán: quién ganó y torres/dragones de SU equipo. */
    async report(matchId, actor, { winner, towers, dragons }) {
      requireTeam(actor)
      const ctx = await load(matchId)
      const { game } = ctx
      if (!game || !['jugando', 'reporte'].includes(game.status)) throw new RoomError('No hay partida por reportar')
      if (game.status === 'jugando') await db.updateGame(game.id, { status: 'reporte', ended_at: iso(now()) }, { status: 'jugando' })
      const side = actorSide(ctx, actor)
      await db.upsertReport({
        game_id: game.id, team_side: side, reported_by: actor.userId ?? null,
        winner_claim: winner, towers: towers | 0, dragons: dragons | 0, created_at: iso(now()),
      })
      const res = resolveReports(await db.reports(game.id))
      if (res.status === 'disputa') await db.updateGame(game.id, { result_status: 'disputa' })
      if (res.status === 'confirmado') await confirmGame(ctx.match, game, res.winnerSide, res.objectives)
      await changed(matchId)
      return res
    },

    // ——— Controles del admin ———
    async admin(matchId, actor, op, payload = {}) {
      requireAdmin(actor)
      const ctx = await load(matchId)
      const { match, game, session, actions } = ctx
      const before = { game, session }
      switch (op) {
        case 'pause':
          if (session?.status !== 'drafting' || session.paused) break
          await db.updateSession(session.id, { paused: true, remaining_ms: Math.max(0, new Date(session.deadline_at).getTime() - now()) })
          break
        case 'resume':
          if (!session?.paused) break
          await db.updateSession(session.id, { paused: false, deadline_at: iso(now() + (session.remaining_ms ?? session.pick_seconds * 1000)), remaining_ms: null })
          break
        case 'reset-timer':
          if (session?.status === 'drafting') await db.updateSession(session.id, { deadline_at: iso(now() + session.pick_seconds * 1000) })
          break
        case 'undo': {
          const last = [...actions].sort((x, y) => y.step - x.step)[0]
          if (!last) break
          await db.deleteAction(last.id)
          await db.updateSession(session.id, { status: 'drafting', current_step: last.step, deadline_at: iso(now() + session.pick_seconds * 1000) })
          if (game.status !== 'draft') await db.updateGame(game.id, { status: 'draft', started_at: null })
          break
        }
        case 'swap-sides':
          if (!game || actions.length) throw new RoomError('Solo se cambian lados antes del primer ban')
          await db.updateGame(game.id, { blue_slot: game.blue_slot === 'a' ? 'b' : 'a' })
          break
        case 'force-start':
          if (session?.status !== 'waiting' || !game.blue_slot) break
          await db.updateSession(session.id, { status: 'drafting', blue_ready: true, red_ready: true, deadline_at: iso(now() + session.pick_seconds * 1000) })
          await db.updateGame(game.id, { status: 'draft' })
          break
        case 'resolve': {
          // Resolver disputa o registrar el ganador directamente.
          const { winner, blue_towers = 0, blue_dragons = 0, red_towers = 0, red_dragons = 0 } = payload
          if (winner !== 'blue' && winner !== 'red') throw new RoomError('Ganador inválido')
          if (!game || !['jugando', 'reporte'].includes(game.status)) throw new RoomError('No hay partida por resolver')
          await confirmGame(match, game, winner, { blue_towers, blue_dragons, red_towers, red_dragons })
          break
        }
        default:
          throw new RoomError('Operación desconocida')
      }
      await db.audit?.({ actor_id: actor.userId ?? null, action: `draft.${op}`, entity: 'match', entity_id: matchId, before, after: payload })
      await changed(matchId)
    },
  }

  async function applyAction(ctx, { step, type, side, championId, by }) {
    const { game, session, steps } = ctx
    // La restricción única (session_id, step) evita acciones dobles aunque lleguen dos peticiones a la vez.
    const inserted = await db.insertAction({
      session_id: session.id, step, team_side: side, type, champion_id: championId,
      created_by: by, created_at: iso(now()),
    })
    if (!inserted) return false
    const next = step + 1
    const done = next >= steps.length
    const sessionPatch = done
      ? { current_step: next, status: 'done', deadline_at: null }
      : { current_step: next, deadline_at: iso(now() + session.pick_seconds * 1000) }
    await Promise.all([
      db.updateSession(session.id, sessionPatch),
      done ? db.updateGame(game.id, { status: 'jugando', started_at: iso(now()) }) : null,
    ])
    // La jugada viaja en el aviso: las otras ventanas la dibujan al instante y luego releen.
    await changed(game.match_id, { action: inserted, session: { id: session.id, ...sessionPatch } })
    return true
  }

  async function confirmGame(match, game, winnerSide, objectives) {
    const winnerSlot = sideSlot(game, winnerSide)
    const updated = await db.updateGame(
      game.id,
      { winner_slot: winnerSlot, result_status: 'confirmado', status: 'cerrada', ...objectives, ended_at: game.ended_at ?? iso(now()) },
      { result_status: game.result_status },
    )
    if (!updated) return
    const { games } = await db.bundle(match.id)
    const out = seriesOutcome(match.best_of, games.map((g) => ({ winner_id: g.winner_slot, result_status: g.result_status })), 'a', 'b')
    if (out.done) {
      const winnerTeam = out.winner ? match[`team_${out.winner}`] : null
      await db.updateMatch(match.id, { status: 'finalizado', score_a: out.a, score_b: out.b, winner_slot: out.winner, winner_id: winnerTeam })
      if (match.next_match_id && winnerTeam) {
        await db.updateMatch(match.next_match_id, { [`team_${match.next_slot ?? 'a'}`]: winnerTeam, [`seed_${match.next_slot ?? 'a'}`]: match[`seed_${out.winner}`] ?? null })
      }
    } else {
      await db.updateMatch(match.id, { status: 'en_curso', score_a: out.a, score_b: out.b })
      await createGame(db, match, Math.max(...games.map((g) => g.number)) + 1, { ...game, winner_slot: winnerSlot })
    }
  }
}

/**
 * Crea la partida `number` de la serie con su sesión de draft en espera.
 * Partida 1: la usa /api/match/create (y el modo demo). Siguientes: al confirmar un resultado.
 */
export async function createGame(db, match, number = 1, previous = null) {
  const phase = match.phase_id ? await db.phase(match.phase_id) : null
  const decision = sideDecision({
    number, phaseType: phase?.type ?? 'friendly', sideMethod: match.side_method,
    previousGame: previous ? { winner_id: previous.winner_slot } : null,
    seedA: match.seed_a, seedB: match.seed_b, teamA: 'a', teamB: 'b',
  })
  const game = await db.insertGame({
    match_id: match.id, number, blue_slot: null, status: 'lados', side_method: decision.method,
    chooser_slot: decision.chooser, winner_slot: null, result_status: 'pendiente',
    started_at: null, ended_at: null, blue_dragons: null, blue_towers: null, red_dragons: null, red_towers: null,
    patch: (await db.patch?.()) ?? null,
  })
  await db.insertSession({
    game_id: game.id, steps: (await db.template?.()) ?? TOURNAMENT_TEMPLATE, current_step: 0, deadline_at: null,
    paused: false, remaining_ms: null, blue_ready: false, red_ready: false, status: 'waiting',
    pick_seconds: match.pick_seconds ?? DEFAULT_PICK_SECONDS,
  })
  return game
}

export { otherSide }
