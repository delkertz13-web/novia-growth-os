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

  it('la composition pilote n’embarque aucune donnée ni contrôle de démo', async () => {
    const { createPilotNovia, mode } = await import('./app/pilot')
    const novia = createPilotNovia()
    expect(mode).toBe('pilot')
    expect(novia.demo).toBeNull()
    expect(novia.execution).toBe('shadow')
    expect(novia.profile.identity.name.status).toBe('unknown')
    const s = novia.snapshot()
    expect([s.customers, s.appointments, s.runs, s.messages]).toEqual([[], [], [], []])
    expect(JSON.stringify(s)).not.toMatch(/Julie|NOVIA Nails|exemple\.demo/)
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
