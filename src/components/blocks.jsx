// Bloques de contenido del CMS. Cada `type` de page_blocks tiene su componente.
// Para un tipo nuevo: agregar aquí el componente y su editor en features/admin/AdminContent.jsx.
import { Link } from 'react-router-dom'
import { CircuitBackground } from './CircuitBackground.jsx'
import { GroupTable } from './tournament.jsx'
import { Logo, Eyebrow, Button } from './ui.jsx'
import { useRepoQuery } from '../app/hooks.jsx'
import { repo } from '../lib/repo/index.js'
import { formatDateTime } from '../lib/format.js'
import { sanitize } from '../lib/sanitize.js'
import { splashUrl } from '../lib/ddragon.js'

const ICONS = {
  coin: <><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="5" /></>,
  draft: <><rect x="3" y="4" width="7" height="16" /><rect x="14" y="4" width="7" height="16" /><path d="M10 12h4" /></>,
  timer: <><circle cx="12" cy="13" r="8" /><path d="M12 13V9M10 2h4M12 2v3" /></>,
  trophy: <><path d="M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4a3 3 0 0 0 3 4M17 6h3a3 3 0 0 1-3 4M12 14v4M8 21h8" /></>,
  star: <path d="m12 3 2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" />,
  users: <><circle cx="9" cy="8" r="3.5" /><path d="M2 20c.6-4 3.4-6 7-6s6.4 2 7 6M16 4.5a3.5 3.5 0 0 1 0 7M18 14c2.2.6 3.6 2.6 4 6" /></>,
}

export function Icon({ name, className = 'size-7' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {ICONS[name] ?? ICONS.star}
    </svg>
  )
}

function Hero({ content }) {
  return (
    <section className="relative isolate overflow-hidden">
      {content.splash && (
        <img src={splashUrl(content.splash)} alt="" className="absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.13] [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]" />
      )}
      <CircuitBackground />
      <div className="relative mx-auto flex min-h-[560px] max-w-6xl flex-col items-center justify-center px-4 py-20 text-center sm:px-6">
        <div className="animate-rise"><Logo className="size-28 sm:size-32" /></div>
        <h1 className="mt-6 animate-rise font-display text-5xl tracking-[0.04em] sm:text-7xl [animation-delay:120ms]">{content.title}</h1>
        <p className="mt-4 animate-rise eyebrow text-sr-sky !text-base [animation-delay:240ms]">{content.subtitle}</p>
        {content.cta?.text && (
          <div className="mt-9 animate-rise [animation-delay:360ms]">
            <Button as={Link} to={content.cta.href ?? '/draft'} skew>{content.cta.text}</Button>
          </div>
        )}
      </div>
    </section>
  )
}

function Marquee({ items }) {
  if (!items?.length) return null
  const row = (
    <span className="flex shrink-0 items-center">
      {items.map((t, i) => (
        <span key={i} className="flex items-center">
          <span className="px-10 font-cond text-lg font-bold uppercase tracking-[0.3em]">{t}</span>
          <span className="size-2.5 rotate-45 bg-sr-white" />
        </span>
      ))}
    </span>
  )
  return (
    <div className="relative z-10 -mx-4 -rotate-[1.4deg] overflow-hidden bg-sr-blue py-3 shadow-[0_10px_40px_rgb(30_90_168/0.35)]" aria-label={items.join(' · ')}>
      <div className="flex w-max animate-marquee" aria-hidden="true">{row}{row}{row}{row}</div>
    </div>
  )
}

/** Banner por torneo activo: aparece y desaparece solo según el estado del torneo. */
function ActiveTournaments({ content }) {
  const { data } = useRepoQuery(['active-tournaments'], () => repo.activeTournaments())
  if (!data?.length) return null
  return (
    <section className="relative">
      <Marquee items={content.marquee} />
      {data.map(({ tournament: t, groups, phases }) => {
        const groupPhase = phases.find((p) => p.type === 'groups')
        return (
          <div key={t.id} className="mx-auto max-w-6xl px-4 pt-16 sm:px-6">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div className="flex items-center gap-4">
                <Logo className="size-14" />
                <div>
                  <Eyebrow>Torneo activo</Eyebrow>
                  <Link to={`/torneos/${t.slug}`} className="font-display text-4xl hover:text-sr-sky sm:text-5xl">{t.name}</Link>
                </div>
              </div>
              <div className="max-w-md text-sm text-[#c9d1dd]">
                <p>{t.format_summary}</p>
                <p className="mt-2 font-cond uppercase tracking-widest text-xs text-sr-gray">
                  {groupPhase && `${groupPhase.name} · BO${groupPhase.best_of} · `}
                  {t.fearless_mode === 'hard' ? 'Hard Fearless' : t.fearless_mode === 'soft' ? 'Soft Fearless' : 'Sin Fearless'} · {t.pick_seconds}s por acción
                </p>
              </div>
            </div>
            <div className="mt-8 grid gap-6 md:grid-cols-2">
              {groups.map((g, i) => <GroupTable key={g.id} group={g} accent={i % 2 ? 'red' : 'blue'} compact />)}
            </div>
            <div className="mt-6 text-right">
              <Link to={`/torneos/${t.slug}`} className="eyebrow text-sr-sky hover:underline !text-xs">Ver calendario y bracket →</Link>
            </div>
          </div>
        )
      })}
    </section>
  )
}

function Cards({ content }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
      {content.eyebrow && <Eyebrow>{content.eyebrow}</Eyebrow>}
      {content.title && <h2 className="mt-2 font-display text-4xl sm:text-5xl">{content.title}</h2>}
      <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(content.items ?? []).map((c, i) => (
          <article key={i} className="group border border-sr-line bg-sr-panel/90 p-6 transition-all hover:-translate-y-1 hover:border-sr-blue">
            <span className="text-sr-sky transition-transform group-hover:scale-110 inline-block"><Icon name={c.icon} /></span>
            <p className="mt-4 font-cond font-bold text-sr-gray">{String(i + 1).padStart(2, '0')}</p>
            <h3 className="mt-1 text-lg font-bold">{c.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-[#c9d1dd]">{c.text}</p>
          </article>
        ))}
      </div>
    </section>
  )
}

function Events({ content }) {
  const { data = [] } = useRepoQuery(['events', content.limit], () => repo.listEvents({ limit: content.limit ?? 3 }))
  if (!data.length) return null
  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
      <h2 className="font-display text-4xl sm:text-5xl">{content.title ?? 'Próximos eventos'}</h2>
      <div className="mt-10 grid gap-4 md:grid-cols-3">
        {data.map((e, i) => (
          <article key={e.id} className="relative border border-sr-line bg-sr-panel/90 p-6 [clip-path:polygon(0_0,calc(100%-14px)_0,100%_14px,100%_100%,0_100%)]">
            <p className={`eyebrow !text-xs ${i === data.length - 1 && data.length > 2 ? 'text-sr-red' : 'text-sr-sky'}`}>{formatDateTime(e.starts_at)}</p>
            <h3 className="mt-2 text-xl font-bold">{e.title}</h3>
            <p className="mt-1 text-sm text-sr-gray">{e.location}</p>
            {e.description && <p className="mt-3 text-sm text-[#c9d1dd]">{e.description}</p>}
          </article>
        ))}
      </div>
    </section>
  )
}

function RichText({ content }) {
  return (
    <section className="mx-auto max-w-3xl px-4 pt-24 sm:px-6">
      {content.title && <h2 className="font-display text-4xl">{content.title}</h2>}
      <div className="prose-sr mt-4" dangerouslySetInnerHTML={{ __html: sanitize(content.html) }} />
    </section>
  )
}

function Gallery({ content }) {
  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
      {content.title && <h2 className="font-display text-4xl">{content.title}</h2>}
      <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(content.images ?? []).map((img, i) => (
          <a key={i} href={img.url || undefined} target="_blank" rel="noreferrer" className="block border border-sr-line bg-sr-panel p-4">
            <img src={img.src} alt={img.alt ?? ''} className="mx-auto h-24 object-contain" loading="lazy" />
          </a>
        ))}
      </div>
    </section>
  )
}

const NETWORKS = { discord: 'Discord', instagram: 'Instagram', tiktok: 'TikTok', twitch: 'Twitch', youtube: 'YouTube', x: 'X' }

function Social({ content }) {
  const links = (content.links ?? []).filter((l) => /^https:\/\//.test(l.url ?? ''))
  if (!links.length) return null
  return (
    <section className="mx-auto max-w-6xl px-4 pt-24 sm:px-6">
      <h2 className="font-display text-4xl">{content.title ?? 'Síguenos'}</h2>
      <div className="mt-6 flex flex-wrap gap-3">
        {links.map((l, i) => (
          <a key={i} href={l.url} target="_blank" rel="noreferrer" className="clip-btn border border-sr-line bg-sr-navy px-8 py-3 font-cond font-bold uppercase tracking-[0.2em] hover:bg-sr-blue">
            {NETWORKS[l.network] ?? l.network}
          </a>
        ))}
      </div>
    </section>
  )
}

export const BLOCKS = {
  hero: { label: 'Hero', Component: Hero },
  active_tournaments: { label: 'Banner de torneos activos', Component: ActiveTournaments },
  cards: { label: 'Tarjetas', Component: Cards },
  events: { label: 'Próximos eventos', Component: Events },
  rich_text: { label: 'Texto enriquecido', Component: RichText },
  gallery: { label: 'Galería', Component: Gallery },
  social: { label: 'Redes sociales', Component: Social },
}

export function BlockRenderer({ blocks }) {
  return blocks.map((b) => {
    const def = BLOCKS[b.type]
    return def ? <def.Component key={b.id} content={b.content ?? {}} /> : null
  })
}
