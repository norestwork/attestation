import { Navigate, Route, Routes } from 'react-router-dom'
import { RequireAuth, useAuth } from './auth.jsx'
import Layout from './components/Layout.jsx'
import Login from './pages/Login.jsx'
import Portfolio from './pages/Portfolio.jsx'
import Teachers from './pages/Teachers.jsx'
import TeacherDetail from './pages/TeacherDetail.jsx'

function Home() {
  const { user } = useAuth()
  if (user === undefined) return <p className="page-note">Загрузка…</p>
  if (user === null) return <Navigate to="/login" replace />
  return <Navigate to={user.is_methodist ? '/teachers' : '/portfolio'} replace />
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route element={<Layout />}>
        <Route path="/" element={<Home />} />
        <Route
          path="/portfolio"
          element={
            <RequireAuth role="teacher">
              <Portfolio />
            </RequireAuth>
          }
        />
        <Route
          path="/teachers"
          element={
            <RequireAuth role="methodist">
              <Teachers />
            </RequireAuth>
          }
        />
        <Route
          path="/teachers/:id"
          element={
            <RequireAuth role="methodist">
              <TeacherDetail />
            </RequireAuth>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  )
}
