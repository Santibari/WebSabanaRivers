import { useRef, useState } from 'react'
import { useAuth, useRepoQuery, useRepoMutation } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { AdminHeader } from './AdminLayout.jsx'
import { TeamLogo, Loading, Empty, ErrorNote, Select } from '../../components/ui.jsx'

export function AdminTeams() {
  const { data: teams, isLoading } = useRepoQuery(['teams'], () => repo.listTeams())
  const [target, setTarget] = useState(null)
  const fileRef = useRef(null)
  const upload = useRepoMutation(({ id, file }) => repo.uploadLogo(id, file))
  const remove = useRepoMutation((id) => repo.removeLogo(id))
  return (
    <>
      <AdminHeader title="Equipos" />
      <p className="mb-4 text-sm text-sr-gray">El admin puede subir o cambiar el logo de cualquier equipo, y quitar logos inapropiados (el equipo sigue existiendo sin logo).</p>
      <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files[0] && upload.mutate({ id: target, file: e.target.files[0] })} />
      <ErrorNote error={upload.error ?? remove.error} />
      {isLoading && <Loading />}
      <div className="divide-y divide-sr-line border border-sr-line">
        {teams?.length === 0 && <div className="p-4"><Empty>No hay equipos registrados.</Empty></div>}
        {teams?.map((t) => (
          <div key={t.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <TeamLogo team={t} size={40} />
            <span className="font-semibold">{t.name}</span>
            <span className="font-cond tracking-widest text-sr-gray">[{t.tag}]</span>
            <div className="ml-auto flex gap-2">
              <button className="border border-sr-line px-3 py-1.5 text-sm" onClick={() => (setTarget(t.id), fileRef.current.click())}>Subir logo</button>
              {t.logo_url && <button className="border border-sr-red/50 px-3 py-1.5 text-sm text-[#ff8a96]" onClick={() => confirm('¿Quitar el logo de este equipo?') && remove.mutate(t.id)}>Quitar logo</button>}
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

const ROLES = { superadmin: 'Superadmin', admin: 'Admin', editor: 'Editor', user: 'Usuario' }

export function AdminUsers() {
  const { user } = useAuth()
  const { data: users, isLoading } = useRepoQuery(['users'], () => repo.listUsers())
  const m = useRepoMutation(({ id, role }) => repo.setUserRole(id, role))
  return (
    <>
      <AdminHeader title="Usuarios" />
      <p className="mb-4 text-sm text-sr-gray">Solo el superadmin cambia roles. Los correos nunca se muestran en vistas públicas.</p>
      <ErrorNote error={m.error} />
      {isLoading && <Loading />}
      <div className="divide-y divide-sr-line border border-sr-line">
        {users?.map((u) => (
          <div key={u.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="font-semibold">{u.username ?? '—'}</span>
            <span className="text-sm text-sr-gray">{u.email ?? 'correo no disponible (aplica la migración 4)'}</span>
            <div className="ml-auto w-44">
              <Select value={u.role} disabled={user.role !== 'superadmin' || u.id === user.id} onChange={(e) => m.mutate({ id: u.id, role: e.target.value })}>
                {Object.entries(ROLES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </Select>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}

export function AdminAudit() {
  const { data, isLoading } = useRepoQuery(['audit'], () => repo.listAudit())
  const { data: names = {} } = useRepoQuery(['audit-names', data?.length], () => repo.profileNames((data ?? []).map((a) => a.actor_id).filter(Boolean)), { enabled: !!data?.length })
  return (
    <>
      <AdminHeader title="Auditoría" />
      {isLoading && <Loading />}
      {data && !data.length && <Empty>Sin registros todavía.</Empty>}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="font-cond text-xs uppercase tracking-widest text-sr-gray">
            <tr><th className="p-2 text-left">Fecha</th><th className="p-2 text-left">Acción</th><th className="p-2 text-left">Entidad</th><th className="p-2 text-left">Actor</th><th className="p-2 text-left">Detalle</th></tr>
          </thead>
          <tbody>
            {data?.map((a) => (
              <tr key={a.id} className="border-t border-sr-line align-top">
                <td className="whitespace-nowrap p-2 text-sr-gray">{new Date(a.created_at).toLocaleString('es-CO', { timeZone: 'America/Bogota' })}</td>
                <td className="p-2 font-semibold">{a.action}</td>
                <td className="p-2">{a.entity} <span className="text-sr-gray">{String(a.entity_id ?? '').slice(0, 12)}</span></td>
                <td className="p-2 text-sr-gray">{a.actor_id ? names[a.actor_id] ?? String(a.actor_id).slice(0, 8) : 'Sistema / enlace'}</td>
                <td className="max-w-md truncate p-2 font-mono text-xs text-sr-gray">{a.after ? JSON.stringify(a.after) : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  )
}
