import { useParams, Link } from 'react-router-dom'
import { useRoom } from './useRoom.js'
import { useChampions } from '../../app/hooks.jsx'
import { Loading, Button } from '../../components/ui.jsx'
import { CaptainBoard } from './CaptainBoard.jsx'
import { SpectatorView } from './SpectatorView.jsx'
import { Stage, SideSelect, CoinReveal, Lobby, GameClock, ReportForm, SeriesDone, AdminControls } from './phases.jsx'

export function DraftRoom() {
  const { id, token } = useParams()
  const { room, derived: d, error, hover, presence, now, remaining, call, adminOp, sendHover } = useRoom(id, token)
  const { data: champs, error: champError } = useChampions()

  if (error && !room)
    return (
      <div className="mx-auto max-w-lg px-6 py-24 text-center">
        <h1 className="font-display text-3xl">No puedes entrar a esta sala</h1>
        <p className="mt-3 text-sr-gray">{error.message}</p>
        <div className="mt-6 flex justify-center gap-3">
          {error.status === 401 && <Button as={Link} to="/login">Iniciar sesión</Button>}
          <Button as={Link} to="/draft" variant="ghost">Volver al draft</Button>
        </div>
      </div>
    )
  if (champError) return <div className="p-10 text-center text-[#ff8a96]">No se pudo cargar Data Dragon: {champError.message}</div>
  if (!room || !champs) return <div className="grid min-h-dvh place-items-center"><Loading label="Entrando a la sala…" /></div>

  const { game, match, viewer } = room
  const isAdmin = viewer.role === 'admin'
  const admin = isAdmin ? <AdminControls room={room} d={d} adminOp={adminOp} presence={presence} /> : null

  if (match.status === 'finalizado')
    return <Stage room={room} d={d}><SeriesDone room={room} /></Stage>

  if (game.status === 'lados')
    return <Stage room={room} d={d}><SideSelect room={room} d={d} call={call} />{admin}</Stage>

  if (game.status === 'sala')
    return (
      <Stage room={room} d={d}>
        <CoinReveal room={room} d={d} now={now} />
        <Lobby room={room} d={d} call={call} presence={presence} />
        {admin}
      </Stage>
    )

  const clock = <GameClock room={room} now={now} call={call} />

  if (isAdmin)
    return (
      <SpectatorView
        room={room} d={d} champs={champs} hover={hover} remaining={remaining}
        controls={<div className="space-y-3">{game.started_at && clock}{admin}</div>}
      />
    )

  return (
    <>
      <CaptainBoard room={room} d={d} champs={champs} hover={hover} remaining={remaining} call={call} sendHover={sendHover} footer={game.started_at ? clock : null} />
      {game.status === 'reporte' && (
        <div className="fixed inset-0 z-40 grid place-items-center overflow-y-auto bg-black/80 p-4">
          <div className="flex flex-col items-center gap-4">
            {clock}
            <ReportForm room={room} d={d} call={call} />
          </div>
        </div>
      )}
    </>
  )
}
