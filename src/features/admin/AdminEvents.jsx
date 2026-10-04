import { useState } from 'react'
import { useRepoQuery, useRepoMutation } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'
import { AdminHeader } from './AdminLayout.jsx'
import { Button, Field, Input, Textarea, Select, ErrorNote, Panel, Empty } from '../../components/ui.jsx'
import { formatDateTime, toLocalInput, fromLocalInput } from '../../lib/format.js'

const empty = { title: '', description: '', starts_at: null, location: '', tournament_id: '', published: true }

export function AdminEvents() {
  const { data: events = [] } = useRepoQuery(['all-events'], () => repo.allEvents())
  const { data: tournaments = [] } = useRepoQuery(['tournaments'], () => repo.listTournaments())
  const [form, setForm] = useState(empty)
  const save = useRepoMutation(() => repo.saveEvent({ ...form, tournament_id: form.tournament_id || null }), { onSuccess: () => setForm(empty) })
  const del = useRepoMutation((id) => repo.deleteEvent(id))
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value })
  return (
    <>
      <AdminHeader title="Eventos" />
      <Panel className="p-5" accent="blue">
        <form className="grid gap-4 sm:grid-cols-2" onSubmit={(e) => (e.preventDefault(), save.mutate())}>
          <Field label="Título"><Input required value={form.title} onChange={set('title')} /></Field>
          <Field label="Fecha y hora (Colombia)"><Input type="datetime-local" value={toLocalInput(form.starts_at)} onChange={(e) => setForm({ ...form, starts_at: fromLocalInput(e.target.value) })} /></Field>
          <Field label="Lugar o enlace"><Input value={form.location ?? ''} onChange={set('location')} /></Field>
          <Field label="Torneo (opcional)">
            <Select value={form.tournament_id ?? ''} onChange={set('tournament_id')}>
              <option value="">Evento del semillero</option>
              {tournaments.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          <div className="sm:col-span-2"><Field label="Descripción"><Textarea value={form.description ?? ''} onChange={set('description')} /></Field></div>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.published} onChange={set('published')} /> Publicado</label>
          <div className="flex gap-2 sm:justify-end">
            {form.id && <Button type="button" variant="ghost" onClick={() => setForm(empty)}>Cancelar</Button>}
            <Button type="submit" disabled={save.isPending}>{form.id ? 'Guardar evento' : 'Crear evento'}</Button>
          </div>
        </form>
        <ErrorNote error={save.error} />
      </Panel>
      <div className="mt-6 divide-y divide-sr-line border border-sr-line">
        {!events.length && <div className="p-4"><Empty>No hay eventos.</Empty></div>}
        {events.map((e) => (
          <div key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="w-48 text-sm text-sr-sky">{formatDateTime(e.starts_at)}</span>
            <span className="font-semibold">{e.title}</span>
            <span className="text-sm text-sr-gray">{e.location}</span>
            {!e.published && <span className="text-xs text-amber-300">oculto</span>}
            <div className="ml-auto flex gap-2">
              <button className="border border-sr-line px-3 py-1.5 text-sm" onClick={() => setForm({ ...e, tournament_id: e.tournament_id ?? '' })}>Editar</button>
              <button className="border border-sr-red/50 px-3 py-1.5 text-sm text-[#ff8a96]" onClick={() => confirm('¿Eliminar este evento?') && del.mutate(e.id)}>Eliminar</button>
            </div>
          </div>
        ))}
      </div>
    </>
  )
}
