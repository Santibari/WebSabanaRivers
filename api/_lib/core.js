// Utilidades comunes de /api: cliente service_role, autenticación, validación, límites y errores.
// La llave service_role vive SOLO en las variables de entorno de Vercel (sin prefijo VITE_).
import { createClient } from '@supabase/supabase-js'
import { createHash, randomBytes } from 'node:crypto'
import { z } from 'zod'
import { RoomError } from '../../shared/room-service.js'

let admin
export function supabaseAdmin() {
  if (!admin) {
    const url = process.env.SUPABASE_URL
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!url || !key) throw new HttpError(500, 'Faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el servidor')
    admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
  }
  return admin
}

export class HttpError extends Error {
  constructor(status, message) {
    super(message)
    this.status = status
  }
}

export const sha256 = (s) => createHash('sha256').update(s).digest('hex')
export const newToken = () => randomBytes(32).toString('base64url')

// Sesiones ya verificadas (por instancia), para no repetir el trabajo en cada pick.
const sessionCache = new Map()

/**
 * Usuario y rol a partir del JWT de Supabase (Authorization: Bearer …). Null si no hay sesión.
 * El JWT se verifica LOCALMENTE con getClaims (llaves asimétricas del proyecto, JWKS en caché),
 * sin ir al servidor de Auth. El rol se lee de `profiles` y se guarda 30 s.
 */
export async function getUser(req) {
  const h = req.headers.authorization ?? ''
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!jwt) return null
  const hit = sessionCache.get(jwt)
  if (hit && hit.until > Date.now()) return hit.user
  const sb = supabaseAdmin()
  const { data, error } = await sb.auth.getClaims(jwt)
  const claims = data?.claims
  if (error || !claims?.sub) return null
  const { data: profile } = await sb.from('profiles').select('role, suspended, username').eq('id', claims.sub).maybeSingle()
  if (profile?.suspended) throw new HttpError(403, 'Cuenta suspendida')
  const user = { id: claims.sub, email: claims.email, role: profile?.role ?? 'user', username: profile?.username }
  if (sessionCache.size > 500) sessionCache.clear()
  sessionCache.set(jwt, { user, until: Math.min(Date.now() + 30_000, (claims.exp ?? 0) * 1000) })
  return user
}

/** getUser perezoso y memorizado para una petición: solo se ejecuta si alguien lo necesita. */
export function lazyUser(req) {
  let p
  return () => (p ??= getUser(req))
}

export const isAdminRole = (role) => role === 'admin' || role === 'superadmin'

export async function requireRole(req, roles) {
  const user = await getUser(req)
  if (!user) throw new HttpError(401, 'Inicia sesión')
  if (!roles.includes(user.role)) throw new HttpError(403, 'No tienes permiso')
  return user
}

/** Límite por IP/usuario (tabla rate_limits, ventana fija). */
export async function rateLimit(req, bucket, max, windowSeconds = 60, userId = null) {
  const ip = (req.headers['x-forwarded-for'] ?? '').split(',')[0].trim() || 'unknown'
  const key = `${bucket}:${userId ?? ip}`
  const { data, error } = await supabaseAdmin().rpc('hit_rate_limit', { p_key: key, p_max: max, p_window_seconds: windowSeconds })
  if (!error && data === false) throw new HttpError(429, 'Demasiadas peticiones, espera un momento')
}

export function parse(schema, body) {
  const r = schema.safeParse(body ?? {})
  if (!r.success) throw new HttpError(400, r.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; '))
  return r.data
}

/** Envoltorio: métodos permitidos, JSON y errores uniformes. Nunca deja la respuesta en blanco. */
export function handler(routes) {
  return async (req, res) => {
    res.setHeader('Cache-Control', 'no-store')
    try {
      const action = req.query.action
      const route = routes[action]
      if (!route) throw new HttpError(404, 'Ruta desconocida')
      const method = route.method ?? 'POST'
      if (req.method !== method) throw new HttpError(405, `Usa ${method}`)
      const body = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : req.body ?? {}
      const out = await route.run({ req, body, query: req.query })
      res.status(200).json(out ?? { ok: true })
    } catch (e) {
      const status = e instanceof HttpError || e instanceof RoomError ? e.status : 500
      if (status === 500) console.error(e)
      res.status(status).json({ error: status === 500 ? 'Error interno' : e.message })
    }
  }
}

export { z }
