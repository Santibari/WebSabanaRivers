// Convierte la guía `.skills/Numero de campeones y sus roles.md` en:
//   - shared/champion-roles.json  (usado por el front y por /api)
//   - supabase/seed/champion_roles.sql (llena la tabla champion_roles)
// Los IDs se resuelven contra champion.json de Data Dragon, como pide la guía de imágenes.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const SOURCE = path.join(root, 'Claude/.skills/Numero de campeones y sus roles.md')

const ROLE_MAP = { Top: 'top', Jg: 'jungle', Mid: 'mid', Adc: 'bottom', Sup: 'utility' }

// Excepciones documentadas en data_dragon_gu_a_de_im_genes.md (nombre público ≠ ID interno)
const NAME_EXCEPTIONS = {
  wukong: 'MonkeyKing',
  nunuywillump: 'Nunu',
  nunuwillump: 'Nunu',
  renataglasc: 'Renata',
}

const normalize = (s) => s.normalize('NFD').replace(/[^a-zA-Z]/g, '').toLowerCase()

async function loadDdragonIds() {
  const versions = await (await fetch('https://ddragon.leagueoflegends.com/api/versions.json')).json()
  const version = versions[0]
  const data = await (await fetch(`https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`)).json()
  const byName = new Map()
  for (const c of Object.values(data.data)) {
    byName.set(normalize(c.name), c.id)
    byName.set(normalize(c.id), c.id)
  }
  return { version, byName, all: Object.keys(data.data) }
}

const md = await readFile(SOURCE, 'utf8')
const entries = [...md.matchAll(/^\d+\.\s+\*\*(.+?)\*\*:\s*(.+)$/gm)].map(([, name, roles]) => ({
  name: name.trim(),
  roles: roles.split(',').map((r) => ROLE_MAP[r.trim()]).filter(Boolean),
}))

const { version, byName, all } = await loadDdragonIds()
const out = {}
const missing = []
for (const e of entries) {
  const key = normalize(e.name)
  const id = NAME_EXCEPTIONS[key] ?? byName.get(key)
  if (!id) missing.push(e.name)
  else out[id] = e.roles
}
const notInGuide = all.filter((id) => !out[id])

await writeFile(path.join(root, 'shared/champion-roles.json'), JSON.stringify(out, null, 2) + '\n')
await mkdir(path.join(root, 'supabase/seed'), { recursive: true })
const rows = Object.entries(out)
  .map(([id, roles]) => `  ('${id}', array[${roles.map((r) => `'${r}'`).join(', ')}]::text[])`)
  .join(',\n')
await writeFile(
  path.join(root, 'supabase/seed/champion_roles.sql'),
  `-- Generado por scripts/seed-roles.js (parche ${version}). No editar a mano.\n` +
    `insert into public.champion_roles (champion_id, roles) values\n${rows}\n` +
    `on conflict (champion_id) do update set roles = excluded.roles;\n`,
)

console.log(`Parche ${version}: ${Object.keys(out).length} campeones con rol.`)
if (missing.length) console.warn('Sin ID en Data Dragon (revisar nombre):', missing.join(', '))
if (notInGuide.length) console.warn('En Data Dragon pero no en la guía (agregar desde el panel):', notInGuide.join(', '))
