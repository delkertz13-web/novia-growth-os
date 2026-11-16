/**
 * Frontières d'architecture P1 (garde-fous automatiques) :
 * - le code générique n'importe jamais la démo (seules les compositions `app/demo*` le font) ;
 * - core reste pur, engine ne dépend ni de React ni du domaine UI, providers restent techniques ;
 * - aucun calcul d'heure dans le fuseau de l'appareil hors de core/time.ts ;
 * - la composition pilote n'embarque ni données ni contrôles de démo.
 */
import { describe, expect, it } from 'vitest'

const sources = import.meta.glob(['./**/*.{ts,tsx}', '!./**/*.test.ts'], { query: '?raw', import: 'default', eager: true }) as Record<string, string>
const files = Object.keys(sources).map((k) => k.slice(2)) // 'core/time.ts'

/** chemin normalisé (relatif à src) de chaque import relatif d'un fichier */
function importsOf(file: string): string[] {
  const dir = file.split('/').slice(0, -1)
  const specs = [...sources[`./${file}`].matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)].map((m) => m[1])
  return specs.map((spec) => {
    if (!spec.startsWith('.')) return spec
    const parts = [...dir]
    for (const seg of spec.split('/')) {
      if (seg === '..') parts.pop()
      else if (seg !== '.') parts.push(seg)
    }
    return parts.join('/')
  })
}

const under = (prefix: string) => files.filter((f) => f.startsWith(prefix))
const violations = (scope: string[], forbidden: (target: string) => boolean) =>
  scope.flatMap((f) => importsOf(f).filter(forbidden).map((t) => `${f} → ${t}`))

describe('séparation démo / pilote', () => {
  it('aucun code générique n’importe src/demo (seules les compositions app/demo* le font)', () => {
    const generic = files.filter((f) => !f.startsWith('demo/') && !/^app\/demo/.test(f))
    expect(violations(generic, (t) => t === 'demo' || t.startsWith('demo/'))).toEqual([])
  })

  it('plus aucun fichier de configuration *.demo.ts hors de src/demo', () => {
    expect(files.filter((f) => /\.demo\.tsx?$/.test(f))).toEqual([])
  })

  it('la composition pilote n’embarque aucune donnée de démo et attend le serveur', async () => {
    const pilot = await import('./app/pilot')
    expect(pilot.mode).toBe('pilot')
    // aucun état local inventé : `novia` n'existe qu'une fois l'état lu sur le serveur
    expect(pilot.novia).toBeUndefined()
    const scope = files.filter((f) => f === 'app/pilot.ts' || f === 'app/pilot-shell.tsx' || f.startsWith('pilot/'))
    expect(scope.filter((f) => /Julie|NOVIA Nails|exemple\.demo/.test(sources[`./${f}`]))).toEqual([])
  })
})

describe('pilote P2 : le serveur fait autorité, aucun transport', () => {
  it('le navigateur pilote n’embarque aucun provider (ni Mock, ni GHL, ni futur) et ne persiste pas l’état', () => {
    const scope = files.filter((f) => f === 'app/pilot.ts' || f === 'app/pilot-shell.tsx' || f.startsWith('pilot/'))
    // seule l'horloge système (technique) est permise
    expect(violations(scope, (t) => /^providers(\/|$)/.test(t) && t !== 'providers/clock')).toEqual([])
    // seule préférence locale : l'établissement choisi sur l'appareil (aucune donnée métier)
    expect(scope.filter((f) => /localStorage\.setItem\((?!CHOICE)/.test(sources[`./${f}`]))).toEqual([])
  })

  it('P3 : les écrans de préparation du pilote ne sont branchés que par la composition pilote', () => {
    const users = files.filter((f) => !f.startsWith('pilot/ui/') && importsOf(f).some((t) => t.startsWith('pilot/ui/')))
    expect(users).toEqual(['app/pilot-routes.tsx'])
    // la démo n'importe rien du pilote (ni écran, ni API)
    expect(importsOf('app/demo-routes.tsx').filter((t) => t.startsWith('pilot'))).toEqual([])
    expect(sources['./pilot/ui/kit.tsx']).not.toMatch(/localStorage/)
  })

  it('le code du navigateur n’importe jamais le serveur, pg, la partie serveur des passkeys ni node:*', () => {
    const bad = files.flatMap((f) => importsOf(f).filter((t) => /^(\.\.\/server|server\/|pg$|@simplewebauthn\/server|node:)/.test(t)).map((t) => `${f} → ${t}`))
    expect(bad).toEqual([])
  })

  it('aucune adresse ni clé de fournisseur réel dans le code du navigateur', () => {
    // providers/ghl et providers/future : interfaces PRÉPARÉES, non connectées, jamais importées par le pilote (test ci-dessus)
    const real = /gohighlevel|leadconnector|twilio|stripe\.com|api\.stripe|sk_live|AC[0-9a-f]{32}/i
    expect(files.filter((f) => !f.startsWith('providers/') && real.test(sources[`./${f}`]))).toEqual([])
    expect(files.filter((f) => /https?:\/\/[^'"`\s]*(gohighlevel|leadconnector|twilio|stripe)/i.test(sources[`./${f}`]))).toEqual([])
  })
})

describe('couches', () => {
  it('core est pur : ni engine, ni providers, ni domaine, ni React, ni démo', () => {
    expect(violations(under('core/'), (t) => /^(engine|providers|domain|demo|pro|client|ui|app)(\/|$)/.test(t) || t === 'react')).toEqual([])
  })

  it('engine ne dépend ni de React, ni de l’UI, ni du domaine, ni d’un provider concret', () => {
    expect(violations(under('engine/'), (t) => /^(domain|demo|pro|client|ui|app|providers\/(mock|ghl|future))(\/|$)/.test(t) || t.startsWith('react'))).toEqual([])
  })

  it('les providers restent techniques : aucune règle métier, aucune orchestration', () => {
    expect(violations(under('providers/'), (t) => /^(core\/(workflows|smartfill|appointmentStatus|revenue|consent|optout)|engine|domain|demo)(\/|$|\.)/.test(t))).toEqual([])
  })

  it('aucune logique GHL dans React : l’UI ne touche jamais un provider concret', () => {
    const ui = files.filter((f) => /^(pro|client|ui|booking|gallery)\//.test(f))
    expect(violations(ui, (t) => /^(providers|engine)(\/|$)/.test(t))).toEqual([])
  })

  it('AnalyticsProvider a disparu : NOVIA calcule ses revenus elle-même', () => {
    expect(files.filter((f) => /AnalyticsProvider/.test(sources[`./${f}`]))).toEqual([])
  })
})

describe('fuseau horaire', () => {
  it('aucun calcul dans le fuseau de l’appareil hors de core/time.ts', () => {
    const scope = files.filter((f) => /^(core|engine|domain|providers|config|pilot|app)\//.test(f) && f !== 'core/time.ts')
    const local = /\.(getHours|getMinutes|getDate|getDay|getMonth|getFullYear|setHours|setMinutes|setDate|setMonth|getTimezoneOffset)\(/
    expect(scope.filter((f) => local.test(sources[`./${f}`]))).toEqual([])
  })
})
