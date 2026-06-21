import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import '@fontsource/fira-sans/400.css'
import '@fontsource/fira-sans/500.css'
import '@fontsource/fira-sans/600.css'
import '@fontsource/fira-sans/700.css'
import { AppErrorBoundary } from '@/shared/ui/AppErrorBoundary'
import { App } from './App'
import { getHighlighter } from './shared/lib/shiki/highlighter'
import './styles/globals.css'

// Eagerly start loading Shiki so it's ready before the first message renders.
void getHighlighter()

const root = document.getElementById('root')
if (!root) throw new Error('Root element not found')

createRoot(root).render(
  <StrictMode>
    <AppErrorBoundary>
      <App />
    </AppErrorBoundary>
  </StrictMode>,
)
