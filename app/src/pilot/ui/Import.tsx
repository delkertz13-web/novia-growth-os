/**
 * Import CSV des clientes : fichier → colonnes → correspondance → APERÇU → import.
 * Aucun scraping ni automatisation Planity : la pro fournit un fichier qu'elle a exporté.
 * L'aperçu est recalculé par le serveur avant tout import ; aucun consentement marketing
 * n'est créé ; la provenance (fichier quelconque ou export Planity) est déclarée.
 */
import { useMemo, useState } from 'react'
import { pilotApi } from '../client'
import { pilotSession } from '../session'
import { IMPORT_FIELDS, importFieldLabels, mapRows, MAX_IMPORT_ROWS, parseCsv, planImport, summarize, type ImportMapping, type ImportSource, type PlannedRow } from '../import'
import { useDemoState } from '../../ui/common'
import { ActionMsg, isOwner, OwnerOnly, PilotPage, useAction } from './kit'

const outcomeText: Record<PlannedRow['outcome'], string> = {
  new: 'Nouvelle',
  duplicate_existing: 'Déjà dans NOVIA',
  duplicate_in_file: 'En double dans le fichier',
  invalid: 'Invalide',
}

/** colonne devinée d'après l'en-tête (la pro confirme toujours) */
function guess(header: string[]): ImportMapping {
  const find = (re: RegExp) => {
    const i = header.findIndex((h) => re.test(h.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()))
    return i >= 0 ? i : undefined
  }
  return { firstName: find(/prenom|first/), lastName: find(/^nom|last|famille/), phone: find(/tel|phone|mobile|portable/), email: find(/mail/) }
}

export function Import() {
  const st = useDemoState()
  const [rows, setRows] = useState<string[][]>([])
  const [fileName, setFileName] = useState('')
  const [mapping, setMapping] = useState<ImportMapping>({})
  const [source, setSource] = useState<ImportSource | ''>('')
  const [server, setServer] = useState<{ plan: PlannedRow[]; summary: Record<string, number>; imported: number } | null>(null)
  const a = useAction()
  const header = rows[0] ?? []
  const mapped = useMemo(() => (rows.length > 1 ? mapRows(rows, mapping) : []), [rows, mapping])
  const tooLong = mapped.length > MAX_IMPORT_ROWS
  const preview = useMemo(() => (mapped.length && !tooLong ? planImport(mapped, st.customers) : []), [mapped, tooLong, st.customers])
  const sum = summarize(server?.plan ?? preview)

  if (!isOwner())
    return (
      <PilotPage title="Importer des clientes">
        <OwnerOnly />
      </PilotPage>
    )

  return (
    <PilotPage title="Importer des clientes">
      <p className="pl-msg" style={{ marginTop: 12 }}>
        Fichier CSV exporté par la professionnelle (Planity, tableur, carnet). Rien n’est importé avant l’aperçu. Aucun consentement marketing n’est créé
        par un import.
      </p>
      <section className="pl-card" style={{ marginTop: 12 }}>
        <h3>1. Fichier</h3>
        <input
          type="file"
          accept=".csv,text/csv"
          aria-label="Fichier CSV"
          onChange={async (e) => {
            const f = e.target.files?.[0]
            setServer(null)
            a.setMsg(null)
            if (!f) return
            if (f.size > 900_000) return a.setMsg({ ok: false, text: 'Fichier trop lourd (900 Ko au plus).' })
            const parsed = parseCsv(await f.text())
            setFileName(f.name)
            setRows(parsed)
            setMapping(guess(parsed[0] ?? []))
          }}
        />
        {fileName && (
          <p className="pl-msg">
            {fileName} : {Math.max(0, rows.length - 1)} ligne(s) sous l’en-tête.
          </p>
        )}
      </section>

      {header.length > 0 && (
        <section className="pl-card" style={{ marginTop: 12 }}>
          <h3>2. Correspondance des colonnes</h3>
          <div className="pl-fields">
            {IMPORT_FIELDS.map((f) => (
              <label key={f} className="pl-label">
                {importFieldLabels[f]}
                <select
                  value={mapping[f] ?? ''}
                  onChange={(e) => {
                    setServer(null)
                    setMapping({ ...mapping, [f]: e.target.value === '' ? undefined : Number(e.target.value) })
                  }}
                >
                  <option value="">(aucune)</option>
                  {header.map((h, i) => (
                    <option key={i} value={i}>
                      {h || `Colonne ${i + 1}`}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>
          <label className="pl-label">
            Provenance du fichier (obligatoire)
            <select value={source} onChange={(e) => setSource(e.target.value as ImportSource | '')}>
              <option value="">Choisir…</option>
              <option value="PLANITY_EXPORT">Export Planity (fait par la pro)</option>
              <option value="IMPORT">Autre fichier (tableur, carnet…)</option>
            </select>
          </label>
        </section>
      )}

      {mapped.length > 0 && (
        <section className="pl-card" style={{ marginTop: 12 }}>
          <h3>3. Aperçu {server ? '(vérifié par le serveur)' : '(sur cet appareil)'}</h3>
          {tooLong ? (
            <p className="pl-msg pl-msg--error">Fichier trop long : {MAX_IMPORT_ROWS} lignes au plus.</p>
          ) : (
            <>
              <p className="pl-msg">
                {sum.new} nouvelle(s) · {sum.duplicateExisting} déjà dans NOVIA · {sum.duplicateInFile} en double dans le fichier · {sum.invalid} invalide(s)
              </p>
              <div className="pl-scroll">
                <table className="pl-table">
                  <thead>
                    <tr>
                      <th>Ligne</th>
                      <th>Prénom</th>
                      <th>Nom</th>
                      <th>Téléphone</th>
                      <th>E-mail</th>
                      <th>Résultat</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(server?.plan ?? preview).slice(0, 200).map((p) => (
                      <tr key={p.line}>
                        <td>{p.line}</td>
                        <td>{p.row.firstName}</td>
                        <td>{p.row.lastName}</td>
                        <td>{p.row.phone}</td>
                        <td>{p.row.email}</td>
                        <td>
                          {outcomeText[p.outcome]}
                          {p.reason && <div className="pl-msg">{p.reason}</div>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="pl-row">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={a.busy || !source}
                  onClick={() => a.run(async () => setServer(await pilotApi.importCustomers(mapped, source as ImportSource, true)), 'Aperçu vérifié par le serveur. Rien n’a été importé.')}
                >
                  Vérifier l’aperçu
                </button>
                <button
                  type="button"
                  className="btn btn--primary btn--sm"
                  disabled={a.busy || !source || !server || server.summary.new === 0}
                  onClick={() =>
                    a.run(
                      async () => {
                        const r = await pilotApi.importCustomers(mapped, source as ImportSource, false)
                        setServer(null)
                        setRows([])
                        setFileName('')
                        await pilotSession()?.sync()
                        return r
                      },
                      (r) => `${r.imported} cliente(s) importée(s), sans consentement marketing. Provenance enregistrée.`,
                    )
                  }
                >
                  Importer {server ? server.summary.new : ''} nouvelle(s) cliente(s)
                </button>
              </div>
              {!source && <p className="pl-msg">Déclarez la provenance du fichier pour continuer.</p>}
            </>
          )}
        </section>
      )}
      <ActionMsg msg={a.msg} />
    </PilotPage>
  )
}
