import { createContext, useContext, useEffect, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { api } from './api.js'

const AuthContext = createContext(null)
export const useAuth = () => useContext(AuthContext)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(undefined) // undefined — ещё проверяем, null — не вошёл

  useEffect(() => {
    api.me().then(setUser).catch(() => setUser(null))
  }, [])

  // api.js сообщает, если сервер ответил 401 (например, сессия сброшена после перезапуска)
  useEffect(() => {
    const onUnauthorized = () => setUser(null)
    window.addEventListener('unauthorized', onUnauthorized)
    return () => window.removeEventListener('unauthorized', onUnauthorized)
  }, [])

  const login = async (email, password) => {
    await api.login(email, password)
    setUser(await api.me())
  }
  const logout = async () => {
    try {
      await api.logout()
    } catch {
      /* всё равно выходим */
    }
    setUser(null)
  }

  return <AuthContext.Provider value={{ user, login, logout }}>{children}</AuthContext.Provider>
}

// Пускает только вошедших; role: 'methodist' | 'teacher' ограничивает раздел
export function RequireAuth({ role, children }) {
  const { user } = useAuth()
  if (user === undefined) return <p className="page-note">Загрузка…</p>
  if (user === null) return <Navigate to="/login" replace />
  if (role === 'methodist' && !user.is_methodist) return <Navigate to="/" replace />
  if (role === 'teacher' && user.is_methodist) return <Navigate to="/" replace />
  return children
}
