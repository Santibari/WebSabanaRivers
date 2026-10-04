-- Sabana Rivers Draft · esquema base
-- Dominios: usuarios y equipos, torneos, draft, contenido. RLS en 0002.

create extension if not exists pgcrypto;

-- ───────────── Usuarios y equipos ─────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  username text unique check (char_length(username) between 2 and 32),
  summoner_name text check (char_length(summoner_name) <= 40),
  region text,
  role text not null default 'user' check (role in ('superadmin', 'admin', 'editor', 'user')),
  suspended boolean not null default false,
  created_at timestamptz not null default now()
);

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 40),
  tag text not null check (tag ~ '^[A-Za-z0-9]{2,5}$'),
  logo_path text,
  captain_id uuid not null references public.profiles (id),
  status text not null default 'activo' check (status in ('activo', 'pendiente', 'rechazado')),
  created_at timestamptz not null default now()
);
create unique index teams_name_key on public.teams (lower(name));
create unique index teams_tag_key on public.teams (upper(tag));

create table public.team_members (
  team_id uuid references public.teams (id) on delete cascade,
  user_id uuid references public.profiles (id) on delete cascade,
  role text not null default 'player' check (role in ('captain', 'player')),
  joined_at timestamptz not null default now(),
  primary key (team_id, user_id)
);

create table public.team_invites (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams (id) on delete cascade,
  code_hash text not null unique,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);

create table public.settings (
  key text primary key,
  value jsonb not null
);

-- ───────────── Torneos ─────────────
create table public.tournaments (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9-]{3,60}$'),
  name text not null,
  status text not null default 'borrador' check (status in ('borrador', 'inscripciones', 'activo', 'finalizado')),
  description text,
  rules text,
  format_summary text,
  fearless_mode text not null default 'hard' check (fearless_mode in ('hard', 'soft', 'off')),
  pick_seconds int not null default 30 check (pick_seconds between 10 and 120),
  max_teams int not null default 10 check (max_teams between 2 and 64),
  approval_mode text not null default 'manual' check (approval_mode in ('manual', 'auto')),
  starts_at timestamptz,
  ends_at timestamptz,
  registration_opens_at timestamptz,
  registration_closes_at timestamptz,
  image_path text,
  banner_path text,
  show_on_home boolean not null default true,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.tournament_phases (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  position int not null,
  name text not null,
  type text not null check (type in ('groups', 'bracket')),
  best_of int not null default 3 check (best_of in (1, 2, 3, 5)),
  groups_count int check (groups_count between 1 and 8),
  qualifiers_per_group int check (qualifiers_per_group between 1 and 8),
  double_round boolean not null default false,
  config jsonb not null default '{}'::jsonb, -- p. ej. {"rounds": {"Final": 5, "Semifinal": 3}}
  status text not null default 'pendiente' check (status in ('pendiente', 'en_curso', 'finalizada')),
  unique (tournament_id, position)
);

create table public.scoring_rules (
  tournament_id uuid references public.tournaments (id) on delete cascade,
  result_key text not null, -- bo1_1_0, bo3_2_0, bo3_2_1, bo5_3_x, draw
  points_winner int not null default 0,
  points_loser int not null default 0,
  primary key (tournament_id, result_key)
);

create table public.groups (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid not null references public.tournaments (id) on delete cascade,
  phase_id uuid references public.tournament_phases (id) on delete cascade,
  name text not null,
  position int not null default 0
);

create table public.tournament_teams (
  tournament_id uuid references public.tournaments (id) on delete cascade,
  team_id uuid references public.teams (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  status text not null default 'pendiente' check (status in ('pendiente', 'aprobado', 'rechazado', 'lista_espera')),
  seed int,
  created_at timestamptz not null default now(),
  primary key (tournament_id, team_id)
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments (id) on delete cascade, -- null = amistoso
  phase_id uuid references public.tournament_phases (id) on delete cascade,
  group_id uuid references public.groups (id) on delete set null,
  team_a uuid references public.teams (id),
  team_b uuid references public.teams (id),
  team_a_name text, -- amistosos con equipos no registrados
  team_b_name text,
  best_of int not null default 3 check (best_of in (1, 2, 3, 5)),
  fearless_mode text not null default 'hard' check (fearless_mode in ('hard', 'soft', 'off')),
  pick_seconds int not null default 30,
  side_method text not null default 'auto' check (side_method in ('auto', 'manual')),
  require_login boolean not null default true,
  scheduled_at timestamptz,
  status text not null default 'programado' check (status in ('programado', 'en_curso', 'finalizado')),
  score_a int not null default 0,
  score_b int not null default 0,
  winner_slot text check (winner_slot in ('a', 'b')),
  winner_id uuid references public.teams (id),
  round int,
  bracket_position int,
  next_match_id uuid references public.matches (id),
  next_slot text check (next_slot in ('a', 'b')),
  seed_a int,
  seed_b int,
  label_a text, -- "1.º Grupo 1" mientras no hay equipo
  label_b text,
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);
create index on public.matches (tournament_id);

create table public.games (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  number int not null,
  blue_slot text check (blue_slot in ('a', 'b')),
  status text not null default 'lados' check (status in ('lados', 'sala', 'draft', 'jugando', 'reporte', 'cerrada')),
  side_method text not null default 'coin' check (side_method in ('coin', 'choice', 'manual')),
  chooser_slot text check (chooser_slot in ('a', 'b')),
  winner_slot text check (winner_slot in ('a', 'b')),
  result_status text not null default 'pendiente' check (result_status in ('pendiente', 'confirmado', 'disputa')),
  patch text,
  started_at timestamptz,
  ended_at timestamptz,
  blue_dragons int check (blue_dragons between 0 and 20),
  blue_towers int check (blue_towers between 0 and 11),
  red_dragons int check (red_dragons between 0 and 20),
  red_towers int check (red_towers between 0 and 11),
  unique (match_id, number)
);

create table public.game_reports (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null references public.games (id) on delete cascade,
  team_side text not null check (team_side in ('blue', 'red')),
  reported_by uuid references public.profiles (id),
  winner_claim text not null check (winner_claim in ('blue', 'red')),
  towers int not null check (towers between 0 and 11),
  dragons int not null check (dragons between 0 and 20),
  created_at timestamptz not null default now(),
  unique (game_id, team_side)
);

-- ───────────── Draft ─────────────
create table public.draft_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  steps jsonb not null, -- [{ "side": "blue", "type": "ban" }, …]
  is_default boolean not null default false
);

create table public.draft_sessions (
  id uuid primary key default gen_random_uuid(),
  game_id uuid not null unique references public.games (id) on delete cascade,
  template_id uuid references public.draft_templates (id),
  steps jsonb not null,
  current_step int not null default 0,
  deadline_at timestamptz,
  pick_seconds int not null default 30,
  paused boolean not null default false,
  remaining_ms int,
  blue_ready boolean not null default false,
  red_ready boolean not null default false,
  status text not null default 'waiting' check (status in ('waiting', 'drafting', 'done'))
);

create table public.draft_actions (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.draft_sessions (id) on delete cascade,
  step int not null,
  team_side text not null check (team_side in ('blue', 'red')),
  type text not null check (type in ('ban', 'pick')),
  champion_id text, -- null = ban vacío por tiempo
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (session_id, step) -- evita acciones dobles en carreras
);

create table public.match_tokens (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  role text not null check (role in ('a', 'b', 'admin')), -- por equipo: el lado cambia entre partidas
  token_hash text not null unique,
  expires_at timestamptz not null default now() + interval '14 days'
);

create table public.coin_tosses (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references public.matches (id) on delete cascade,
  game_number int not null,
  winner_slot text not null check (winner_slot in ('a', 'b')),
  result_side text not null default 'blue',
  created_at timestamptz not null default now()
);

-- ───────────── Contenido ─────────────
create table public.events (
  id uuid primary key default gen_random_uuid(),
  tournament_id uuid references public.tournaments (id) on delete set null,
  title text not null,
  description text,
  starts_at timestamptz,
  location text,
  image_path text,
  published boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.pages (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null
);

create table public.page_blocks (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages (id) on delete cascade,
  type text not null check (type in ('hero', 'active_tournaments', 'rich_text', 'cards', 'events', 'gallery', 'social')),
  position int not null default 0,
  visible boolean not null default true,
  status text not null default 'borrador' check (status in ('borrador', 'publicado')),
  content jsonb not null default '{}'::jsonb,         -- versión publicada
  draft_content jsonb,                                 -- borrador en edición
  updated_at timestamptz not null default now()
);

create table public.champion_roles (
  champion_id text primary key,
  roles text[] not null check (roles <@ array['top', 'jungle', 'mid', 'bottom', 'utility']::text[])
);

create table public.audit_log (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles (id),
  action text not null,
  entity text not null,
  entity_id text,
  before jsonb,
  after jsonb,
  created_at timestamptz not null default now()
);

create table public.rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);
