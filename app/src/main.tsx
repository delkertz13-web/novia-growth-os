import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/inter'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Navigate, Outlet, RouterProvider, useParams } from 'react-router-dom'
import { Booking } from './client/Booking'
import { ClientLayout } from './client/ClientLayout'
import { Gallery } from './client/Gallery'
import { Home } from './client/Home'
import { Infos, Services } from './client/Services'
import { Agenda } from './pro/Agenda'
import { AppointmentDetail } from './pro/AppointmentDetail'
import { CustomerFile } from './pro/CustomerFile'
import { Customers } from './pro/Customers'
import { Conversation, Messages } from './pro/Messages'
import { Settings } from './pro/Settings'
import { Voice } from './pro/Voice'
import { Dashboard } from './pro/Dashboard'
import { Novia } from './pro/Novia'
import { ProLayout } from './pro/ProLayout'
import { Revenue } from './pro/Revenue'
import { DemoBanner, ScrollTop } from './ui/common'
import { useResetEpoch } from './ui/demo'

/** Après une réinitialisation de la démo, les écrans repartent de zéro (aucun état résiduel). */
function Epoch() {
  const epoch = useResetEpoch()
  return <Outlet key={epoch} />
}

function Root() {
  return (
    <>
      <ScrollTop />
      <DemoBanner />
      <Epoch />
    </>
  )
}

function LegacyCustomer() {
  const { id } = useParams()
  return <Navigate to={`/pro/clientes/${id}`} replace />
}

const router = createBrowserRouter([
  {
    element: <Root />,
    children: [
      {
        element: <ClientLayout />,
        children: [
          { path: '/', element: <Home /> },
          { path: '/galerie', element: <Gallery /> },
          { path: '/prestations', element: <Services /> },
          { path: '/infos', element: <Infos /> },
          { path: '/reserver', element: <Booking /> },
        ],
      },
      {
        path: '/pro',
        element: <ProLayout />,
        children: [
          { index: true, element: <Dashboard /> },
          { path: 'agenda', element: <Agenda /> },
          { path: 'rdv/:id', element: <AppointmentDetail /> },
          { path: 'clientes', element: <Customers /> },
          { path: 'clientes/:id', element: <CustomerFile /> },
          // ancienne adresse de la fiche (Lot 5)
          { path: 'cliente/:id', element: <LegacyCustomer /> },
          { path: 'messages', element: <Messages /> },
          { path: 'messages/:id', element: <Conversation /> },
          { path: 'novia', element: <Novia /> },
          { path: 'voice', element: <Voice /> },
          { path: 'revenue', element: <Revenue /> },
          { path: 'reglages', element: <Settings /> },
        ],
      },
      { path: '*', element: <Home /> },
    ],
  },
])

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <RouterProvider router={router} />
  </StrictMode>,
)
