import { daysLabel, daysUntil, deadlineState, fmtDate, position } from '../utils.js'

// Пятилетний срок категории одной линией: заполнено до сегодняшнего дня,
// штриховкой отмечены последние полгода — время, когда нужно подать документы.
export default function Timeline({ attestedAt, endsAt, deadline }) {
  if (!attestedAt || !endsAt || !deadline) {
    return (
      <section className="hero">
        <h1>Срок аттестации не задан</h1>
        <p className="muted">Методист ещё не указал дату присвоения категории.</p>
      </section>
    )
  }

  const days = daysUntil(deadline)
  const state = deadlineState(days)
  const today = position(new Date(), attestedAt, endsAt)
  const deadlinePos = position(deadline, attestedAt, endsAt)

  let headline
  if (days < 0) headline = `Срок подачи документов прошёл: ${daysLabel(days)}`
  else if (days === 0) headline = 'Документы нужно подать сегодня'
  else headline = `До срока подачи документов: ${daysLabel(days)}`

  return (
    <section className="hero">
      <h1 className={`hero-title is-${state}`}>{headline}</h1>
      <p className="muted">
        Категория действует до {fmtDate(endsAt)}. Документы нужно подать до {fmtDate(deadline)}.
      </p>

      <div className="timeline" aria-hidden="true">
        <div className="tl-above">
          <span className="tl-label" style={{ left: `${deadlinePos}%` }}>
            срок подачи
          </span>
        </div>
        <div className="tl-track">
          <div className="tl-fill" style={{ width: `${today}%` }} />
          <div className="tl-zone" style={{ left: `${deadlinePos}%` }} />
          <div className="tl-tick" style={{ left: `${deadlinePos}%` }} />
          <div className="tl-today" style={{ left: `${today}%` }} />
        </div>
        <div className="tl-below">
          <span className="tl-label" style={{ left: `${today}%` }}>
            сегодня
          </span>
        </div>
        <div className="tl-ends">
          <span>{fmtDate(attestedAt)}</span>
          <span>{fmtDate(endsAt)}</span>
        </div>
      </div>
    </section>
  )
}
