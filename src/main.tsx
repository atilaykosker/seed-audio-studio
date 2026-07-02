import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { migrateStorageNamespace } from '@/lib/storage'

// Preserve existing users' data across the Seed → Bookticle rebrand.
migrateStorageNamespace()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
