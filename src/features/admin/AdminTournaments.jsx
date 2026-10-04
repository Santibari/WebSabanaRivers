import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useRepoQuery, useRepoMutation } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { AdminHeader } from './AdminLayout.jsx'
import { Button, Badge, Loading, Empty, Panel, Field, Input, Select, Textarea, ErrorNote, TabBar, TeamLogo, STATUS_LABEL, STATUS_TONE } from '../../components/ui.jsx'
import { MatchRow } from '../../components/tournament.jsx'
import { LinksPanel, rememberRoom } from '../draft/DraftHome.jsx'
import { formatDate, toLocalInput, fromLocalInput } from '../../lib/format.js'
import { ScoringEditor } from './TournamentWizard.jsx'

export function AdminTournaments() {
  const { data, isLoading } = useRepoQuery(['tournaments'], () => repo.listTournaments())
  return (
    <>
      <AdminHeader title="Torneos"><Button as={Link} to="nuevo">Nuevo torneo</Button></AdminHeader>
      {isLoading && <Loading />}
      {data && !data.length && <Empty>No hay torneos. Crea el primero con el asistente.</Empty>}
      <div className="grid gap-3">
        {data?.map((t) => (
          <Link key={t.id} to={t.id} className="flex flex-wrap items-center gap-4 border border-sr-line bg-sr-panel/90 p-4 hover:border-sr-sky">
            <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            <span className="font-display text-xl">{t.name}</span>
            <span className="text-sm text-sr-gray">{t.teamsCount}/{t.max_teams} equipos · {formatDate(t.starts_at)}</span>
            <span className="ml-auto text-sr-sky">Gestionar →</span>
          </Link>
        ))}
      </div>
    </>
  )
}

function InfoTab({ t }) {
  const [f, setF] = useState(t)
  useEffect(() => setF(t), [t])
  const m = useRepoMutation(() =>
    repo.updateTournament(t.id, {
      name: f.name, status: f.status, description: f.description, format_summary: f.format_summary, rules: f.rules,
      starts_at: f.starts_at, ends_at: f.ends_at, show_on_home: f.show_on_home, max_teams: Number(f.max_teams),
      fearless_mode: f.fearless_mode, pick_seconds: Number(f.pick_seconds), approval_mode: f.approval_mode,
    }),
  )
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <form className="space-y-4" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Nombre"><Input value={f.name} onChange={set('name')} required /></Field>
        <Field label="Estado" hint="Al pasar a Activo aparece el banner en el inicio; al Finalizar, desaparece.">
          <Select value={f.status} onChange={set('status')}>
            {Object.entries(STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Cupo de equipos"><Input type="number" min={2} max={10} value={f.max_teams} onChange={set('max_teams')} /></Field>
        <Field label="Inicio"><Input type="datetime-local" value={toLocalInput(f.starts_at)} onChange={(e) => setF({ ...f, starts_at: fromLocalInput(e.target.value) })} /></Field>
        <Field label="Fin"><Input type="datetime-local" value={toLocalInput(f.ends_at)} onChange={(e) => setF({ ...f, ends_at: fromLocalInput(e.target.value) })} /></Field>
        <Field label="Aprobación">
          <Select value={f.approval_mode} onChange={set('approval_mode')}><option value="manual">Manual</option><option value="auto">Automática</option></Select>
        </Field>
        <Field label="Fearless">
          <Select value={f.fearless_mode} onChange={set('fearless_mode')}><option value="hard">Hard</option><option value="soft">Soft</option><option value="off">Sin Fearless</option></Select>
        </Field>
        <Field label="Segundos por acción"><Input type="number" min={10} max={120} value={f.pick_seconds} onChange={set('pick_seconds')} /></Field>
        <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={!!f.show_on_home} onChange={set('show_on_home')} /> Mostrar banner en el inicio</label>
      </div>
      <Field label="Resumen del formato (banner del inicio)"><Textarea value={f.format_summary ?? ''} onChange={set('format_summary')} /></Field>
      <Field label="Descripción"><Textarea value={f.description ?? ''} onChange={set('description')} /></Field>
      <Field label="Reglamento (## títulos, **negritas**, - listas)"><Textarea className="min-h-64 font-mono text-sm" value={f.rules ?? ''} onChange={set('rules')} /></Field>
      <ErrorNote error={m.error} />
      <Button type="submit" disabled={m.isPending}>{m.isSuccess ? 'Guardado ✓' : 'Guardar cambios'}</Button>
    </form>
  )
}

const REG_TONE = { pendiente: 'amber', aprobado: 'green', rechazado: 'red', lista_espera: 'gray' }

function TeamsTab({ t, groups }) {
  const { data: regs = [] } = useRepoQuery(['registrations', t.id], () => repo.registrations(t.id))
  const m = useRepoMutation(({ teamId, patch }) => repo.setRegistration(t.id, teamId, patch))
  const approved = regs.filter((r) => r.status === 'aprobado')
  const draw = async () => {
    // Sorteo aleatorio y equilibrado de los aprobados en los grupos de la fase de grupos.
    const shuffled = [...approved].sort(() => Math.random() - 0.5)
    for (const [i, r] of shuffled.entries()) await m.mutateAsync({ teamId: r.team_id, patch: { group_id: groups[i % groups.length].id } })
  }
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-sr-gray">{approved.length}/{t.max_teams} aprobados.</p>
        {groups.length > 0 && <Button variant="ghost" onClick={draw} disabled={!approved.length || m.isPending}>Sorteo aleatorio de grupos</Button>}
      </div>
      <ErrorNote error={m.error} />
      {regs.length === 0 && <Empty>Ningún equipo ha solicitado inscripción.</Empty>}
      <div className="divide-y divide-sr-line border border-sr-line">
        {regs.map((r) => (
          <div key={r.team_id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <TeamLogo team={r.team} size={32} />
            <span className="font-semibold">{r.team?.name}</span>
            <Badge tone={REG_TONE[r.status]}>{r.status.replace('_', ' ')}</Badge>
            <div className="ml-auto flex flex-wrap gap-2">
              {groups.length > 0 && r.status === 'aprobado' && (
                <select className="border border-sr-line bg-sr-black px-2 py-1.5 text-sm" value={r.group_id ?? ''} onChange={(e) => m.mutate({ teamId: r.team_id, patch: { group_id: e.target.value || null } })}>
                  <option value="">Sin grupo</option>
                  {groups.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              )}
              {r.status !== 'aprobado' && <button className="border border-emerald-500/50 px-3 py-1.5 text-sm text-emerald-300" onClick={() => m.mutate({ teamId: r.team_id, patch: { status: 'aprobado' } })}>Aprobar</button>}
              {r.status !== 'rechazado' && <button className="border border-sr-red/50 px-3 py-1.5 text-sm text-[#ff8a96]" onClick={() => m.mutate({ teamId: r.team_id, patch: { status: 'rechazado', group_id: null } })}>Rechazar</button>}
              {r.status !== 'lista_espera' && <button className="border border-sr-line px-3 py-1.5 text-sm" onClick={() => m.mutate({ teamId: r.team_id, patch: { status: 'lista_espera', group_id: null } })}>Lista de espera</button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function PhasesTab({ phases, matches }) {
  const sched = useRepoMutation((id) => repo.generateSchedule(id))
  const bracket = useRepoMutation((id) => repo.generateBracket(id))
  return (
    <div className="space-y-4">
      {phases.map((p) => {
        const count = matches.filter((m) => m.phase_id === p.id).length
        return (
          <Panel key={p.id} className="flex flex-wrap items-center gap-4 p-5">
            <div>
              <p className="font-display text-xl">{p.position + 1}. {p.name}</p>
              <p className="text-sm text-sr-gray">
                {p.type === 'groups' ? `Grupos · ${p.groups_count} grupos · BO${p.best_of} · pasan ${p.qualifiers_per_group}${p.double_round ? ' · ida y vuelta' : ''}` : `Eliminatoria · BO${p.best_of} por defecto${p.config?.rounds ? ` · ${Object.entries(p.config.rounds).map(([k, v]) => `${k} BO${v}`).join(', ')}` : ''}`}
              </p>
              <p className="text-sm text-sr-gray">{count} partidos · estado: {p.status}</p>
            </div>
            <div className="ml-auto">
              {p.type === 'groups' ? (
                <Button disabled={count > 0 || sched.isPending} onClick={() => sched.mutate(p.id)}>Generar calendario todos contra todos</Button>
              ) : (
                <Button disabled={count > 0 || bracket.isPending} onClick={() => confirm('¿Cerrar la fase de grupos y generar el bracket con los clasificados actuales?') && bracket.mutate(p.id)}>Generar bracket con clasificados</Button>
              )}
            </div>
          </Panel>
        )
      })}
      <ErrorNote error={sched.error ?? bracket.error} />
      {sched.data && <p className="text-sm text-emerald-300">Se crearon {sched.data.created} partidos.</p>}
      {bracket.data && <p className="text-sm text-emerald-300">Se crearon {bracket.data.created} llaves.</p>}
    </div>
  )
}

function MatchesTab({ matches, groups }) {
  const [links, setLinks] = useState(null)
  const open = useRepoMutation((m) => repo.createMatch({ matchId: m.id }).then((r) => ({ ...r, m })), {
    onSuccess: (r) => {
      rememberRoom({ matchId: r.matchId, tokens: r.tokens, nameA: r.m.teamA?.name, nameB: r.m.teamB?.name, at: Date.now() })
      setLinks(r)
    },
  })
  const upd = useRepoMutation(({ id, patch }) => repo.updateMatch(id, patch))
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]))
  if (!matches.length) return <Empty>Genera el calendario desde la pestaña Fases.</Empty>
  return (
    <div className="space-y-4">
      {links && (
        <Panel className="p-5" accent="blue">
          <p className="mb-3 font-display text-xl">Enlaces: {links.m.teamA?.name} vs {links.m.teamB?.name}</p>
          <LinksPanel matchId={links.matchId} tokens={links.tokens} nameA={links.m.teamA?.name} nameB={links.m.teamB?.name} />
          <p className="mt-2 text-xs text-sr-gray">Los capitanes también pueden entrar sin enlace desde Draft → Mis salas, con la sesión de su equipo.</p>
        </Panel>
      )}
      <ErrorNote error={open.error ?? upd.error} />
      <div className="border border-sr-line bg-sr-panel/90">
        {[...matches].sort((a, b) => (a.round ?? 0) - (b.round ?? 0)).map((m) => (
          <MatchRow
            key={m.id}
            m={m}
            groupName={groupName[m.group_id]}
            actions={
              <>
                <input
                  type="datetime-local"
                  aria-label="Fecha del partido"
                  className="border border-sr-line bg-sr-black px-2 py-1 text-xs"
                  value={toLocalInput(m.scheduled_at)}
                  onChange={(e) => upd.mutate({ id: m.id, patch: { scheduled_at: fromLocalInput(e.target.value) } })}
                />
                {m.status !== 'finalizado' && m.team_a && m.team_b && (
                  <button className="border border-sr-sky/60 px-3 py-1.5 text-xs uppercase tracking-widest text-sr-sky" onClick={() => open.mutate(m)}>
                    {m.status === 'programado' ? 'Abrir sala' : 'Enlaces'}
                  </button>
                )}
                <Link to={`/draft/${m.id}`} className="border border-sr-line px-3 py-1.5 text-xs uppercase tracking-widest">Ver</Link>
              </>
            }
          />
        ))}
      </div>
    </div>
  )
}

function ScoringTab({ t, scoring }) {
  const [rules, setRules] = useState(scoring)
  useEffect(() => setRules(scoring), [scoring])
  const m = useRepoMutation(() => repo.saveScoring(t.id, rules))
  return (
    <div className="space-y-4">
      <ScoringEditor rules={rules} onChange={setRules} />
      <ErrorNote error={m.error} />
      <Button onClick={() => m.mutate()} disabled={m.isPending}>{m.isSuccess ? 'Guardado ✓' : 'Guardar puntos'}</Button>
      <p className="text-sm text-sr-gray">La tabla se recalcula sola con estos valores; el cambio queda en la auditoría.</p>
    </div>
  )
}

export function AdminTournamentEdit() {
  const { id } = useParams()
  const [tab, setTab] = useState('info')
  const { data: list } = useRepoQuery(['tournaments'], () => repo.listTournaments())
  const slug = list?.find((t) => t.id === id)?.slug
  const { data, isLoading } = useRepoQuery(['tournament', slug], () => repo.getTournament(slug), { enabled: !!slug })
  if (isLoading || !data) return <Loading />
  const { tournament: t, phases, groups, matches, scoring } = data
  const groupPhase = phases.find((p) => p.type === 'groups')
  return (
    <>
      <AdminHeader title={t.name}>
        <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
        <Button as={Link} to={`/torneos/${t.slug}`} variant="ghost">Ver página pública</Button>
      </AdminHeader>
      <TabBar
        value={tab}
        onChange={setTab}
        tabs={[
          { value: 'info', label: 'Información' },
          { value: 'equipos', label: 'Inscripciones y grupos' },
          { value: 'fases', label: 'Fases' },
          { value: 'partidos', label: 'Partidos' },
          { value: 'puntos', label: 'Puntos' },
        ]}
      />
      <div className="mt-6">
        {tab === 'info' && <InfoTab t={t} />}
        {tab === 'equipos' && <TeamsTab t={t} groups={groups.filter((g) => g.phase_id === groupPhase?.id)} />}
        {tab === 'fases' && <PhasesTab phases={phases} matches={matches} />}
        {tab === 'partidos' && <MatchesTab matches={matches} groups={groups} />}
        {tab === 'puntos' && <ScoringTab t={t} scoring={scoring} />}
      </div>
    </>
  )
}
