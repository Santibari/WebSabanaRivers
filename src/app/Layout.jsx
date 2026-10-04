import { useState } from 'react'
import { NavLink, Outlet, Link, useLocation } from 'react-router-dom'
import { Logo } from '../components/ui.jsx'
import { useAuth, isEditorUser } from './hooks.jsx'
import { repo, isDemo } from '../lib/repo/index.js'

const tabs = [
  { to: '/', label: 'Sabana Rivers', end: true },
  { to: '/torneos', label: 'Torneos' },
  { to: '/draft', label: 'Draft' },
]

function NavTab({ to, label, end, onClick }) {
  return (
    <NavLink
      to={to}
      end={end}
      onClick={onClick}
      className={({ isActive }) =>
        `relative py-2 font-cond font-semibold uppercase tracking-[0.18em] text-[0.95rem] transition-colors ${
          isActive ? 'text-sr-sky after:absolute after:inset-x-0 after:-bottom-1 after:h-0.5 after:bg-sr-sky' : 'text-sr-white hover:text-sr-sky'
        }`
      }
    >
      {label}
    </NavLink>
  )
}

export function Header() {
  const { user } = useAuth()
  const [open, setOpen] = useState(false)
  const close = () => setOpen(false)
  return (
    <header className="relative z-20">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-6 px-4 py-4 sm:px-6">
        <Link to="/" className="flex items-center gap-3" onClick={close}>
          <Logo className="size-10" />
          <span className="leading-none">
            <span className="block font-display text-lg tracking-[0.06em]">SABANA RIVERS</span>
            <span className="block font-cond text-xs font-semibold tracking-[0.5em] text-sr-sky">DRAFT</span>
          </span>
        </Link>
        <button className="md:hidden border border-sr-line px-3 py-2 font-cond uppercase tracking-widest text-sm" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
          Menú
        </button>
        <nav className={`${open ? 'flex' : 'hidden'} absolute inset-x-0 top-full flex-col gap-4 border-y border-sr-line bg-sr-ink px-6 py-5 md:static md:flex md:flex-row md:items-center md:gap-9 md:border-0 md:bg-transparent md:p-0`}>
          {tabs.map((t) => <NavTab key={t.to} {...t} onClick={close} />)}
          {user && <NavTab to="/equipo" label="Mi equipo" onClick={close} />}
          {isEditorUser(user) && <NavTab to="/admin" label="Admin" onClick={close} />}
          {user ? (
            <button onClick={() => repo.auth.signOut()} className="clip-btn bg-sr-navy px-6 py-2.5 font-cond text-sm font-bold uppercase tracking-[0.16em] hover:bg-sr-blue" title={user.email}>
              Salir · {user.username ?? user.email}
            </button>
          ) : (
            <Link to="/login" onClick={close} className="clip-btn bg-sr-blue px-7 py-2.5 font-cond text-sm font-bold uppercase tracking-[0.16em] hover:bg-[#2468c0]">
              Iniciar sesión
            </Link>
          )}
        </nav>
      </div>
    </header>
  )
}

export function Footer() {
  return (
    <footer className="relative z-10 mx-auto mt-20 max-w-6xl border-t border-sr-line px-4 py-8 text-xs text-sr-gray sm:px-6">
      <div className="flex flex-col justify-between gap-3 sm:flex-row">
        <p>Semillero de Esports · Universidad de La Sabana</p>
        <p className="max-w-xl sm:text-right">
          Sabana Rivers Draft no está respaldado por Riot Games y no refleja las opiniones de Riot Games ni de nadie
          involucrado oficialmente en la producción o gestión de League of Legends.
        </p>
      </div>
    </footer>
  )
}

function DemoBanner() {
  if (!isDemo) return null
  return (
    <div className="relative z-30 border-b border-amber-500/40 bg-amber-500/10 px-4 py-1.5 text-center text-xs text-amber-200">
      Modo demo: los datos se guardan en este navegador. Configura Supabase en <code>.env</code> para usar la base real.{' '}
      <Link to="/login" className="underline">Cambiar de usuario</Link>
    </div>
  )
}

export function Layout() {
  const { pathname } = useLocation()
  return (
    <div className="sr-grid min-h-dvh">
      <DemoBanner />
      <Header />
      <main key={pathname} className="relative">
        <Outlet />
      </main>
      <Footer />
    </div>
  )
}

/** Sala del draft: pantalla completa, sin header ni footer. */
export function BareLayout() {
  return (
    <div className="min-h-dvh bg-sr-ink">
      <DemoBanner />
      <Outlet />
    </div>
  )
}
