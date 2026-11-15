import type { ProviderError, ProviderResult } from './types'

/** Erreur typée renvoyée par tout provider préparé mais non branché (jamais retentable). */
export const notConnectedError = (provider: string, method: string): ProviderError => ({
  provider,
  code: 'not_connected',
  message: `${provider}.${method} : intégration préparée mais non connectée.`,
  retryable: false,
})

/**
 * Construit un provider dont chaque méthode répond `not_connected`, sans exception ni
 * appel réseau. Le typage garantit que la future implémentation couvre exactement le contrat.
 */
export function notConnected<T extends { readonly name: string }>(name: string, methods: { [K in Exclude<keyof T, 'name'>]-?: true }): T {
  const out: Record<string, unknown> = { name }
  for (const m of Object.keys(methods)) out[m] = async (): Promise<ProviderResult<never>> => ({ ok: false, error: notConnectedError(name, m) })
  return out as T
}
