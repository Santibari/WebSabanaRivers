import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useRepoQuery } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { Eyebrow, Loading, Empty, TabBar, STATUS_LABEL } from '../../components/ui.jsx'
import { GroupTable, Bracket, MatchRow } from '../../components/tournament.jsx'
import { generateBracket, roundName } from '../../../shared/standings.js'
import { markdown } from '../../lib/sanitize.js'

/** Bracket "esqueleto" con etiquetas (1.º Grupo 1…) mientras no se ha generado el real. */
function previewBracket(groupPhase, bracketPhase, groups) {
  const names = groups.filter((g) => g.phase_id === groupPhase.id).map((g) => g.name)
  const rounds = generateBracket(names.map(() => []), groupPhase.qualifiers_per_group ?? 2, names)
  return rounds.flatMap((r, ri) =>
    r.map((m, i) => ({
      id: `p-${ri}-${i}`, round: ri + 1, bracket_position: i, status: 'programado',
      best_of: bracketPhase.config?.rounds?.[roundName(r.length)] ?? bracketPhase.best_of,
      label_a: m.labelA, label_b: m.labelB,
    })),
  )
}

export function TournamentDetail() {
  const { slug } = useParams()
  const [tab, setTab] = useState('grupos')
  const { data, isLoading } = useRepoQuery(['tournament', slug], () => repo.getTournament(slug))
  if (isLoading) return <div className="mx-auto max-w-6xl px-6"><Loading /></div>
  if (!data) return <div className="mx-auto max-w-6xl px-6 py-20"><Empty>Torneo no encontrado.</Empty></div>

  const { tournament: t, phases, groups, matches } = data
  const groupPhase = phases.find((p) => p.type === 'groups')
  const bracketPhase = phases.find((p) => p.type === 'bracket')
  const bracketMatches = bracketPhase ? matches.filter((m) => m.phase_id === bracketPhase.id) : []
  const groupName = Object.fromEntries(groups.map((g) => [g.id, g.name]))
  const calendar = [...matches].filter((m) => m.team_a || m.team_b).sort((a, b) => (a.scheduled_at ?? '9').localeCompare(b.scheduled_at ?? '9'))

  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <Eyebrow>{STATUS_LABEL[t.status]} · {t.teamsCount} equipos</Eyebrow>
      <h1 className="mt-2 font-display text-5xl leading-none sm:text-7xl">Torneo {t.name}</h1>
      <div className="mt-6 border-t-2 border-sr-white" />
      <div className="mt-6">
        <TabBar
          value={tab}
          onChange={setTab}
          tabs={[
            { value: 'grupos', label: 'Grupos' },
            { value: 'calendario', label: 'Calendario' },
            ...(bracketPhase ? [{ value: 'bracket', label: 'Bracket' }] : []),
            { value: 'reglamento', label: 'Reglamento' },
          ]}
        />
      </div>

      {tab === 'grupos' && (
        <section className="mt-10">
          <h2 className="font-display text-4xl">{groupPhase?.name ?? 'Grupos'}</h2>
          <p className="mt-2 text-[#c9d1dd]">
            Desempate: puntos, luego dragones, luego torres y por último el enfrentamiento directo.
            {groupPhase && ` Series BO${groupPhase.best_of}. Pasan ${groupPhase.qualifiers_per_group ?? 2} por grupo.`}
          </p>
          {groups.length ? (
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {groups.map((g, i) => <GroupTable key={g.id} group={g} accent={i % 2 ? 'red' : 'blue'} />)}
            </div>
          ) : (
            <div className="mt-8"><Empty>Los grupos se publican cuando cierren las inscripciones.</Empty></div>
          )}
        </section>
      )}

      {tab === 'calendario' && (
        <section className="mt-10">
          <h2 className="font-display text-4xl">Calendario y resultados</h2>
          <p className="mt-2 text-sr-gray">Horas en Colombia (UTC−5).</p>
          <div className="mt-8 border border-sr-line bg-sr-panel/90">
            {calendar.length ? calendar.map((m) => <MatchRow key={m.id} m={m} groupName={groupName[m.group_id]} />) : <div className="p-6"><Empty>Aún no hay partidos programados.</Empty></div>}
          </div>
        </section>
      )}

      {tab === 'bracket' && bracketPhase && (
        <section className="mt-10">
          <h2 className="font-display text-4xl">{bracketPhase.name}</h2>
          <p className="mt-2 mb-10 text-[#c9d1dd]">
            Pasan los {groupPhase?.qualifiers_per_group ?? 2} mejores de cada grupo. El mejor clasificado de cada llave elige lado azul o rojo.
          </p>
          <Bracket matches={bracketMatches.length ? bracketMatches : groupPhase ? previewBracket(groupPhase, bracketPhase, groups) : []} />
        </section>
      )}

      {tab === 'reglamento' && (
        <section className="prose-sr mt-6 max-w-3xl" dangerouslySetInnerHTML={{ __html: markdown(t.rules || 'El reglamento se publicará pronto.') }} />
      )}
    </div>
  )
}
