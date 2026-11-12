import { Link, Outlet } from 'react-router-dom'
import { useAuth } from '../auth.jsx'
import { getRole, setRole } from '../mock.js'

export default function Layout() {
  const { user, logout } = useAuth()
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="brand">
            Аттестация преподавателей
          </Link>
          {user && (
            <div className="topbar-user">
              <span>{user.full_name}</span>
              {import.meta.env.MODE === 'mock' && (
                <button
                  className="btn"
                  onClick={() => {
                    setRole(getRole() === 'methodist' ? 'teacher' : 'methodist')
                    window.location.hash = '#/'
                    window.location.reload()
                  }}
                >
                  Тест: переключить роль
                </button>
              )}
              <button className="btn btn-quiet" onClick={logout}>
                Выйти
              </button>
            </div>
          )}
        </div>
      </header>
      <main className="page">
        <Outlet />
      </main>
    </>
  )
}
