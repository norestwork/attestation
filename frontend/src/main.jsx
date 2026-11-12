import React from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, HashRouter } from 'react-router-dom'
import App from './App.jsx'
import { AuthProvider } from './auth.jsx'
import './styles.css'

// В демо-сборке (режим mock) адреса вида /#/teachers: так страница открывается из любой папки
// на любом статическом хостинге без настройки сервера.
const Router = import.meta.env.MODE === 'mock' ? HashRouter : BrowserRouter

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <Router>
      <AuthProvider>
        <App />
      </AuthProvider>
    </Router>
  </React.StrictMode>
)
