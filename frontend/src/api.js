import { mockRequest } from './mock.js'

// Все запросы к Go-бэкенду. Сессия живёт в cookie, поэтому токены хранить не нужно.
export class ApiError extends Error {
  constructor(message, status) {
    super(message)
    this.status = status
  }
}

const JSON_HEADERS = { 'Content-Type': 'application/json' }

async function request(path, options = {}) {
  // `npm run dev:mock`: вместо сервера подставляются тестовые данные из mock.js
  if (import.meta.env.MODE === 'mock') return mockRequest(path, options)
  let res
  try {
    res = await fetch('/api' + path, { credentials: 'same-origin', ...options })
  } catch {
    throw new ApiError('Нет связи с сервером. Проверьте подключение.', 0)
  }
  const isJson = (res.headers.get('content-type') || '').includes('json')
  const data = isJson ? await res.json() : null
  if (!res.ok) {
    // 401 на странице входа — это просто неверный пароль, а не истёкшая сессия
    if (res.status === 401 && path !== '/login') {
      window.dispatchEvent(new Event('unauthorized'))
    }
    // ответ без JSON-ошибки приходит не от нашего Go-кода, а от прокси: сервер не запущен или упал
    const fallback = isJson ? 'Что-то пошло не так' : 'Сервер не отвечает. Запущен ли Go-сервер на порту 8080?'
    throw new ApiError((data && data.error) || fallback, res.status)
  }
  return data
}

const send = (method, body) => ({ method, headers: JSON_HEADERS, body: JSON.stringify(body) })

export const api = {
  login: (email, password) => request('/login', send('POST', { email, password })),
  logout: () => request('/logout', { method: 'POST' }),
  me: () => request('/me'),
  criteria: () => request('/criteria'),

  // преподаватель
  myStatus: () => request('/my/status'),
  myDocuments: () => request('/my/documents'),
  upload: (formData) => request('/my/documents', { method: 'POST', body: formData }),
  deleteMyDocument: (id) => request(`/my/documents/${id}`, { method: 'DELETE' }),

  // методист
  teachers: () => request('/teachers'),
  createTeacher: (data) => request('/teachers', send('POST', data)),
  updateTeacher: (id, data) => request(`/teachers/${id}`, send('PATCH', data)),
  deleteTeacher: (id) => request(`/teachers/${id}`, { method: 'DELETE' }),
  teacherDocuments: (id) => request(`/teachers/${id}/documents`),
  reviewDocument: (id, accepted) => request(`/documents/${id}`, send('PATCH', { accepted })),
  runNotify: () => request('/notify/run', { method: 'POST' }),
}

export const fileUrl = (id) => `/api/documents/${id}/file`
