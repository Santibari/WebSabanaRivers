import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { Button, TeamLogo, ErrorNote, Logo } from '../../components/ui.jsx'
import { duration } from '../../lib/format.js'
import { FEARLESS_LABEL } from './useRoom.js'

function useAction(fn) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)
  const run = async (...args) => {
    setBusy(true)
    setError(null)
    try {
      await fn(...args)
    } catch (e) {
      setError(e)
    } finally {
      setBusy(false)
    }
  }
  return { run, busy, error }
}

export function Stage({ children, room, d }) {
  const { match } = room
  return (
    <div className="relative mx-auto flex min-h-dvh max-w-5xl flex-col items-center justify-center gap-8 px-4 py-10 text-center">
      <Link to="/" className="absolute left-4 top-4 flex items-center gap-2 text-sm text-sr-gray hover:text-sr-white"><Logo className="size-8" /> Sabana Rivers</Link>
      <p className="eyebrow text-[#c9d1dd]">{d.meta.replace(' · Fearless', '')} · {FEARLESS_LABEL[match.fearless_mode]} · {match.pick_seconds}s por acción</p>
      <div className="flex w-full flex-col items-center justify-center gap-6 sm:flex-row sm:gap-12">
        <TeamBadge team={match.teamA} wins={match.score_a} />
        <span className="font-display text-3xl text-sr-gray">VS</span>
        <TeamBadge team={match.teamB} wins={match.score_b} />
      </div>
      {children}
    </div>
  )
}

function TeamBadge({ team, wins }) {
  return (
    <div className="flex min-w-56 flex-col items-center gap-3">
      <TeamLogo team={team} size={84} />
      <p className="font-display text-2xl">{team?.name}</p>
      <p className="font-cond tracking-[0.3em] text-sr-gray">{wins ?? 0} VICTORIAS</p>
    </div>
  )
}

/** Lados: moneda del servidor (grupos), elección del mejor sembrado / del perdedor, o manual. */
export function SideSelect({ room, d, call }) {
  const { game, viewer } = room
  const act = useAction(call)
  const isAdmin = viewer.role === 'admin'
  const chooserName = game.chooser_slot ? d.nameOfSlot(game.chooser_slot) : null
  const iChoose = isAdmin || game.side_method === 'manual' || (game.side_method === 'choice' && game.chooser_slot === viewer.role)

  if (game.side_method === 'coin') {
    return (
      <div className="space-y-5">
        <Coin />
        <p className="text-lg text-[#c9d1dd]">La moneda del servidor decide quién juega en el lado azul.</p>
        {(viewer.role === 'a' || viewer.role === 'b' || isAdmin) && (
          <Button skew onClick={() => act.run('coin')} disabled={act.busy}>Lanzar moneda</Button>
        )}
        <ErrorNote error={act.error} />
      </div>
    )
  }
  return (
    <div className="space-y-5">
      <p className="text-xl">
        {game.side_method === 'manual'
          ? 'Lados por elección manual.'
          : game.number > 1
            ? <><b>{chooserName}</b> perdió la partida anterior y elige lado.</>
            : <><b>{chooserName}</b> es el mejor clasificado y elige lado.</>}
      </p>
      {iChoose ? (
        <div className="flex flex-wrap justify-center gap-4">
          <Button skew onClick={() => act.run('side', { side: 'blue' })} disabled={act.busy}>Jugar lado azul</Button>
          <Button skew variant="danger" onClick={() => act.run('side', { side: 'red' })} disabled={act.busy}>Jugar lado rojo</Button>
        </div>
      ) : (
        <p className="text-sr-gray">Esperando a que {chooserName ?? 'el otro equipo'} elija…</p>
      )}
      <ErrorNote error={act.error} />
    </div>
  )
}

function Coin({ spinning = false }) {
  return (
    <div className="mx-auto [perspective:600px]">
      <div className={`grid size-28 place-items-center rounded-full border-4 border-sr-sky bg-gradient-to-br from-sr-blue to-sr-navy shadow-[0_0_40px_rgb(79_179_255/0.35)] ${spinning ? 'animate-flip' : ''}`}>
        <Logo className="size-16 rounded-full" />
      </div>
    </div>
  )
}

/** Ambas ventanas ven la misma animación y el mismo resultado de la moneda. */
export function CoinReveal({ room, d, now }) {
  const coin = room.coin
  const age = coin ? now - new Date(coin.created_at).getTime() : Infinity
  const [show, setShow] = useState(age < 5000)
  useEffect(() => {
    if (age < 5000) setShow(true)
    const t = setTimeout(() => setShow(false), Math.max(0, 5000 - age))
    return () => clearTimeout(t)
  }, [coin?.created_at])
  if (!show || !coin) return null
  const spinning = age < 1600
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/85" role="status" aria-live="assertive">
      <div className="space-y-6 text-center">
        <Coin spinning={spinning} />
        {!spinning && (
          <p className="animate-rise font-display text-3xl sm:text-5xl">
            A <span className="text-sr-sky">{d.nameOfSlot(coin.winner_slot)}</span> le tocó el lado azul
          </p>
        )}
      </div>
    </div>
  )
}

/** Sala de espera: cada equipo marca "Listo"; el draft empieza cuando ambos lo están. */
export function Lobby({ room, d, call, presence }) {
  const { session, viewer } = room
  const act = useAction(call)
  const mine = viewer.side
  const ready = mine ? session[`${mine}_ready`] : false
  return (
    <div className="w-full max-w-2xl space-y-6">
      <div className="grid grid-cols-2 gap-4">
        {['blue', 'red'].map((side) => (
          <div key={side} className={`border-t-4 ${side === 'blue' ? 'border-sr-sky bg-sr-navy/70' : 'border-sr-red bg-sr-wine/70'} p-5`}>
            <p className="eyebrow !text-xs text-[#c9d1dd]">Lado {side === 'blue' ? 'azul' : 'rojo'}</p>
            <p className="mt-1 font-display text-2xl">{d.teamName(side)}</p>
            <p className={`mt-3 font-cond text-lg font-bold uppercase tracking-[0.25em] ${session[`${side}_ready`] ? 'text-emerald-300' : 'text-sr-gray'}`}>
              {session[`${side}_ready`] ? '✓ Listo' : 'Esperando…'}
            </p>
          </div>
        ))}
      </div>
      {mine && (
        <Button skew className="!px-14 !py-4 !text-lg" variant={ready ? 'ghost' : 'primary'} onClick={() => act.run('ready', { ready: !ready })} disabled={act.busy}>
          {ready ? 'Cancelar listo' : 'Estoy listo'}
        </Button>
      )}
      <p className="text-sm text-sr-gray">Conectados en la sala: {presence.total ?? 1}</p>
      <ErrorNote error={act.error} />
    </div>
  )
}

/** Contador de la partida (arranca al cerrar el draft, se detiene con "Terminar encuentro"). */
export function GameClock({ room, now, call }) {
  const { game, viewer } = room
  const act = useAction(call)
  if (!game.started_at) return null
  const end = game.ended_at ? new Date(game.ended_at).getTime() : now
  const ms = end - new Date(game.started_at).getTime()
  return (
    <div className="flex flex-wrap items-center justify-center gap-4">
      <span className="font-cond uppercase tracking-[0.25em] text-sr-gray">Partida</span>
      <span className="font-display text-3xl tabular-nums">{duration(ms)}</span>
      {game.status === 'jugando' && (viewer.role === 'a' || viewer.role === 'b') && (
        <Button variant="danger" skew onClick={() => act.run('end')} disabled={act.busy}>{act.busy ? 'Terminando…' : 'Terminar encuentro'}</Button>
      )}
      <ErrorNote error={act.error} />
    </div>
  )
}

/** Reporte de cada capitán: ganador + torres y dragones de SU equipo. */
export function ReportForm({ room, d, call }) {
  const { viewer, reports, game } = room
  const mine = reports.find((r) => r.team_side === viewer.side)
  const other = reports.find((r) => r.team_side !== viewer.side)
  const [winner, setWinner] = useState(null)
  const [towers, setTowers] = useState(0)
  const [dragons, setDragons] = useState(0)
  const act = useAction(call)

  if (game.result_status === 'disputa')
    return <Notice tone="red" title="Resultado en disputa">Los dos capitanes reportaron ganadores distintos. El admin lo resolverá.</Notice>
  if (mine)
    return (
      <Notice title="Reporte enviado">
        {other ? 'Ambos reportaron; confirmando…' : `Esperando el reporte de ${d.teamName(viewer.side === 'blue' ? 'red' : 'blue')}. El resultado queda pendiente hasta que su capitán entre a la web.`}
      </Notice>
    )

  return (
    <form
      className="w-full max-w-xl space-y-5 border border-sr-line bg-sr-panel p-6 text-left"
      onSubmit={(e) => {
        e.preventDefault()
        if (winner) act.run('report', { winner, towers: Number(towers), dragons: Number(dragons) })
      }}
    >
      <h2 className="font-display text-2xl">¿Quién ganó?</h2>
      <div className="grid grid-cols-2 gap-3">
        {['blue', 'red'].map((side) => (
          <button
            type="button"
            key={side}
            onClick={() => setWinner(side)}
            aria-pressed={winner === side}
            className={`border-2 p-4 font-semibold ${winner === side ? (side === 'blue' ? 'border-sr-sky bg-sr-navy' : 'border-sr-red bg-sr-wine') : 'border-sr-line'}`}
          >
            {d.teamName(side)}
            <span className="block font-cond text-xs uppercase tracking-widest text-sr-gray">Lado {side === 'blue' ? 'azul' : 'rojo'}</span>
          </button>
        ))}
      </div>
      <p className="text-sm text-[#c9d1dd]">Objetivos de <b>tu equipo</b> ({d.teamName(viewer.side)}):</p>
      <div className="grid grid-cols-2 gap-3">
        <NumberField label="Torres derribadas" value={towers} onChange={setTowers} max={11} />
        <NumberField label="Dragones tomados" value={dragons} onChange={setDragons} max={20} />
      </div>
      <Button type="submit" className="w-full" disabled={!winner || act.busy}>Enviar reporte</Button>
      <ErrorNote error={act.error} />
    </form>
  )
}

function NumberField({ label, value, onChange, max }) {
  return (
    <label className="block">
      <span className="eyebrow !text-[0.65rem] text-sr-gray">{label}</span>
      <div className="mt-1 flex items-center border border-sr-line">
        <button type="button" className="px-4 py-2 text-xl" onClick={() => onChange(Math.max(0, value - 1))} aria-label={`Restar ${label}`}>−</button>
        <input type="number" min={0} max={max} value={value} onChange={(e) => onChange(Math.min(max, Math.max(0, +e.target.value || 0)))} className="w-full bg-transparent py-2 text-center font-display text-xl" />
        <button type="button" className="px-4 py-2 text-xl" onClick={() => onChange(Math.min(max, value + 1))} aria-label={`Sumar ${label}`}>+</button>
      </div>
    </label>
  )
}

export function Notice({ title, children, tone = 'sky' }) {
  return (
    <div className={`max-w-xl border-l-4 ${tone === 'red' ? 'border-sr-red bg-sr-wine/40' : 'border-sr-sky bg-sr-navy/50'} px-5 py-4 text-left`}>
      <p className="font-bold">{title}</p>
      <p className="mt-1 text-sm text-[#c9d1dd]">{children}</p>
    </div>
  )
}

export function SeriesDone({ room }) {
  const { match } = room
  const winner = match.winner_slot ? (match.winner_slot === 'a' ? match.teamA : match.teamB) : null
  return (
    <div className="space-y-4">
      <p className="eyebrow text-sr-sky">Serie terminada</p>
      <p className="font-display text-5xl">{winner ? `Gana ${winner.name}` : 'Empate'}</p>
      <p className="font-display text-3xl tabular-nums">{match.score_a} – {match.score_b}</p>
      {match.tournament && <Button as={Link} to={`/torneos/${match.tournament.slug}`} variant="ghost">Ver tabla del torneo</Button>}
    </div>
  )
}

/** Controles del admin: pausar, deshacer, tiempo, lados, forzar inicio y resolver disputas. */
export function AdminControls({ room, d, adminOp, presence }) {
  const { session, game, reports } = room
  const act = useAction(adminOp)
  const [res, setRes] = useState({ winner: null, blue_towers: 0, blue_dragons: 0, red_towers: 0, red_dragons: 0 })
  useEffect(() => {
    const b = reports.find((r) => r.team_side === 'blue')
    const r = reports.find((x) => x.team_side === 'red')
    setRes((s) => ({ ...s, blue_towers: b?.towers ?? s.blue_towers, blue_dragons: b?.dragons ?? s.blue_dragons, red_towers: r?.towers ?? s.red_towers, red_dragons: r?.dragons ?? s.red_dragons }))
  }, [reports])
  if (!game) return null
  const resolvable = ['jugando', 'reporte'].includes(game.status)
  const btn = 'border border-sr-line bg-sr-panel px-3 py-2 font-cond text-sm font-bold uppercase tracking-widest hover:border-sr-sky disabled:opacity-40'
  return (
    <div className="z-30 border border-sr-line bg-sr-ink/95 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="eyebrow !text-xs mr-2 text-amber-300">Admin</span>
        {session?.status === 'drafting' && !session.paused && <button className={btn} onClick={() => act.run('pause')}>Pausar</button>}
        {session?.paused && <button className={btn} onClick={() => act.run('resume')}>Reanudar</button>}
        <button className={btn} disabled={!room.actions.length} onClick={() => act.run('undo')}>Deshacer última</button>
        <button className={btn} disabled={session?.status !== 'drafting'} onClick={() => act.run('reset-timer')}>Reiniciar tiempo</button>
        <button className={btn} disabled={!game.blue_slot || room.actions.length > 0} onClick={() => act.run('swap-sides')}>Cambiar lados</button>
        <button className={btn} disabled={session?.status !== 'waiting' || !game.blue_slot} onClick={() => act.run('force-start')}>Forzar inicio</button>
        <span className="ml-auto text-sm text-sr-gray">
          Conectados: {presence.total ?? 0} (equipo A {presence.a ?? 0} · equipo B {presence.b ?? 0} · admin {presence.admin ?? 0})
        </span>
      </div>
      {resolvable && (
        <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-sr-line pt-3">
          <span className="text-sm">
            {game.result_status === 'disputa' ? <b className="text-[#ff8a96]">Disputa</b> : 'Registrar resultado'}
            {reports.map((r) => (
              <span key={r.team_side} className="ml-3 text-sr-gray">
                {d.teamName(r.team_side)} dice: gana {d.teamName(r.winner_claim)} ({r.towers}T/{r.dragons}D)
              </span>
            ))}
          </span>
          <select className="border border-sr-line bg-sr-black px-2 py-2" value={res.winner ?? ''} onChange={(e) => setRes({ ...res, winner: e.target.value })}>
            <option value="">Ganador…</option>
            <option value="blue">{d.teamName('blue')} (azul)</option>
            <option value="red">{d.teamName('red')} (rojo)</option>
          </select>
          {['blue_towers', 'blue_dragons', 'red_towers', 'red_dragons'].map((k) => (
            <label key={k} className="text-xs text-sr-gray">
              {{ blue_towers: 'Torres azul', blue_dragons: 'Dragones azul', red_towers: 'Torres rojo', red_dragons: 'Dragones rojo' }[k]}
              <input type="number" min={0} className="block w-20 border border-sr-line bg-sr-black px-2 py-1.5 text-sr-white" value={res[k]} onChange={(e) => setRes({ ...res, [k]: Math.max(0, +e.target.value || 0) })} />
            </label>
          ))}
          <button className={btn} disabled={!res.winner} onClick={() => act.run('resolve', res)}>Confirmar resultado</button>
        </div>
      )}
      <ErrorNote error={act.error} />
    </div>
  )
}
