// Punto único de acceso a datos.
// - Con VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY → Supabase.
// - Sin ellas, en desarrollo (npm run dev) → modo demo, todo en el navegador.
// - Sin ellas en producción → NO se activa el demo en silencio: la app muestra un error de configuración
//   (salvo que se pida a propósito con VITE_DEMO=true).
import { demoRepo } from './demo.js'

const hasSupabase = !!import.meta.env.VITE_SUPABASE_URL && !!import.meta.env.VITE_SUPABASE_ANON_KEY
const demoAllowed = import.meta.env.DEV || import.meta.env.VITE_DEMO === 'true'

export const isDemo = !hasSupabase && demoAllowed

/** true si el build de producción quedó sin configurar. El motivo NO se muestra al público. */
export const configError = !hasSupabase && !demoAllowed

export const repo = hasSupabase ? (await import('./supabase.js')).supabaseRepo : demoRepo
