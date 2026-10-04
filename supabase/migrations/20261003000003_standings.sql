-- Tabla de posiciones calculada desde los resultados guardados (nunca se escribe a mano).
-- Orden: puntos → dragones de la fase → torres de la fase. (El enfrentamiento directo,
-- 4.º criterio, lo aplica shared/standings.js al dibujar la tabla.)

create or replace view public.standings with (security_invoker = true) as
with closed as (
  select m.*, greatest(m.score_a, m.score_b) as w, least(m.score_a, m.score_b) as l
  from public.matches m
  where m.status = 'finalizado' and m.group_id is not null
),
scored as (
  select c.group_id, c.team_a, c.team_b, c.score_a, c.score_b,
         coalesce(r.points_winner, 0) as pw, coalesce(r.points_loser, 0) as pl
  from closed c
  left join public.scoring_rules r
    on r.tournament_id = c.tournament_id
   and r.result_key = case when c.score_a = c.score_b then 'draw' else 'bo' || c.best_of || '_' || c.w || '_' || c.l end
),
per_team as (
  select group_id, team_a as team_id,
         case when score_a >= score_b then pw else pl end as points,
         (score_a > score_b)::int as won, (score_a = score_b)::int as drawn, (score_a < score_b)::int as lost
  from scored
  union all
  select group_id, team_b,
         case when score_b >= score_a then pw else pl end,
         (score_b > score_a)::int, (score_a = score_b)::int, (score_b < score_a)::int
  from scored
),
totals as (
  select group_id, team_id, count(*) as played, sum(won) as won, sum(drawn) as drawn, sum(lost) as lost, sum(points) as points
  from per_team group by group_id, team_id
),
objectives as (
  select group_id, team_id, sum(dragons) as dragons, sum(towers) as towers
  from (
    select m.group_id, case when g.blue_slot = 'a' then m.team_a else m.team_b end as team_id,
           coalesce(g.blue_dragons, 0) as dragons, coalesce(g.blue_towers, 0) as towers
    from public.games g join public.matches m on m.id = g.match_id
    where g.result_status = 'confirmado' and m.group_id is not null
    union all
    select m.group_id, case when g.blue_slot = 'a' then m.team_b else m.team_a end,
           coalesce(g.red_dragons, 0), coalesce(g.red_towers, 0)
    from public.games g join public.matches m on m.id = g.match_id
    where g.result_status = 'confirmado' and m.group_id is not null
  ) o group by group_id, team_id
)
select tt.tournament_id, tt.group_id, tt.team_id, t.name, t.tag, t.logo_path,
       coalesce(x.played, 0) as played, coalesce(x.won, 0) as won, coalesce(x.drawn, 0) as drawn,
       coalesce(x.lost, 0) as lost, coalesce(x.points, 0) as points,
       coalesce(o.dragons, 0) as dragons, coalesce(o.towers, 0) as towers,
       row_number() over (
         partition by tt.group_id
         order by coalesce(x.points, 0) desc, coalesce(o.dragons, 0) desc, coalesce(o.towers, 0) desc, t.name
       ) as position
from public.tournament_teams tt
join public.teams t on t.id = tt.team_id
left join totals x on x.group_id = tt.group_id and x.team_id = tt.team_id
left join objectives o on o.group_id = tt.group_id and o.team_id = tt.team_id
where tt.status = 'aprobado' and tt.group_id is not null;

grant select on public.standings to anon, authenticated;

-- Límite de peticiones atómico para /api (ventana fija).
create or replace function public.hit_rate_limit(p_key text, p_max int, p_window_seconds int)
returns boolean language plpgsql security definer set search_path = public as $$
declare v_count int;
begin
  insert into rate_limits (key, window_start, count) values (p_key, now(), 1)
  on conflict (key) do update set
    count = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then 1 else rate_limits.count + 1 end,
    window_start = case when rate_limits.window_start < now() - make_interval(secs => p_window_seconds) then now() else rate_limits.window_start end
  returning count into v_count;
  return v_count <= p_max;
end $$;
revoke execute on function public.hit_rate_limit from anon, authenticated;
