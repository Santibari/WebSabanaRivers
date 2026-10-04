-- Mejoras tras las pruebas del 3 oct 2026:
--  1) Nombres de usuario visibles (integrantes de equipo, auditoría) sin exponer el resto del perfil.
--  2) Listado de usuarios con correo, solo para admins.
--  3) Auditoría automática de lo que el admin/editor cambia directamente en la base
--     (lo que pasa por /api ya se audita allí y no se duplica).

-- 1) Solo id + username de los perfiles pedidos.
create or replace function public.profile_names(p_ids uuid[])
returns table (id uuid, username text)
language sql stable security definer set search_path = public as $$
  select p.id, p.username from profiles p where p.id = any(p_ids)
$$;
grant execute on function public.profile_names(uuid[]) to anon, authenticated;

-- 2) Usuarios con correo (auth.users) — solo admin/superadmin.
create or replace function public.admin_list_users()
returns table (id uuid, username text, role text, email text, suspended boolean, created_at timestamptz)
language plpgsql stable security definer set search_path = public, auth as $$
begin
  if not public.is_admin() then
    raise exception 'Solo un admin puede ver los usuarios';
  end if;
  return query
    select p.id, p.username, p.role, u.email::text, p.suspended, p.created_at
    from public.profiles p join auth.users u on u.id = p.id
    order by p.created_at;
end $$;
revoke execute on function public.admin_list_users() from anon;
grant execute on function public.admin_list_users() to authenticated;

-- 3) Auditoría por trigger.
create or replace function public.audit_row_change()
returns trigger language plpgsql security definer set search_path = public as $$
declare
  v_row jsonb := to_jsonb(coalesce(new, old));
begin
  -- Las funciones de /api usan service_role y auditan por su cuenta; sin sesión no hay actor.
  if auth.uid() is null or coalesce(auth.role(), '') = 'service_role' then
    return coalesce(new, old);
  end if;
  insert into audit_log (actor_id, action, entity, entity_id, before, after)
  values (
    auth.uid(),
    tg_table_name || '.' || lower(tg_op),
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'team_id', v_row ->> 'key', v_row ->> 'champion_id'),
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  return coalesce(new, old);
end $$;

do $$
declare t text;
begin
  foreach t in array array[
    'tournaments', 'tournament_phases', 'groups', 'tournament_teams', 'events',
    'pages', 'page_blocks', 'teams', 'team_members', 'champion_roles', 'settings', 'profiles'
  ] loop
    execute format('drop trigger if exists audit_%1$s on public.%1$I', t);
    execute format('create trigger audit_%1$s after insert or update or delete on public.%1$I
                    for each row execute function public.audit_row_change()', t);
  end loop;
end $$;
