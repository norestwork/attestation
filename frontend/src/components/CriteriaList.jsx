import { useState } from 'react'
import { api, fileUrl } from '../api.js'
import { CRITERION_LABEL, criterionState, fmtDateTime } from '../utils.js'

// mode="self"   — преподаватель: загрузка и удаление своих документов
// mode="review" — методист: просмотр и отметка «принято»
export default function CriteriaList({ criteria, docs, mode, onChange }) {
  const [open, setOpen] = useState({})
  const [error, setError] = useState('')

  const toggle = (id) => setOpen((o) => ({ ...o, [id]: !o[id] }))

  const run = async (action) => {
    setError('')
    try {
      await action()
      await onChange()
    } catch (e) {
      setError(e.message)
    }
  }

  const remove = (doc) => {
    if (!window.confirm(`Удалить файл «${doc.filename}»?`)) return
    run(() => api.deleteMyDocument(doc.id))
  }

  return (
    <div>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <ul className="criteria">
        {criteria.map((c) => {
          const list = docs.filter((d) => d.criterion_id === c.id)
          const state = criterionState(list)
          const isOpen = !!open[c.id]
          return (
            <li key={c.id} className="criterion">
              <button
                type="button"
                className="criterion-head"
                aria-expanded={isOpen}
                onClick={() => toggle(c.id)}
              >
                <span className="criterion-title">{c.title}</span>
                <span className="muted criterion-count">
                  {list.length > 0 ? `файлов: ${list.length}` : ''}
                </span>
                <span className={`chip chip-${state}`}>{CRITERION_LABEL[state]}</span>
                <span className="chevron" aria-hidden="true" />
              </button>

              {isOpen && (
                <div className="criterion-body">
                  {list.length === 0 && (
                    <p className="muted">
                      {mode === 'self'
                        ? 'Пока ничего не загружено. Добавьте подтверждающий документ ниже.'
                        : 'Преподаватель ничего не загрузил по этому критерию.'}
                    </p>
                  )}

                  {list.map((d) => (
                    <div key={d.id} className="doc">
                      <div className="doc-main">
                        <a
                          href={fileUrl(d.id)}
                          className="doc-name"
                          onClick={
                            import.meta.env.MODE === 'mock'
                              ? (e) => {
                                  e.preventDefault()
                                  window.alert('В демо-версии файлы не скачиваются.')
                                }
                              : undefined
                          }
                        >
                          {d.filename}
                        </a>
                        {d.description && <div className="doc-desc">{d.description}</div>}
                        <div className="muted doc-meta">Загружено {fmtDateTime(d.uploaded_at)}</div>
                      </div>
                      <span className={`chip ${d.accepted ? 'chip-accepted' : 'chip-pending'}`}>
                        {d.accepted ? 'Принят' : 'На проверке'}
                      </span>
                      {mode === 'self' && !d.accepted && (
                        <button className="btn btn-quiet" onClick={() => remove(d)}>
                          Удалить
                        </button>
                      )}
                      {mode === 'review' && (
                        <button
                          className={`btn ${d.accepted ? 'btn-quiet' : 'btn-primary'}`}
                          onClick={() => run(() => api.reviewDocument(d.id, !d.accepted))}
                        >
                          {d.accepted ? 'Снять отметку' : 'Принять'}
                        </button>
                      )}
                    </div>
                  ))}

                  {mode === 'self' && (
                    <UploadForm criterionId={c.id} onUploaded={onChange} />
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function UploadForm({ criterionId, onUploaded }) {
  const [description, setDescription] = useState('')
  const [file, setFile] = useState(null)
  const [fileKey, setFileKey] = useState(0) // сбрасывает поле выбора файла
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e) => {
    e.preventDefault()
    if (!file) {
      setError('Выберите файл PDF, JPG или PNG до 10 МБ.')
      return
    }
    setBusy(true)
    setError('')
    try {
      const fd = new FormData()
      fd.append('criterion_id', criterionId)
      fd.append('description', description)
      fd.append('file', file)
      await api.upload(fd)
      setDescription('')
      setFile(null)
      setFileKey((k) => k + 1)
      await onUploaded()
    } catch (err) {
      setError(err.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <form className="upload" onSubmit={submit}>
      <label className="field">
        <span>Описание (тема, место, уровень, результат)</span>
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          maxLength={300}
        />
      </label>
      <label className="field">
        <span>Файл</span>
        <input
          key={fileKey}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          onChange={(e) => setFile(e.target.files[0] || null)}
        />
      </label>
      {error && (
        <p className="alert" role="alert">
          {error}
        </p>
      )}
      <div>
        <button className="btn btn-primary" disabled={busy}>
          {busy ? 'Загружаю…' : 'Загрузить файл'}
        </button>
      </div>
    </form>
  )
}
