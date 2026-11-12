// Тестовые данные для просмотра интерфейса без Go-сервера.
// Включается только командой `npm run dev:mock` (режим vite "mock"), на боевую сборку не влияет.
// Данные живут в памяти: после перезагрузки страницы возвращаются исходные.

const CRITERIA = [
  'Повышение квалификации',
  'Участие в методических объединениях',
  'Педагогическая разработка',
  'Публикации',
  'Выступления',
  'Инновационная деятельность',
  'Экспертная деятельность',
  'Профессиональные конкурсы',
  'Достижения учащихся',
  'Результаты освоения программ',
  'Консультативно-методическая деятельность',
].map((title, i) => ({ id: i + 1, title }))

const pad = (n) => String(n).padStart(2, '0')
const iso = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
const addMonths = (d, m) => new Date(d.getFullYear(), d.getMonth() + m, d.getDate())
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)

// дедлайн = присвоение + 54 месяца, окончание = присвоение + 60 месяцев
const attestedFor = (daysToDeadline) => iso(addMonths(addDays(new Date(), daysToDeadline), -54))

let teachers = [
  { id: 1, full_name: 'Швыркунова О.Ю.', email: 'shvyrkunova@college.ru', attested_at: attestedFor(400) },
  { id: 2, full_name: 'Петров А.В.', email: 'petrov@college.ru', attested_at: attestedFor(120) },
  { id: 3, full_name: 'Смирнова Е.Н.', email: 'smirnova@college.ru', attested_at: attestedFor(12) },
  { id: 4, full_name: 'Кузнецова Т.И.', email: 'kuznetsova@college.ru', attested_at: attestedFor(-20) },
  { id: 5, full_name: 'Орлов Д.С.', email: 'orlov@college.ru', attested_at: null },
]
const SELF_ID = 2 // под ролью «преподаватель» вы видите портфолио Петрова А.В.

let nextDocId = 100
const ago = (days) => addDays(new Date(), -days).toISOString()
let docs = [
  { id: 1, teacher_id: 1, criterion_id: 1, description: 'Курсы «Цифровая среда в колледже», 72 ч', filename: 'kursy.pdf', accepted: true, uploaded_at: ago(40) },
  { id: 2, teacher_id: 1, criterion_id: 4, description: 'Статья в сборнике конференции', filename: 'statya.pdf', accepted: true, uploaded_at: ago(35) },
  { id: 3, teacher_id: 1, criterion_id: 9, description: 'Диплом студента, региональный конкурс', filename: 'diplom.jpg', accepted: false, uploaded_at: ago(3) },
  { id: 4, teacher_id: 2, criterion_id: 1, description: 'Удостоверение о повышении квалификации', filename: 'udostoverenie.pdf', accepted: true, uploaded_at: ago(60) },
  { id: 5, teacher_id: 2, criterion_id: 2, description: 'Справка об участии в МО', filename: 'spravka_mo.pdf', accepted: false, uploaded_at: ago(5) },
  { id: 6, teacher_id: 2, criterion_id: 5, description: 'Выступление на педсовете', filename: 'vystuplenie.png', accepted: true, uploaded_at: ago(20) },
  { id: 7, teacher_id: 3, criterion_id: 3, description: 'Методическая разработка урока', filename: 'razrabotka.pdf', accepted: true, uploaded_at: ago(15) },
  { id: 8, teacher_id: 4, criterion_id: 8, description: 'Участие в конкурсе «Педагог года»', filename: 'konkurs.pdf', accepted: false, uploaded_at: ago(9) },
]

// роль хранится в sessionStorage: 'methodist' | 'teacher' | '' (вышли)
export const getRole = () => {
  const r = sessionStorage.getItem('mockRole')
  return r === null ? 'methodist' : r
}
export const setRole = (r) => sessionStorage.setItem('mockRole', r)

const wait = (data) => new Promise((res) => setTimeout(() => res(structuredClone(data)), 150))
const err = (msg, status) => Promise.reject(Object.assign(new Error(msg), { status }))

const readiness = (id) => {
  const done = new Set(docs.filter((d) => d.teacher_id === id && d.accepted).map((d) => d.criterion_id))
  return Math.floor((done.size * 100) / CRITERIA.length)
}

const dates = (t) => {
  if (!t.attested_at) return { attested_at: null, ends_at: null, deadline: null }
  const [y, m, d] = t.attested_at.split('-').map(Number)
  const start = new Date(y, m - 1, d)
  return { attested_at: t.attested_at, ends_at: iso(addMonths(start, 60)), deadline: iso(addMonths(start, 54)) }
}

const row = (t) => ({ id: t.id, full_name: t.full_name, email: t.email, readiness_pct: readiness(t.id), ...dates(t) })

const publicDoc = ({ id, criterion_id, description, filename, accepted, uploaded_at }) => ({
  id, criterion_id, description, filename, accepted, uploaded_at,
})

export function mockRequest(path, options = {}) {
  const method = (options.method || 'GET').toUpperCase()
  const body = typeof options.body === 'string' ? JSON.parse(options.body) : null
  let m

  if (path === '/login' && method === 'POST') {
    setRole(body.email.includes('teacher') ? 'teacher' : 'methodist')
    return wait({ ok: true })
  }
  if (path === '/logout') {
    setRole('')
    return wait({ ok: true })
  }

  const role = getRole()
  if (!role) return err('нужно войти', 401)
  const isMethodist = role === 'methodist'

  if (path === '/me') {
    return wait(
      isMethodist
        ? { id: 100, full_name: 'Иванова И.И.', email: 'metodist@college.ru', is_methodist: true }
        : { id: SELF_ID, full_name: 'Петров А.В.', email: 'petrov@college.ru', is_methodist: false }
    )
  }
  if (path === '/criteria') return wait(CRITERIA)

  // преподаватель
  if (path === '/my/status') {
    const me = teachers.find((t) => t.id === SELF_ID)
    const criteria = CRITERIA.map((c) => {
      const list = docs.filter((d) => d.teacher_id === SELF_ID && d.criterion_id === c.id)
      return { id: c.id, title: c.title, uploaded: list.length, accepted: list.some((d) => d.accepted) }
    })
    return wait({ ...dates(me), readiness_pct: readiness(SELF_ID), criteria })
  }
  if (path === '/my/documents' && method === 'GET') {
    return wait(docs.filter((d) => d.teacher_id === SELF_ID).map(publicDoc).reverse())
  }
  if (path === '/my/documents' && method === 'POST') {
    const f = options.body
    docs.push({
      id: nextDocId++,
      teacher_id: SELF_ID,
      criterion_id: Number(f.get('criterion_id')),
      description: f.get('description') || '',
      filename: f.get('file').name,
      accepted: false,
      uploaded_at: new Date().toISOString(),
    })
    return wait({ id: nextDocId })
  }
  if ((m = path.match(/^\/my\/documents\/(\d+)$/)) && method === 'DELETE') {
    docs = docs.filter((d) => !(d.id === Number(m[1]) && d.teacher_id === SELF_ID && !d.accepted))
    return wait({ ok: true })
  }

  // методист
  if (!isMethodist) return err('недостаточно прав', 403)

  if (path === '/teachers' && method === 'GET') return wait(teachers.map(row))
  if (path === '/teachers' && method === 'POST') {
    teachers.push({
      id: Math.max(...teachers.map((t) => t.id)) + 1,
      full_name: body.full_name,
      email: body.email,
      attested_at: body.attested_at || null,
    })
    return wait({ id: teachers.length })
  }
  if ((m = path.match(/^\/teachers\/(\d+)$/))) {
    const t = teachers.find((x) => x.id === Number(m[1]))
    if (!t) return err('преподаватель не найден', 404)
    if (method === 'PATCH') {
      if (body.full_name != null) t.full_name = body.full_name
      if (body.email != null) t.email = body.email
      if (body.attested_at != null) t.attested_at = body.attested_at || null
      return wait({ ok: true })
    }
    if (method === 'DELETE') {
      teachers = teachers.filter((x) => x.id !== t.id)
      docs = docs.filter((d) => d.teacher_id !== t.id)
      return wait({ ok: true })
    }
  }
  if ((m = path.match(/^\/teachers\/(\d+)\/documents$/))) {
    return wait(docs.filter((d) => d.teacher_id === Number(m[1])).map(publicDoc).reverse())
  }
  if ((m = path.match(/^\/documents\/(\d+)$/)) && method === 'PATCH') {
    const d = docs.find((x) => x.id === Number(m[1]))
    if (!d) return err('документ не найден', 404)
    d.accepted = body.accepted
    return wait({ ok: true })
  }
  if (path === '/notify/run') return wait({ sent: 0 })

  return err(`в тестовом режиме нет ручки ${method} ${path}`, 404)
}
