import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useRepoQuery, useRepoMutation } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { AdminHeader } from './AdminLayout.jsx'
import { Button, Field, Input, Select, Textarea, ErrorNote, Panel, Logo, Eyebrow } from '../../components/ui.jsx'
import { DEFAULT_SCORING } from '../../../shared/standings.js'
import { slugify, fromLocalInput, toLocalInput } from '../../lib/format.js'

const SCORING_ROWS = [
  ['bo1_1_0', 'BO1 ganado'],
  ['bo3_2_0', 'BO3 ganado 2-0'],
  ['bo3_2_1', 'BO3 ganado 2-1'],
  ['bo5_3_0', 'BO5 ganado 3-0'],
  ['bo5_3_1', 'BO5 ganado 3-1'],
  ['bo5_3_2', 'BO5 ganado 3-2'],
  ['draw', 'Empate 1-1 (solo BO2)'],
]

export function ScoringEditor({ rules, onChange }) {
  const set = (key, who, v) => onChange({ ...rules, [key]: { ...(rules[key] ?? { winner: 0, loser: 0 }), [who]: Math.max(0, Number(v) || 0) } })
  return (
    <table className="w-full max-w-xl border border-sr-line text-sm">
      <thead className="font-cond text-xs uppercase tracking-widest text-sr-gray">
        <tr><th className="p-3 text-left">Resultado de la serie</th><th className="p-3">Ganador</th><th className="p-3">Perdedor</th></tr>
      </thead>
      <tbody>
        {SCORING_ROWS.map(([k, label]) => (
          <tr key={k} className="border-t border-sr-line">
            <td className="p-3">{label}</td>
            {['winner', 'loser'].map((who) => (
              <td key={who} className="p-2 text-center">
                <input type="number" min={0} max={10} aria-label={`${label} · ${who === 'winner' ? 'ganador' : 'perdedor'}`} value={rules[k]?.[who] ?? 0} onChange={(e) => set(k, who, e.target.value)} className="w-16 border border-sr-line bg-sr-black px-2 py-1.5 text-center" />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  )
}

const STEPS = ['Información', 'Cupos e inscripción', 'Fases', 'Puntos', 'Draft', 'Revisar y publicar']

const defaultPhases = [
  { name: 'Fase de grupos', type: 'groups', best_of: 3, groups_count: 2, qualifiers_per_group: 2, double_round: false, config: {} },
  { name: 'Eliminatorias', type: 'bracket', best_of: 3, config: { rounds: { Semifinal: 3, Final: 5 } } },
]

function PhaseEditor({ phases, onChange }) {
  const update = (i, patch) => onChange(phases.map((p, j) => (j === i ? { ...p, ...patch } : p)))
  const move = (i, d) => {
    const next = [...phases]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    onChange(next)
  }
  return (
    <div className="space-y-3">
      {phases.map((p, i) => (
        <Panel key={i} className="space-y-3 p-4" accent={p.type === 'groups' ? 'blue' : 'red'}>
          <div className="flex flex-wrap items-end gap-3">
            <span className="font-display text-xl">{i + 1}.</span>
            <Field label="Nombre"><Input value={p.name} onChange={(e) => update(i, { name: e.target.value })} /></Field>
            <Field label="Tipo">
              <Select value={p.type} onChange={(e) => update(i, { type: e.target.value })}>
                <option value="groups">Grupos (todos contra todos)</option>
                <option value="bracket">Eliminatoria (bracket)</option>
              </Select>
            </Field>
            <Field label="Serie por defecto">
              <Select value={p.best_of} onChange={(e) => update(i, { best_of: Number(e.target.value) })}>
                {[1, 2, 3, 5].map((n) => <option key={n} value={n}>BO{n}</option>)}
              </Select>
            </Field>
            <div className="ml-auto flex gap-1">
              <button type="button" disabled={i === 0} onClick={() => move(i, -1)} className="border border-sr-line px-3 py-2 disabled:opacity-30" aria-label="Subir">↑</button>
              <button type="button" disabled={i === phases.length - 1} onClick={() => move(i, 1)} className="border border-sr-line px-3 py-2 disabled:opacity-30" aria-label="Bajar">↓</button>
              <button type="button" onClick={() => onChange(phases.filter((_, j) => j !== i))} className="border border-sr-red/50 px-3 py-2 text-[#ff8a96]" aria-label="Quitar fase">✕</button>
            </div>
          </div>
          {p.type === 'groups' ? (
            <div className="flex flex-wrap gap-3">
              <Field label="Número de grupos"><Input type="number" min={1} max={8} value={p.groups_count ?? 2} onChange={(e) => update(i, { groups_count: Number(e.target.value) })} /></Field>
              <Field label="Clasifican por grupo"><Input type="number" min={1} max={8} value={p.qualifiers_per_group ?? 2} onChange={(e) => update(i, { qualifiers_per_group: Number(e.target.value) })} /></Field>
              <label className="flex items-center gap-2 self-end pb-3 text-sm"><input type="checkbox" checked={!!p.double_round} onChange={(e) => update(i, { double_round: e.target.checked })} /> Ida y vuelta</label>
            </div>
          ) : (
            <div className="flex flex-wrap gap-3">
              {['Cuartos de final', 'Semifinal', 'Final'].map((r) => (
                <Field key={r} label={`${r}`}>
                  <Select value={p.config?.rounds?.[r] ?? p.best_of} onChange={(e) => update(i, { config: { ...p.config, rounds: { ...(p.config?.rounds ?? {}), [r]: Number(e.target.value) } } })}>
                    {[1, 3, 5].map((n) => <option key={n} value={n}>BO{n}</option>)}
                  </Select>
                </Field>
              ))}
              <p className="self-end pb-3 text-sm text-sr-gray">Cruce: 1.º contra 2.º de grupos distintos. Sin potencia de 2, los mejores sembrados pasan directo.</p>
            </div>
          )}
        </Panel>
      ))}
      <div className="flex gap-2">
        <Button type="button" variant="ghost" onClick={() => onChange([...phases, { ...defaultPhases[0] }])}>+ Fase de grupos</Button>
        <Button type="button" variant="ghost" onClick={() => onChange([...phases, { ...defaultPhases[1] }])}>+ Eliminatoria</Button>
      </div>
    </div>
  )
}

export function TournamentWizard() {
  const nav = useNavigate()
  const { data: settings } = useRepoQuery(['settings'], () => repo.settings())
  const globalMax = Number(settings?.max_teams_global ?? 10)
  const [step, setStep] = useState(0)
  const [t, setT] = useState({
    name: '', slug: '', description: '', format_summary: '', rules: '', status: 'inscripciones',
    starts_at: null, ends_at: null, registration_opens_at: null, registration_closes_at: null,
    max_teams: 6, approval_mode: 'manual', fearless_mode: 'hard', pick_seconds: 30, show_on_home: true,
  })
  const [phases, setPhases] = useState(defaultPhases)
  const [scoring, setScoring] = useState(DEFAULT_SCORING)
  const set = (k) => (e) => setT({ ...t, [k]: e.target.value })
  const date = (k) => ({ value: toLocalInput(t[k]), onChange: (e) => setT({ ...t, [k]: fromLocalInput(e.target.value) }) })

  const create = useRepoMutation(
    () => repo.createTournament({ tournament: { ...t, max_teams: Math.min(Number(t.max_teams), globalMax), pick_seconds: Number(t.pick_seconds) }, phases, scoring }),
    { onSuccess: (row) => nav(`/admin/torneos/${row.id}`) },
  )
  const canNext = step !== 0 || (t.name.trim().length > 2 && /^[a-z0-9-]{3,60}$/.test(t.slug))

  return (
    <>
      <AdminHeader title="Nuevo torneo" />
      <ol className="mb-8 flex flex-wrap gap-2">
        {STEPS.map((s, i) => (
          <li key={s}>
            <button onClick={() => i < step && setStep(i)} className={`border px-3 py-2 font-cond text-sm uppercase tracking-widest ${i === step ? 'border-sr-sky bg-sr-navy text-sr-sky' : i < step ? 'border-sr-line text-sr-white' : 'border-sr-line text-sr-gray'}`}>
              {i + 1}. {s}
            </button>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre"><Input value={t.name} onChange={(e) => setT({ ...t, name: e.target.value, slug: slugify(e.target.value) })} placeholder="League of Legends 2026-2" /></Field>
            <Field label="Slug (URL)" hint={`/torneos/${t.slug || '…'}`}><Input value={t.slug} onChange={(e) => setT({ ...t, slug: slugify(e.target.value) })} /></Field>
            <Field label="Inicio"><Input type="datetime-local" {...date('starts_at')} /></Field>
            <Field label="Fin"><Input type="datetime-local" {...date('ends_at')} /></Field>
            <Field label="Estado inicial">
              <Select value={t.status} onChange={set('status')}>
                <option value="borrador">Borrador (no se publica)</option><option value="inscripciones">Inscripciones abiertas</option><option value="activo">Activo</option>
              </Select>
            </Field>
          </div>
          <Field label="Resumen del formato (aparece en el banner del inicio)"><Textarea value={t.format_summary} onChange={set('format_summary')} placeholder="Dos grupos de 3, series BO3; pasan 2 por grupo…" /></Field>
          <Field label="Descripción"><Textarea value={t.description} onChange={set('description')} /></Field>
          <Field label="Reglamento (## títulos, **negritas**, - listas)"><Textarea className="min-h-48 font-mono text-sm" value={t.rules} onChange={set('rules')} /></Field>
        </div>
      )}

      {step === 1 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Límite de equipos" hint={`Tope global actual: ${globalMax} (lo cambia el superadmin).`}>
            <Input type="number" min={2} max={globalMax} value={t.max_teams} onChange={set('max_teams')} />
          </Field>
          <Field label="Aprobación" hint="Si el cupo está lleno, los equipos quedan en lista de espera.">
            <Select value={t.approval_mode} onChange={set('approval_mode')}><option value="manual">Manual (el admin aprueba)</option><option value="auto">Automática</option></Select>
          </Field>
          <Field label="Abren inscripciones"><Input type="datetime-local" {...date('registration_opens_at')} /></Field>
          <Field label="Cierran inscripciones"><Input type="datetime-local" {...date('registration_closes_at')} /></Field>
        </div>
      )}

      {step === 2 && <PhaseEditor phases={phases} onChange={setPhases} />}
      {step === 3 && <ScoringEditor rules={scoring} onChange={setScoring} />}

      {step === 4 && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Modo Fearless" hint="Hard: lo pickeado se bloquea para ambos. Soft: solo para quien lo pickeó. Los bans no se arrastran.">
            <Select value={t.fearless_mode} onChange={set('fearless_mode')}><option value="hard">Hard Fearless</option><option value="soft">Soft Fearless</option><option value="off">Sin Fearless</option></Select>
          </Field>
          <Field label="Segundos por acción"><Input type="number" min={10} max={120} value={t.pick_seconds} onChange={set('pick_seconds')} /></Field>
        </div>
      )}

      {step === 5 && (
        <div className="space-y-6">
          <p className="eyebrow text-sr-gray">Vista previa del banner del inicio</p>
          <Panel className="p-6">
            <div className="flex items-center gap-4">
              <Logo className="size-14" />
              <div>
                <Eyebrow>{t.status === 'activo' ? 'Torneo activo' : 'Próximo torneo'}</Eyebrow>
                <p className="font-display text-4xl">{t.name || 'Sin nombre'}</p>
              </div>
            </div>
            <p className="mt-4 text-[#c9d1dd]">{t.format_summary || 'Sin resumen.'}</p>
          </Panel>
          <ul className="space-y-1 text-sm text-[#c9d1dd]">
            <li>Cupo: {Math.min(Number(t.max_teams), globalMax)} equipos · aprobación {t.approval_mode}</li>
            <li>Fases: {phases.map((p) => `${p.name} (${p.type === 'groups' ? `${p.groups_count} grupos, BO${p.best_of}` : 'bracket'})`).join(' → ') || 'ninguna'}</li>
            <li>Draft: {t.fearless_mode === 'off' ? 'sin Fearless' : `${t.fearless_mode === 'hard' ? 'Hard' : 'Soft'} Fearless`} · {t.pick_seconds}s por acción</li>
          </ul>
          <ErrorNote error={create.error} />
        </div>
      )}

      <div className="mt-8 flex gap-3">
        {step > 0 && <Button variant="ghost" onClick={() => setStep(step - 1)}>Atrás</Button>}
        {step < STEPS.length - 1 ? (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>Siguiente</Button>
        ) : (
          <Button skew onClick={() => create.mutate()} disabled={create.isPending || !phases.length}>Crear torneo</Button>
        )}
      </div>
    </>
  )
}
