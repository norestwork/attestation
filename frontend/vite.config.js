import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Для демо-сборки: обычный (не module) скрипт, чтобы index.html открывался и двойным кликом с диска.
// Браузеры блокируют type="module" на file://, а классический скрипт — нет.
const classicScriptForFile = () => ({
  name: 'classic-script-for-file',
  transformIndexHtml: {
    order: 'post',
    handler: (html) =>
      html
        .replace(/<script type="module" crossorigin src=/g, '<script defer src=')
        .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href='),
  },
})

// В разработке запросы /api уходят на Go-сервер, так что cookie сессии работает без CORS.
// Демо-сборка (mode mock) использует относительные пути и лежит в любой папке.
export default defineConfig(({ mode }) => {
  const demo = mode === 'mock'
  return {
    base: demo ? './' : '/',
    plugins: [react(), ...(demo ? [classicScriptForFile()] : [])],
    build: demo ? { rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } } } : {},
    server: {
      proxy: { '/api': 'http://localhost:8080' },
    },
  }
})
