import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { BrowserRouter } from 'react-router-dom'

// Seed a dev API key so /api/auth and other endpoints work immediately without manual input
if (import.meta.env.DEV) {
  const existing = localStorage.getItem('apiKey')
  if (!existing) {
    localStorage.setItem('apiKey', 'test-write')
  }
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
