import { useEffect, useRef, useState } from 'react'

/** Muestra su contenido con una animación cuando entra en pantalla. */
export function Reveal({ children, delay = 0, className = '', as: Tag = 'div' }) {
  const ref = useRef(null)
  const [visible, setVisible] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return setVisible(true)
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setVisible(true)
          io.disconnect()
        }
      },
      { rootMargin: '0px 0px -10% 0px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return (
    <Tag ref={ref} className={`reveal ${visible ? 'is-visible' : ''} ${className}`} style={{ transitionDelay: `${delay}ms` }}>
      {children}
    </Tag>
  )
}
