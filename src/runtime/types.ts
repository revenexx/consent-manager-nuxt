import type { Ref } from 'vue'

export type LegalBasis = 'consent' | 'legitimate_interest' | 'necessary'
export type Decision = 'granted' | 'denied' | 'objected'
export type GoogleSignal =
  | 'ad_storage' | 'analytics_storage' | 'ad_user_data' | 'ad_personalization'
  | 'functionality_storage' | 'personalization_storage' | 'security_storage'

export interface PolicyVersion {
  id: string | null
  number: number
  sha256: string
  material: boolean
  /** Additive to the shared contract: the latest material version up to this one. */
  material_number?: number
  published_at: string | null
  preview?: boolean
}

export interface PolicySettings {
  consent_lifetime_days: number
  banner_layout: 'box' | 'bar' | 'modal'
  show_cookie_details: boolean
  banner_exempt_paths: string[]
  google_consent_mode: 'basic' | 'off'
}

export interface BannerTexts {
  title: string
  body: string
  accept_all: string
  reject_all: string
  settings: string
  save: string
  privacy_url?: string | null
  imprint_url?: string | null
  [label: string]: string | null | undefined
}

export interface LocalizedPurpose { code: string, name: string, description: string }
export interface LocalizedCookie { name: string, kind: string, host: string | null, duration: string, description: string }
export interface LocalizedVendor {
  code: string
  name: string
  company: string | null
  purposes: string[]
  cookies: LocalizedCookie[]
  [field: string]: unknown
}

export interface PolicyPurpose { code: string, legal_basis: LegalBasis, google_signals: GoogleSignal[], position: number }
export interface PolicyCookie { name: string, kind: string, host: string | null, duration: Record<string, string> }
export interface PolicyVendor { code: string, purposes: string[], legal_basis_override: LegalBasis | null, hosts: string[], cookies: PolicyCookie[] }

/** The delivered policy — GET /consent-manager/delivery/policy, verbatim. */
export interface DeliveredPolicy {
  version: PolicyVersion
  settings: PolicySettings
  locales: Record<string, { banner: BannerTexts, purposes: LocalizedPurpose[], vendors: LocalizedVendor[] }>
  purposes: PolicyPurpose[]
  vendors: PolicyVendor[]
}

/** The `rvx_consent` cookie, decoded. g = granted, d = denied, o = objected. */
export interface ConsentCookie {
  id: string
  v: number
  p: Record<string, 'g' | 'd' | 'o'>
  x: Record<string, 'g' | 'd' | 'o'>
  t: number
}

/** What hooks, DOM events and the provider hand out. Never the consent id. */
export interface ConsentState {
  purposes: Record<string, Decision>
  vendors: Record<string, Decision>
}

export type RecordAction = 'accept_all' | 'reject_all' | 'custom' | 'vendor_grant' | 'withdraw' | 'renew'
export type RecordSurface = 'first_layer' | 'preferences' | 'privacy_link' | 'content_gate'

/**
 * The ONLY coupling between @revenexx/consent-manager-nuxt and any loader
 * (shared contract). Provided as `nuxtApp.$consentProvider`.
 */
export interface ConsentProvider {
  readonly ready: Promise<void>
  allows: (vendor: string, purpose: string) => boolean
  trigger: (vendor: string, purpose: string) => Promise<void> & { consented: Ref<boolean> }
  googleSignals: () => Record<GoogleSignal, 'granted' | 'denied'>
  onChange: (cb: (state: ConsentState) => void) => () => void
}
