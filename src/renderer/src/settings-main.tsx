import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import { SettingsWindow } from './SettingsWindow'
import './styles.css'
import './settings.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <SettingsWindow />
    </ErrorBoundary>
  </StrictMode>,
)
