import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { WARN_DAYS, daysLabel, daysUntil, deadlineState, fmtDate } from '../utils.js'

const SORTS = {
  name: 'По ФИО',
  deadline: 'Сначала ближайший срок',
  readiness: 'Сначала наименее готовые',
}

export default function Teachers() {
  const [rows, setRows] = useState(null)
  const [error, setError] = useState('')
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState('deadline')
  const [adding, setAdding] = useState(false)

  const load = useCallback(async () => {
    try {
      setRows(await api.teachers())
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  const list = useMemo(() => {
    if (!rows) return []
    const q = query.trim().toLowerCase()
    const withDays = rows
      .filter((t) => t.full_name.toLowerCase().includes(q))
      .map((t) => ({ ...t, days: daysUntil(t.deadline) }))
    const cmp = {
      name: (a, b) => a.full_name.localeCompare(b.full_name, 'ru'),
      deadline: (a, b) => (a.days ?? Infinity) - (b.days ?? Infinity),
      readiness: (a, b) => a.readiness_pct - b.readiness_pct,
    }[sort]
    return withDays.sort(cmp)
  }, [rows, query, sort])

  if (error && !rows) return <p className="alert">{error}</p>
  if (!rows) return <p className="page-note">Загрузка…</p>

  const urgent = rows.filter((t) => {
    const d = daysUntil(t.deadline)
    return d !== null && d <= WARN_DAYS
  }).length

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Преподаватели</h1>
          <p className="muted">
            Всего: {rows.length}. Срок подачи документов ближе {WARN_DAYS} дней или уже прошёл: {urgent}.
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setAdding((v) => !v)}>
          {adding ? 'Скрыть форму' : 'Добавить преподавателя'}
        </button>
      </div>

      {adding && (
        <AddTeacher
          onCreated={() => {
            setAdding(false)
            load()
          }}
        />
      )}

      <div className="toolbar">
        <label className="field field-inline">
          <span className="visually-hidden">Поиск по ФИО</span>
          <input
            type="search"
            placeholder="Поиск по ФИО"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </label>
        <label className="field field-inline">
          <span className="visually-hidden">Сортировка</span>
          <select value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>Преподаватель</th>
              <th>Заполненность портфолио</th>
              <th>Категория присвоена</th>
              <th>Срок подачи документов</th>
            </tr>
          </thead>
          <tbody>
            {list.map((t) => (
              <tr key={t.id}>
                <td>
                  <Link to={`/teachers/${t.id}`} className="row-link">
                    {t.full_name}
                  </Link>
                  <div className="muted small">{t.email}</div>
                </td>
                <td>
                  <div className="bar-row">
                    <div className="bar" role="progressbar" aria-valuenow={t.readiness_pct} aria-valuemin="0" aria-valuemax="100">
                      <div className="bar-fill" style={{ width: `${t.readiness_pct}%` }} />
                    </div>
                    <span className="bar-num">{t.readiness_pct}%</span>
                  </div>
                </td>
                <td>{fmtDate(t.attested_at)}</td>
                <td>
                  {t.deadline ? (
                    <>
                      <div>{fmtDate(t.deadline)}</div>
                      <span className={`chip chip-${deadlineState(t.days)}`}>{daysLabel(t.days)}</span>
                    </>
                  ) : (
                    <span className="muted">дата не указана</span>
                  )}
                </td>
              </tr>
            ))}
            {list.length === 0 && (
              <tr>
                <td colSpan="4" className="muted empty">
                  {rows.length === 0
                    ? 'Преподавателей пока нет. Добавьте первого.'
                    : 'Никого не нашли. Проверьте запрос.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  )
}

function AddTeacher({ onCreated }) {
  const [form, setForm] = useState({ full_name: '', email: '', password: '', attested_at: '' })
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }))

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      await api.createTeacher({ ...form, full_name: form.full_name.trim(), email: form.email.trim() })
      onCreated()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="panel form-grid" onSubmit={submit}>
      <label className="field">
        <span>ФИО</span>
        <input value={form.full_name} onChange={set('full_name')} required />
      </label>
      <label className="field">
        <span>Электронная почта</span>
        <input type="email" value={form.email} onChange={set('email')} required />
      </label>
      <label className="field">
        <span>Начальный пароль (от 6 символов)</span>
        <input type="text" minLength={6} value={form.password} onChange={set('password')} required />
      </label>
      <label className="field">
        <span>Дата присвоения категории</span>
        <input type="date" value={form.attested_at} onChange={set('attested_at')} />
      </label>
      {error && (
        <p className="alert form-wide" role="alert">
          {error}
        </p>
      )}
      <div className="form-wide">
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Сохраняю…' : 'Создать учётную запись'}
        </button>
      </div>
    </form>
  )
}
