/** Erreur levée par toute implémentation préparée mais non branchée. */
export class NotConnectedError extends Error {
  constructor(provider: string, method: string) {
    super(`${provider}.${method} : intégration préparée mais non connectée (démonstration).`)
    this.name = 'NotConnectedError'
  }
}

/**
 * Construit un objet dont chaque méthode lève NotConnectedError. Le typage garantit
 * que la future implémentation couvre exactement l'interface attendue.
 */
export function notConnected<T extends object>(provider: string, methods: { [K in keyof T]-?: true }): T {
  const out: Record<string, () => never> = {}
  for (const m of Object.keys(methods))
    out[m] = () => {
      throw new NotConnectedError(provider, m)
    }
  return out as T
}
