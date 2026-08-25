import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import ErrorBoundary from './components/ErrorBoundary'
import { registrarTrabajador } from './lib/offline'
import { escucharInstalacion } from './lib/instalacion'

// Se registra el trabajador de servicio para que la app abra sin señal: en una azotea la
// conexión falta seguido, y toda la física, el catálogo y los proyectos ya viven en el equipo.
registrarTrabajador()

// El navegador avisa UNA sola vez de que la app se puede instalar, y hay que retener ese aviso
// antes de que lo descarte. Va aquí, fuera del árbol de React, porque el aviso llega temprano:
// esperar a que monte un componente es llegar tarde.
escucharInstalacion()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {/* Todo el trabajo del instalador vive en este navegador. Sin este límite, un fallo de
        renderizado deja la página en blanco y parece que la cartera se borró. */}
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
)
