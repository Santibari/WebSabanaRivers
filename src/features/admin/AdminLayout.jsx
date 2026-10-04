import { NavLink, Outlet, Navigate } from 'react-router-dom'
import { useAuth, isAdminUser, isEditorUser } from '../../app/hooks.jsx'
import { Eyebrow, Loading } from '../../components/ui.jsx'

const SECTIONS = [
  { to: 'torneos', label: 'Torneos', admin: true },
  { to: 'drafts', label: 'Drafts', admin: true },
  { to: 'eventos', label: 'Eventos' },
  { to: 'contenido', label: 'Contenido' },
  { to: 'equipos', label: 'Equipos', admin: true },
  { to: 'usuarios', label: 'Usuarios', admin: true },
  { to: 'auditoria', label: 'Auditoría', admin: true },
]

export function AdminLayout() {
  const { user, ready } = useAuth()
  if (!ready) return <div className="mx-auto max-w-6xl px-6"><Loading /></div>
  if (!isEditorUser(user)) return <Navigate to="/login" replace />
  const sections = SECTIONS.filter((s) => !s.admin || isAdminUser(user))
  return (
    <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6">
      <Eyebrow className="text-amber-300">Panel de administración · {user.role}</Eyebrow>
      <div className="mt-4 grid gap-8 lg:grid-cols-[200px_1fr]">
        <nav className="flex gap-1 overflow-x-auto lg:flex-col">
          {sections.map((s) => (
            <NavLink
              key={s.to}
              to={s.to}
              className={({ isActive }) => `whitespace-nowrap border-l-2 px-4 py-2.5 font-cond font-semibold uppercase tracking-[0.18em] ${isActive ? 'border-sr-sky bg-sr-navy/60 text-sr-sky' : 'border-transparent hover:border-sr-line'}`}
            >
              {s.label}
            </NavLink>
          ))}
        </nav>
        <div className="min-w-0"><Outlet /></div>
      </div>
    </div>
  )
}

export function AdminHeader({ title, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-2 border-sr-white pb-4">
      <h1 className="font-display text-3xl sm:text-4xl">{title}</h1>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  )
}
