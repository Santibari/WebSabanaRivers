# Pendientes encontrados en las pruebas con Supabase (3 oct 2026)

Pruebas hechas desde el navegador contra el proyecto `SabanaRivers`. Todo el flujo principal funcionó
(torneo → equipos → logo → inscripción → grupos → calendario → sala → moneda → draft 2×20 acciones →
Fearless → reportes → disputa → resultado → tabla → bracket → amistoso → controles del admin → RLS).

## Errores encontrados — estado (4 oct 2026)

1. ✅ Integrantes salían como "Jugador" → función `profile_names` (migración 4).
2. ✅ El formulario de crear equipo ahora se limpia.
3. ✅ El título del torneo ya no repite "Torneo".
4. ✅ Admin → Usuarios muestra el correo → función `admin_list_users` (migración 4).
5. ✅ Auditoría muestra el nombre del actor.
6. ✅ Auditoría automática por trigger de lo que el admin cambia directo en la base (migración 4).
7. ✅ "Terminar encuentro" muestra "Terminando…" y la sala vuelve actualizada en la misma respuesta.
8. ✅ El pick es optimista y la grilla se bloquea mientras se confirma.

> La migración `supabase/migrations/20261004000004_mejoras.sql` hay que ejecutarla en Supabase (SQL Editor).
> Sin ella la web sigue funcionando, pero sin los puntos 1, 4, 5 y 6.

## Velocidad (medido contra Supabase desde Colombia, servidor local)

| Operación | Antes | Después |
| --- | --- | --- |
| Pick/ban (incluye la sala actualizada) | ~2,3 s | ~0,5 s (y se ve al instante por el pick optimista) |
| Leer la sala con sesión | ~1,05 s | ~0,1–0,3 s |
| Aviso al espectador | relectura completa | ~0,2 s (la jugada viaja en el aviso) |

## Antes de desplegar en Vercel

- Falta `vercel.json` con rewrites a `index.html` (si no, los enlaces `/draft/<id>/<token>` dan 404 al abrirlos directo).
- Variables de entorno en Vercel (las 4 del `.env`) y dominio de producción en Supabase → Authentication → URL Configuration.

## Para revisar (decisión, no error)

- Los códigos de invitación se pueden usar varias veces durante sus 7 días.

## Datos de prueba que quedaron en Supabase

Torneo "PRUEBA Torneo LoL", equipos "PRUEBA Azul" y "PRUEBA Rojo" (capitán: tu cuenta), amistoso
"PRUEBA Amigos A vs B" y evento "PRUEBA Evento". Para borrarlos, en el SQL Editor:

```sql
delete from public.tournaments where slug = 'prueba-torneo-lol';             -- arrastra fases, grupos, partidos, partidas y drafts
delete from public.matches where team_a_name like 'PRUEBA%';                 -- amistoso
delete from public.teams where name like 'PRUEBA%';                          -- equipos (el logo queda en Storage: team-logos)
delete from public.events where title like 'PRUEBA%';
```
