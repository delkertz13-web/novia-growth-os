import '@fontsource-variable/fraunces/full.css'
import '@fontsource-variable/fraunces/full-italic.css'
import '@fontsource-variable/inter'
import './styles/app.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { createBrowserRouter, Outlet, RouterProvider } from 'react-router-dom'
import { Booking } from './client/Booking'
import { ClientLayout } from './client/ClientLayout'
import { Gallery } from './client/Gallery'
import { Home } from './client/Home'
import { Infos, Services } from './client/Services'
import { Agenda } from './pro/Agenda'
import { AppointmentDetail } from './pro/AppointmentDetail'
import { CustomerFile } from './pro/CustomerFile'
import { Dashboard } from './pro/Dashboard'
import { Novia } from './pro/Novia'
import { ProLayout } from './pro/ProLayout'
import { Revenue } from './pro/Revenue'
import { DemoBanner, ScrollTop } from './ui/common'

function Root() {
  return (
    <>
      <ScrollTop />
      <DemoBanner />
      <Outlet />
    </>
  )
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
          { path: 'cliente/:id', element: <CustomerFile /> },
          { path: 'novia', element: <Novia /> },
          { path: 'revenue', element: <Revenue /> },
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
