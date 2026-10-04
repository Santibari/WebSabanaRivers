// Punto único de acceso a datos. Con VITE_SUPABASE_URL configurado usa Supabase;
// si no, arranca en modo demo (todo en el navegador) para poder probar la web completa.
import { demoRepo } from './demo.js'

export const isDemo = !import.meta.env.VITE_SUPABASE_URL

export const repo = isDemo ? demoRepo : (await import('./supabase.js')).supabaseRepo
