-- Datos iniciales. Los roles de campeones están en supabase/seed/champion_roles.sql
-- (generado con `npm run seed:roles`). `supabase db reset` aplica migraciones y ambos seeds (ver config.toml).

insert into public.settings (key, value) values
  ('max_teams_global', '10'::jsonb),
  ('site', '{"name": "Sabana Rivers Draft", "tagline": "Somos semillero de esports"}'::jsonb)
on conflict (key) do nothing;

insert into public.draft_templates (name, is_default, steps) values (
  'Torneo (5 bans · 5 picks)', true,
  '[{"side":"blue","type":"ban"},{"side":"red","type":"ban"},{"side":"blue","type":"ban"},{"side":"red","type":"ban"},{"side":"blue","type":"ban"},{"side":"red","type":"ban"},
    {"side":"blue","type":"pick"},{"side":"red","type":"pick"},{"side":"red","type":"pick"},{"side":"blue","type":"pick"},{"side":"blue","type":"pick"},{"side":"red","type":"pick"},
    {"side":"red","type":"ban"},{"side":"blue","type":"ban"},{"side":"red","type":"ban"},{"side":"blue","type":"ban"},
    {"side":"red","type":"pick"},{"side":"blue","type":"pick"},{"side":"blue","type":"pick"},{"side":"red","type":"pick"}]'::jsonb
) on conflict (name) do nothing;

insert into public.pages (slug, title) values ('inicio', 'Sabana Rivers'), ('torneos', 'Torneos')
on conflict (slug) do nothing;

with p as (select id from public.pages where slug = 'inicio')
insert into public.page_blocks (page_id, type, position, status, content)
select p.id, b.type, b.position, 'publicado', b.content from p, (values
  ('hero', 0, '{"title": "Sabana Rivers", "subtitle": "Somos semillero de esports", "cta": {"text": "Ir al draft", "href": "/draft"}}'::jsonb),
  ('active_tournaments', 1, '{"marquee": ["Torneo League of Legends", "Organizado por Sabana Rivers", "Fase de grupos en curso", "Draft Fearless"]}'::jsonb),
  ('cards', 2, '{"eyebrow": "Cómo se juega", "title": "De la moneda a la tabla", "items": [
      {"icon": "coin", "title": "Moneda", "text": "En la fase de grupos, el servidor lanza la moneda y asigna el lado azul o rojo."},
      {"icon": "draft", "title": "Draft Fearless", "text": "Cada capitán en su ventana: 5 bans y 5 picks. Lo jugado no se repite en la serie."},
      {"icon": "timer", "title": "Partida", "text": "Corre el contador. Se detiene cuando un capitán pulsa \"Terminar encuentro\"."},
      {"icon": "trophy", "title": "Resultado", "text": "Cada capitán reporta ganador, torres y dragones. La tabla se actualiza sola."}]}'::jsonb),
  ('events', 3, '{"title": "Próximos eventos", "limit": 3}'::jsonb),
  ('social', 4, '{"title": "Síguenos", "links": []}'::jsonb)
) as b(type, position, content)
where not exists (select 1 from public.page_blocks pb where pb.page_id = p.id);

