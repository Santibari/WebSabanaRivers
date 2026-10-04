import { useCallback, useEffect, useRef, useState } from 'react'
import { TeamPlate, TurnHeader, PickSlot, BanRow, ChampionGrid } from './parts.jsx'

const ROLE_HINT = ['TOP', 'JG', 'MID', 'ADC', 'SUP']

/** Vista del capitán durante el draft: picks a los lados, grilla al centro, bans y botón abajo. */
export function CaptainBoard({ room, d, champs, hover, remaining, lock: lockChampion, pending, sendHover, footer }) {
  const { viewer, session } = room
  const mySide = viewer.side
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState(false)
  const byId = champs.byId

  useEffect(() => {
    setSelected(null)
    setError(null)
  }, [d.step])

  const oppLocked = d.lockedFor(viewer.role === 'a' ? 'b' : 'a')
  const status = useCallback(
    (id) => {
      if (d.state.used.has(id)) {
        const isBan = [...d.state.bans.blue, ...d.state.bans.red].includes(id)
        return { kind: isBan ? 'ban' : 'pick', note: isBan ? 'Baneado en esta partida' : 'Elegido en esta partida' }
      }
      const lock = d.myLocked.get(id)
      if (!lock) return null
      // En Soft Fearless, en fase de bans puedes banear lo que tú no puedes pickear pero el rival sí.
      const blocked = d.current?.type === 'pick' || oppLocked.has(id)
      if (!blocked) return null
      return { kind: 'fearless', note: `Fearless: usado en el juego ${lock.game} por ${d.nameOfSlot(lock.teamId)}` }
    },
    [d, oppLocked],
  )

  const select = (id) => {
    if (!d.myTurn) return
    setSelected(id)
    sendHover(id)
  }

  const lock = async () => {
    if (!selected || !d.myTurn || busy || pending) return
    setBusy(true)
    setError(null)
    try {
      await lockChampion(selected)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }

  // Aviso animado cuando empieza mi turno.
  const [toastKey, setToastKey] = useState(null)
  const wasMyTurn = useRef(false)
  useEffect(() => {
    if (d.myTurn && !wasMyTurn.current) setToastKey(`${d.step}`)
    wasMyTurn.current = d.myTurn
  }, [d.myTurn, d.step])

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Enter' && selected && d.myTurn && document.activeElement?.tagName !== 'INPUT') lock()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const picks = (side) => d.state.picks[side].map((id) => byId[id] ?? { id, name: id, roles: [] })
  const bans = (side) => d.state.bans[side].map((id) => (id ? byId[id] ?? { id, name: id } : null))
  const cur = d.current
  const previewFor = (side) => {
    const id = side === mySide ? selected ?? hover[side] : hover[side]
    return id && cur?.side === side ? byId[id] : null
  }
  const drafting = session.status === 'drafting'
  const title = !drafting ? (session.status === 'done' ? 'Draft cerrado' : 'Esperando') : d.myTurn ? `Tu turno · ${d.actionLabel}` : d.actionLabel
  const subtitle = drafting && !d.myTurn ? `Turno de ${d.teamName(cur.side)}` : null
  const sel = selected ? byId[selected] : null
  const btnLabel = !drafting ? 'Draft cerrado' : !d.myTurn ? 'Turno del rival' : sel ? `${cur.type === 'ban' ? 'Banear' : 'Bloquear'} ${sel.name}` : 'Elige un campeón'

  const column = (side) => (
    <div className="flex min-h-[320px] flex-1 flex-col gap-2 lg:min-h-0">
      {Array.from({ length: 5 }, (_, i) => {
        const p = picks(side)
        const active = drafting && cur?.side === side && cur.type === 'pick' && i === p.length
        const isPending = pending && pending.type === 'pick' && pending.team_side === side && i === p.length - 1
        return <PickSlot key={i} index={i} side={side} champ={p[i]} role={ROLE_HINT[i]} active={active} preview={active ? previewFor(side) : null} pending={isPending} />
      })}
    </div>
  )

  return (
    <div className="relative flex min-h-dvh animate-fade-in flex-col gap-3 p-3 sm:p-5 lg:h-dvh">
      {toastKey && (
        <div
          key={toastKey}
          onAnimationEnd={() => setToastKey(null)}
          className="pointer-events-none fixed left-1/2 top-24 z-50 animate-toast border-2 border-sr-sky bg-sr-navy/95 px-10 py-4 text-center shadow-[0_0_40px_rgb(79_179_255/0.5)]"
          role="status"
        >
          <p className="font-display text-3xl text-sr-sky sm:text-4xl">¡Tu turno!</p>
          <p className="eyebrow mt-1 !text-sm text-sr-white">{d.actionLabel}</p>
        </div>
      )}
      <div className="grid grid-cols-2 items-center gap-3 lg:grid-cols-[1fr_1.1fr_1fr]">
        <TeamPlate team={d.blue} side="blue" mine={mySide === 'blue'} active={drafting && cur?.side === 'blue'} />
        <div className="order-first col-span-2 lg:order-none lg:col-span-1">
          <TurnHeader meta={d.meta} title={title} subtitle={subtitle} remaining={remaining} total={session.pick_seconds} paused={session.paused} accent={d.myTurn ? 'sky' : cur?.side === 'red' ? 'red' : 'white'} />
        </div>
        <TeamPlate team={d.red} side="red" mine={mySide === 'red'} active={drafting && cur?.side === 'red'} />
      </div>

      {d.myTurn && (
        <p className="border-l-4 border-sr-sky bg-sr-navy/70 px-4 py-2 font-cond text-sm font-bold uppercase tracking-[0.25em] text-sr-sky lg:hidden" role="status">
          ¡Tu turno! {d.actionLabel}
        </p>
      )}

      <div className="grid min-h-0 flex-1 gap-3 lg:grid-cols-[minmax(180px,18%)_1fr_minmax(180px,18%)]">
        <div className="order-2 flex flex-col lg:order-none">{column('blue')}</div>
        <div className="order-1 flex min-h-[420px] flex-col lg:order-none lg:min-h-0">
          <ChampionGrid
            champions={champs.champions}
            version={champs.version}
            status={status}
            selected={selected}
            onSelect={select}
            disabled={!d.myTurn || !!pending}
            fearlessCount={d.myLocked.size}
          />
        </div>
        <div className="order-3 flex flex-col lg:order-none">{column('red')}</div>
      </div>

      <div className="grid items-center gap-3 lg:grid-cols-[1fr_auto_1fr]">
        <BanRow side="blue" bans={bans('blue')} version={champs.version} activeIndex={drafting && cur?.side === 'blue' && cur.type === 'ban' ? d.state.bans.blue.length : -1} preview={previewFor('blue')} />
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={lock}
            disabled={!sel || !d.myTurn || busy || !!pending}
            className={`clip-btn min-w-[300px] px-12 py-4 font-cond text-xl font-bold uppercase tracking-[0.25em] transition duration-200 active:scale-95 sm:min-w-[440px] sm:text-2xl ${
              sel && d.myTurn
                ? `${cur.type === 'ban' ? 'bg-sr-red hover:bg-[#e04656] shadow-[0_0_28px_rgb(210_58_74/0.55)]' : 'bg-sr-blue hover:bg-[#2468c0] shadow-[0_0_28px_rgb(30_90_168/0.7)]'} hover:scale-[1.02]`
                : 'bg-sr-panel text-sr-gray'
            }`}
          >
            {pending ? 'Confirmando…' : btnLabel}
          </button>
          {error && <p role="alert" className="text-sm text-[#ff8a96]">{error.message}</p>}
          {footer}
        </div>
        <BanRow side="red" bans={bans('red')} version={champs.version} align="right" activeIndex={drafting && cur?.side === 'red' && cur.type === 'ban' ? d.state.bans.red.length : -1} preview={previewFor('red')} />
      </div>
      <span className="sr-only" aria-live="polite">{subtitle ? `${subtitle}: ${title}` : title}</span>
    </div>
  )
}
