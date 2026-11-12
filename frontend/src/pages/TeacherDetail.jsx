import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { api } from '../api.js'
import CriteriaList from '../components/CriteriaList.jsx'
import Timeline from '../components/Timeline.jsx'

// Страница методиста: все данные об одном преподавателе
export default function TeacherDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [teacher, setTeacher] = useState(undefined) // undefined — грузим, null — не найден
  const [criteria, setCriteria] = useState([])
  const [docs, setDocs] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [rows, c, d] = await Promise.all([api.teachers(), api.criteria(), api.teacherDocuments(id)])
      setTeacher(rows.find((t) => String(t.id) === id) || null)
      setCriteria(c)
      setDocs(d)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [id])

  useEffect(() => {
    load()
  }, [load])

  if (error && teacher === undefined) return <p className="alert">{error}</p>
  if (teacher === undefined) return <p className="page-note">Загрузка…</p>
  if (teacher === null)
    return (
      <p className="page-note">
        Преподаватель не найден. <Link to="/teachers">Вернуться к списку</Link>
      </p>
    )

  const remove = async () => {
    if (!window.confirm(`Удалить ${teacher.full_name} вместе со всеми загруженными документами? Это нельзя отменить.`)) return
    try {
      await api.deleteTeacher(teacher.id)
      navigate('/teachers', { replace: true })
    } catch (e) {
      setError(e.message)
    }
  }

  return (
    <>
      <p className="back">
        <Link to="/teachers">Все преподаватели</Link>
      </p>
      <div className="page-head">
        <div>
          <h1>{teacher.full_name}</h1>
          <p className="muted">{teacher.email}</p>
        </div>
        <div className="readiness-big">
          <span className="readiness-pct">{teacher.readiness_pct}%</span>
          <span className="muted">портфолио заполнено</span>
        </div>
      </div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}

      <Timeline attestedAt={teacher.attested_at} endsAt={teacher.ends_at} deadline={teacher.deadline} />

      <section className="panel">
        <h2>Документы по критериям</h2>
        <p className="muted">Откройте критерий, скачайте файл и отметьте документ принятым.</p>
        <CriteriaList criteria={criteria} docs={docs} mode="review" onChange={load} />
      </section>

      <section className="panel">
        <h2>Данные учётной записи</h2>
        <EditTeacher key={teacher.id + teacher.email + teacher.attested_at} teacher={teacher} onSaved={load} />
        <hr />
        <button className="btn btn-danger" onClick={remove}>
          Удалить преподавателя
        </button>
      </section>
    </>
  )
}

function EditTeacher({ teacher, onSaved }) {
  const [form, setForm] = useState({
    full_name: teacher.full_name,
    email: teacher.email,
    attested_at: teacher.attested_at || '',
    password: '',
  })
  const [msg, setMsg] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setMsg('')
    setError('')
    try {
      const body = {
        full_name: form.full_name.trim(),
        email: form.email.trim(),
        attested_at: form.attested_at, // пустая строка очищает дату
      }
      if (form.password) body.password = form.password
      await api.updateTeacher(teacher.id, body)
      setForm((f) => ({ ...f, password: '' }))
      setMsg('Изменения сохранены.')
      await onSaved()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="form-grid" onSubmit={submit}>
      <label className="field">
        <span>ФИО</span>
        <input value={form.full_name} onChange={set('full_name')} required />
      </label>
      <label className="field">
        <span>Электронная почта</span>
        <input type="email" value={form.email} onChange={set('email')} required />
      </label>
      <label className="field">
        <span>Дата присвоения категории</span>
        <input type="date" value={form.attested_at} onChange={set('attested_at')} />
      </label>
      <label className="field">
        <span>Новый пароль (оставьте пустым, чтобы не менять)</span>
        <input type="text" minLength={6} value={form.password} onChange={set('password')} />
      </label>
      {error && (
        <p className="alert form-wide" role="alert">
          {error}
        </p>
      )}
      {msg && (
        <p className="ok-note form-wide" role="status">
          {msg}
        </p>
      )}
      <div className="form-wide">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Сохраняю…' : 'Сохранить изменения'}
        </button>
      </div>
    </form>
  )
}
