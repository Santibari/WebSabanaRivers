import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { repo } from '../../lib/repo/index.js'
import { buildDraftState, actionLabel, phaseLabel } from '../../../shared/draft-engine.js'

/**
 * Estado vivo de una sala: se recarga con cada aviso (Broadcast / otra pestaña),
 * corrige el reloj contra el servidor y dispara /api/draft/timeout cuando vence el turno.
 */
export function useRoom(matchId, token) {
  const [room, setRoom] = useState(null)
  const [error, setError] = useState(null)
  const [hover, setHover] = useState({ blue: null, red: null })
  const [presence, setPresence] = useState({ total: 1 })
  const offset = useRef(0)
  const subRef = useRef(null)
  const loadSeq = useRef(0)

  const load = useCallback(async () => {
    const seq = ++loadSeq.current
    try {
      const t0 = Date.now()
      const r = await repo.getRoom(matchId, token)
      if (seq !== loadSeq.current) return
      offset.current = r.serverNow - (t0 + Date.now()) / 2
      setRoom(r)
      setError(null)
    } catch (e) {
      if (seq === loadSeq.current) setError(e)
    }
  }, [matchId, token])

  useEffect(() => {
    load()
  }, [load])

  const role = room?.viewer.role
  useEffect(() => {
    if (!role) return
    const sub = repo.subscribeRoom(matchId, {
      role,
      onRefresh: load,
      onHover: ({ side, championId }) => setHover((h) => ({ ...h, [side]: championId })),
      onPresence: setPresence,
    })
    subRef.current = sub
    return () => sub.close()
  }, [matchId, role, load])

  // Al cambiar de turno se limpia el hover.
  const step = room?.session?.current_step
  useEffect(() => setHover({ blue: null, red: null }), [step, room?.game?.id])

  const now = useServerNow(offset)
  const derived = useMemo(() => (room ? derive(room) : null), [room])

  // Timeout autoritativo: cualquier ventana avisa al servidor; él verifica el plazo.
  const fired = useRef(null)
  const s = room?.session
  const remaining = s?.status === 'drafting' && !s.paused && s.deadline_at ? new Date(s.deadline_at).getTime() - now : null
  useEffect(() => {
    if (remaining == null || remaining > -300) return
    const key = `${s.id}:${s.current_step}`
    if (fired.current === key) return
    fired.current = key
    const t = setTimeout(() => repo.roomCall('timeout', matchId, token).catch(() => {}).finally(load), Math.random() * 500)
    return () => clearTimeout(t)
  }, [remaining, s, matchId, token, load])

  const call = useCallback(
    async (op, extra) => {
      await repo.roomCall(op, matchId, token, extra)
      await load()
    },
    [matchId, token, load],
  )
  const adminOp = useCallback(
    async (op, payload) => {
      await repo.adminDraft(matchId, op, payload, token)
      await load()
    },
    [matchId, token, load],
  )
  const sendHover = useCallback(
    (championId) => {
      const side = room?.viewer.side
      if (!side) return
      setHover((h) => ({ ...h, [side]: championId }))
      subRef.current?.sendHover(side, championId)
    },
    [room?.viewer.side],
  )

  return { room, derived, error, hover, presence, now, remaining, call, adminOp, sendHover, reload: load }
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
