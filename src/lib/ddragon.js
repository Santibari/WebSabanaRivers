// Data Dragon y Community Dragon, según las guías de Claude/.skills/:
//  - data_dragon_gu_a_de_im_genes.md: retratos con versión, loading/splash sin versión, IDs internos de champion.json
//  - data_dragon_iconos.md: íconos de posición (bottom = ADC, utility = Soporte)
// Ninguna imagen de campeón se guarda en Supabase.
import ROLES from '../../shared/champion-roles.json'

const DD = 'https://ddragon.leagueoflegends.com'
const CACHE_KEY = 'sr-ddragon-v1'
const TTL = 24 * 3600_000

export const ROLE_ORDER = ['top', 'jungle', 'mid', 'bottom', 'utility']
export const ROLE_LABEL = { top: 'Top', jungle: 'Jungla', mid: 'Mid', bottom: 'ADC', utility: 'Soporte' }
export const ROLE_SHORT = { top: 'TOP', jungle: 'JG', mid: 'MID', bottom: 'ADC', utility: 'SUP' }

export const squareUrl = (version, id) => `${DD}/cdn/${version}/img/champion/${id}.png`
export const splashUrl = (id, skin = 0) => `${DD}/cdn/img/champion/splash/${id}_${skin}.jpg`
export const loadingUrl = (id, skin = 0) => `${DD}/cdn/img/champion/loading/${id}_${skin}.jpg`
// La ruta de data_dragon_iconos.md (rcp-fe-lol-static-assets/…/images/roles/) ya devuelve 404;
// se usan los íconos del plugin de Clash, con los mismos nombres internos salvo mid → middle.
export const roleIconUrl = (role) =>
  `https://raw.communitydragon.org/latest/plugins/rcp-fe-lol-clash/global/default/assets/images/position-selector/positions/icon-position-${role === 'mid' ? 'middle' : role}.png`

function readCache() {
  try {
    const c = JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null')
    if (c && Date.now() - c.at < TTL) return c
  } catch {}
  return null
}

let inflight = null

/** { version, champions: [{ id, name, roles, tags }], byId } — en es_MX, caché de 24 h. */
export function loadChampions() {
  if (inflight) return inflight
  inflight = (async () => {
    let cache = readCache()
    if (!cache) {
      const versions = await (await fetch(`${DD}/api/versions.json`)).json()
      const version = versions[0]
      const data = await (await fetch(`${DD}/cdn/${version}/data/es_MX/champion.json`)).json()
      const raw = Object.values(data.data).map((c) => ({ id: c.id, name: c.name, tags: c.tags }))
      cache = { at: Date.now(), version, raw }
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(cache))
      } catch {}
    }
    const champions = cache.raw
      .map((c) => ({ ...c, roles: ROLES[c.id] ?? [] }))
      .sort((a, b) => a.name.localeCompare(b.name, 'es'))
    return { version: cache.version, champions, byId: Object.fromEntries(champions.map((c) => [c.id, c])) }
  })().catch((e) => {
    inflight = null
    throw e
  })
  return inflight
}

/** Normaliza para el buscador: sin tildes, apóstrofes ni espacios. */
export const searchKey = (s) => s.normalize('NFD').replace(/[^a-zA-Z0-9]/g, '').toLowerCase()
