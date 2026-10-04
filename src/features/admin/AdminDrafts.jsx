import { Link } from 'react-router-dom'
import { useRepoQuery } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { AdminHeader } from './AdminLayout.jsx'
import { Badge, Loading, Empty, TeamLogo, Button } from '../../components/ui.jsx'

const GAME_STATUS = {
  lados: ['Definiendo lados', 'amber'], sala: ['Sala de espera', 'amber'], draft: ['Draft en curso', 'sky'],
  jugando: ['Jugando', 'sky'], reporte: ['Esperando reportes', 'amber'], cerrada: ['Cerrada', 'gray'],
}

export function AdminDrafts() {
  const { data, isLoading } = useRepoQuery(['live-matches'], () => repo.listLiveMatches(), { refetchInterval: 10_000 })
  const open = (data ?? []).filter((m) => m.status !== 'finalizado')
  const done = (data ?? []).filter((m) => m.status === 'finalizado')
  const row = (m) => {
    const [label, tone] = GAME_STATUS[m.game?.status] ?? ['—', 'gray']
    const dispute = m.game?.result_status === 'disputa'
    return (
      <div key={m.id} className={`flex flex-wrap items-center gap-3 border-b border-sr-line px-4 py-3 ${dispute ? 'bg-sr-wine/40' : ''}`}>
        <TeamLogo team={m.teamA} size={28} />
        <span className="font-semibold">{m.teamA?.name} vs {m.teamB?.name}</span>
        <span className="text-sm text-sr-gray">{m.tournament_id ? 'Torneo' : 'Amistoso'} · BO{m.best_of} · {m.score_a}-{m.score_b} · juego {m.game?.number}</span>
        <Badge tone={tone}>{label}</Badge>
        {dispute && <Badge tone="red">Disputa</Badge>}
        <Button as={Link} to={`/draft/${m.id}`} variant="ghost" className="ml-auto !py-1.5">Espectar / controlar</Button>
      </div>
    )
  }
  return (
    <>
      <AdminHeader title="Drafts">
        <Button as={Link} to="/draft" variant="ghost">Crear amistoso</Button>
      </AdminHeader>
      <p className="mb-4 text-sm text-sr-gray">La vista de espectador es solo para el admin: pausar, deshacer, reiniciar tiempo, cambiar lados y resolver disputas. Las salas de partidos del torneo se abren desde Torneos → Partidos.</p>
      {isLoading && <Loading />}
      <h2 className="eyebrow mb-2 text-sr-gray">En curso</h2>
      <div className="border border-sr-line bg-sr-panel/90">{open.length ? open.map(row) : <div className="p-4"><Empty>No hay salas abiertas.</Empty></div>}</div>
      {done.length > 0 && (
        <>
          <h2 className="eyebrow mb-2 mt-8 text-sr-gray">Terminadas</h2>
          <div className="border border-sr-line bg-sr-panel/90">{done.map(row)}</div>
        </>
      )}
    </>
  )
}
