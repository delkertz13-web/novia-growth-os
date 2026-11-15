/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** demo (défaut) | pilot */
  readonly VITE_NOVIA_MODE?: 'demo' | 'pilot'
  /** pilote : identifiant de l'entreprise */
  readonly VITE_NOVIA_BUSINESS_ID?: string
  /** pilote : fuseau IANA du salon (à vérifier avec l'établissement) */
  readonly VITE_NOVIA_TIMEZONE?: string
}
