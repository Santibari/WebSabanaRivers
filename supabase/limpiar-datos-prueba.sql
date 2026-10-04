-- Limpieza de los datos de prueba (todos llevan "PRUEBA" en el nombre).
-- Ejecutar en Supabase → SQL Editor. Primero el PASO 1 (solo mira), luego el PASO 2 (borra).
-- Tu cuenta (superadmin) y la configuración de la web NO se tocan.

-- ───────────── PASO 1 · Vista previa (no borra nada) ─────────────
select 'torneos' as que, count(*) from public.tournaments where name like 'PRUEBA%'
union all select 'partidos de esos torneos', count(*) from public.matches m join public.tournaments t on t.id = m.tournament_id where t.name like 'PRUEBA%'
union all select 'amistosos / drafts libres', count(*) from public.matches where tournament_id is null and (team_a_name like 'PRUEBA%' or team_b_name like 'PRUEBA%')
union all select 'equipos', count(*) from public.teams where name like 'PRUEBA%'
union all select 'eventos', count(*) from public.events where title like 'PRUEBA%';

-- ───────────── PASO 2 · Borrado (todo o nada) ─────────────
begin;

-- Amistosos y drafts libres de prueba (arrastran partidas, drafts, acciones, reportes, monedas y enlaces).
delete from public.matches
where tournament_id is null and (team_a_name like 'PRUEBA%' or team_b_name like 'PRUEBA%');

-- Torneo de prueba (arrastra fases, grupos, inscripciones, puntos y todos sus partidos).
delete from public.tournaments where name like 'PRUEBA%';

-- Cualquier partido que aún apunte a un equipo de prueba (p. ej. un amistoso con equipo registrado).
delete from public.matches
where team_a in (select id from public.teams where name like 'PRUEBA%')
   or team_b in (select id from public.teams where name like 'PRUEBA%');

-- Equipos de prueba (arrastran integrantes, invitaciones e inscripciones).
delete from public.teams where name like 'PRUEBA%';

-- Evento de prueba.
delete from public.events where title like 'PRUEBA%';

-- Contadores del límite de peticiones (se regeneran solos).
delete from public.rate_limits;

commit;

-- ───────────── PASO 3 · Verificación (todo debe dar 0) ─────────────
select
  (select count(*) from public.tournaments where name like 'PRUEBA%') as torneos,
  (select count(*) from public.teams where name like 'PRUEBA%') as equipos,
  (select count(*) from public.matches where team_a_name like 'PRUEBA%' or team_b_name like 'PRUEBA%') as amistosos,
  (select count(*) from public.events where title like 'PRUEBA%') as eventos;

-- Nota: el historial de auditoría (audit_log) es de solo inserción a propósito y se conserva.
-- El logo de prueba se borra desde Storage → team-logos (Supabase no permite borrarlo por SQL).
