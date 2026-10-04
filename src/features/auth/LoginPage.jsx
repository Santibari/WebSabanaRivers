import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { repo, isDemo } from '../../lib/repo/index.js'
import { useAuth } from '../../app/hooks.jsx'
import { Eyebrow, Title, Field, Input, Button, ErrorNote, Panel, Badge } from '../../components/ui.jsx'

const ROLE_LABEL = { superadmin: 'Superadmin', admin: 'Admin', editor: 'Editor', user: 'Capitán / jugador' }

function DemoUsers() {
  const nav = useNavigate()
  const users = repo.auth.demoUsers()
  return (
    <Panel className="p-6" accent="blue">
      <h2 className="font-display text-xl">Modo demo · entrar como</h2>
      <p className="mt-1 text-sm text-sr-gray">La sesión es por pestaña: abre otra pestaña y entra como el otro capitán para probar el draft sincronizado.</p>
      <div className="mt-4 grid gap-2">
        {users.map((u) => (
          <button
            key={u.id}
            onClick={async () => {
              await repo.auth.signInAs(u.id)
              nav(u.role === 'user' ? '/equipo' : '/admin')
            }}
            className="flex items-center justify-between border border-sr-line px-4 py-2.5 text-left hover:border-sr-sky"
          >
            <span>
              <span className="font-semibold">{u.username}</span>
              <span className="block text-xs text-sr-gray">{u.email}</span>
            </span>
            <Badge tone={u.role === 'user' ? 'gray' : 'amber'}>{ROLE_LABEL[u.role]}</Badge>
          </button>
        ))}
      </div>
      <button
        onClick={() => confirm('¿Borrar todos los datos del modo demo y volver a los de ejemplo?') && repo.auth.resetDemo()}
        className="mt-5 text-sm text-sr-gray underline hover:text-sr-white"
      >
        Reiniciar datos de ejemplo
      </button>
    </Panel>
  )
}

export function LoginPage() {
  const { user } = useAuth()
  const nav = useNavigate()
  const [mode, setMode] = useState('login')
  const [form, setForm] = useState({ email: '', password: '', username: '' })
  const [error, setError] = useState(null)
  const [info, setInfo] = useState(null)
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError(null)
    setInfo(null)
    try {
      if (mode === 'login') {
        await repo.auth.signIn(form.email, form.password)
        nav('/equipo')
      } else {
        if (form.password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres')
        const r = await repo.auth.signUp(form.email, form.password, form.username)
        if (r.needsConfirmation) setInfo('Te enviamos un correo para verificar tu cuenta. Después podrás crear tu equipo.')
        else nav('/equipo')
      }
    } catch (err) {
      setError(err)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto grid max-w-6xl gap-10 px-4 pt-10 sm:px-6 lg:grid-cols-2">
      <div>
        <Eyebrow>{mode === 'login' ? 'Bienvenido de vuelta' : 'Crea tu cuenta'}</Eyebrow>
        <Title className="mt-2">{mode === 'login' ? 'Iniciar sesión' : 'Registro'}</Title>
        {user && <p className="mt-4 text-sr-gray">Sesión actual: {user.email}</p>}
        <form onSubmit={submit} className="mt-8 max-w-md space-y-4">
          {mode === 'register' && (
            <Field label="Nombre de usuario"><Input value={form.username} onChange={set('username')} required minLength={2} maxLength={32} autoComplete="nickname" /></Field>
          )}
          <Field label="Correo"><Input type="email" value={form.email} onChange={set('email')} required autoComplete="email" /></Field>
          <Field label="Contraseña" hint={isDemo ? 'Modo demo: la contraseña no se verifica.' : undefined}>
            <Input type="password" value={form.password} onChange={set('password')} required={!isDemo} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} />
          </Field>
          <ErrorNote error={error} />
          {info && <p className="border-l-2 border-sr-sky bg-sr-navy/50 px-3 py-2 text-sm">{info}</p>}
          <Button type="submit" skew disabled={busy}>{mode === 'login' ? 'Entrar' : 'Crear cuenta'}</Button>
          <p className="text-sm text-sr-gray">
            {mode === 'login' ? '¿No tienes cuenta? ' : '¿Ya tienes cuenta? '}
            <button type="button" className="text-sr-sky underline" onClick={() => setMode(mode === 'login' ? 'register' : 'login')}>
              {mode === 'login' ? 'Regístrate' : 'Inicia sesión'}
            </button>
          </p>
        </form>
      </div>
      {isDemo && <DemoUsers />}
    </div>
  )
}
