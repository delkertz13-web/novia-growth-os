/**
 * Résumé imprimable du profil PILOT-001 : vérifié, estimé, inconnu, capacités bloquées,
 * messages et réponses approuvés, configuration Planity, objectifs. (Imprimer → PDF.)
 */
import { novia } from '../../domain'
import { fmt } from '../../ui/common'
import { pilotApi } from '../client'
import { factOf, SECTIONS } from '../onboarding'
import { assessReadiness, completeness } from '../readiness'
import { Loading, PilotPage, StatusTag, useLoad } from './kit'
import { factLabels } from './Preparation'
import { LevelTag } from './Readiness'

export function Summary() {
  const { data, error } = useLoad(pilotApi.onboarding)
  if (!data) return <PilotPage title="Résumé">{<Loading error={error} />}</PilotPage>
  const p = data.profile
  const c = completeness(p, data.facts, factLabels)
  const caps = assessReadiness(data.engineProfile, data.facts, data.settings)
  const approvedT = data.templates.filter((t) => t.status === 'APPROVED')
  const approvedF = data.faq.filter((f) => f.status === 'APPROVED')
  const facts = (sectionId: string) => SECTIONS.find((s) => s.id === sectionId)?.facts ?? []
  const factBlock = (sectionId: string) => (
    <ul className="pl-list">
      {facts(sectionId).map((f) => {
        const v = factOf(data.facts, f.key)
        return (
          <li key={f.key}>
            <StatusTag status={v.status} /> <span>{f.label} : {v.value || '—'}</span>
          </li>
        )
      })}
    </ul>
  )
  return (
    <PilotPage title={`Résumé · ${p.identity.name.value || 'PILOT-001'}`}>
      <p className="pl-row pl-noprint" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn--primary btn--sm" onClick={() => window.print()}>
          Imprimer / PDF
        </button>
      </p>
      <p className="pl-msg">Édité le {fmt.date(novia.now(), { dateStyle: 'long', timeStyle: 'short' })}. Mode shadow : rien n’est envoyé.</p>
      <div className="pl-grid" style={{ marginTop: 12 }}>
        {(['verified', 'estimated', 'unknown'] as const).map((st) => (
          <section key={st} className="pl-card">
            <div className="pl-row pl-row--between">
              <h3>{st === 'verified' ? 'Vérifié' : st === 'estimated' ? 'Estimé' : 'Inconnu'}</h3>
              <span>{c[st].length}</span>
            </div>
            <ul className="pl-list">
              {c[st].map((i) => (
                <li key={`${i.section}-${i.label}`}>
                  <span className="pl-msg">{i.section}</span> {i.label}
                </li>
              ))}
            </ul>
          </section>
        ))}
        <section className="pl-card">
          <h3>Capacités</h3>
          <ul className="pl-list">
            {caps.map((cap) => (
              <li key={cap.id}>
                <LevelTag level={cap.level} /> <span>{cap.title}{cap.level === 'BLOCKED' ? ` : ${cap.reasons.join(' ')}` : ''}</span>
              </li>
            ))}
          </ul>
        </section>
        <section className="pl-card">
          <h3>Planity (scénario A)</h3>
          <p className="pl-msg">
            Agenda de référence : {p.schedule.authority.value === 'planity' ? 'Planity (NOVIA observe)' : 'NOVIA'} <StatusTag status={p.schedule.authority.status} /> · Rappels
            de l’agenda : {p.schedule.externalReminders.value ? 'oui' : 'non'} <StatusTag status={p.schedule.externalReminders.status} />
          </p>
          {factBlock('planity')}
        </section>
        <section className="pl-card">
          <h3>Prestations</h3>
          {!p.services.items.length ? (
            <p className="pl-msg">Aucune prestation saisie.</p>
          ) : (
            <ul className="pl-list">
              {p.services.items.map((s) => (
                <li key={s.id}>
                  {s.name} · {fmt.eur(s.price)} · {fmt.duration(s.durationMin)}
                  {s.bookableOnline ? ' · réservable en ligne' : ''}
                </li>
              ))}
            </ul>
          )}
          <StatusTag status={p.services.status} />
        </section>
        <section className="pl-card">
          <h3>Messages approuvés</h3>
          {!approvedT.length && <p className="pl-msg">Aucun : tous les messages automatiques sont bloqués.</p>}
          <ul className="pl-list">
            {approvedT.map((t) => (
              <li key={t.key}>
                <strong>{data.templateMeta[t.key].label} (v{t.version})</strong> {t.body}
              </li>
            ))}
          </ul>
        </section>
        <section className="pl-card">
          <h3>Réponses approuvées</h3>
          {!approvedF.length && <p className="pl-msg">Aucune : toute question est transmise à la professionnelle.</p>}
          <ul className="pl-list">
            {approvedF.map((f) => (
              <li key={f.id}>
                <strong>{f.intent}</strong> {f.answer}
              </li>
            ))}
          </ul>
        </section>
        <section className="pl-card">
          <h3>Objectifs du pilote</h3>
          {factBlock('objectifs')}
        </section>
      </div>
    </PilotPage>
  )
}
