import { useEffect, useRef, useState } from 'react'
import { TeamPlate, TurnHeader } from './parts.jsx'
import { splashUrl, squareUrl, loadingUrl } from '../../lib/ddragon.js'

/** Vista de espectador del admin: escenario con splash arts, bans y lo ya jugado en la serie. */
export function SpectatorView({ room, d, champs, hover, remaining, controls }) {
  const { session, actions, previous } = room
  const byId = champs.byId
  const champ = (id) => (id ? byId[id] ?? { id, name: id } : null)
  const moment = usePickMoment(actions, byId)
  const drafting = session?.status === 'drafting'
  const cur = d.current

  // Paneles con la imagen vertical (loading screen) de Data Dragon: tiene la misma proporción
  // que el panel (308×560), así el campeón se ve COMPLETO, sin recortes.
  const panels = (side) => {
    const picks = d.state.picks[side]
    const blue = side === 'blue'
    return (
      <div className="flex flex-1 items-end gap-2 xl:gap-3">
        {Array.from({ length: 5 }, (_, i) => {
          const c = champ(picks[i])
          const active = drafting && cur?.side === side && cur.type === 'pick' && i === picks.length
          const preview = active && hover[side] ? champ(hover[side]) : null
          const shown = c ?? preview
          return (
            <div
              key={i}
              style={{ animationDelay: `${(blue ? i : 4 - i) * 60}ms` }}
              className={`relative aspect-[308/560] flex-1 animate-pop-in overflow-hidden ${
                c ? (blue ? 'bg-sr-navy' : 'bg-sr-wine') : `border border-dashed ${blue ? 'border-sr-blue/70' : 'border-sr-red/70'} bg-sr-panel`
              } ${active ? 'animate-pulse-sky' : ''}`}
            >
              {shown && (
                <img
                  key={`${shown.id}-${c ? 'lock' : 'prev'}`}
                  src={loadingUrl(shown.id)}
                  alt=""
                  className={`absolute inset-0 h-full w-full object-cover object-top ${c ? 'animate-reveal-up' : 'animate-fade-in opacity-40 grayscale'}`}
                />
              )}
              {c && <span key={`sw-${c.id}`} className="sweep absolute inset-0" aria-hidden="true" />}
              <div className="absolute inset-x-0 bottom-0 h-2/5 bg-gradient-to-t from-black/95 via-black/50 to-transparent" />
              <div className="absolute inset-x-0 bottom-3 text-center">
                {shown && (
                  <p key={shown.id} className={`animate-name-in px-2 font-display leading-tight drop-shadow-[0_2px_6px_rgba(0,0,0,0.9)] ${shown.name.length > 9 ? 'text-sm xl:text-lg' : 'text-lg xl:text-2xl'} ${c ? '' : 'opacity-60'}`}>
                    {shown.name}
                  </p>
                )}
                <p className="eyebrow !text-[0.6rem] text-[#c9d1dd] !tracking-[0.25em]">{active ? 'Eligiendo…' : `Pick ${i + 1}`}</p>
              </div>
              <div className={`absolute inset-x-0 bottom-0 h-1 transition-colors ${c ? (blue ? 'bg-sr-sky shadow-[0_0_12px_rgb(79_179_255)]' : 'bg-sr-red shadow-[0_0_12px_rgb(210_58_74)]') : ''}`} />
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
        const preview = active && hover[side] ? champ(hover[side]) : null
        const shown = c ?? preview
        return (
          <div key={i} className={`relative grid size-14 place-items-center overflow-hidden border xl:size-[76px] ${active ? 'border-2 border-sr-sky shadow-[0_0_16px_rgb(79_179_255/0.5)]' : 'border-sr-line'} bg-sr-panel`}>
            {shown && (
              <img
                key={`${shown.id}-${c ? 'ban' : 'prev'}`}
                src={squareUrl(champs.version, shown.id)}
                alt=""
                className={`absolute inset-0 h-full w-full object-cover ${c ? 'animate-ban-slam grayscale-[0.7]' : 'animate-fade-in opacity-40'}`}
              />
            )}
            {c && <span key={`x-${c.id}`} className="absolute inset-x-1 top-1/2 h-0.5 origin-left animate-strike bg-sr-red shadow-[0_0_8px_rgb(210_58_74)]" aria-hidden="true" />}
            <span className="relative text-center text-[0.68rem] font-semibold drop-shadow">{c ? c.name : active ? 'Eligiendo…' : i < list.length ? '—' : ''}</span>
          </div>
        )
      })}
    </div>
  )

  const title = drafting ? `${d.phaseLabel}` : session?.status === 'done' ? 'Draft cerrado' : 'Sala de espera'

  return (
    <div className="relative flex min-h-dvh animate-fade-in flex-col gap-4 overflow-hidden p-4 xl:p-8">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-4">
        <TeamPlate team={d.blue} side="blue" active={drafting && cur?.side === 'blue'} />
        <div className="w-[min(36vw,420px)]">
          <TurnHeader meta={d.meta} title={title} subtitle={drafting && cur ? `${d.teamName(cur.side)} · ${d.actionLabel}` : null} remaining={drafting ? remaining : null} total={session?.pick_seconds ?? 30} paused={session?.paused} accent={drafting && cur?.side === 'red' ? 'red' : drafting ? 'sky' : 'white'} />
        </div>
        <TeamPlate team={d.red} side="red" active={drafting && cur?.side === 'red'} />
      </div>

      <div className="flex flex-1 items-center gap-6 xl:gap-10">
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
        <div key={moment.key} className="pointer-events-none fixed inset-0 z-40 grid animate-[fade-in_0.25s_ease-out_both] place-items-center bg-black/75 backdrop-blur-sm" role="status" aria-live="assertive">
          <div
            className={`w-[min(80vw,calc((100dvh-190px)*1.694))] animate-splash border-2 bg-black ${
              moment.side === 'blue' ? 'border-sr-sky shadow-[0_0_80px_rgb(79_179_255/0.45)]' : 'border-[#ff6b79] shadow-[0_0_80px_rgb(210_58_74/0.45)]'
            }`}
          >
            <div className="sweep">
              <img src={splashUrl(moment.champ.id)} alt="" className="aspect-[1215/717] w-full animate-lock-in object-cover" />
            </div>
            <div className="flex items-end justify-between gap-6 bg-black/90 px-8 py-5">
              <p className={`eyebrow animate-name-in !text-lg ${moment.side === 'blue' ? 'text-sr-sky' : 'text-[#ff6b79]'}`}>{d.teamName(moment.side)} elige</p>
              <p className="animate-name-in font-display text-5xl xl:text-6xl">{moment.champ.name}</p>
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
