-- Sabana Rivers Draft · seguridad: funciones auxiliares, RLS, Storage y Realtime.
-- Regla: lo que no está permitido aquí queda negado. Las escrituras del draft, partidos,
-- partidas, moneda y puntuación solo las hace /api con la llave service_role (que salta RLS).

-- ───────────── Funciones auxiliares ─────────────
create or replace function public.current_role_name() returns text
language sql stable security definer set search_path = public as $$
  select coalesce((select role from profiles where id = auth.uid() and not suspended), 'anon')
$$;

create or replace function public.is_superadmin() returns boolean
language sql stable as $$ select public.current_role_name() = 'superadmin' $$;

create or replace function public.is_admin() returns boolean
language sql stable as $$ select public.current_role_name() in ('superadmin', 'admin') $$;

create or replace function public.is_editor() returns boolean
language sql stable as $$ select public.current_role_name() in ('superadmin', 'admin', 'editor') $$;

create or replace function public.is_captain_of(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid() and role = 'captain')
$$;

create or replace function public.is_member_of(p_team uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from team_members where team_id = p_team and user_id = auth.uid())
$$;

-- Un perfil por usuario nuevo (registro solo con correo).
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, username) values (new.id, nullif(new.raw_user_meta_data ->> 'username', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- Nadie puede subirse el rol a sí mismo.
create or replace function public.protect_profile_role() returns trigger
language plpgsql as $$
begin
  if new.role is distinct from old.role and not public.is_superadmin() and auth.role() <> 'service_role' then
    raise exception 'Solo el superadmin cambia roles';
  end if;
  if new.suspended is distinct from old.suspended and not public.is_admin() and auth.role() <> 'service_role' then
    raise exception 'Solo un admin suspende cuentas';
  end if;
  return new;
end $$;
create trigger profiles_role_guard before update on public.profiles
  for each row execute function public.protect_profile_role();

-- El audit_log es solo inserción.
create or replace function public.audit_append_only() returns trigger
language plpgsql as $$ begin raise exception 'audit_log es de solo inserción'; end $$;
create trigger audit_no_update before update or delete on public.audit_log
  for each row execute function public.audit_append_only();

-- ───────────── RLS ─────────────
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','teams','team_members','team_invites','settings','tournaments',
    'tournament_phases','scoring_rules','groups','tournament_teams','matches','games','game_reports',
    'draft_templates','draft_sessions','draft_actions','match_tokens','coin_tosses','events','pages',
    'page_blocks','champion_roles','audit_log','rate_limits'
  ] loop
    execute format('alter table public.%I enable row level security', t);
  end loop;
end $$;

-- Perfiles: cada quien ve y edita el suyo; los admins ven todos. Los correos viven en auth.users y nunca se exponen.
create policy profiles_self_read on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_self_update on public.profiles for update using (id = auth.uid() or public.is_admin());

-- Equipos: lectura pública de nombre/tag/logo. Crear: usuario con correo verificado. Editar: su capitán o admin.
create policy teams_read on public.teams for select using (true);
create or replace function public.email_verified() returns boolean
language sql stable security definer set search_path = auth, public as $$
  select exists (select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null)
$$;
create policy teams_insert on public.teams for insert to authenticated
  with check (captain_id = auth.uid() and public.email_verified());

-- Quien crea el equipo queda como capitán.
create or replace function public.team_add_captain() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into team_members (team_id, user_id, role) values (new.id, new.captain_id, 'captain')
  on conflict do nothing;
  return new;
end $$;
create trigger teams_add_captain after insert on public.teams
  for each row execute function public.team_add_captain();
create policy teams_update on public.teams for update using (public.is_captain_of(id) or public.is_admin());
create policy teams_delete on public.teams for delete using (public.is_admin());

create policy members_read on public.team_members for select using (true);
create policy members_captain on public.team_members for delete using (public.is_captain_of(team_id) or public.is_admin() or user_id = auth.uid());
-- Altas de integrantes: solo /api/teams/join (valida el código) y el trigger de creación.

create policy invites_captain on public.team_invites for select using (public.is_captain_of(team_id) or public.is_admin());

create policy settings_read on public.settings for select using (true);
create policy settings_write on public.settings for all using (public.is_superadmin()) with check (public.is_superadmin());

-- Torneos: público lo publicado; admins todo.
create policy tournaments_read on public.tournaments for select using (status <> 'borrador' or public.is_admin());
create policy tournaments_admin on public.tournaments for all using (public.is_admin()) with check (public.is_admin());

create policy phases_read on public.tournament_phases for select using (true);
create policy phases_admin on public.tournament_phases for all using (public.is_admin()) with check (public.is_admin());
create policy groups_read on public.groups for select using (true);
create policy groups_admin on public.groups for all using (public.is_admin()) with check (public.is_admin());
create policy scoring_read on public.scoring_rules for select using (true);
-- scoring_rules: escritura solo por /api/admin (service_role) para dejar auditoría.

create policy tt_read on public.tournament_teams for select using (true);
create policy tt_request on public.tournament_teams for insert to authenticated
  with check (public.is_captain_of(team_id) and status in ('pendiente', 'lista_espera'));
create policy tt_withdraw on public.tournament_teams for delete using (public.is_captain_of(team_id) or public.is_admin());
create policy tt_admin on public.tournament_teams for update using (public.is_admin()) with check (public.is_admin());

-- Partidos y partidas: lectura pública (calendario, resultados, bracket). Escritura: solo /api.
create policy matches_read on public.matches for select using (tournament_id is not null or public.is_admin()
  or public.is_member_of(team_a) or public.is_member_of(team_b));
create policy games_read on public.games for select using (exists (
  select 1 from public.matches m where m.id = match_id and (m.tournament_id is not null or public.is_admin())));

-- Draft: terminado = público; en curso = solo los dos equipos y el admin (la sala lee por /api/draft/state).
create policy sessions_read on public.draft_sessions for select using (
  status = 'done' or public.is_admin() or exists (
    select 1 from public.games g join public.matches m on m.id = g.match_id
    where g.id = game_id and (public.is_member_of(m.team_a) or public.is_member_of(m.team_b))));
create policy actions_read on public.draft_actions for select using (exists (
  select 1 from public.draft_sessions s where s.id = session_id));  -- hereda la política de draft_sessions
create policy templates_read on public.draft_templates for select using (true);
create policy templates_admin on public.draft_templates for all using (public.is_admin()) with check (public.is_admin());
create policy reports_admin on public.game_reports for select using (public.is_admin());
create policy coin_read on public.coin_tosses for select using (true);
-- match_tokens: sin políticas → nadie fuera de service_role los lee.

-- Contenido
create policy events_read on public.events for select using (published or public.is_editor());
create policy events_write on public.events for all using (public.is_editor()) with check (public.is_editor());
create policy pages_read on public.pages for select using (true);
create policy pages_write on public.pages for all using (public.is_editor()) with check (public.is_editor());
create policy blocks_read on public.page_blocks for select using ((status = 'publicado' and visible) or public.is_editor());
create policy blocks_write on public.page_blocks for all using (public.is_editor()) with check (public.is_editor());
create policy roles_read on public.champion_roles for select using (true);
create policy roles_write on public.champion_roles for all using (public.is_admin()) with check (public.is_admin());
create policy audit_read on public.audit_log for select using (public.is_admin());
create policy audit_insert on public.audit_log for insert with check (public.is_editor() and actor_id = auth.uid());

-- ───────────── Storage ─────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types) values
  ('team-logos', 'team-logos', true, 2097152, array['image/webp']),
  ('tournament-assets', 'tournament-assets', true, 5242880, array['image/webp', 'image/png', 'image/jpeg'])
on conflict (id) do nothing;

-- Los logos de equipo los escribe /api/teams/logo (reprocesados con sharp). Aquí solo lectura pública.
create policy "logos lectura" on storage.objects for select using (bucket_id in ('team-logos', 'tournament-assets'));
create policy "assets admin" on storage.objects for insert to authenticated
  with check (bucket_id = 'tournament-assets' and public.is_admin());
create policy "assets admin upd" on storage.objects for update to authenticated
  using (bucket_id = 'tournament-assets' and public.is_admin());

-- ───────────── Realtime ─────────────
-- La sala del draft se sincroniza por Broadcast (canal room:{match_id}) que emite /api tras cada cambio,
-- más Presence para contar conectados. Postgres Changes solo para lo público.
alter publication supabase_realtime add table public.matches, public.games, public.tournament_teams, public.page_blocks;
