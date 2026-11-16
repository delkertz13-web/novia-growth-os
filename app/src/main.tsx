import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/inter'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// démo : prête immédiatement ; pilote : connexion puis état lu sur le serveur (NOVIA_MODE, vite.config.ts)
import { bootstrap } from '@novia/runtime'
import { Gate } from '@novia/shell'

const root = createRoot(document.getElementById('root')!)

bootstrap().then(async (boot) => {
  if (boot.status !== 'ready') {
    root.render(
      <StrictMode>
        <Gate boot={boot} />
      </StrictMode>,
    )
    return
  }
  // les écrans lisent `novia` dès leur chargement : ils ne sont importés qu'une fois prêt
  const { App } = await import('./router')
  root.render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
})
