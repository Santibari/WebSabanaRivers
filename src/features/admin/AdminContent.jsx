import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { useRepoQuery, useRepoMutation } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { AdminHeader } from './AdminLayout.jsx'
import { Button, Field, Input, Textarea, Select, ErrorNote, Panel, Badge, Loading } from '../../components/ui.jsx'
import { BLOCKS, BlockRenderer } from '../../components/blocks.jsx'

const NEW_CONTENT = {
  hero: { title: 'Título', subtitle: 'Subtítulo', cta: { text: 'Ir al draft', href: '/draft' } },
  active_tournaments: { marquee: ['Torneo activo'] },
  cards: { eyebrow: '', title: 'Título', items: [{ icon: 'star', title: 'Tarjeta', text: 'Texto' }] },
  events: { title: 'Próximos eventos', limit: 3 },
  rich_text: { title: 'Título', html: '<p>Texto</p>' },
  gallery: { title: 'Galería', images: [] },
  social: { title: 'Síguenos', links: [] },
}

function ListEditor({ items, onChange, fields, newItem, label }) {
  return (
    <div className="space-y-2">
      {items.map((it, i) => (
        <div key={i} className="flex flex-wrap items-end gap-2 border border-sr-line p-3">
          {fields.map(([k, l, type]) =>
            type === 'textarea' ? (
              <div key={k} className="min-w-64 flex-1"><Field label={l}><Textarea className="!min-h-16" value={it[k] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></Field></div>
            ) : (
              <div key={k} className="min-w-36 flex-1"><Field label={l}><Input value={it[k] ?? ''} onChange={(e) => onChange(items.map((x, j) => (j === i ? { ...x, [k]: e.target.value } : x)))} /></Field></div>
            ),
          )}
          <button type="button" className="border border-sr-red/50 px-3 py-2 text-[#ff8a96]" onClick={() => onChange(items.filter((_, j) => j !== i))} aria-label="Quitar">✕</button>
        </div>
      ))}
      <Button type="button" variant="ghost" onClick={() => onChange([...items, newItem])}>+ {label}</Button>
    </div>
  )
}

function ContentForm({ block, onChange }) {
  const c = block.content
  const set = (patch) => onChange({ ...block, content: { ...c, ...patch } })
  switch (block.type) {
    case 'hero':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Título"><Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Subtítulo"><Input value={c.subtitle ?? ''} onChange={(e) => set({ subtitle: e.target.value })} /></Field>
          <Field label="Texto del botón"><Input value={c.cta?.text ?? ''} onChange={(e) => set({ cta: { ...c.cta, text: e.target.value } })} /></Field>
          <Field label="Enlace del botón"><Input value={c.cta?.href ?? ''} onChange={(e) => set({ cta: { ...c.cta, href: e.target.value } })} /></Field>
          <Field label="Splash de fondo (ID de campeón, p. ej. Ahri)" hint="Imagen desde Data Dragon. Vacío = sin imagen.">
            <Input value={c.splash ?? ''} onChange={(e) => set({ splash: e.target.value.replace(/[^A-Za-z]/g, '') })} />
          </Field>
        </div>
      )
    case 'active_tournaments':
      return (
        <Field label="Frases de la cinta animada (una por línea)" hint="Los torneos se toman solos de la tabla de torneos activos.">
          <Textarea value={(c.marquee ?? []).join('\n')} onChange={(e) => set({ marquee: e.target.value.split('\n').filter(Boolean) })} />
        </Field>
      )
    case 'cards':
      return (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Antetítulo"><Input value={c.eyebrow ?? ''} onChange={(e) => set({ eyebrow: e.target.value })} /></Field>
            <Field label="Título"><Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          </div>
          <ListEditor items={c.items ?? []} onChange={(items) => set({ items })} label="Tarjeta" newItem={{ icon: 'star', title: '', text: '' }}
            fields={[['icon', 'Icono (coin, draft, timer, trophy, star, users)'], ['title', 'Título'], ['text', 'Texto', 'textarea']]} />
        </div>
      )
    case 'events':
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Título"><Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Cantidad"><Input type="number" min={1} max={12} value={c.limit ?? 3} onChange={(e) => set({ limit: Number(e.target.value) })} /></Field>
        </div>
      )
    case 'rich_text':
      return (
        <div className="space-y-3">
          <Field label="Título"><Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          <Field label="Contenido (HTML básico: p, h2, h3, ul, li, a, strong). Se limpia con DOMPurify.">
            <Textarea className="min-h-40 font-mono text-sm" value={c.html ?? ''} onChange={(e) => set({ html: e.target.value })} />
          </Field>
        </div>
      )
    case 'gallery':
      return (
        <div className="space-y-3">
          <Field label="Título"><Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          <ListEditor items={c.images ?? []} onChange={(images) => set({ images })} label="Imagen" newItem={{ src: '', alt: '', url: '' }} fields={[['src', 'URL de la imagen'], ['alt', 'Texto alternativo'], ['url', 'Enlace (https://)']]} />
        </div>
      )
    case 'social':
      return (
        <div className="space-y-3">
          <Field label="Título"><Input value={c.title ?? ''} onChange={(e) => set({ title: e.target.value })} /></Field>
          <ListEditor items={c.links ?? []} onChange={(links) => set({ links })} label="Red" newItem={{ network: 'discord', url: 'https://' }} fields={[['network', 'Red (discord, instagram, tiktok, twitch, youtube, x)'], ['url', 'URL (https://)']]} />
        </div>
      )
    default:
      return null
  }
}

/** Editor de la página de inicio: bloques ordenables, visibles/ocultos, borrador/publicado. */
export function AdminContent() {
  const { data, isLoading } = useRepoQuery(['page-all', 'inicio'], () => repo.getPage('inicio', { all: true }))
  const [blocks, setBlocks] = useState([])
  const [preview, setPreview] = useState(false)
  const [newType, setNewType] = useState('rich_text')
  useEffect(() => data && setBlocks(data), [data])
  const save = useRepoMutation(() => repo.savePage('inicio', blocks))
  if (isLoading) return <Loading />

  const update = (i, b) => setBlocks(blocks.map((x, j) => (j === i ? b : x)))
  const move = (i, d) => {
    const next = [...blocks]
    ;[next[i], next[i + d]] = [next[i + d], next[i]]
    setBlocks(next)
  }

  return (
    <>
      <AdminHeader title="Contenido · Inicio">
        <Button variant="ghost" onClick={() => setPreview(!preview)}>{preview ? 'Editar' : 'Vista previa'}</Button>
        <Button as={Link} to="/" variant="ghost">Ver inicio</Button>
        <Button onClick={() => save.mutate()} disabled={save.isPending}>{save.isSuccess ? 'Guardado ✓' : 'Guardar'}</Button>
      </AdminHeader>
      <ErrorNote error={save.error} />
      {preview ? (
        <div className="-mx-4 border border-dashed border-sr-line pb-10">
          <BlockRenderer blocks={blocks.filter((b) => b.visible)} />
        </div>
      ) : (
        <div className="space-y-4">
          {blocks.map((b, i) => (
            <Panel key={b.id ?? i} className="space-y-4 p-5" accent={b.status === 'publicado' ? 'blue' : undefined}>
              <div className="flex flex-wrap items-center gap-3">
                <span className="font-display text-lg">{BLOCKS[b.type]?.label ?? b.type}</span>
                <Badge tone={b.status === 'publicado' ? 'green' : 'amber'}>{b.status}</Badge>
                {!b.visible && <Badge>Oculto</Badge>}
                <div className="ml-auto flex flex-wrap gap-1">
                  <button className="border border-sr-line px-3 py-1.5 text-sm" onClick={() => update(i, { ...b, visible: !b.visible })}>{b.visible ? 'Ocultar' : 'Mostrar'}</button>
                  <button className="border border-sr-line px-3 py-1.5 text-sm" onClick={() => update(i, { ...b, status: b.status === 'publicado' ? 'borrador' : 'publicado' })}>{b.status === 'publicado' ? 'Pasar a borrador' : 'Publicar'}</button>
                  <button disabled={i === 0} className="border border-sr-line px-3 py-1.5 disabled:opacity-30" onClick={() => move(i, -1)} aria-label="Subir">↑</button>
                  <button disabled={i === blocks.length - 1} className="border border-sr-line px-3 py-1.5 disabled:opacity-30" onClick={() => move(i, 1)} aria-label="Bajar">↓</button>
                  <button className="border border-sr-red/50 px-3 py-1.5 text-[#ff8a96]" onClick={() => confirm('¿Quitar este bloque?') && setBlocks(blocks.filter((_, j) => j !== i))} aria-label="Quitar bloque">✕</button>
                </div>
              </div>
              <ContentForm block={b} onChange={(nb) => update(i, nb)} />
            </Panel>
          ))}
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Agregar bloque">
              <Select value={newType} onChange={(e) => setNewType(e.target.value)}>
                {Object.entries(BLOCKS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Button variant="ghost" onClick={() => setBlocks([...blocks, { id: `new-${Date.now()}`, type: newType, visible: true, status: 'borrador', content: structuredClone(NEW_CONTENT[newType]) }])}>Agregar</Button>
          </div>
          <p className="text-sm text-sr-gray">Los bloques en borrador no los ve el público. Guarda para aplicar los cambios.</p>
        </div>
      )}
    </>
  )
}
