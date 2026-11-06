/**
 * Point unique de branchement des providers.
 *
 * Le domaine NOVIA (src/domain) ne connaît que l'interface `Providers`. Pour passer
 * de la démonstration à une intégration réelle, on remplace l'implémentation ICI
 * (ex. createGHLProviders(...) + providers Voice / Payment), sans modifier aucun
 * composant React.
 *
 * Mode actuel : 'mock' UNIQUEMENT. Aucune intégration réelle n'est branchée.
 */
import { providers as mockProviders } from './mock'
import type { Providers } from './types'

export type ProviderMode = 'mock'

export const providerMode: ProviderMode = 'mock'

export const providers: Providers = mockProviders

export type * from './types'
