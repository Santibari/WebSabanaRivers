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

/** Usuario y rol a partir del JWT de Supabase (Authorization: Bearer …). Null si no hay sesión. */
export async function getUser(req) {
  const h = req.headers.authorization ?? ''
  const jwt = h.startsWith('Bearer ') ? h.slice(7) : null
  if (!jwt) return null
  const sb = supabaseAdmin()
  const { data, error } = await sb.auth.getUser(jwt)
  if (error || !data?.user) return null
  const { data: profile } = await sb.from('profiles').select('role, suspended, username').eq('id', data.user.id).maybeSingle()
  if (profile?.suspended) throw new HttpError(403, 'Cuenta suspendida')
  return { id: data.user.id, email: data.user.email, role: profile?.role ?? 'user', username: profile?.username }
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
