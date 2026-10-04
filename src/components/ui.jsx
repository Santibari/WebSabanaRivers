// Piezas de UI reutilizables con el estilo del afiche (fondo negro, bordes blancos, display ancha).
import { useState } from 'react'
import { Link } from 'react-router-dom'

/** Cambia este archivo por el logo oficial (PNG/SVG) en /public. */
export const LOGO_URL = '/logo-sabana-rivers.svg'

export function Logo({ className = 'size-10' }) {
  return <img src={LOGO_URL} alt="Sabana Rivers" className={`${className} object-contain`} />
}

const variants = {
  primary: 'bg-sr-blue text-sr-white hover:bg-[#2468c0]',
  ghost: 'border border-sr-line text-sr-white hover:border-sr-gray',
  danger: 'bg-sr-red text-sr-white hover:bg-[#e04656]',
  outline: 'border-2 border-sr-white text-sr-white hover:bg-sr-white hover:text-sr-black',
}

export function Button({ variant = 'primary', className = '', skew = false, as, ...props }) {
  const Comp = as ?? 'button'
  return (
    <Comp
      className={`inline-flex items-center justify-center gap-2 px-5 py-2.5 font-cond font-bold uppercase tracking-[0.14em] text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${variants[variant]} ${skew ? 'clip-btn px-7' : ''} ${className}`}
      {...props}
    />
  )
}

export function Eyebrow({ children, className = 'text-sr-sky' }) {
  return <p className={`eyebrow ${className}`}>{children}</p>
}

export function Title({ children, className = '' }) {
  return <h1 className={`font-display text-4xl sm:text-5xl lg:text-6xl leading-[1.05] ${className}`}>{children}</h1>
}

/** Logo de equipo en círculo; si no hay logo, el tag. */
export function TeamLogo({ team, size = 36, className = '' }) {
  const [broken, setBroken] = useState(false)
  const style = { width: size, height: size }
  if (team?.logo_url && !broken)
    return <img src={team.logo_url} alt="" style={style} onError={() => setBroken(true)} className={`rounded-full object-cover bg-black border border-sr-gray/50 shrink-0 ${className}`} />
  return (
    <span style={style} className={`rounded-full border-2 border-sr-gray/70 grid place-items-center shrink-0 font-cond font-bold text-[0.62rem] tracking-wider text-sr-gray ${className}`}>
      {team?.tag ?? ''}
    </span>
  )
}

export function Panel({ children, className = '', accent }) {
  const top = accent === 'blue' ? 'border-t-2 border-t-sr-sky' : accent === 'red' ? 'border-t-2 border-t-sr-red' : ''
  return <div className={`bg-sr-panel/90 border border-sr-line ${top} ${className}`}>{children}</div>
}

export function Field({ label, hint, children }) {
  return (
    <label className="block space-y-1.5">
      <span className="eyebrow text-sr-gray !text-[0.7rem]">{label}</span>
      {children}
      {hint && <span className="block text-xs text-sr-gray">{hint}</span>}
    </label>
  )
}

export const inputCls =
  'w-full bg-sr-black border border-sr-line px-3 py-2.5 text-sr-white placeholder:text-sr-gray/70 focus:border-sr-sky focus:outline-none'

export function Input(props) {
  return <input {...props} className={`${inputCls} ${props.className ?? ''}`} />
}
export function Select({ children, ...props }) {
  return (
    <select {...props} className={`${inputCls} ${props.className ?? ''}`}>
      {children}
    </select>
  )
}
export function Textarea(props) {
  return <textarea {...props} className={`${inputCls} min-h-28 ${props.className ?? ''}`} />
}

export function ErrorNote({ error }) {
  if (!error) return null
  return (
    <p role="alert" className="border-l-2 border-sr-red bg-sr-wine/40 px-3 py-2 text-sm text-[#ffb3bc]">
      {error.message ?? String(error)}
    </p>
  )
}

export function Empty({ children }) {
  return <p className="border border-dashed border-sr-line px-4 py-8 text-center text-sr-gray">{children}</p>
}

export function Loading({ label = 'Cargando…' }) {
  return (
    <div className="flex items-center gap-3 py-10 text-sr-gray" role="status">
      <span className="size-3 animate-ping rounded-full bg-sr-sky" />
      {label}
    </div>
  )
}

export function TabBar({ tabs, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-2" role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={`px-5 py-2.5 font-semibold border transition-colors ${value === t.value ? 'bg-sr-blue border-sr-blue' : 'border-sr-line hover:border-sr-gray'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  )
}

export function Badge({ children, tone = 'gray' }) {
  const tones = {
    gray: 'border-sr-line text-sr-gray',
    sky: 'border-sr-sky/60 text-sr-sky',
    red: 'border-sr-red/60 text-[#ff8a96]',
    green: 'border-emerald-500/60 text-emerald-300',
    amber: 'border-amber-500/60 text-amber-300',
  }
  return <span className={`inline-block border px-2 py-0.5 font-cond text-xs font-semibold uppercase tracking-widest ${tones[tone]}`}>{children}</span>
}

export const STATUS_LABEL = { borrador: 'Borrador', inscripciones: 'Inscripciones', activo: 'Activo', finalizado: 'Finalizado' }
export const STATUS_TONE = { borrador: 'gray', inscripciones: 'amber', activo: 'sky', finalizado: 'gray' }

export function TextLink({ to, children }) {
  return (
    <Link to={to} className="text-sr-sky underline-offset-4 hover:underline">
      {children}
    </Link>
  )
}
