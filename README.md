# Sabana Rivers Draft

Web del semillero de esports **Sabana Rivers**: pestañas *Sabana Rivers*, *Torneos* y *Draft*, con un simulador de draft
de League of Legends en formato **Fearless**, sincronizado en tiempo real entre los dos equipos.

El plan completo está en [`Claude/plan-implementacion-sabana-rivers-draft.md`](Claude/plan-implementacion-sabana-rivers-draft.md)
y los diseños en [`Claude/design/`](Claude/design/).

## Arrancar

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # pruebas del motor de draft, Fearless, series, tabla y bracket
```

Sin variables de entorno la web arranca en **modo demo**: todo funciona en el navegador (datos en `localStorage`).
En `/login` puedes **entrar como** cualquier usuario de prueba (admin o capitanes). La sesión es **por pestaña**, así
que puedes abrir el enlace del equipo A en una pestaña y el del equipo B en otra para jugar un draft sincronizado.
Para borrar los datos de ejemplo, usa *Reiniciar datos de ejemplo* en `/login`.

### Con Supabase

1. Crea el proyecto en Supabase y aplica `supabase/migrations/*` (con la CLI: `supabase db reset` también carga los seeds).
2. Copia `.env.example` a `.env` y llena `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`.
   La llave `service_role` **nunca** lleva prefijo `VITE_` ni se sube al repositorio.
3. Regístrate en la web y, en la tabla `profiles`, cambia tu rol a `superadmin` (la primera vez se hace a mano).

En desarrollo, Vite sirve las funciones de `/api` con el mismo formato `(req, res)` de las funciones serverless.

## Arquitectura

| Carpeta | Qué hay |
| --- | --- |
| `shared/` | Lógica pura, compartida por el servidor y el navegador: `draft-engine.js` (orden de 20 acciones, Fearless Hard/Soft, timeout, series, reportes, lados), `room-service.js` (servicio autoritativo de la sala), `standings.js` (tabla con desempate por dragones y torres, bracket 1.º vs 2.º con byes), `champion-roles.json` |
| `api/` | Funciones Node: `draft/[action]` (state, ready, action, timeout), `match/[action]` (create, coin, side, end, report), `admin/[action]` (controles de sala, calendario, bracket, puntos), `teams/[action]` (logo con `sharp`, invitaciones). Validación con Zod y límite de peticiones |
| `supabase/` | Migraciones (tablas, RLS, Storage, Realtime, vista `standings`) y seeds |
| `src/lib/repo/` | Capa de datos con dos implementaciones de la misma interfaz: `supabase.js` y `demo.js` |
| `src/features/` | Inicio (bloques del CMS), torneos, draft (vista del capitán, espectador del admin, fases de la sala), mi equipo, admin |
| `scripts/seed-roles.js` | Convierte `Claude/.skills/Numero de campeones y sus roles.md` en `shared/champion-roles.json` y `supabase/seed/champion_roles.sql` (`npm run seed:roles`) |

**El servidor manda:** el navegador nunca escribe picks ni bans. Todo pasa por `shared/room-service.js`, que valida
turno, tiempo, disponibilidad y Fearless. La restricción única `(session_id, step)` evita acciones dobles.

### Decisiones de implementación a revisar

- Los enlaces de la sala son **por equipo** (A/B), no por lado: el lado cambia entre partidas de la serie.
- La sala se sincroniza por **Broadcast** (`room:{match_id}`) y cada ventana relee el estado por `/api/draft/state`.
  Así se respeta que un draft en curso solo lo vean los dos equipos y el admin.
- Los puntos de una serie se suman cuando la serie termina. Los dragones y las torres cuentan desde cada partida confirmada.
- La ruta de íconos de rol de `data_dragon_iconos.md` ya da 404 en Community Dragon. Se usan los íconos del plugin de Clash.
- Logo: `public/logo-sabana-rivers.svg` es provisional. Reemplázalo por el oficial y cambia `LOGO_URL` en `src/components/ui.jsx` si cambia la extensión.

## Pendiente (fases siguientes del plan)

- Despliegue (Vercel), cabeceras de seguridad, dominio y Sentry.
- CAPTCHA (Turnstile) en registro/login y MFA obligatoria para admins.
- Pruebas E2E con Playwright y prueba de carga con espectadores.
- Editor de texto enriquecido (TipTap) en el CMS; hoy el bloque de texto acepta HTML básico saneado con DOMPurify.

Sabana Rivers Draft no está respaldado por Riot Games y no refleja las opiniones de Riot Games ni de nadie involucrado
oficialmente en la producción o gestión de League of Legends.
