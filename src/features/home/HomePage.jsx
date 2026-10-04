import { BlockRenderer } from '../../components/blocks.jsx'
import { Loading } from '../../components/ui.jsx'
import { useRepoQuery } from '../../app/hooks.jsx'
import { repo } from '../../lib/repo/index.js'

export function HomePage() {
  const { data: blocks, isLoading } = useRepoQuery(['page', 'inicio'], () => repo.getPage('inicio'))
  if (isLoading) return <div className="mx-auto max-w-6xl px-6"><Loading /></div>
  return <BlockRenderer blocks={blocks ?? []} />
}
