// Los textos del CMS se limpian antes de mostrarlos (evita XSS).
import DOMPurify from 'dompurify'

export const sanitize = (html) => DOMPurify.sanitize(html ?? '', { USE_PROFILES: { html: true } })

/** Markdown mínimo (títulos, negritas, listas, párrafos) para el reglamento. */
export function markdown(md = '') {
  const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const inline = (s) => esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>').replace(/\*(.+?)\*/g, '<em>$1</em>')
  const out = []
  let list = false
  for (const line of md.split('\n')) {
    const l = line.trim()
    if (l.startsWith('- ')) {
      if (!list) out.push('<ul>'), (list = true)
      out.push(`<li>${inline(l.slice(2))}</li>`)
      continue
    }
    if (list) out.push('</ul>'), (list = false)
    if (!l) continue
    if (l.startsWith('### ')) out.push(`<h3>${inline(l.slice(4))}</h3>`)
    else if (l.startsWith('## ')) out.push(`<h2>${inline(l.slice(3))}</h2>`)
    else out.push(`<p>${inline(l)}</p>`)
  }
  if (list) out.push('</ul>')
  return sanitize(out.join(''))
}
