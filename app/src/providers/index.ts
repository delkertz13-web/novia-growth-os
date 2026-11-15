/**
 * Contrats des fournisseurs techniques et leurs implémentations.
 *
 * Le choix des implémentations ne se fait PAS ici : il se fait dans la composition
 * (src/app/demo.ts ou src/app/pilot.ts), selon NOVIA_MODE. En P1, seules les
 * implémentations Mock existent ; GHL, SMS direct, Voice, paiement et Planity sont
 * préparés et répondent `not_connected`.
 */
export type * from './types'
export { SystemClock, createFixedClock } from './clock'
