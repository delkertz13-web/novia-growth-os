import { cancellationPolicy, faq } from '../config/content.demo'
import { services } from '../config/services.demo'
import { Notice } from '../ui/common'
import { ClientFooter } from './ClientLayout'
import { HoursCard, ServiceRow } from './parts'

export function Services() {
  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div className="eyebrow">Prestations</div>
          <h1 className="display">Choisir sa séance</h1>
          <p className="muted" style={{ margin: 0 }}>
            Durées et prix de démonstration. Touchez une prestation pour réserver.
          </p>
        </div>
        <div className="svc-list stagger">
          {services.filter((s) => s.active).map((s) => (
            <div key={s.id}>
              <ServiceRow service={s} />
              <p className="svc-detail" style={{ padding: '8px 12px 6px' }}>
                {s.description}
              </p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ height: 40 }} />
      <ClientFooter />
    </main>
  )
}

export function Infos() {
  return (
    <main className="page">
      <div className="wrap">
        <div className="page-head">
          <div className="eyebrow">Infos pratiques</div>
          <h1 className="display">Avant de venir</h1>
        </div>
        <Notice>Réponses de démonstration, non validées par l’établissement.</Notice>
        <div className="faq" style={{ margin: '10px 0 30px' }}>
          {faq.map((f) => (
            <details key={f.q}>
              <summary>{f.q}</summary>
              <p>{f.a}</p>
            </details>
          ))}
        </div>
        <div className="info-grid">
          <HoursCard />
          <div className="card" style={{ padding: 22 }}>
            <div className="eyebrow" style={{ marginBottom: 8 }}>
              Annulation
            </div>
            <p style={{ margin: 0, fontSize: 15 }}>{cancellationPolicy}</p>
          </div>
        </div>
      </div>
      <div style={{ height: 40 }} />
      <ClientFooter />
    </main>
  )
}
