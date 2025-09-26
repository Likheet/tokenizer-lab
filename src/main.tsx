import { createRoot } from 'react-dom/client'

import App from './App'
import './index.css'
import { ThemeProvider } from './components/ui/ThemeProvider'

createRoot(document.getElementById('root')!).render(
  <ThemeProvider defaultTheme="dark" storageKey="vite-ui-theme">
    <App />
  </ThemeProvider>
)
