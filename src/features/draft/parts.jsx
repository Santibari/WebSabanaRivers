import { memo, useMemo, useState } from 'react'
import { TeamLogo } from '../../components/ui.jsx'
import { squareUrl, loadingUrl, ROLE_ORDER, ROLE_LABEL, ROLE_SHORT, roleIconUrl, searchKey } from '../../lib/ddragon.js'
import { clock } from '../../lib/format.js'

/** Barra superior de cada equipo (azul a la izquierda, rojo a la derecha). */
export function TeamPlate({ team, side, mine, dim = false }) {
  const blue = side === 'blue'
  return (
    <div
      className={`flex h-14 items-center gap-4 px-5 sm:h-16 sm:px-7 ${blue ? 'clip-right bg-sr-blue' : 'clip-left flex-row-reverse bg-[#b3212f]'} ${dim ? 'opacity-60' : ''}`}
    >
      <TeamLogo team={team} size={40} className="!border-2 !border-sr-white" />
      <span className="truncate font-display text-xl sm:text-3xl">{team?.name ?? '—'}</span>
      {mine && <span className="hidden bg-black px-3 py-1 font-cond text-xs font-bold tracking-[0.3em] sm:inline">TU EQUIPO</span>}
    </div>
  )
}

/** Centro superior: contexto, turno, reloj y barra que se vacía. */
export function TurnHeader({ meta, title, remaining, total, paused, accent = 'sky', big = true }) {
  const pct = remaining == null ? 0 : Math.max(0, Math.min(100, (remaining / (total * 1000)) * 100))
  const low = remaining != null && remaining < 8000
  return (
    <div className="flex flex-col items-center text-center">
      <p className="eyebrow !text-[0.7rem] text-[#c9d1dd] sm:!text-sm">{meta}</p>
      <p className={`mt-1 font-display ${big ? 'text-2xl sm:text-4xl xl:text-5xl' : 'text-xl sm:text-3xl'} ${accent === 'sky' ? 'text-sr-sky' : accent === 'red' ? 'text-[#ff6b79]' : 'text-sr-white'}`}>
        {title}
        {remaining != null && (
          <span className={`ml-3 tabular-nums ${low ? 'text-[#ff6b79]' : 'text-sr-white'}`} aria-live="off">
            {paused ? 'PAUSA' : clock(remaining)}
          </span>
        )}
      </p>
      <div className="mt-2 h-1.5 w-full max-w-xl bg-sr-line" role="progressbar" aria-valuenow={Math.round(pct)} aria-valuemin={0} aria-valuemax={100} aria-label="Tiempo restante">
        <div className={`h-full transition-[width] duration-200 ease-linear ${low ? 'bg-sr-red' : 'bg-sr-sky'}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

/** Slot de pick vertical (vista del capitán). */
export function PickSlot({ side, champ, role, active, preview, index }) {
  const blue = side === 'blue'
  const shown = champ ?? preview
  const roleTxt = shown?.roles?.[0] ? ROLE_SHORT[shown.roles[0]] : role
  return (
    <div
      className={`relative flex min-h-0 flex-1 items-center overflow-hidden border-sr-line ${blue ? 'border-l-4 border-l-sr-sky' : 'border-r-4 border-r-sr-red'} ${
        champ ? (blue ? 'bg-sr-navy' : 'bg-sr-wine') : 'bg-sr-panel'
      } ${active ? 'animate-pulse-sky' : ''}`}
      aria-label={`Pick ${index + 1} ${shown ? shown.name : 'vacío'}`}
    >
      {shown && (
        <img
          src={loadingUrl(shown.id)}
          alt=""
          className={`absolute inset-0 h-full w-full object-cover object-[50%_18%] ${champ ? 'opacity-70' : 'opacity-30 grayscale'}`}
        />
      )}
      <div className={`absolute inset-0 ${blue ? 'bg-gradient-to-r' : 'bg-gradient-to-l'} from-black/80 via-black/30 to-transparent`} />
      {shown ? (
        <div className={`relative flex w-full items-center gap-2 px-4 ${blue ? '' : 'flex-row-reverse'}`}>
          <span className="font-cond text-xs tracking-widest text-sr-gray">{roleTxt}</span>
          <span className={`font-display text-lg sm:text-2xl ${champ ? '' : 'opacity-60'}`}>{shown.name}</span>
        </div>
      ) : (
        <svg viewBox="0 0 24 24" className={`relative mx-auto size-10 ${active ? 'text-sr-sky' : 'text-sr-line'}`} aria-hidden="true">
          <path d="M4 20v-8a8 8 0 0 1 16 0v8h-5v-6h-6v6z" fill="currentColor" />
        </svg>
      )}
    </div>
  )
}

/** Fila de bans (5 casillas inclinadas). */
export function BanRow({ side, bans, activeIndex, preview, version, align = 'left' }) {
  return (
    <div className={`flex gap-2 ${align === 'right' ? 'flex-row-reverse' : ''}`}>
      {Array.from({ length: 5 }, (_, i) => {
        const c = bans[i]
        const active = i === activeIndex
        const done = i < bans.length
        const shown = c ?? (active ? preview : null)
        return (
          <div
            key={i}
            className={`relative grid h-14 w-14 place-items-center overflow-hidden border sm:h-[72px] sm:w-[84px] skew-panel ${
              active ? 'border-sr-sky border-2 shadow-[0_0_18px_rgb(79_179_255/0.4)]' : 'border-sr-line'
            } bg-sr-panel`}
            title={c ? `Ban: ${c.name}` : done ? 'Ban vacío (tiempo agotado)' : `Ban ${i + 1}`}
          >
            {shown && <img src={squareUrl(version, shown.id)} alt="" className={`absolute inset-0 h-full w-full object-cover unskew scale-125 ${c ? 'grayscale-[0.6]' : 'opacity-40'}`} />}
            {c && <span className="absolute inset-x-1 top-1/2 h-0.5 -rotate-12 bg-sr-red/90" aria-hidden="true" />}
            <span className="relative unskew px-1 text-center font-semibold text-[0.7rem] leading-tight drop-shadow sm:text-xs">
              {c ? c.name : done ? '—' : active ? `Ban ${i + 1}` : ''}
            </span>
          </div>
        )
      })}
      <span className="sr-only">{side === 'blue' ? 'Bans azules' : 'Bans rojos'}</span>
    </div>
  )
}

/**
 * Grilla de campeones con filtros por rol, buscador y estados (baneado, elegido, Fearless).
 * status(champId) → null | { kind: 'ban'|'pick'|'fearless', note }
 */
export const ChampionGrid = memo(function ChampionGrid({ champions, version, status, selected, onSelect, disabled, fearlessCount }) {
  const [role, setRole] = useState('all')
  const [q, setQ] = useState('')
  const list = useMemo(() => {
    const k = searchKey(q)
    return champions.filter((c) => (role === 'all' || c.roles.includes(role)) && (!k || searchKey(c.name).includes(k) || searchKey(c.id).includes(k)))
  }, [champions, role, q])

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2">
        {['all', ...ROLE_ORDER].map((r) => (
          <button
            key={r}
            onClick={() => setRole(r)}
            aria-pressed={role === r}
            className={`flex items-center gap-1.5 border px-3 py-2 font-cond text-sm font-bold uppercase tracking-[0.18em] sm:px-4 ${
              role === r ? 'border-sr-blue bg-sr-blue' : 'border-sr-line bg-sr-panel hover:border-sr-gray'
            }`}
          >
            {r !== 'all' && <img src={roleIconUrl(r)} alt="" className="size-4" />}
            {r === 'all' ? 'Todos' : ROLE_LABEL[r]}
          </button>
        ))}
        <span className="ml-auto hidden font-cond text-sm uppercase tracking-[0.2em] text-[#c9d1dd] xl:inline">
          {fearlessCount} bloqueados por Fearless
        </span>
        <label className="relative w-full sm:w-64">
          <span className="sr-only">Buscar campeón</span>
          <svg viewBox="0 0 24 24" className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-sr-gray" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar campeón" className="w-full border border-sr-line bg-sr-panel py-2 pl-9 pr-3 placeholder:text-sr-gray focus:border-sr-sky focus:outline-none" />
        </label>
      </div>
      <div className="thin-scroll mt-3 grid min-h-0 flex-1 auto-rows-min grid-cols-[repeat(auto-fill,minmax(84px,1fr))] gap-2 overflow-y-auto border border-sr-line bg-black/30 p-2 sm:grid-cols-[repeat(auto-fill,minmax(104px,1fr))]">
        {list.map((c) => {
          const st = status(c.id)
          const isSel = selected === c.id
          const blocked = !!st
          const tag = st?.kind === 'ban' ? 'BANEADO' : st?.kind === 'pick' ? 'ELEGIDO' : st?.kind === 'fearless' ? 'FEARLESS' : null
          const tagColor = st?.kind === 'ban' ? 'text-[#ff6b79]' : st?.kind === 'pick' ? 'text-sr-sky' : 'text-sr-gray'
          return (
            <button
              key={c.id}
              type="button"
              disabled={blocked || disabled}
              onClick={() => onSelect(c.id)}
              title={st?.note ?? `${c.name} · ${c.roles.map((r) => ROLE_LABEL[r]).join(', ')}`}
              aria-label={`${c.name}${st ? `, ${st.note}` : ''}`}
              aria-pressed={isSel}
              className={`group relative aspect-square overflow-hidden border text-left transition ${
                isSel ? 'border-2 border-sr-sky shadow-[0_0_16px_rgb(79_179_255/0.45)]' : 'border-sr-line'
              } ${blocked ? 'cursor-not-allowed' : disabled ? 'cursor-default' : 'hover:border-sr-gray'}`}
            >
              <img src={squareUrl(version, c.id)} alt="" loading="lazy" className={`absolute inset-0 h-full w-full object-cover ${blocked ? 'opacity-25 grayscale' : 'group-hover:scale-105 transition-transform'}`} />
              <span className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/10 to-transparent" />
              {tag && (
                <span className={`absolute left-1.5 top-1.5 flex items-center gap-1 font-cond text-[0.62rem] font-bold tracking-[0.15em] ${tagColor}`}>
                  {st.kind === 'fearless' && (
                    <svg viewBox="0 0 24 24" className="size-3" fill="currentColor" aria-hidden="true"><path d="M7 10V7a5 5 0 0 1 10 0v3h1v11H6V10zm2 0h6V7a3 3 0 0 0-6 0z" /></svg>
                  )}
                  {tag}
                </span>
              )}
              <span className="absolute inset-x-0 bottom-0 px-1.5 pb-1.5 text-center">
                <span className={`block font-cond text-[0.6rem] tracking-[0.2em] ${blocked ? 'text-sr-gray/60' : 'text-[#c9d1dd]'}`}>
                  {c.roles[0] ? ROLE_LABEL[c.roles[0]].toUpperCase() : ''}
                </span>
                <span className={`block truncate text-sm font-semibold ${blocked ? 'text-sr-gray/70' : ''}`}>{c.name}</span>
              </span>
            </button>
          )
        })}
        {!list.length && <p className="col-span-full p-6 text-center text-sr-gray">Ningún campeón coincide.</p>}
      </div>
    </div>
  )
})
