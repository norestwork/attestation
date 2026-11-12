export const WARN_DAYS = 30 // совпадает с warnDays в Go-коде рассылки

export function fmtDate(s) {
  if (!s) return 'не указана'
  const [y, m, d] = s.split('-')
  return `${d}.${m}.${y}`
}

export function fmtDateTime(iso) {
  return new Date(iso).toLocaleDateString('ru-RU')
}

const toDate = (s) => {
  const [y, m, d] = s.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export function daysUntil(s) {
  if (!s) return null
  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((toDate(s) - today) / 86400000)
}

function plural(n, one, few, many) {
  const a = Math.abs(n)
  if (a % 10 === 1 && a % 100 !== 11) return one
  if (a % 10 >= 2 && a % 10 <= 4 && (a % 100 < 12 || a % 100 > 14)) return few
  return many
}

export function daysLabel(days) {
  if (days === null) return 'дата не указана'
  if (days < 0) return `просрочено на ${-days} ${plural(days, 'день', 'дня', 'дней')}`
  if (days === 0) return 'срок сегодня'
  return `${days} ${plural(days, 'день', 'дня', 'дней')}`
}

// ok — больше полугода, soon — приближается, urgent — меньше WARN_DAYS, overdue — прошёл
export function deadlineState(days) {
  if (days === null) return 'none'
  if (days < 0) return 'overdue'
  if (days <= WARN_DAYS) return 'urgent'
  if (days <= 180) return 'soon'
  return 'ok'
}

// положение даты на шкале от start до end, в процентах (0–100)
export function position(date, start, end) {
  const a = toDate(start).getTime()
  const b = toDate(end).getTime()
  const t = typeof date === 'string' ? toDate(date).getTime() : date.getTime()
  if (b <= a) return 0
  return Math.max(0, Math.min(100, ((t - a) / (b - a)) * 100))
}

export const CRITERION_LABEL = { none: 'Нет документов', pending: 'На проверке', accepted: 'Принято' }

export function criterionState(docs) {
  if (docs.length === 0) return 'none'
  return docs.some((d) => d.accepted) ? 'accepted' : 'pending'
}
