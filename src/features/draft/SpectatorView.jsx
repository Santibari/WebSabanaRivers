import { useEffect, useRef, useState } from 'react'
import { TeamPlate, TurnHeader } from './parts.jsx'
import { splashUrl, squareUrl } from '../../lib/ddragon.js'

/** Vista de espectador del admin: escenario con splash arts, bans y lo ya jugado en la serie. */
export function SpectatorView({ room, d, champs, hover, remaining, controls }) {
  const { session, actions, previous } = room
  const byId = champs.byId
  const champ = (id) => (id ? byId[id] ?? { id, name: id } : null)
  const moment = usePickMoment(actions, byId)
  const drafting = session?.status === 'drafting'
  const cur = d.current

  const panels = (side) => {
    const picks = d.state.picks[side]
    const blue = side === 'blue'
    return (
      <div className={`flex flex-1 gap-2 ${blue ? '' : ''}`}>
        {Array.from({ length: 5 }, (_, i) => {
          const c = champ(picks[i])
          const active = drafting && cur?.side === side && cur.type === 'pick' && i === picks.length
          const preview = active && hover[side] ? champ(hover[side]) : null
          const shown = c ?? preview
          return (
            <div
              key={i}
              className={`relative flex-1 skew-panel overflow-hidden ${
                c ? (blue ? 'bg-sr-navy' : 'bg-sr-wine') : `border border-dashed ${blue ? 'border-sr-blue/70' : 'border-sr-red/70'} bg-sr-panel`
              } ${active ? 'animate-pulse-sky' : ''}`}
            >
              {shown && (
                <img
                  src={splashUrl(shown.id)}
                  alt=""
                  className={`absolute inset-0 h-full w-[260%] max-w-none -translate-x-[30%] object-cover unskew ${c ? '' : 'opacity-35 grayscale'}`}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-4 unskew text-center">
                {shown && <p className={`px-3 font-display leading-tight ${shown.name.length > 9 ? 'text-sm xl:text-lg' : 'text-lg xl:text-2xl'} ${c ? '' : 'opacity-60'}`}>{shown.name}</p>}
                <p className="eyebrow !text-[0.6rem] text-[#c9d1dd] !tracking-[0.25em]">{active ? 'Eligiendo…' : `Pick ${i + 1}`}</p>
              </div>
              <div className={`absolute inset-x-0 bottom-0 h-1 ${c ? (blue ? 'bg-sr-sky' : 'bg-sr-red') : ''}`} />
            </div>
          )
        })}
      </div>
    )
  }

  const bans = (side) => (
    <div className={`flex items-center gap-2 ${side === 'red' ? 'flex-row-reverse' : ''}`}>
      <span className={`eyebrow !text-xs ${side === 'blue' ? 'text-sr-sky' : 'text-[#ff6b79]'}`}>Bans</span>
      {Array.from({ length: 5 }, (_, i) => {
        const list = d.state.bans[side]
        const c = champ(list[i])
        const active = drafting && cur?.side === side && cur.type === 'ban' && i === list.length
        return (
          <div key={i} className={`relative grid size-14 place-items-center overflow-hidden border xl:size-[76px] ${active ? 'border-2 border-sr-sky' : 'border-sr-line'} bg-sr-panel`}>
            {c && <img src={squareUrl(champs.version, c.id)} alt="" className="absolute inset-0 h-full w-full object-cover grayscale-[0.7]" />}
            <span className="relative text-center text-[0.68rem] font-semibold drop-shadow">{c ? c.name : active ? 'Eligiendo…' : i < list.length ? '—' : ''}</span>
          </div>
        )
      })}
    </div>
  )

  const title = drafting ? `${d.phaseLabel}` : session?.status === 'done' ? 'Draft cerrado' : 'Sala de espera'

  return (
    <div className="relative flex min-h-dvh flex-col gap-4 overflow-hidden p-4 xl:p-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <TeamPlate team={d.blue} side="blue" />
        <div className="w-[min(36vw,420px)]">
          <TurnHeader meta={d.meta} title={title} remaining={drafting ? remaining : null} total={session?.pick_seconds ?? 30} paused={session?.paused} accent="white" />
        </div>
        <TeamPlate team={d.red} side="red" />
      </div>

      <div className="flex min-h-[340px] flex-1 items-stretch gap-6 xl:gap-10">
        {panels('blue')}
        <div className="w-px bg-sr-line" />
        {panels('red')}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-sr-line pb-4">
        {bans('blue')}
        {bans('red')}
      </div>

      <div>
        <p className="eyebrow !text-sm text-[#c9d1dd]">Ya jugados en la serie · bloqueados por Fearless</p>
        {previous.length === 0 && <p className="mt-2 text-sm text-sr-gray">Es la primera partida de la serie.</p>}
        {previous.map((g) => (
          <div key={g.number} className="mt-3 flex flex-wrap items-center gap-2">
            <span className="w-28 font-semibold text-sr-sky">Juego {g.number} · Azul</span>
            {g.picks.blue.map((id) => <Chip key={id} name={champ(id)?.name} />)}
            <span className="ml-4 font-semibold text-[#ff6b79]">Rojo</span>
            {g.picks.red.map((id) => <Chip key={id} name={champ(id)?.name} />)}
          </div>
        ))}
      </div>

      {controls}

      {moment && (
        <div className="pointer-events-none fixed inset-0 z-40 grid place-items-center bg-black/70" role="status" aria-live="assertive">
          <div key={moment.key} className={`w-[min(76vw,1400px)] animate-splash border-2 ${moment.side === 'blue' ? 'border-sr-sky' : 'border-[#ff6b79]'} bg-black`}>
            <img src={splashUrl(moment.champ.id)} alt="" className="aspect-[1215/717] w-full object-cover" />
            <div className="flex items-end justify-between bg-black/90 px-8 py-6">
              <p className={`eyebrow !text-xl ${moment.side === 'blue' ? 'text-sr-sky' : 'text-[#ff6b79]'}`}>{d.teamName(moment.side)} elige</p>
              <p className="font-display text-6xl">{moment.champ.name}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function Chip({ name }) {
  return <span className="border border-sr-line bg-sr-panel px-5 py-2 text-sm">{name}</span>
}

/** Cuando entra un pick nuevo, su splash ocupa la pantalla unos segundos y luego se reduce. */
function usePickMoment(actions, byId) {
  const [moment, setMoment] = useState(null)
  const seen = useRef(undefined)
  const timer = useRef(null)
  useEffect(() => {
    const last = actions.at(-1)
    const key = last ? `${last.session_id}:${last.step}` : null
    if (seen.current === undefined) {
      seen.current = key // no animar lo que ya estaba al abrir la vista
      return
    }
    if (!last || key === seen.current) return
    seen.current = key
    if (last.type !== 'pick' || !last.champion_id) return
    setMoment({ key, side: last.team_side, champ: byId[last.champion_id] ?? { id: last.champion_id, name: last.champion_id } })
    clearTimeout(timer.current)
    timer.current = setTimeout(() => setMoment(null), 2600)
  }, [actions, byId])
  useEffect(() => () => clearTimeout(timer.current), [])
  return moment
}
