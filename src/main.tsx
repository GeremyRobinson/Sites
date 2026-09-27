import { createRoot } from 'react-dom/client'
import App from './App'
import './ui/theme'
import './styles.css'
import './tools/panels.css'

createRoot(document.getElementById('root')!).render(<App />)
