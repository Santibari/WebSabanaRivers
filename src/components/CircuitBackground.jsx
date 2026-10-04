// Circuitos del afiche: azul a la izquierda, rojo a la derecha. Se dibujan al cargar y los nodos laten.
const LEFT = [
  'M40 0 V160 H237 V414',
  'M0 103 H96 V311 H52 V630',
  'M0 222 H155 V488 H111 V720',
  'M0 607 H74 V700',
]
function mirror(d) {
  // Refleja coordenadas X (H y la X de M) sobre un ancho de 1067.
  return d.replace(/M(\d+) (\d+)/, (_, x, y) => `M${1067 - +x} ${y}`).replace(/H(\d+)/g, (_, x) => `H${1067 - +x}`)
}

export function CircuitBackground({ height = 760, className = '' }) {
  return (
    <svg
      aria-hidden="true"
      viewBox={`0 0 1067 ${height}`}
      preserveAspectRatio="xMidYMin slice"
      className={`pointer-events-none absolute inset-x-0 top-0 h-full w-full ${className}`}
    >
      {LEFT.map((d, i) => (
        <path key={`l${i}`} d={d} className="circuit-path" style={{ animationDelay: `${i * 0.25}s` }} stroke="#1E5AA8" strokeWidth="1.5" fill="none" opacity="0.9" />
      ))}
      {LEFT.map((d, i) => (
        <path key={`r${i}`} d={mirror(d)} className="circuit-path" style={{ animationDelay: `${0.15 + i * 0.25}s` }} stroke="#8E2733" strokeWidth="1.5" fill="none" opacity="0.95" />
      ))}
      <line x1="0" y1="103" x2="44" y2="103" stroke="#4FB3FF" strokeWidth="2" />
      <line x1="0" y1="222" x2="44" y2="222" stroke="#4FB3FF" strokeWidth="2" />
      <line x1="1023" y1="103" x2="1067" y2="103" stroke="#D23A4A" strokeWidth="2" />
      <line x1="1023" y1="222" x2="1067" y2="222" stroke="#D23A4A" strokeWidth="2" />
      <circle cx="237" cy="414" r="4" fill="#4FB3FF" className="circuit-pulse" />
      <circle cx="52" cy="630" r="3.5" fill="#4FB3FF" className="circuit-pulse" style={{ animationDelay: '0.8s' }} />
      <circle cx={1067 - 237} cy="414" r="4" fill="#D23A4A" className="circuit-pulse" style={{ animationDelay: '0.4s' }} />
      <circle cx={1067 - 52} cy="630" r="3.5" fill="#D23A4A" className="circuit-pulse" style={{ animationDelay: '1.2s' }} />
    </svg>
  )
}
