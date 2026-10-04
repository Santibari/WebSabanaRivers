import { Link } from 'react-router-dom'
import { useRepoQuery } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { Eyebrow, Title, Loading, Empty, Badge, Logo, STATUS_LABEL, STATUS_TONE } from '../../components/ui.jsx'
import { formatDate } from '../../lib/format.js'

const SECTIONS = [
  { title: 'Activos', match: (t) => t.status === 'activo' },
  { title: 'Próximos · inscripciones abiertas', match: (t) => t.status === 'inscripciones' },
  { title: 'Borradores', match: (t) => t.status === 'borrador' },
  { title: 'Finalizados', match: (t) => t.status === 'finalizado' },
]

export function TournamentsPage() {
  const { data, isLoading } = useRepoQuery(['tournaments'], () => repo.listTournaments())
  return (
    <div className="mx-auto max-w-6xl px-4 pt-10 sm:px-6">
      <Eyebrow>Competencias del semillero</Eyebrow>
      <Title className="mt-2">Torneos</Title>
      <div className="mt-6 border-t-2 border-sr-white" />
      {isLoading && <Loading />}
      {data && !data.length && <div className="mt-10"><Empty>Todavía no hay torneos publicados.</Empty></div>}
      {SECTIONS.map(({ title, match }) => {
        const list = (data ?? []).filter(match)
        if (!list.length) return null
        return (
          <section key={title} className="mt-12">
            <h2 className="eyebrow text-sr-gray">{title}</h2>
            <div className="mt-4 grid gap-4 md:grid-cols-2">
              {list.map((t) => (
                <Link key={t.id} to={`/torneos/${t.slug}`} className="group flex gap-5 border border-sr-line bg-sr-panel/90 p-6 transition-colors hover:border-sr-sky">
                  <Logo className="size-16 shrink-0" />
                  <div className="min-w-0">
                    <Badge tone={STATUS_TONE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
                    <h3 className="mt-2 font-display text-2xl group-hover:text-sr-sky">{t.name}</h3>
                    <p className="mt-1 text-sm text-sr-gray">
                      {t.teamsCount} / {t.max_teams} equipos · {formatDate(t.starts_at)} – {formatDate(t.ends_at)}
                    </p>
                    {t.format_summary && <p className="mt-3 line-clamp-2 text-sm text-[#c9d1dd]">{t.format_summary}</p>}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )
      })}
    </div>
  )
}
