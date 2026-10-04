import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// En desarrollo, sirve las funciones de /api (Node) desde el mismo servidor de Vite,
// con la misma firma (req, res) que usan las funciones serverless.
function localApi(env) {
  return {
    name: 'sabana-local-api',
    configureServer(server) {
      Object.assign(process.env, env)
      server.middlewares.use(async (req, res, next) => {
        const m = req.url?.match(/^\/api\/(draft|match|admin|teams)\/([a-z-]+)(\?.*)?$/)
        if (!m) return next()
        let raw = ''
        for await (const chunk of req) raw += chunk
        req.query = { action: m[2] }
        req.body = raw ? JSON.parse(raw) : {}
        res.status = (code) => ((res.statusCode = code), res)
        res.json = (obj) => {
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(obj))
        }
        try {
          const mod = await server.ssrLoadModule(`/api/${m[1]}/[action].js`)
          await mod.default(req, res)
        } catch (e) {
          console.error(e)
          res.status(500).json({ error: 'Error interno' })
        }
      })
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  return {
    plugins: [react(), tailwindcss(), localApi(env)],
    test: { include: ['shared/**/*.test.js', 'src/**/*.test.{js,jsx}'] },
  }
})
