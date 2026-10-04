// /api/admin/draft · schedule · bracket · scoring — solo admin/superadmin. Todo queda en audit_log.
import { handler, parse, requireRole, z, HttpError, supabaseAdmin } from '../_lib/core.js'
import { mutate } from '../_lib/room.js'
import { roundRobin } from '../../shared/draft-engine.js'
import { generateBracket, roundName } from '../../shared/standings.js'

const ADMINS = ['admin', 'superadmin']
const one = ({ data, error }) => {
  if (error) throw error
  return data
}

async function audit(user, action, entity, entityId, after) {
  await supabaseAdmin().from('audit_log').insert({ actor_id: user.id, action, entity, entity_id: entityId, after })
}

export default handler({
  draft: {
    // Pausar, reanudar, deshacer, reiniciar tiempo, cambiar lados, forzar inicio, resolver disputa.
    // Sirve con sesión de admin o con el enlace de admin de la sala (drafts libres sin cuenta).
    run: async ({ req, body }) => {
      const b = parse(z.object({
        matchId: z.string().uuid(),
        token: z.string().min(20).max(100).optional(),
        op: z.enum(['pause', 'resume', 'undo', 'reset-timer', 'swap-sides', 'force-start', 'resolve']),
        payload: z.object({
          winner: z.enum(['blue', 'red']).optional(),
          blue_towers: z.number().int().min(0).max(11).optional(),
          blue_dragons: z.number().int().min(0).max(20).optional(),
          red_towers: z.number().int().min(0).max(11).optional(),
          red_dragons: z.number().int().min(0).max(20).optional(),
        }).default({}),
      }), body)
      return mutate(req, b, (svc, actor) => svc.admin(b.matchId, actor, b.op, b.payload))
    },
  },

  schedule: {
    // Genera el calendario todos contra todos de cada grupo de una fase.
    run: async ({ req, body }) => {
      const user = await requireRole(req, ADMINS)
      const { phaseId } = parse(z.object({ phaseId: z.string().uuid() }), body)
      const sb = supabaseAdmin()
      const phase = one(await sb.from('tournament_phases').select('*, tournaments(*)').eq('id', phaseId).single())
      if (phase.type !== 'groups') throw new HttpError(400, 'La fase no es de grupos')
      const existing = one(await sb.from('matches').select('id').eq('phase_id', phaseId).limit(1))
      if (existing.length) throw new HttpError(409, 'Esta fase ya tiene calendario')
      const groups = one(await sb.from('groups').select('id, name').eq('phase_id', phaseId).order('position'))
      const rows = []
      for (const g of groups) {
        const teams = one(await sb.from('tournament_teams').select('team_id').eq('group_id', g.id).eq('status', 'aprobado'))
        roundRobin(teams.map((t) => t.team_id), phase.double_round).forEach((pairs, round) =>
          pairs.forEach(([a, b]) => rows.push({
            tournament_id: phase.tournament_id, phase_id: phase.id, group_id: g.id, team_a: a, team_b: b,
            best_of: phase.best_of, fearless_mode: phase.tournaments.fearless_mode,
            pick_seconds: phase.tournaments.pick_seconds, round: round + 1, created_by: user.id,
          })))
      }
      if (rows.length) one(await sb.from('matches').insert(rows))
      await sb.from('tournament_phases').update({ status: 'en_curso' }).eq('id', phaseId)
      await audit(user, 'phase.schedule', 'tournament_phase', phaseId, { matches: rows.length })
      return { created: rows.length }
    },
  },

  bracket: {
    // Toma los clasificados de la fase de grupos anterior y crea las llaves (1.º A vs 2.º B, 1.º B vs 2.º A…).
    run: async ({ req, body }) => {
      const user = await requireRole(req, ADMINS)
      const { phaseId } = parse(z.object({ phaseId: z.string().uuid() }), body)
      const sb = supabaseAdmin()
      const phase = one(await sb.from('tournament_phases').select('*, tournaments(*)').eq('id', phaseId).single())
      if (phase.type !== 'bracket') throw new HttpError(400, 'La fase no es eliminatoria')
      if (one(await sb.from('matches').select('id').eq('phase_id', phaseId).limit(1)).length)
        throw new HttpError(409, 'El bracket ya existe')
      const prev = one(await sb.from('tournament_phases').select('*')
        .eq('tournament_id', phase.tournament_id).eq('type', 'groups').lt('position', phase.position)
        .order('position', { ascending: false }).limit(1).maybeSingle())
      if (!prev) throw new HttpError(400, 'No hay fase de grupos previa')
      const groups = one(await sb.from('groups').select('id, name').eq('phase_id', prev.id).order('position'))
      const table = one(await sb.from('standings').select('*').in('group_id', groups.map((g) => g.id)).order('position'))
      const ordered = groups.map((g) => table.filter((r) => r.group_id === g.id).map((r) => r.team_id))
      const rounds = generateBracket(ordered, prev.qualifiers_per_group ?? 2, groups.map((g) => g.name))

      // Se insertan de la final hacia atrás para conocer next_match_id.
      const created = []
      let nextIds = []
      for (let r = rounds.length - 1; r >= 0; r--) {
        const name = roundName(rounds[r].length)
        const bestOf = phase.config?.rounds?.[name] ?? phase.best_of
        const ids = []
        for (let i = 0; i < rounds[r].length; i++) {
          const m = rounds[r][i]
          const next = nextIds[Math.floor(i / 2)] ?? null
          const row = one(await sb.from('matches').insert({
            tournament_id: phase.tournament_id, phase_id: phase.id, best_of: bestOf,
            fearless_mode: phase.tournaments.fearless_mode, pick_seconds: phase.tournaments.pick_seconds,
            team_a: m.a, team_b: m.b, seed_a: m.seedA, seed_b: m.seedB, label_a: m.labelA, label_b: m.labelB,
            round: r + 1, bracket_position: i, next_match_id: next, next_slot: i % 2 ? 'b' : 'a', created_by: user.id,
          }).select('id').single())
          ids.push(row.id)
          created.push({ ...m, id: row.id, next, slot: i % 2 ? 'b' : 'a' })
        }
        nextIds = ids
      }
      // Byes: el equipo pasa directo a la siguiente llave.
      for (const m of created.filter((c) => c.bye && c.next)) {
        const team = m.a ?? m.b
        const seed = m.a ? m.seedA : m.seedB
        await sb.from('matches').update({ status: 'finalizado', winner_id: team, winner_slot: m.a ? 'a' : 'b' }).eq('id', m.id)
        await sb.from('matches').update({ [`team_${m.slot}`]: team, [`seed_${m.slot}`]: seed }).eq('id', m.next)
      }
      await sb.from('tournament_phases').update({ status: 'finalizada' }).eq('id', prev.id)
      await sb.from('tournament_phases').update({ status: 'en_curso' }).eq('id', phaseId)
      await audit(user, 'phase.bracket', 'tournament_phase', phaseId, { matches: created.length })
      return { created: created.length }
    },
  },

  scoring: {
    run: async ({ req, body }) => {
      const user = await requireRole(req, ADMINS)
      const b = parse(z.object({
        tournamentId: z.string().uuid(),
        rules: z.record(z.string().regex(/^(bo\d_\d_\d|draw)$/), z.object({ winner: z.number().int().min(0).max(10), loser: z.number().int().min(0).max(10) })),
      }), body)
      const sb = supabaseAdmin()
      const before = one(await sb.from('scoring_rules').select('*').eq('tournament_id', b.tournamentId))
      one(await sb.from('scoring_rules').upsert(Object.entries(b.rules).map(([result_key, r]) => ({
        tournament_id: b.tournamentId, result_key, points_winner: r.winner, points_loser: r.loser,
      }))))
      await sb.from('audit_log').insert({ actor_id: user.id, action: 'scoring.update', entity: 'tournament', entity_id: b.tournamentId, before, after: b.rules })
    },
  },
})
