// Fechas: se guardan en UTC y se muestran en hora de Colombia (UTC−5).
const TZ = 'America/Bogota'

export function formatDate(iso, opts = {}) {
  if (!iso) return 'Por definir'
  return new Intl.DateTimeFormat('es-CO', { timeZone: TZ, day: 'numeric', month: 'short', ...opts }).format(new Date(iso))
}

export function formatDateTime(iso) {
  if (!iso) return 'Por definir'
  return new Intl.DateTimeFormat('es-CO', {
    timeZone: TZ, weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit',
  }).format(new Date(iso))
}

export function clock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000))
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`
}

export function duration(ms) {
  const s = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(s / 3600)
  const mm = String(Math.floor((s % 3600) / 60)).padStart(h ? 2 : 1, '0')
  const ss = String(s % 60).padStart(2, '0')
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`
}

export const slugify = (s) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60)

/** Convierte una fecha ISO a valor de <input type="datetime-local"> en hora de Colombia. */
export function toLocalInput(iso) {
  if (!iso) return ''
  const d = new Date(new Date(iso).getTime() - 5 * 3600_000)
  return d.toISOString().slice(0, 16)
}
export function fromLocalInput(v) {
  if (!v) return null
  return new Date(`${v}:00-05:00`).toISOString()
}
