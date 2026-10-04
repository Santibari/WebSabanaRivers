import { StrictMode, Component } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, RouterProvider, Navigate } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import './styles.css'
import { AuthProvider, LiveUpdates } from './app/hooks.jsx'
import { Layout, BareLayout } from './app/Layout.jsx'
import { HomePage } from './features/home/HomePage.jsx'
import { TournamentsPage } from './features/tournaments/TournamentsPage.jsx'
import { TournamentDetail } from './features/tournaments/TournamentDetail.jsx'
import { DraftHome } from './features/draft/DraftHome.jsx'
import { DraftRoom } from './features/draft/DraftRoom.jsx'
import { TeamPage } from './features/team/TeamPage.jsx'
import { LoginPage } from './features/auth/LoginPage.jsx'
import { AdminLayout } from './features/admin/AdminLayout.jsx'
import { AdminTournaments, AdminTournamentEdit } from './features/admin/AdminTournaments.jsx'
import { TournamentWizard } from './features/admin/TournamentWizard.jsx'
import { AdminDrafts } from './features/admin/AdminDrafts.jsx'
import { AdminContent } from './features/admin/AdminContent.jsx'
import { AdminEvents } from './features/admin/AdminEvents.jsx'
import { AdminTeams, AdminUsers, AdminAudit } from './features/admin/AdminPeople.jsx'

/** Nunca deja la app en blanco: cualquier error de render muestra un aviso. */
class ErrorBoundary extends Component {
  state = { error: null }
  static getDerivedStateFromError(error) {
    return { error }
  }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="mx-auto max-w-xl px-6 py-24 text-center">
        <h1 className="font-display text-3xl">Algo salió mal</h1>
        <p className="mt-3 text-sr-gray">{String(this.state.error.message ?? this.state.error)}</p>
        <a href="/" className="mt-6 inline-block text-sr-sky underline">Volver al inicio</a>
      </div>
    )
  }
}

const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/torneos', element: <TournamentsPage /> },
      { path: '/torneos/:slug', element: <TournamentDetail /> },
      { path: '/draft', element: <DraftHome /> },
      { path: '/equipo', element: <TeamPage /> },
      { path: '/login', element: <LoginPage /> },
      {
        path: '/admin',
        element: <AdminLayout />,
        children: [
          { index: true, element: <Navigate to="torneos" replace /> },
          { path: 'torneos', element: <AdminTournaments /> },
          { path: 'torneos/nuevo', element: <TournamentWizard /> },
          { path: 'torneos/:id', element: <AdminTournamentEdit /> },
          { path: 'drafts', element: <AdminDrafts /> },
          { path: 'eventos', element: <AdminEvents /> },
          { path: 'contenido', element: <AdminContent /> },
          { path: 'equipos', element: <AdminTeams /> },
          { path: 'usuarios', element: <AdminUsers /> },
          { path: 'auditoria', element: <AdminAudit /> },
        ],
      },
      { path: '*', element: <div className="mx-auto max-w-6xl px-6 py-24"><h1 className="font-display text-4xl">Página no encontrada</h1></div> },
    ],
  },
  {
    element: <BareLayout />,
    children: [
      { path: '/draft/:id', element: <DraftRoom /> },
      { path: '/draft/:id/:token', element: <DraftRoom /> },
    ],
  },
])

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false, staleTime: 15_000 } } })

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ErrorBoundary>
      <QueryClientProvider client={qc}>
        <AuthProvider>
          <LiveUpdates />
          <RouterProvider router={router} />
        </AuthProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  </StrictMode>,
)
