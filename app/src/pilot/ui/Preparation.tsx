/**
 * Préparation de PILOT-001 (mode rendez-vous) : la checklist se remplit pendant la
 * rencontre, sans JSON ni code. Chaque bloc s'enregistre à part (brouillon sur le serveur) :
 * on peut s'arrêter et reprendre plus tard, sur n'importe quel appareil.
 *
 * Rien n'est pré-rempli : tout part « Inconnu ». « Estimé » n'est jamais traité comme « Vérifié ».
 */
import { useState, type ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { BusinessProfile } from '../../config/profile'
import type { Field, OpeningHours, ServiceConfig } from '../../config/schema'
import { pilotApi, type Onboarding } from '../client'
import { factOf, SECTIONS, statusText, type FactItem, type PilotStatus, type ProfileSection } from '../onboarding'
import { completeness } from '../readiness'
import { ActionMsg, isOwner, Loading, OwnerOnly, PilotPage, StatusPicker, StatusTag, useAction, useLoad } from './kit'

const ps = (s: string): PilotStatus => (s === 'estimated' || s === 'verified' ? s : 'unknown')
export const factLabels = SECTIONS.flatMap((s) => s.facts.map((f) => ({ key: f.key, label: f.label, section: s.title })))

export function Preparation() {
  const { section } = useParams()
  const { data, error, reload } = useLoad(pilotApi.onboarding)
  const current = SECTIONS.find((s) => s.id === section)
  if (!data) return <PilotPage title="Préparation">{<Loading error={error} />}</PilotPage>

  if (!current) {
    const c = completeness(data.profile, data.facts, factLabels)
    return (
      <PilotPage title="Préparation">
        <p className="pl-msg" style={{ marginTop: 12 }}>
          À remplir pendant le rendez-vous avec la professionnelle. Chaque information garde son statut : inconnue, estimée ou vérifiée. Tout est
          enregistré au fur et à mesure : vous pouvez vous arrêter et reprendre plus tard.
        </p>
        <div className="pl-row" style={{ margin: '12px 0' }}>
          <StatusTag status="verified" /> {c.verified.length}
          <StatusTag status="estimated" /> {c.estimated.length}
          <StatusTag status="unknown" /> {c.unknown.length}
        </div>
        <div className="pl-grid">
          {SECTIONS.map((s) => {
            const items = c.unknown.concat(c.estimated, c.verified).filter((i) => i.section === s.title)
            const n = (st: string) => items.filter((i) => i.status === st).length
            return (
              <Link key={s.id} to={`/pro/pilote/preparation/${s.id}`} className="pl-tile">
                <strong>{s.title}</strong>
                <span>
                  {n('verified')} vérifié(s) · {n('estimated')} estimé(s) · {n('unknown')} inconnu(s)
                </span>
              </Link>
            )
          })}
        </div>
      </PilotPage>
    )
  }

  const idx = SECTIONS.indexOf(current)
  const next = SECTIONS[idx + 1]
  return (
    <PilotPage title={current.title} back="/pro/pilote/preparation">
      {!isOwner() && <OwnerOnly />}
      <div className="pl-grid" style={{ marginTop: 12 }}>
        {current.profile.map((p) => (
          <ProfileEditor key={p} section={p} data={data} onSaved={reload} />
        ))}
        {current.facts.map((f) => (
          <FactEditor key={f.key} item={f} data={data} onSaved={reload} />
        ))}
        {!current.profile.length && !current.facts.length && <p className="pl-msg">Rien à saisir ici.</p>}
      </div>
      <div className="pl-row pl-row--between" style={{ marginTop: 16 }}>
        <Link to="/pro/pilote/preparation" className="btn btn--ghost btn--sm">
          Toutes les sections
        </Link>
        {next && (
          <Link to={`/pro/pilote/preparation/${next.id}`} className="btn btn--primary btn--sm">
            Suivant : {next.title}
          </Link>
        )}
      </div>
    </PilotPage>
  )
}

/* ------------------------------------------------------------------ */
/* Faits libres                                                          */
/* ------------------------------------------------------------------ */

function FactEditor({ item, data, onSaved }: { item: FactItem; data: Onboarding; onSaved: () => void }) {
  const saved = factOf(data.facts, item.key)
  const [value, setValue] = useState(saved.value)
  const [status, setStatus] = useState<PilotStatus>(saved.status)
  const [note, setNote] = useState(saved.note ?? '')
  const a = useAction()
  const dirty = value !== saved.value || status !== saved.status || note !== (saved.note ?? '')
  const ro = !isOwner()
  return (
    <section className="pl-card">
      <div className="pl-row pl-row--between">
        <h3>{item.label}</h3>
        <StatusTag status={saved.status} />
      </div>
      <textarea aria-label={item.label} placeholder={item.hint ?? 'À compléter pendant le rendez-vous'} value={value} maxLength={2000} disabled={ro} onChange={(e) => setValue(e.target.value)} />
      <StatusPicker label={item.label} value={status} onChange={setStatus} disabled={ro} />
      <input type="text" aria-label={`Note : ${item.label}`} placeholder="Note (facultative) : source, à confirmer…" value={note} maxLength={500} disabled={ro} onChange={(e) => setNote(e.target.value)} />
      {!ro && (
        <SaveRow dirty={dirty} busy={a.busy} onSave={() => a.run(() => pilotApi.saveFact(item.key, { value, status, note: note || undefined }).then(onSaved))} />
      )}
      <ActionMsg msg={a.msg} />
    </section>
  )
}

function SaveRow({ dirty, busy, onSave }: { dirty: boolean; busy: boolean; onSave: () => void }) {
  return (
    <div className="pl-row">
      <button type="button" className="btn btn--primary btn--sm" disabled={busy || !dirty} onClick={onSave}>
        Enregistrer le brouillon
      </button>
      {dirty && <span className="pl-msg">Modifications non enregistrées</span>}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Profil (ce que le moteur lit)                                         */
/* ------------------------------------------------------------------ */

function ProfileEditor({ section, data, onSaved }: { section: ProfileSection; data: Onboarding; onSaved: () => void }) {
  const p = data.profile
  switch (section) {
    case 'identity':
      return <IdentityEditor p={p} onSaved={onSaved} />
    case 'services':
      return <ServicesEditor p={p} onSaved={onSaved} />
    case 'hours':
      return <HoursEditor p={p} onSaved={onSaved} />
    case 'booking':
      return (
        <NumbersEditor
          title="Délai minimum et horizon de réservation"
          section="booking"
          field={p.booking}
          onSaved={onSaved}
          inputs={[
            ['minNoticeHours', 'Délai minimum (heures)'],
            ['maxAdvanceDays', 'Horizon (jours)'],
            ['slotStepMin', 'Pas des créneaux (min)'],
            ['bufferMin', 'Battement entre RDV (min)'],
          ]}
        />
      )
    case 'schedule':
      return <ScheduleEditor p={p} onSaved={onSaved} />
    case 'cancellation':
      return <CancellationEditor p={p} onSaved={onSaved} />
    case 'smartFill':
      return <NumbersEditor title="SmartFill : clientes sollicitées au plus par créneau" section="smartFill" field={p.smartFill} onSaved={onSaved} inputs={[['maxContacts', 'Nombre maximum']]} />
    case 'rules':
      return <RulesEditor p={p} onSaved={onSaved} />
    case 'consent':
      return <ConsentEditor p={p} onSaved={onSaved} />
  }
}

function Block({ title, status, children }: { title: string; status: string; children: ReactNode }) {
  return (
    <section className="pl-card">
      <div className="pl-row pl-row--between">
        <h3>{title}</h3>
        <StatusTag status={status} />
      </div>
      {children}
    </section>
  )
}

function useSection(section: ProfileSection, onSaved: () => void) {
  const a = useAction()
  const save = (value: unknown) => a.run(() => pilotApi.saveSection(section, value).then(onSaved))
  return { ...a, save }
}

type TextKey = 'name' | 'artistFirstName' | 'address' | 'city' | 'phone' | 'email' | 'instagram' | 'googleReviewUrl' | 'timezone'
const identityFields: [TextKey, string][] = [
  ['name', 'Nom commercial'],
  ['artistFirstName', 'Prénom de la professionnelle'],
  ['address', 'Adresse'],
  ['city', 'Ville'],
  ['phone', 'Téléphone'],
  ['email', 'E-mail'],
  ['timezone', 'Fuseau horaire'],
  ['instagram', 'Instagram'],
  ['googleReviewUrl', 'Google Business Profile (lien)'],
]

function IdentityEditor({ p, onSaved }: { p: BusinessProfile; onSaved: () => void }) {
  const init = () => Object.fromEntries(identityFields.map(([k]) => [k, { value: p.identity[k].value, status: ps(p.identity[k].status) }])) as Record<TextKey, Field<string>>
  const [v, setV] = useState(init)
  const s = useSection('identity', onSaved)
  const ro = !isOwner()
  const dirty = identityFields.some(([k]) => v[k].value !== p.identity[k].value || v[k].status !== p.identity[k].status)
  return (
    <section className="pl-card">
      <h3>Identité</h3>
      {identityFields.map(([k, label]) => (
        <div key={k} className="pl-grid" style={{ gap: 6 }}>
          <label className="pl-label">
            <span className="pl-row pl-row--between">
              {label} <StatusTag status={p.identity[k].status} />
            </span>
            <input type="text" value={v[k].value} disabled={ro} onChange={(e) => setV({ ...v, [k]: { ...v[k], value: e.target.value } })} />
          </label>
          <StatusPicker label={label} value={v[k].status as PilotStatus} disabled={ro} onChange={(st) => setV({ ...v, [k]: { ...v[k], status: st } })} />
        </div>
      ))}
      {!ro && <SaveRow dirty={dirty} busy={s.busy} onSave={() => s.save(v)} />}
      <ActionMsg msg={s.msg} />
    </section>
  )
}

const slug = (s: string) =>
  s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 30) || 'prestation'

function ServicesEditor({ p, onSaved }: { p: BusinessProfile; onSaved: () => void }) {
  const [items, setItems] = useState<ServiceConfig[]>(p.services.items)
  const [status, setStatus] = useState<PilotStatus>(ps(p.services.status))
  const s = useSection('services', onSaved)
  const ro = !isOwner()
  const dirty = status !== p.services.status || JSON.stringify(items) !== JSON.stringify(p.services.items)
  const set = (i: number, patch: Partial<ServiceConfig>) => setItems(items.map((x, j) => (j === i ? { ...x, ...patch } : x)))
  const num = (v: string) => (v === '' ? NaN : Number(v))
  const add = () => {
    const ids = new Set(items.map((x) => x.id))
    let id = `prestation-${items.length + 1}`
    while (ids.has(id)) id = `${id}-b`
    setItems([...items, { id, name: '', description: '', durationMin: 60, price: 0, deposit: 0, category: 'pose', returnRecommendedAfterDays: null, active: true, bookableOnline: false, coverImageId: '' }])
  }
  return (
    <Block title="Prestations" status={p.services.status}>
      {!items.length && <p className="pl-msg">Aucune prestation saisie. Ajoutez celles que la professionnelle propose réellement, avec leur prix et leur durée.</p>}
      {items.map((x, i) => (
        <div key={i} className="pl-card pl-card--inner">
          <label className="pl-label">
            Nom
            <input type="text" value={x.name} maxLength={80} disabled={ro} onChange={(e) => set(i, { name: e.target.value, ...(p.services.items.some((o) => o.id === x.id) ? {} : { id: slug(e.target.value) }) })} />
          </label>
          <div className="pl-fields">
            <label className="pl-label">
              Prix (€)
              <input type="number" inputMode="decimal" min={0} value={Number.isNaN(x.price) ? '' : x.price} disabled={ro} onChange={(e) => set(i, { price: num(e.target.value) })} />
            </label>
            <label className="pl-label">
              Durée (min)
              <input type="number" min={5} value={Number.isNaN(x.durationMin) ? '' : x.durationMin} disabled={ro} onChange={(e) => set(i, { durationMin: num(e.target.value) })} />
            </label>
            <label className="pl-label">
              Battement (min)
              <input type="number" min={0} value={x.bufferMin ?? ''} disabled={ro} onChange={(e) => set(i, { bufferMin: e.target.value === '' ? undefined : Number(e.target.value) })} />
            </label>
            <label className="pl-label">
              Acompte (€)
              <input type="number" min={0} value={x.deposit} disabled={ro} onChange={(e) => set(i, { deposit: Number(e.target.value) || 0 })} />
            </label>
            <label className="pl-label">
              Retour conseillé (jours)
              <input
                type="number"
                min={1}
                placeholder="sans objet"
                value={x.returnRecommendedAfterDays ?? ''}
                disabled={ro}
                onChange={(e) => set(i, { returnRecommendedAfterDays: e.target.value === '' ? null : Number(e.target.value) })}
              />
            </label>
          </div>
          <label className="pl-check">
            <input type="checkbox" checked={x.bookableOnline === true} disabled={ro} onChange={(e) => set(i, { bookableOnline: e.target.checked })} /> Réservable en ligne
          </label>
          {!ro && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setItems(items.filter((_, j) => j !== i))}>
              Retirer cette prestation
            </button>
          )}
        </div>
      ))}
      {!ro && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={add}>
          Ajouter une prestation
        </button>
      )}
      <StatusPicker label="Prestations" value={status} onChange={setStatus} disabled={ro} />
      {!ro && <SaveRow dirty={dirty} busy={s.busy} onSave={() => s.save({ status, items })} />}
      <ActionMsg msg={s.msg} />
    </Block>
  )
}

const DAYS = [
  [1, 'Lundi'],
  [2, 'Mardi'],
  [3, 'Mercredi'],
  [4, 'Jeudi'],
  [5, 'Vendredi'],
  [6, 'Samedi'],
  [0, 'Dimanche'],
] as const

function HoursEditor({ p, onSaved }: { p: BusinessProfile; onSaved: () => void }) {
  const [hours, setHours] = useState<OpeningHours>(p.identity.openingHours.value)
  const [hStatus, setHStatus] = useState<PilotStatus>(ps(p.identity.openingHours.status))
  const [breaks, setBreaks] = useState(p.breaks.value)
  const [bStatus, setBStatus] = useState<PilotStatus>(ps(p.breaks.status))
  const s = useSection('hours', onSaved)
  const ro = !isOwner()
  const dirty =
    hStatus !== p.identity.openingHours.status ||
    bStatus !== p.breaks.status ||
    JSON.stringify(hours) !== JSON.stringify(p.identity.openingHours.value) ||
    JSON.stringify(breaks) !== JSON.stringify(p.breaks.value)
  return (
    <Block title="Horaires d’ouverture et pauses" status={p.identity.openingHours.status}>
      {DAYS.map(([d, label]) => {
        const h = hours[d]
        return (
          <div key={d} className="pl-row">
            <label className="pl-check" style={{ minWidth: 120 }}>
              <input type="checkbox" checked={!!h} disabled={ro} onChange={(e) => setHours({ ...hours, [d]: e.target.checked ? { open: '09:00', close: '18:00' } : null })} />
              {label}
            </label>
            {h ? (
              <>
                <input type="time" aria-label={`${label} : ouverture`} style={{ width: 120 }} value={h.open} disabled={ro} onChange={(e) => setHours({ ...hours, [d]: { ...h, open: e.target.value } })} />
                <input type="time" aria-label={`${label} : fermeture`} style={{ width: 120 }} value={h.close} disabled={ro} onChange={(e) => setHours({ ...hours, [d]: { ...h, close: e.target.value } })} />
              </>
            ) : (
              <span className="pl-msg">Fermé</span>
            )}
          </div>
        )
      })}
      <StatusPicker label="Horaires" value={hStatus} onChange={setHStatus} disabled={ro} />
      <h3>Pauses</h3>
      {breaks.map((b, i) => (
        <div key={i} className="pl-row">
          <select aria-label="Jour de la pause" style={{ width: 130 }} value={b.weekday} disabled={ro} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, weekday: Number(e.target.value) } : x)))}>
            {DAYS.map(([d, l]) => (
              <option key={d} value={d}>
                {l}
              </option>
            ))}
          </select>
          <input type="time" aria-label="Début de la pause" style={{ width: 120 }} value={b.start} disabled={ro} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, start: e.target.value } : x)))} />
          <input type="time" aria-label="Fin de la pause" style={{ width: 120 }} value={b.end} disabled={ro} onChange={(e) => setBreaks(breaks.map((x, j) => (j === i ? { ...x, end: e.target.value } : x)))} />
          {!ro && (
            <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBreaks(breaks.filter((_, j) => j !== i))}>
              Retirer
            </button>
          )}
        </div>
      ))}
      {!ro && (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setBreaks([...breaks, { weekday: 1, start: '12:00', end: '13:00' }])}>
          Ajouter une pause
        </button>
      )}
      <p className="pl-msg">Aucune pause : choisissez « Vérifié » seulement si la professionnelle confirme qu’elle n’en prend pas.</p>
      <StatusPicker label="Pauses" value={bStatus} onChange={setBStatus} disabled={ro} />
      {!ro && <SaveRow dirty={dirty} busy={s.busy} onSave={() => s.save({ openingHours: { value: hours, status: hStatus }, breaks: { value: breaks, status: bStatus } })} />}
      <ActionMsg msg={s.msg} />
    </Block>
  )
}

function NumbersEditor<T extends object>({
  title,
  section,
  field,
  inputs,
  onSaved,
}: {
  title: string
  section: ProfileSection
  field: Field<T>
  inputs: [keyof T & string, string][]
  onSaved: () => void
}) {
  const [value, setValue] = useState<T>(field.value)
  const [status, setStatus] = useState<PilotStatus>(ps(field.status))
  const s = useSection(section, onSaved)
  const ro = !isOwner()
  const dirty = status !== field.status || JSON.stringify(value) !== JSON.stringify(field.value)
  return (
    <Block title={title} status={field.status}>
      <div className="pl-fields">
        {inputs.map(([k, label]) => (
          <label key={k} className="pl-label">
            {label}
            <input type="number" min={0} value={String((value as Record<string, unknown>)[k] ?? '')} disabled={ro} onChange={(e) => setValue({ ...value, [k]: Number(e.target.value) })} />
          </label>
        ))}
      </div>
      <StatusPicker label={title} value={status} onChange={setStatus} disabled={ro} />
      {!ro && <SaveRow dirty={dirty} busy={s.busy} onSave={() => s.save({ value, status })} />}
      <ActionMsg msg={s.msg} />
    </Block>
  )
}

function ScheduleEditor({ p, onSaved }: { p: BusinessProfile; onSaved: () => void }) {
  const [authority, setAuthority] = useState<Field<'planity' | 'novia'>>({ ...p.schedule.authority, status: ps(p.schedule.authority.status) })
  const [reminders, setReminders] = useState<Field<boolean>>({ ...p.schedule.externalReminders, status: ps(p.schedule.externalReminders.status) })
  const s = useSection('schedule', onSaved)
  const ro = !isOwner()
  const dirty = JSON.stringify([authority, reminders]) !== JSON.stringify([p.schedule.authority, p.schedule.externalReminders])
  return (
    <Block title="Agenda de référence" status={p.schedule.authority.status}>
      <p className="pl-msg">
        Scénario A : Planity reste l’agenda qui fait foi. NOVIA n’en garde qu’une copie observée (RDV saisis ou importés) et n’affiche aucun créneau comme
        disponible.
      </p>
      <label className="pl-label">
        Qui fait foi pour l’agenda ?
        <select value={authority.value} disabled={ro} onChange={(e) => setAuthority({ ...authority, value: e.target.value as 'planity' | 'novia' })}>
          <option value="planity">Planity (agenda observé dans NOVIA)</option>
          <option value="novia">NOVIA</option>
        </select>
      </label>
      <StatusPicker label="Agenda de référence" value={authority.status as PilotStatus} onChange={(st) => setAuthority({ ...authority, status: st })} disabled={ro} />
      <label className="pl-label">
        L’agenda envoie-t-il déjà des rappels aux clientes ?
        <select value={reminders.value ? 'oui' : 'non'} disabled={ro} onChange={(e) => setReminders({ ...reminders, value: e.target.value === 'oui' })}>
          <option value="non">Non</option>
          <option value="oui">Oui (NOVIA n’en ajoute pas)</option>
        </select>
      </label>
      <StatusPicker label="Rappels de l’agenda" value={reminders.status as PilotStatus} onChange={(st) => setReminders({ ...reminders, status: st })} disabled={ro} />
      {!ro && <SaveRow dirty={dirty} busy={s.busy} onSave={() => s.save({ authority, externalReminders: reminders })} />}
      <ActionMsg msg={s.msg} />
    </Block>
  )
}

function CancellationEditor({ p, onSaved }: { p: BusinessProfile; onSaved: () => void }) {
  const [value, setValue] = useState(p.cancellation.value)
  const [status, setStatus] = useState<PilotStatus>(ps(p.cancellation.status))
  const s = useSection('cancellation', onSaved)
  const ro = !isOwner()
  const dirty = status !== p.cancellation.status || JSON.stringify(value) !== JSON.stringify(p.cancellation.value)
  return (
    <Block title="Politique d’annulation" status={p.cancellation.status}>
      <label className="pl-label">
        Annulation sans frais jusqu’à (heures avant)
        <input type="number" min={0} value={value.freeCancellationHours} disabled={ro} onChange={(e) => setValue({ ...value, freeCancellationHours: Number(e.target.value) })} />
      </label>
      <label className="pl-label">
        Texte de la politique
        <textarea value={value.text} maxLength={600} disabled={ro} onChange={(e) => setValue({ ...value, text: e.target.value })} />
      </label>
      <StatusPicker label="Politique d’annulation" value={status} onChange={setStatus} disabled={ro} />
      {!ro && <SaveRow dirty={dirty} busy={s.busy} onSave={() => s.save({ value, status })} />}
      <ActionMsg msg={s.msg} />
    </Block>
  )
}

function ConsentEditor({ p, onSaved }: { p: BusinessProfile; onSaved: () => void }) {
  const [text, setText] = useState(p.consent.value.marketingOptInText)
  const [status, setStatus] = useState<PilotStatus>(ps(p.consent.status))
  const s = useSection('consent', onSaved)
  const ro = !isOwner()
  const dirty = status !== p.consent.status || text !== p.consent.value.marketingOptInText
  return (
    <Block title="Texte de la case de consentement marketing" status={p.consent.status}>
      <p className="pl-msg">Ce texte servira de preuve quand une cliente accepte de recevoir des offres. Il ne crée aucun consentement à lui seul.</p>
      <textarea value={text} maxLength={600} disabled={ro} onChange={(e) => setText(e.target.value)} />
      <StatusPicker label="Texte de consentement" value={status} onChange={setStatus} disabled={ro} />
      {!ro && <SaveRow dirty={dirty} busy={s.busy} onSave={() => s.save({ value: { marketingOptInText: text }, status })} />}
      <ActionMsg msg={s.msg} />
    </Block>
  )
}

function RulesEditor({ p, onSaved }: { p: BusinessProfile; onSaved: () => void }) {
  const r = p.rules
  const [status, setStatus] = useState<PilotStatus>(ps(r.status))
  const [win, setWin] = useState(r.sendWindow)
  const [rem, setRem] = useState(r.w02.remindersHoursBefore.join(', '))
  const [w03, setW03] = useState(r.w03)
  const [w04, setW04] = useState(r.w04)
  const s = useSection('rules', onSaved)
  const ro = !isOwner()
  const reminders = rem
    .split(/[,; ]+/)
    .filter(Boolean)
    .map(Number)
  const dirty =
    status !== r.status ||
    JSON.stringify([win, w03, w04]) !== JSON.stringify([r.sendWindow, r.w03, r.w04]) ||
    reminders.join(',') !== r.w02.remindersHoursBefore.join(',')
  const pair = (label: string, v: { waitBeforeRecoveryHours: number; lastFollowUpDelayHours: number }, set: (x: typeof v) => void) => (
    <div className="pl-fields">
      <label className="pl-label">
        {label} : attente avant relance (h)
        <input type="number" min={0} value={v.waitBeforeRecoveryHours} disabled={ro} onChange={(e) => set({ ...v, waitBeforeRecoveryHours: Number(e.target.value) })} />
      </label>
      <label className="pl-label">
        {label} : délai de la dernière relance (h)
        <input type="number" min={1} value={v.lastFollowUpDelayHours} disabled={ro} onChange={(e) => set({ ...v, lastFollowUpDelayHours: Number(e.target.value) })} />
      </label>
    </div>
  )
  return (
    <Block title="Règles des messages" status={r.status}>
      <div className="pl-fields">
        <label className="pl-label">
          Plage d’envoi : début
          <input type="time" value={win.start} disabled={ro} onChange={(e) => setWin({ ...win, start: e.target.value })} />
        </label>
        <label className="pl-label">
          Plage d’envoi : fin
          <input type="time" value={win.end} disabled={ro} onChange={(e) => setWin({ ...win, end: e.target.value })} />
        </label>
      </div>
      <label className="pl-label">
        Rappels de RDV : heures avant (ex. 48, 24)
        <input type="text" inputMode="numeric" value={rem} disabled={ro} onChange={(e) => setRem(e.target.value)} />
      </label>
      {pair('Annulation (W03)', w03, setW03)}
      {pair('Absence (W04)', w04, setW04)}
      <StatusPicker label="Règles des messages" value={status} onChange={setStatus} disabled={ro} />
      {!ro && (
        <SaveRow
          dirty={dirty}
          busy={s.busy}
          onSave={() => s.save({ status, sendWindow: win, w02: { remindersHoursBefore: reminders }, w03, w04 })}
        />
      )}
      <ActionMsg msg={s.msg} />
    </Block>
  )
}

export { statusText }
