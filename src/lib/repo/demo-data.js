// Datos de ejemplo del MODO DEMO (sin Supabase). Torneo actual: 6 equipos en 2 grupos de 3.
// Usuarios de prueba: en modo demo la contraseña no se verifica; se entra con "Entrar como".
import { DEFAULT_SCORING } from '../../../shared/standings.js'
import { roundRobin } from '../../../shared/draft-engine.js'

const day = (d, h = 19) => new Date(Date.UTC(2026, 9, d, h + 5, 0)).toISOString() // hora Colombia → UTC

export function demoSeed() {
  const users = [
    { id: 'u-admin', email: 'admin@sabanarivers.test', username: 'Admin Sabana Rivers', role: 'superadmin' },
    { id: 'u-editor', email: 'editor@sabanarivers.test', username: 'Editor', role: 'editor' },
    { id: 'u-nog', email: 'capitan.nog@demo.test', username: 'Capitán Owls Gold', role: 'user' },
    { id: 'u-wur', email: 'capitan.wur@demo.test', username: 'Capitán Wolves UR', role: 'user' },
    { id: 'u-sr', email: 'capitan.sr@demo.test', username: 'Capitán Sabana Rivers', role: 'user' },
    { id: 'u-nob', email: 'capitan.nob@demo.test', username: 'Capitán Owls Black', role: 'user' },
    { id: 'u-wura', email: 'capitan.wura@demo.test', username: 'Capitán Wolves Academy', role: 'user' },
    { id: 'u-sra', email: 'capitan.sra@demo.test', username: 'Capitán SR Academy', role: 'user' },
  ]
  const teams = [
    { id: 't-nog', name: 'Noctua Owls Gold', tag: 'NOG', captain_id: 'u-nog' },
    { id: 't-wur', name: 'Wolves UR', tag: 'WUR', captain_id: 'u-wur' },
    { id: 't-sr', name: 'Sabana Rivers', tag: 'SR', captain_id: 'u-sr' },
    { id: 't-nob', name: 'Noctua Owls Black', tag: 'NOB', captain_id: 'u-nob' },
    { id: 't-wura', name: 'Wolves UR Academy', tag: 'WURA', captain_id: 'u-wura' },
    { id: 't-sra', name: 'SR Academy', tag: 'SRA', captain_id: 'u-sra' },
  ].map((t) => ({ ...t, logo_url: t.id === 't-sr' ? '/logo-sabana-rivers-azul.webp' : null, status: 'activo' }))
  const team_members = teams.map((t) => ({ team_id: t.id, user_id: t.captain_id, role: 'captain' }))

  const tournament = {
    id: 'tor-lol', slug: 'league-of-legends-2026', name: 'League of Legends', status: 'activo',
    description: 'Torneo interno del semillero: 6 equipos, fase de grupos todos contra todos y eliminatorias.',
    format_summary: 'Dos grupos de 3 equipos, series BO3. Pasan los 2 mejores de cada grupo a semifinales (BO3) y final (BO5). Draft Fearless: lo pickeado en la serie no se repite.',
    rules: '## Formato\nFase de grupos todos contra todos en series **BO3**. Pasan los 2 mejores de cada grupo.\n\n## Draft\nDraft de torneo: 5 bans y 5 picks por equipo. **Hard Fearless**: los campeones pickeados en partidas anteriores de la serie quedan bloqueados para ambos equipos.\n\n## Lados\nEn grupos, la moneda del servidor asigna el lado. En eliminatorias elige el mejor clasificado. Desde la partida 2 elige el perdedor de la anterior.\n\n## Resultados\nAl terminar, cada capitán reporta el ganador y las torres y dragones de su equipo. Si no coinciden, el admin resuelve.\n\n## Desempate\nPuntos, luego dragones, luego torres y por último el enfrentamiento directo.',
    fearless_mode: 'hard', pick_seconds: 30, max_teams: 6, approval_mode: 'manual',
    starts_at: day(10), ends_at: day(31), registration_opens_at: day(1), registration_closes_at: day(8),
    image_path: null, show_on_home: true,
  }
  const phases = [
    { id: 'ph-groups', tournament_id: 'tor-lol', position: 0, name: 'Fase de grupos', type: 'groups', best_of: 3, groups_count: 2, qualifiers_per_group: 2, double_round: false, config: {}, status: 'en_curso' },
    { id: 'ph-bracket', tournament_id: 'tor-lol', position: 1, name: 'Eliminatorias', type: 'bracket', best_of: 3, config: { rounds: { Semifinal: 3, Final: 5 } }, status: 'pendiente' },
  ]
  const groups = [
    { id: 'g-1', tournament_id: 'tor-lol', phase_id: 'ph-groups', name: 'Grupo 1', position: 0 },
    { id: 'g-2', tournament_id: 'tor-lol', phase_id: 'ph-groups', name: 'Grupo 2', position: 1 },
  ]
  const tournament_teams = teams.map((t, i) => ({
    tournament_id: 'tor-lol', team_id: t.id, group_id: i < 3 ? 'g-1' : 'g-2', status: 'aprobado', seed: null,
  }))

  const matches = []
  groups.forEach((g, gi) => {
    const ids = tournament_teams.filter((tt) => tt.group_id === g.id).map((tt) => tt.team_id)
    roundRobin(ids).forEach((pairs, r) =>
      pairs.forEach(([a, b]) =>
        matches.push({
          id: `m-${g.id}-${r}`, tournament_id: 'tor-lol', phase_id: 'ph-groups', group_id: g.id,
          team_a: a, team_b: b, best_of: 3, fearless_mode: 'hard', pick_seconds: 30, side_method: 'auto',
          require_login: true, scheduled_at: day(10 + r * 7, 18 + gi), status: 'programado', score_a: 0, score_b: 0,
          winner_slot: null, winner_id: null, round: r + 1,
        }),
      ),
    )
  })

  const events = [
    { id: 'ev-1', tournament_id: 'tor-lol', title: 'Jornada 1 · Fase de grupos', starts_at: day(10, 18), location: 'Discord Sabana Rivers', description: 'Primera jornada de los dos grupos.', published: true },
    { id: 'ev-2', tournament_id: 'tor-lol', title: 'Jornada 2 · Fase de grupos', starts_at: day(17, 18), location: 'Discord Sabana Rivers', description: 'Segunda jornada.', published: true },
    { id: 'ev-3', tournament_id: 'tor-lol', title: 'Semifinales y final', starts_at: day(31, 15), location: 'Universidad de La Sabana', description: 'Presencial.', published: true },
  ]

  const blocks = [
    { id: 'b-hero', type: 'hero', position: 0, visible: true, status: 'publicado', content: { title: 'Sabana Rivers', subtitle: 'Somos semillero de esports', cta: { text: 'Ir al draft', href: '/draft' }, splash: 'Ahri' } },
    { id: 'b-active', type: 'active_tournaments', position: 1, visible: true, status: 'publicado', content: { marquee: ['Torneo League of Legends', 'Organizado por Sabana Rivers', 'Fase de grupos en curso', 'Draft Fearless'] } },
    { id: 'b-cards', type: 'cards', position: 2, visible: true, status: 'publicado', content: {
      eyebrow: 'Cómo se juega', title: 'De la moneda a la tabla', items: [
        { icon: 'coin', title: 'Moneda', text: 'En la fase de grupos, el servidor lanza la moneda y asigna el lado azul o rojo.' },
        { icon: 'draft', title: 'Draft Fearless', text: 'Cada capitán en su ventana: 5 bans y 5 picks. Lo jugado no se repite en la serie.' },
        { icon: 'timer', title: 'Partida', text: 'Corre el contador. Se detiene cuando un capitán pulsa "Terminar encuentro".' },
        { icon: 'trophy', title: 'Resultado', text: 'Cada capitán reporta ganador, torres y dragones. La tabla se actualiza sola.' },
      ] } },
    { id: 'b-events', type: 'events', position: 3, visible: true, status: 'publicado', content: { title: 'Próximos eventos', limit: 3 } },
    { id: 'b-about', type: 'rich_text', position: 4, visible: true, status: 'publicado', content: { title: 'Quiénes somos', html: '<p>Sabana Rivers es el semillero de esports de la Universidad de La Sabana. Entrenamos, competimos y organizamos torneos abiertos a la comunidad.</p>' } },
    { id: 'b-social', type: 'social', position: 5, visible: true, status: 'publicado', content: { title: 'Síguenos', links: [
      { network: 'discord', url: 'https://discord.com' }, { network: 'instagram', url: 'https://instagram.com' },
      { network: 'tiktok', url: 'https://tiktok.com' }, { network: 'twitch', url: 'https://twitch.tv' },
    ] } },
  ]

  return {
    version: 1,
    profiles: users,
    teams, team_members, team_invites: [],
    tournaments: [tournament], phases, groups, tournament_teams,
    scoring_rules: { 'tor-lol': { ...DEFAULT_SCORING } },
    matches, games: [], sessions: [], actions: [], reports: [], coins: [], match_tokens: [],
    events, pages: { inicio: blocks }, audit: [],
    settings: { max_teams_global: 10 },
  }
}
