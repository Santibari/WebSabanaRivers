import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth, useRepoQuery, useRepoMutation, isAdminUser } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { Eyebrow, Title, Button, Field, Input, Select, ErrorNote, Panel, Badge, TeamLogo } from '../../components/ui.jsx'

const ROOMS_KEY = 'sr-my-rooms'
const readRooms = () => {
  try {
    return JSON.parse(localStorage.getItem(ROOMS_KEY) ?? '[]')
  } catch {
    return []
  }
}
export function rememberRoom(entry) {
  try {
    const list = [entry, ...readRooms().filter((r) => r.matchId !== entry.matchId)].slice(0, 12)
    localStorage.setItem(ROOMS_KEY, JSON.stringify(list))
  } catch {}
}

export function roomLinks(matchId, tokens) {
  const base = `${location.origin}/draft/${matchId}`
  return { a: `${base}/${tokens.a}`, b: `${base}/${tokens.b}`, admin: `${base}/${tokens.admin}` }
}

export function LinksPanel({ matchId, tokens, nameA, nameB }) {
  const links = roomLinks(matchId, tokens)
  const [copied, setCopied] = useState(null)
  const copy = async (key, text) => {
    await navigator.clipboard?.writeText(text)
    setCopied(key)
    setTimeout(() => setCopied(null), 1500)
  }
  const rows = [
    ['a', `Capitán · ${nameA}`, 'border-sr-sky'],
    ['b', `Capitán · ${nameB}`, 'border-sr-red'],
    ['admin', 'Admin del match (espectador y controles)', 'border-amber-400'],
  ]
  const all = rows.map(([k, label]) => `${label}: ${links[k]}`).join('\n')
  return (
    <div className="space-y-3">
      {rows.map(([k, label, color]) => (
        <div key={k} className={`flex flex-col gap-2 border-l-4 ${color} bg-sr-black p-3 sm:flex-row sm:items-center`}>
          <span className="w-72 shrink-0 text-sm font-semibold">{label}</span>
          <code className="min-w-0 flex-1 truncate text-xs text-sr-gray">{links[k]}</code>
          <div className="flex gap-2">
            <button onClick={() => copy(k, links[k])} className="border border-sr-line px-3 py-1.5 text-xs uppercase tracking-widest hover:border-sr-sky">{copied === k ? 'Copiado' : 'Copiar'}</button>
            <a href={links[k]} target="_blank" rel="noreferrer" className="border border-sr-line px-3 py-1.5 text-xs uppercase tracking-widest hover:border-sr-sky">Abrir</a>
          </div>
        </div>
      ))}
      <Button variant="ghost" onClick={() => copy('all', all)}>{copied === 'all' ? 'Copiados' : 'Copiar todos'}</Button>
      <p className="text-xs text-sr-gray">El lado (azul/rojo) se decide en la sala: moneda, elección del mejor sembrado o del perdedor de la partida anterior. Los enlaces son por equipo y valen para toda la serie.</p>
    </div>
  )
}

function CreateFriendly() {
  const { user } = useAuth()
  const { data: teams = [] } = useRepoQuery(['teams'], () => repo.listTeams(), { enabled: !!user })
  const [form, setForm] = useState({ teamA: '', teamB: '', teamAName: '', teamBName: '', bestOf: 3, fearless: 'hard', pickSeconds: 30, sideMethod: 'auto' })
  const [created, setCreated] = useState(null)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })
  const m = useRepoMutation(
    () => {
      const p = {
        bestOf: Number(form.bestOf), fearless: form.fearless, pickSeconds: Number(form.pickSeconds), sideMethod: form.sideMethod,
        ...(form.teamA ? { teamA: form.teamA } : { teamAName: form.teamAName.trim() }),
        ...(form.teamB ? { teamB: form.teamB } : { teamBName: form.teamBName.trim() }),
      }
      return repo.createMatch(p)
    },
    {
      onSuccess: (res) => {
        const nameA = teams.find((t) => t.id === form.teamA)?.name ?? form.teamAName
        const nameB = teams.find((t) => t.id === form.teamB)?.name ?? form.teamBName
        rememberRoom({ ...res, nameA, nameB, at: Date.now() })
        setCreated({ ...res, nameA, nameB })
      },
    },
  )

  if (created)
    return (
      <Panel className="space-y-5 p-6" accent="blue">
        <h3 className="font-display text-2xl">Sala creada: {created.nameA} vs {created.nameB}</h3>
        <LinksPanel matchId={created.matchId} tokens={created.tokens} nameA={created.nameA} nameB={created.nameB} />
        <Button variant="ghost" onClick={() => setCreated(null)}>Crear otro</Button>
      </Panel>
    )

  const teamPicker = (slot) => (
    <div className="space-y-2">
      {user && teams.length > 0 ? (
        <Field label={`Equipo ${slot}`}>
          <Select value={form[`team${slot}`]} onChange={set(`team${slot}`)}>
            <option value="">Escribir nombre</option>
            {teams.map((t) => <option key={t.id} value={t.id}>{t.name} [{t.tag}]</option>)}
          </Select>
        </Field>
      ) : (
        <span className="eyebrow !text-[0.7rem] text-sr-gray">Equipo {slot}</span>
      )}
      {!form[`team${slot}`] && <Input placeholder="Nombre del equipo" value={form[`team${slot}Name`]} onChange={set(`team${slot}Name`)} maxLength={40} required minLength={2} />}
    </div>
  )

  return (
    <Panel className="p-6" accent="blue">
      <form className="space-y-5" onSubmit={(e) => (e.preventDefault(), m.mutate())}>
        <div className="grid gap-4 sm:grid-cols-2">{teamPicker('A')}{teamPicker('B')}</div>
        <div className="grid gap-4 sm:grid-cols-4">
          <Field label="Formato">
            <Select value={form.bestOf} onChange={set('bestOf')}>
              <option value={1}>BO1</option><option value={3}>BO3</option><option value={5}>BO5</option><option value={2}>BO2</option>
            </Select>
          </Field>
          <Field label="Fearless">
            <Select value={form.fearless} onChange={set('fearless')}>
              <option value="hard">Hard</option><option value="soft">Soft</option><option value="off">Sin Fearless</option>
            </Select>
          </Field>
          <Field label="Segundos por acción"><Input type="number" min={10} max={120} value={form.pickSeconds} onChange={set('pickSeconds')} /></Field>
          <Field label="Lados">
            <Select value={form.sideMethod} onChange={set('sideMethod')}>
              <option value="auto">Moneda</option><option value="manual">Elegir manualmente</option>
            </Select>
          </Field>
        </div>
        <ErrorNote error={m.error} />
        <Button type="submit" skew disabled={m.isPending}>Crear sala</Button>
      </form>
    </Panel>
  )
}

function JoinWithLink() {
  const [value, setValue] = useState('')
  const [err, setErr] = useState(null)
  const nav = useNavigate()
  const go = (e) => {
    e.preventDefault()
    const m = value.trim().match(/draft\/([^/\s]+)(?:\/([^/\s?#]+))?/)
    if (!m) return setErr(new Error('Pega el enlace completo de la sala'))
    nav(`/draft/${m[1]}${m[2] ? `/${m[2]}` : ''}`)
  }
  return (
    <Panel className="p-6" accent="red">
      <form onSubmit={go} className="space-y-4">
        <Field label="Enlace de tu equipo"><Input value={value} onChange={(e) => setValue(e.target.value)} placeholder="https://…/draft/…/…" /></Field>
        <ErrorNote error={err} />
        <Button type="submit" variant="danger" skew>Entrar a la sala</Button>
      </form>
    </Panel>
  )
}

function MyRooms() {
  const { user } = useAuth()
  const { data: mine = [] } = useRepoQuery(['my-teams', user?.id], () => repo.myTeams(), { enabled: !!user })
  const { data: live = [] } = useRepoQuery(['live-matches'], () => repo.listLiveMatches(), { enabled: !!user })
  const recent = readRooms()
  const myIds = new Set(mine.map((t) => t.id))
  const tournamentRooms = live.filter((m) => m.status !== 'finalizado' && (myIds.has(m.team_a) || myIds.has(m.team_b)))
  if (!tournamentRooms.length && !recent.length) return null
  return (
    <section className="mt-14">
      <h2 className="font-display text-3xl">Mis salas</h2>
      <div className="mt-5 grid gap-3">
        {tournamentRooms.map((m) => (
          <Link key={m.id} to={`/draft/${m.id}`} className="flex items-center gap-4 border border-sr-line bg-sr-panel/90 p-4 hover:border-sr-sky">
            <TeamLogo team={m.teamA} size={30} />
            <span className="font-semibold">{m.teamA?.name} vs {m.teamB?.name}</span>
            <Badge tone="sky">Juego {m.game?.number} · {m.game?.status}</Badge>
            <span className="ml-auto text-sm text-sr-sky">Entrar →</span>
          </Link>
        ))}
        {recent.map((r) => (
          <details key={r.matchId} className="border border-sr-line bg-sr-panel/90 p-4">
            <summary className="cursor-pointer font-semibold">{r.nameA} vs {r.nameB} <span className="text-sm text-sr-gray">· creada por ti</span></summary>
            <div className="mt-4"><LinksPanel matchId={r.matchId} tokens={r.tokens} nameA={r.nameA} nameB={r.nameB} /></div>
          </details>
        ))}
      </div>
    </section>
  )
}

export function DraftHome() {
  const { user } = useAuth()
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <Eyebrow>Simulador · Fearless · tiempo real</Eyebrow>
      <Title className="mt-2">Draft</Title>
      <p className="mt-3 max-w-2xl text-[#c9d1dd]">
        Cada capitán entra con el enlace de su equipo, en su propia ventana. Orden de torneo: 5 bans y 5 picks por equipo,
        con Fearless entre partidas de la misma serie.
        {isAdminUser(user) && <> Las salas de partidos del torneo se abren desde <Link to="/admin/drafts" className="text-sr-sky underline">Admin · Drafts</Link>.</>}
      </p>
      <div className="mt-6 border-t-2 border-sr-white" />
      <div className="mt-10 grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <section>
          <h2 className="eyebrow text-sr-gray">Draft libre · sin cuenta</h2>
          <p className="mt-1 text-sm text-[#c9d1dd]">Crea una sala para practicar o jugar un amistoso. Comparte el enlace de cada equipo y guarda el de admin para controlar la sala.</p>
          <div className="mt-3"><CreateFriendly /></div>
        </section>
        <section>
          <h2 className="eyebrow text-sr-gray">Ya tengo enlace</h2>
          <div className="mt-3"><JoinWithLink /></div>
        </section>
      </div>
      <MyRooms />
      {!user && (
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border border-sr-line bg-sr-panel/80 p-6">
          <p className="text-[#c9d1dd]"><b className="text-sr-white">¿Juegas un torneo?</b> Los drafts oficiales exigen iniciar sesión con la cuenta de tu equipo.</p>
          <Button as={Link} to="/login">Iniciar sesión</Button>
        </div>
      )}
    </div>
  )
}
