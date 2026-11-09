/**
 * Instance NOVIA de l'application. Les composants React importent `novia` (et le
 * profil de l'entreprise) depuis ici, jamais un provider, jamais la démonstration.
 *
 * `@novia/runtime` est résolu au build selon NOVIA_MODE (vite.config.ts) :
 * src/app/demo.ts ou src/app/pilot.ts. C'est le seul aiguillage demo / pilot.
 */
import { novia } from '@novia/runtime'
import { serviceOf } from '../config/profile'

export { novia }
export { mode as noviaMode } from '@novia/runtime'

/** Profil de l'entreprise courante (identité, prestations, contenu du site). */
export const profile = novia.profile
export const business = profile.identity
export const services = profile.services.items
export const serviceById = (id: string) => serviceOf(profile, id)
export const content = profile.content
export const galleryById = (id: string) => profile.content.gallery.find((g) => g.id === id)

export * from './cockpit'
export * from './reactions'
export * from './kpi'
export type { BookingInput, CallPlan, DemoControls, IntentResult, Novia, SmartFillFunnel, SmartFillOutcome } from './intents'
export type { NoviaSnapshot, VoiceMode, VoiceSettings } from '../engine/model'
export * from './conversations'
export * from './customers'
export * from './timeline'
export * from './voice'
export type { VoiceCall, Conversation, NoviaSettings } from '../core/types'
