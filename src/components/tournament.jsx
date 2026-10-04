import { TeamLogo, Badge } from './ui.jsx'
import { roundName } from '../../shared/standings.js'
import { formatDateTime } from '../lib/format.js'

const LETTERS = 'ABCDEFGHIJ'

/** Tabla de grupo con el estilo del afiche. compact = solo D · T · PTS (inicio). */
export function GroupTable({ group, accent = 'blue', compact = false }) {
  const color = accent === 'blue' ? 'text-sr-sky' : 'text-sr-red'
  const cols = compact ? ['D', 'T', 'PTS'] : ['PJ', 'G', 'E', 'P', 'D', 'T', 'PTS']
  const titles = { PJ: 'Partidos jugados', G: 'Ganados', E: 'Empatados', P: 'Perdidos', D: 'Dragones', T: 'Torres', PTS: 'Puntos' }
  return (
    <section className={`bg-sr-panel/90 border border-sr-line border-t-2 ${accent === 'blue' ? 'border-t-sr-sky' : 'border-t-sr-red'}`}>
      <header className="flex items-center justify-between px-5 py-4 border-b border-sr-line">
        <h3 className="font-display text-2xl">{group.name}</h3>
        <span className="eyebrow !text-[0.7rem] text-sr-gray">{compact ? 'D · T · PTS' : 'Posiciones'}</span>
      </header>
      <table className="w-full text-sm">
        <caption className="sr-only">Tabla de {group.name}: puntos, dragones y torres</caption>
        {!compact && (
          <thead>
            <tr className="text-sr-gray font-cond tracking-widest text-xs">
              <th className="w-10" />
              <th className="text-left font-semibold py-2">EQUIPO</th>
              {cols.map((c) => <th key={c} title={titles[c]} className="w-10 text-center font-semibold">{c}</th>)}
            </tr>
          </thead>
        )}
        <tbody>
          {group.standings.length === 0 && (
            <tr><td colSpan={cols.length + 2} className="px-5 py-6 text-sr-gray">Aún no hay equipos en este grupo.</td></tr>
          )}
          {group.standings.map((row, i) => (
            <tr key={row.team.id} className="border-t border-sr-line first:border-t-0">
              <td className={`pl-5 w-10 font-display ${color}`}>{LETTERS[i]}</td>
              <td className="py-3">
                <span className="flex items-center gap-3">
                  <TeamLogo team={row.team} size={30} />
                  <span className="font-semibold">{row.team.name}</span>
                </span>
              </td>
              {!compact && (
                <>
                  <td className="text-center tabular-nums">{row.played}</td>
                  <td className="text-center tabular-nums">{row.won}</td>
                  <td className="text-center tabular-nums">{row.drawn}</td>
                  <td className="text-center tabular-nums">{row.lost}</td>
                </>
              )}
              <td className="text-center tabular-nums text-[#c9d1dd]">{row.dragons}</td>
              <td className="text-center tabular-nums text-[#c9d1dd]">{row.towers}</td>
              <td className="pr-5 text-center font-display text-base">{row.points}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  )
}

function BracketSlot({ team, label, score, won }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${won ? 'bg-sr-navy/60' : ''}`}>
      <TeamLogo team={team} size={34} />
      <span className={`flex-1 truncate font-semibold ${team ? '' : 'text-[#c9d1dd]'}`}>{team?.name ?? label}</span>
      <span className="font-display text-lg w-6 text-right">{score ?? '–'}</span>
    </div>
  )
}

function BracketMatch({ m, title, final }) {
  const done = m.status === 'finalizado'
  return (
    <div>
      <p className={`eyebrow mb-2 !text-[0.72rem] ${final ? 'text-sr-sky' : 'text-[#c9d1dd]'}`}>{title} · BO{m.best_of}</p>
      <div className={`border-2 divide-y divide-sr-line bg-sr-ink ${final ? 'border-sr-sky' : 'border-sr-white'}`}>
        <BracketSlot team={m.teamA} label={m.label_a ?? 'Por definir'} score={done || m.status === 'en_curso' ? m.score_a : null} won={done && m.winner_slot === 'a'} />
        <BracketSlot team={m.teamB} label={m.label_b ?? 'Por definir'} score={done || m.status === 'en_curso' ? m.score_b : null} won={done && m.winner_slot === 'b'} />
      </div>
    </div>
  )
}

/** Bracket de eliminatorias por rondas, con conectores. Sin calendario (decisión de diseño). */
export function Bracket({ matches }) {
  const rounds = []
  for (const m of matches) (rounds[m.round - 1] ??= []).push(m)
  rounds.forEach((r) => r.sort((a, b) => a.bracket_position - b.bracket_position))
  if (!rounds.length) return null
  const final = rounds.at(-1)?.[0]
  const champion = final?.status === 'finalizado' ? (final.winner_slot === 'a' ? final.teamA : final.teamB) : null

  return (
    <div className="overflow-x-auto thin-scroll pb-4">
      <div className="flex min-w-[720px] items-stretch">
        {rounds.map((round, ri) => {
          const isFinal = ri === rounds.length - 1
          const name = roundName(round.length)
          return (
            <div key={ri} className="flex flex-1 items-stretch">
              <div className="flex flex-1 flex-col justify-around gap-10">
                {isFinal ? (
                  <div className="space-y-6">
                    <BracketMatch m={round[0]} title="Final" final />
                    <div className="border-2 border-sr-white px-6 py-5 text-center">
                      <p className="eyebrow text-[#c9d1dd] !text-[0.72rem]">Campeón</p>
                      <p className="mt-1 font-display text-3xl">{champion?.name ?? 'Por definir'}</p>
                    </div>
                  </div>
                ) : (
                  round.map((m, i) => <BracketMatch key={m.id} m={m} title={`${name} ${round.length > 1 ? i + 1 : ''}`.trim()} />)
                )}
              </div>
              {!isFinal && (
                <div className="flex w-16 flex-col justify-around" aria-hidden="true">
                  {Array.from({ length: Math.ceil(round.length / 2) }, (_, i) => (
                    <div key={i} className="relative flex-1">
                      <div className="absolute left-2 right-0 top-1/4 bottom-1/4 border-y-2 border-r-2 border-sr-sky" />
                      <div className="absolute right-[-1.5rem] top-1/2 w-6 border-t-2 border-sr-sky" />
                    </div>
                  ))}
                </div>
              )}
              {!isFinal && <div className="w-6" />}
            </div>
          )
        })}
      </div>
    </div>
  )
}

const MATCH_STATUS = { programado: ['Programado', 'gray'], en_curso: ['En curso', 'sky'], finalizado: ['Finalizado', 'green'] }

export function MatchRow({ m, groupName, actions }) {
  const [label, tone] = MATCH_STATUS[m.status] ?? ['—', 'gray']
  return (
    <div className="flex flex-col gap-3 border-b border-sr-line px-4 py-3 sm:flex-row sm:items-center">
      <div className="w-44 shrink-0 text-sm text-sr-gray">
        <p>{formatDateTime(m.scheduled_at)}</p>
        <p className="font-cond uppercase tracking-widest text-xs">{groupName ?? (m.round ? `Ronda ${m.round}` : 'Amistoso')} · BO{m.best_of}</p>
      </div>
      <div className="flex flex-1 items-center gap-3">
        <span className="flex flex-1 items-center justify-end gap-2 text-right font-semibold">
          {m.teamA?.name ?? m.label_a ?? m.team_a_name ?? 'Por definir'} <TeamLogo team={m.teamA} size={28} />
        </span>
        <span className="w-16 text-center font-display text-lg tabular-nums">
          {m.status === 'programado' ? 'vs' : `${m.score_a}-${m.score_b}`}
        </span>
        <span className="flex flex-1 items-center gap-2 font-semibold">
          <TeamLogo team={m.teamB} size={28} /> {m.teamB?.name ?? m.label_b ?? m.team_b_name ?? 'Por definir'}
        </span>
      </div>
      <div className="flex items-center gap-2 sm:w-auto">
        <Badge tone={tone}>{label}</Badge>
        {actions}
      </div>
    </div>
  )
}
