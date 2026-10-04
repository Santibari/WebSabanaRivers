import { useRef, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { useAuth, useRepoQuery, useRepoMutation } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { Eyebrow, Title, Panel, Field, Input, Button, ErrorNote, TeamLogo, Badge, Select, Loading, Empty } from '../../components/ui.jsx'

const REG_LABEL = { pendiente: ['Pendiente', 'amber'], aprobado: ['Aprobado', 'green'], rechazado: ['Rechazado', 'red'], lista_espera: ['Lista de espera', 'gray'] }

function CreateTeam() {
  const [form, setForm] = useState({ name: '', tag: '' })
  const m = useRepoMutation(() => repo.createTeam(form), { onSuccess: () => setForm({ name: '', tag: '' }) })
  return (
    <Panel className="p-6" accent="blue">
      <h2 className="font-display text-2xl">Registrar equipo</h2>
      <p className="mt-1 text-sm text-sr-gray">Quedarás como capitán. Después subes el logo e invitas a tus compañeros.</p>
      <form className="mt-5 grid gap-4 sm:grid-cols-[1fr_140px_auto] sm:items-end" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Field label="Nombre"><Input required minLength={2} maxLength={40} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></Field>
        <Field label="Tag (2–5)"><Input required pattern="[A-Za-z0-9]{2,5}" value={form.tag} onChange={(e) => setForm({ ...form, tag: e.target.value.toUpperCase() })} /></Field>
        <Button type="submit" disabled={m.isPending}>Crear</Button>
      </form>
      <div className="mt-3"><ErrorNote error={m.error} /></div>
    </Panel>
  )
}

function JoinTeam() {
  const [code, setCode] = useState('')
  const m = useRepoMutation(() => repo.joinTeam(code))
  return (
    <Panel className="p-6" accent="red">
      <h2 className="font-display text-2xl">Unirme con código</h2>
      <form className="mt-4 flex gap-3" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <Input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="Código de invitación" required />
        <Button type="submit" variant="danger" disabled={m.isPending}>Unirme</Button>
      </form>
      <div className="mt-3"><ErrorNote error={m.error} /></div>
    </Panel>
  )
}

function TeamCard({ team, tournaments }) {
  const isCaptain = team.myRole === 'captain'
  const fileRef = useRef(null)
  const [invite, setInvite] = useState(null)
  const [tid, setTid] = useState('')
  const logo = useRepoMutation((file) => repo.uploadLogo(team.id, file))
  const inv = useRepoMutation(() => repo.createInvite(team.id), { invalidate: false, onSuccess: setInvite })
  const reg = useRepoMutation(() => repo.requestRegistration(tid, team.id))
  const open = tournaments.filter((t) => ['inscripciones', 'activo'].includes(t.status) && !team.registrations.some((r) => r.tournament_id === t.id))

  return (
    <Panel className="p-6" accent="blue">
      <div className="flex flex-wrap items-center gap-5">
        <TeamLogo team={team} size={88} />
        <div>
          <Badge tone="sky">{isCaptain ? 'Capitán' : 'Jugador'}</Badge>
          <h2 className="mt-1 font-display text-3xl">{team.name}</h2>
          <p className="font-cond tracking-[0.3em] text-sr-gray">[{team.tag}]</p>
        </div>
        {isCaptain && (
          <div className="ml-auto">
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files[0] && logo.mutate(e.target.files[0])} />
            <Button variant="ghost" onClick={() => fileRef.current.click()} disabled={logo.isPending}>{logo.isPending ? 'Subiendo…' : 'Subir logo'}</Button>
            <p className="mt-1 text-xs text-sr-gray">PNG, JPG o WEBP · máx. 2 MB · se recorta cuadrado</p>
          </div>
        )}
      </div>
      <ErrorNote error={logo.error} />

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <div>
          <h3 className="eyebrow text-sr-gray">Integrantes</h3>
          <ul className="mt-2 divide-y divide-sr-line border border-sr-line">
            {team.members.map((m) => (
              <li key={m.user_id} className="flex justify-between px-4 py-2.5">
                <span>{m.profile?.username ?? 'Jugador sin nombre'}</span>
                <span className="text-sm text-sr-gray">{m.role === 'captain' ? 'Capitán' : 'Jugador'}</span>
              </li>
            ))}
          </ul>
          {isCaptain && (
            <div className="mt-3">
              <Button variant="ghost" onClick={() => inv.mutate()} disabled={inv.isPending}>Generar código de invitación</Button>
              {invite && <p className="mt-2 text-sm">Código: <code className="bg-sr-black px-2 py-1 font-bold tracking-widest text-sr-sky">{invite.code}</code> · vence en {invite.expiresInDays} días</p>}
            </div>
          )}
        </div>
        <div>
          <h3 className="eyebrow text-sr-gray">Torneos</h3>
          <ul className="mt-2 divide-y divide-sr-line border border-sr-line">
            {team.registrations.length === 0 && <li className="px-4 py-2.5 text-sr-gray">Sin inscripciones todavía.</li>}
            {team.registrations.map((r) => {
              const [label, tone] = REG_LABEL[r.status] ?? [r.status, 'gray']
              return (
                <li key={r.tournament_id} className="flex items-center justify-between px-4 py-2.5">
                  <Link to={`/torneos/${r.tournament?.slug}`} className="hover:text-sr-sky">{r.tournament?.name}</Link>
                  <Badge tone={tone}>{label}</Badge>
                </li>
              )
            })}
          </ul>
          {isCaptain && open.length > 0 && (
            <form className="mt-3 flex gap-2" onSubmit={(e) => (e.preventDefault(), tid && reg.mutate())}>
              <Select value={tid} onChange={(e) => setTid(e.target.value)}>
                <option value="">Inscribir en…</option>
                {open.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </Select>
              <Button type="submit" disabled={!tid || reg.isPending}>Inscribir</Button>
            </form>
          )}
          <ErrorNote error={reg.error} />
        </div>
      </div>
    </Panel>
  )
}

export function TeamPage() {
  const { user, ready } = useAuth()
  const { data: teams, isLoading } = useRepoQuery(['my-teams', user?.id], () => repo.myTeams(), { enabled: !!user })
  const { data: tournaments = [] } = useRepoQuery(['tournaments'], () => repo.listTournaments())
  if (ready && !user) return <Navigate to="/login" replace />
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <Eyebrow>{user?.email}</Eyebrow>
      <Title className="mt-2">Mi equipo</Title>
      <div className="mt-6 border-t-2 border-sr-white" />
      {isLoading && <Loading />}
      <div className="mt-10 space-y-6">
        {teams?.map((t) => <TeamCard key={t.id} team={t} tournaments={tournaments} />)}
        {teams && !teams.length && <Empty>Aún no perteneces a ningún equipo.</Empty>}
        <div className="grid gap-6 lg:grid-cols-2">
          <CreateTeam />
          <JoinTeam />
        </div>
      </div>
    </div>
  )
}
