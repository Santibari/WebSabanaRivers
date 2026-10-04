import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { repo } from '../../lib/repo/index.js'
import { buildDraftState, actionLabel, phaseLabel } from '../../../shared/draft-engine.js'

/**
 * Estado vivo de una sala.
 * Velocidad:
 *  - cada cambio devuelve la sala ya actualizada (sin segunda petición);
 *  - el pick propio se dibuja antes de que responda el servidor (optimista);
 *  - los avisos de Realtime traen la jugada, así las otras ventanas la dibujan al instante
 *    y releen la sala en segundo plano.
 * También corrige el reloj contra el servidor y dispara el timeout cuando vence el turno.
 */
export function useRoom(matchId, token) {
  const [room, setRoomState] = useState(null)
  const [error, setError] = useState(null)
  const [hover, setHover] = useState({ blue: null, red: null })
  const [presence, setPresence] = useState({ total: 1 })
  const [pending, setPending] = useState(null) // pick optimista en curso
  const offset = useRef(0)
  const subRef = useRef(null)
  const seq = useRef(0)
  const roomRef = useRef(null)

  const setRoom = useCallback((r, sentAt) => {
    if (sentAt) offset.current = r.serverNow - (sentAt + Date.now()) / 2
    roomRef.current = r
    setRoomState(r)
  }, [])

  const load = useCallback(async () => {
    const mine = ++seq.current
    try {
      const t0 = Date.now()
      const r = await repo.getRoom(matchId, token)
      if (mine !== seq.current) return
      setRoom(r, t0)
      setError(null)
    } catch (e) {
      if (mine === seq.current) setError(e)
    }
  }, [matchId, token, setRoom])

  // Relecturas agrupadas: varios avisos seguidos → una sola petición.
  const reloadTimer = useRef(null)
  const scheduleLoad = useCallback(
    (ms = 120) => {
      clearTimeout(reloadTimer.current)
      reloadTimer.current = setTimeout(load, ms)
    },
    [load],
  )

  useEffect(() => {
    load()
    return () => clearTimeout(reloadTimer.current)
  }, [load])

  /** Aplica una jugada que llegó por aviso, si encaja con lo que tenemos. */
  const applyPatch = useCallback(
    (p) => {
      const r = roomRef.current
      if (p?.action && r?.session && p.session?.id === r.session.id && !r.actions.some((a) => a.step === p.action.step)) {
        if (p.action.step === r.actions.length) {
          setRoom({ ...r, actions: [...r.actions, p.action], session: { ...r.session, ...p.session } })
        }
      }
      scheduleLoad(p?.action ? 250 : 60)
    },
    [setRoom, scheduleLoad],
  )

  const role = room?.viewer.role
  useEffect(() => {
    if (!role) return
    const sub = repo.subscribeRoom(matchId, {
      role,
      onRefresh: applyPatch,
      onHover: ({ side, championId }) => setHover((h) => ({ ...h, [side]: championId })),
      onPresence: setPresence,
    })
    subRef.current = sub
    return () => sub.close()
  }, [matchId, role, applyPatch])

  // Al cambiar de turno se limpia el hover.
  const step = room?.session?.current_step
  useEffect(() => setHover({ blue: null, red: null }), [step, room?.game?.id])

  const now = useServerNow(offset)
  const derived = useMemo(() => (room ? derive(room) : null), [room])

  /** Ejecuta un cambio y usa la sala que devuelve el servidor. */
  const run = useCallback(
    async (fn) => {
      seq.current++ // descarta lecturas en vuelo, que serían más viejas
      const t0 = Date.now()
      const res = await fn()
      if (res?.room) setRoom(res.room, t0)
      else await load()
      return res
    },
    [setRoom, load],
  )

  // Timeout autoritativo: cualquier ventana avisa al servidor; él verifica el plazo.
  const fired = useRef(null)
  const s = room?.session
  const remaining = s?.status === 'drafting' && !s.paused && s.deadline_at ? new Date(s.deadline_at).getTime() - now : null
  useEffect(() => {
    if (remaining == null || remaining > -300) return
    const key = `${s.id}:${s.current_step}`
    if (fired.current === key) return
    fired.current = key
    const t = setTimeout(() => run(() => repo.roomCall('timeout', matchId, token)).catch(() => load()), Math.random() * 400)
    return () => clearTimeout(t)
  }, [remaining, s, matchId, token, run, load])

  const call = useCallback((op, extra) => run(() => repo.roomCall(op, matchId, token, extra)), [run, matchId, token])
  const adminOp = useCallback((op, payload) => run(() => repo.adminDraft(matchId, op, payload, token)), [run, matchId, token])

  /** Pick/ban optimista: se ve de inmediato y se confirma (o revierte) con la respuesta del servidor. */
  const lock = useCallback(
    async (championId) => {
      const r = roomRef.current
      const st = r && buildDraftState(r.steps, r.actions)
      if (!st?.current) return
      const optimistic = { id: `tmp-${st.currentStep}`, session_id: r.session.id, step: st.currentStep, team_side: st.current.side, type: st.current.type, champion_id: championId, pending: true }
      setPending(optimistic)
      setRoom({ ...r, actions: [...r.actions, optimistic], session: { ...r.session, current_step: st.currentStep + 1 } })
      try {
        const res = await run(() => repo.roomCall('lock', matchId, token, { championId }))
        const done = res?.room?.actions.find((a) => a.step === optimistic.step)
        if (done) subRef.current?.sendPatch?.({ action: done, session: res.room.session })
      } catch (e) {
        setRoom(r)
        load()
        throw e
      } finally {
        setPending(null)
      }
    },
    [run, matchId, token, setRoom, load],
  )

  const sendHover = useCallback(
    (championId) => {
      const side = roomRef.current?.viewer.side
      if (!side) return
      setHover((h) => ({ ...h, [side]: championId }))
      subRef.current?.sendHover(side, championId)
    },
    [],
  )

  return { room, derived, error, hover, presence, now, remaining, call, adminOp, lock, pending, sendHover, reload: load }
}

function useServerNow(offset) {
  const [now, setNow] = useState(() => Date.now() + offset.current)
  useEffect(() => {
    const iv = setInterval(() => setNow(Date.now() + offset.current), 200)
    return () => clearInterval(iv)
  }, [offset])
  return now
}

export const FEARLESS_LABEL = { hard: 'Hard Fearless', soft: 'Soft Fearless', off: 'Sin Fearless' }

/** Datos derivados que usan todas las vistas de la sala. */
export function derive(room) {
  const { match, game, steps, actions, viewer } = room
  const blueSlot = game?.blue_slot ?? 'a'
  const team = (slot) => (slot === 'a' ? match.teamA : match.teamB)
  const blue = team(blueSlot)
  const red = team(blueSlot === 'a' ? 'b' : 'a')
  const state = buildDraftState(steps, actions)
  const step = state.currentStep
  const lockedFor = (slot) => new Map(room.locked[slot] ?? [])
  const myLocked = viewer.role === 'a' || viewer.role === 'b' ? lockedFor(viewer.role) : new Map()
  const context = match.groupName ?? match.phase?.name ?? (match.tournament ? match.tournament.name : 'Amistoso')
  const meta = [context, `Juego ${game?.number ?? 1} de ${match.best_of}`, `BO${match.best_of}`, match.fearless_mode !== 'off' ? 'Fearless' : null]
    .filter(Boolean)
    .join(' · ')
  return {
    blue, red, blueSlot, state, step, steps,
    current: state.current,
    actionLabel: state.current ? actionLabel(steps, step) : 'Draft cerrado',
    phaseLabel: phaseLabel(steps, step),
    myTurn: !!viewer.side && state.current?.side === viewer.side && room.session?.status === 'drafting',
    myLocked,
    lockedFor,
    meta,
    teamName: (side) => (side === 'blue' ? blue?.name : red?.name),
    nameOfSlot: (slot) => team(slot)?.name,
  }
}
