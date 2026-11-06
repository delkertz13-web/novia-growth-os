/**
 * Instance NOVIA de l'application. Les composants React importent `novia` depuis ici,
 * jamais un provider directement.
 */
import { rules } from '../config/rules.demo'
import { services } from '../config/services.demo'
import { providers } from '../providers'
import { createNovia } from './intents'

export const novia = createNovia(providers, { rules, services })

export * from './cockpit'
export * from './reactions'
export * from './kpi'
export type { IntentResult, Novia } from './intents'
export type { NoviaSnapshot, SmartFillFunnel, VoiceMode, VoiceSettings } from '../providers/types'
export * from './conversations'
export * from './customers'
export * from './timeline'
export * from './voice'
export type { VoiceCall, Conversation, NoviaSettings } from '../core/types'
