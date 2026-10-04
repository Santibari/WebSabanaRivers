import { describe, it, expect } from 'vitest'
import { createRoomService, createGame } from '../room-service.js'
import { createMemoryDb, emptyStore } from '../memory-db.js'
import { TOURNAMENT_TEMPLATE } from '../draft-engine.js'

const CHAMPS = Array.from({ length: 40 }, (_, i) => `C${i}`)

function setup({ bestOf = 3, fearless = 'hard', phaseType = 'groups' } = {}) {
  const store = emptyStore()
  store.teams.push({ id: 'T1', name: 'Noctua Owls Gold' }, { id: 'T2', name: 'Wolves UR' })
  store.phases.push({ id: 'P1', type: phaseType })
  store.matches.push({
    id: 'M1', team_a: 'T1', team_b: 'T2', best_of: bestOf, fearless_mode: fearless, pick_seconds: 30,
    side_method: 'auto', phase_id: 'P1', status: 'programado', seed_a: 2, seed_b: 1,
  })
  let t = 1_000_000
  const clock = { now: () => t, tick: (ms) => (t += ms) }
  const db = createMemoryDb(store)
  let r = 0
  const svc = createRoomService(db, { now: clock.now, random: () => (r++ % 7) / 7, championIds: async () => new Set(CHAMPS) })
  return { store, db, svc, clock }
}

const A = { role: 'a', userId: 'u1' }
const B = { role: 'b', userId: 'u2' }
const ADMIN = { role: 'admin', userId: 'adm' }

async function playDraft(svc, champsFor) {
  const room = await svc.getRoom('M1', A)
  const blueActor = room.game.blue_slot === 'a' ? A : B
  const redActor = blueActor === A ? B : A
  await svc.setReady('M1', A)
  await svc.setReady('M1', B)
  for (let i = 0; i < TOURNAMENT_TEMPLATE.length; i++) {
    const step = TOURNAMENT_TEMPLATE[i]
    await svc.lock('M1', step.side === 'blue' ? blueActor : redActor, champsFor(i))
  }
  return { blueActor, redActor }
}

describe('serie completa', () => {
  it('moneda → listo → 20 acciones → reportes → partida 2 con Fearless', async () => {
    const { db, svc, store } = setup()
    await createGame(db, store.matches[0], 1)

    let room = await svc.getRoom('M1', A)
    expect(room.game.status).toBe('lados')
    expect(room.game.side_method).toBe('coin')
    await expect(svc.lock('M1', A, 'C1')).rejects.toThrow()

    await svc.coinToss('M1', A)
    room = await svc.getRoom('M1', A)
    expect(room.game.status).toBe('sala')

    const { blueActor, redActor } = await playDraft(svc, (i) => `C${i}`)
    room = await svc.getRoom('M1', A)
    expect(room.game.status).toBe('jugando')
    expect(room.session.status).toBe('done')

    await svc.endGame('M1', A)
    await svc.report('M1', blueActor, { winner: 'blue', towers: 9, dragons: 3 })
    room = await svc.getRoom('M1', redActor)
    expect(room.reports[0]).not.toHaveProperty('winner_claim') // no se filtra el reporte del otro
    const res = await svc.report('M1', redActor, { winner: 'blue', towers: 2, dragons: 1 })
    expect(res.status).toBe('confirmado')

    room = await svc.getRoom('M1', A)
    expect(room.games).toHaveLength(2)
    expect(room.game.number).toBe(2)
    // El perdedor de la partida 1 elige lado en la 2
    expect(room.game.side_method).toBe('choice')
    expect(room.game.chooser_slot).toBe(redActor.role)
    // Hard Fearless: los 10 picks de la partida 1 quedan bloqueados para ambos
    expect(room.locked.a).toHaveLength(10)
    expect(room.locked.b).toHaveLength(10)
    expect(store.games[0]).toMatchObject({ blue_towers: 9, red_dragons: 1, winner_slot: blueActor.role })
  })

  it('rechaza un pick bloqueado por Fearless en la partida 2', async () => {
    const { db, svc, store } = setup()
    await createGame(db, store.matches[0], 1)
    await svc.coinToss('M1', A)
    const { blueActor, redActor } = await playDraft(svc, (i) => `C${i}`)
    await svc.report('M1', blueActor, { winner: 'red', towers: 1, dragons: 0 })
    await svc.report('M1', redActor, { winner: 'red', towers: 8, dragons: 4 })
    const loser = blueActor
    await svc.chooseSide('M1', loser, 'blue')
    await svc.setReady('M1', A)
    await svc.setReady('M1', B)
    for (let i = 0; i < 6; i++) await svc.lock('M1', i % 2 ? (loser === A ? B : A) : loser, `C${20 + i}`)
    // C6 fue pick en la partida 1
    await expect(svc.lock('M1', loser, 'C6')).rejects.toThrow(/Fearless/)
    // Un ban sí puede repetir un campeón que fue baneado antes (los bans no se arrastran)
  })

  it('disputa cuando los capitanes no coinciden y el admin la resuelve', async () => {
    const { db, svc, store } = setup({ bestOf: 1 })
    await createGame(db, store.matches[0], 1)
    await svc.coinToss('M1', B)
    const { blueActor, redActor } = await playDraft(svc, (i) => `C${i}`)
    await svc.report('M1', blueActor, { winner: 'blue', towers: 5, dragons: 2 })
    expect((await svc.report('M1', redActor, { winner: 'red', towers: 5, dragons: 2 })).status).toBe('disputa')
    await svc.admin('M1', ADMIN, 'resolve', { winner: 'red', red_towers: 7 })
    expect(store.matches[0]).toMatchObject({ status: 'finalizado', winner_id: store.matches[0][`team_${redActor.role}`] })
    expect(store.audit).toHaveLength(1)
  })

  it('timeout: idempotente, ban vacío en bans y nada antes del plazo', async () => {
    const { db, svc, store, clock } = setup()
    await createGame(db, store.matches[0], 1)
    await svc.coinToss('M1', A)
    await svc.setReady('M1', A)
    await svc.setReady('M1', B)
    expect((await svc.timeout('M1')).applied).toBe(false)
    clock.tick(31_000)
    expect((await svc.timeout('M1')).applied).toBe(true)
    expect((await svc.timeout('M1')).applied).toBe(false)
    expect(store.actions).toHaveLength(1)
    expect(store.actions[0].champion_id).toBeNull()
  })

  it('pausa conserva el tiempo restante y deshacer quita la última acción', async () => {
    const { db, svc, store, clock } = setup()
    await createGame(db, store.matches[0], 1)
    await svc.coinToss('M1', A)
    await svc.setReady('M1', A)
    await svc.setReady('M1', B)
    clock.tick(10_000)
    await svc.admin('M1', ADMIN, 'pause')
    clock.tick(60_000)
    expect((await svc.timeout('M1')).applied).toBe(false)
    await svc.admin('M1', ADMIN, 'resume')
    expect(new Date(store.sessions[0].deadline_at).getTime() - clock.now()).toBe(20_000)
    const blue = store.games[0].blue_slot === 'a' ? A : B
    await svc.lock('M1', blue, 'C3')
    await svc.admin('M1', ADMIN, 'undo')
    expect(store.actions).toHaveLength(0)
    expect(store.sessions[0].current_step).toBe(0)
  })

  it('en eliminatoria elige lado el mejor sembrado, sin moneda', async () => {
    const { db, svc, store } = setup({ phaseType: 'bracket' })
    await createGame(db, store.matches[0], 1)
    const room = await svc.getRoom('M1', A)
    expect(room.game).toMatchObject({ side_method: 'choice', chooser_slot: 'b' })
    await expect(svc.coinToss('M1', A)).rejects.toThrow()
    await expect(svc.chooseSide('M1', A, 'blue')).rejects.toThrow()
    await svc.chooseSide('M1', B, 'red')
    expect(store.games[0].blue_slot).toBe('a')
  })
})
