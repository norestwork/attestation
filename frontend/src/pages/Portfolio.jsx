import { useCallback, useEffect, useState } from 'react'
import { api } from '../api.js'
import CriteriaList from '../components/CriteriaList.jsx'
import Timeline from '../components/Timeline.jsx'

// Портфолио преподавателя: его срок, готовность и 11 критериев с загрузкой документов
export default function Portfolio() {
  const [status, setStatus] = useState(null)
  const [docs, setDocs] = useState([])
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const [s, d] = await Promise.all([api.myStatus(), api.myDocuments()])
      setStatus(s)
      setDocs(d)
      setError('')
    } catch (e) {
      setError(e.message)
    }
  }, [])

  useEffect(() => {
    load()
  }, [load])

  if (error && !status) return <p className="alert">{error}</p>
  if (!status) return <p className="page-note">Загрузка…</p>

  const accepted = status.criteria.filter((c) => c.accepted).length

  return (
    <>
      <Timeline
        attestedAt={status.attested_at}
        endsAt={status.ends_at}
        deadline={status.deadline}
      />

      <section className="panel">
        <div className="readiness">
          <h2>Портфолио</h2>
          <p className="muted">
            Принято критериев: {accepted} из {status.criteria.length}
          </p>
          <div className="bar" role="progressbar" aria-valuenow={status.readiness_pct} aria-valuemin="0" aria-valuemax="100">
            <div className="bar-fill" style={{ width: `${status.readiness_pct}%` }} />
          </div>
          <p className="readiness-pct">{status.readiness_pct}%</p>
        </div>
        <p className="muted">
          Критерий считается выполненным, когда методист принял хотя бы один документ по нему.
          Откройте критерий, чтобы загрузить файл.
        </p>
        <CriteriaList criteria={status.criteria} docs={docs} mode="self" onChange={load} />
      </section>
    </>
  )
}
