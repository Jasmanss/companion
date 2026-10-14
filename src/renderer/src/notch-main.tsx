import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './ErrorBoundary'
import { NotchWindow } from './Notch'
import './styles.css'
import './notch.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <NotchWindow />
    </ErrorBoundary>
  </StrictMode>,
)
