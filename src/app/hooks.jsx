import { createContext, useContext, useEffect, useState } from 'react'
import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import { repo } from '../lib/repo/index.js'
import { loadChampions } from '../lib/ddragon.js'

const AuthCtx = createContext({ user: null, ready: false })

export function AuthProvider({ children }) {
  const [state, setState] = useState({ user: null, ready: false })
  const qc = useQueryClient()
  useEffect(() => {
    let alive = true
    repo.auth.current().then((user) => alive && setState({ user, ready: true }))
    const off = repo.auth.onChange((user) => {
      setState({ user, ready: true })
      qc.invalidateQueries()
    })
    return () => {
      alive = false
      off()
    }
  }, [qc])
  return <AuthCtx.Provider value={state}>{children}</AuthCtx.Provider>
}

export const useAuth = () => useContext(AuthCtx)
export const isAdminUser = (u) => !!u && ['admin', 'superadmin'].includes(u.role)
export const isEditorUser = (u) => !!u && ['admin', 'superadmin', 'editor'].includes(u.role)

/** Cualquier cambio en los datos (otra pestaña o Realtime) refresca las consultas abiertas. */
export function LiveUpdates() {
  const qc = useQueryClient()
  useEffect(() => repo.subscribeAll(() => qc.invalidateQueries({ predicate: (q) => q.queryKey[0] !== 'champions' && q.queryKey[0] !== 'room' })), [qc])
  return null
}

export const useRepoQuery = (key, fn, opts = {}) => useQuery({ queryKey: key, queryFn: fn, ...opts })

export function useRepoMutation(fn, { invalidate = true, onSuccess } = {}) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: (data, vars) => {
      if (invalidate) qc.invalidateQueries()
      onSuccess?.(data, vars)
    },
  })
}

export const useChampions = () => useQuery({ queryKey: ['champions'], queryFn: loadChampions, staleTime: Infinity })
