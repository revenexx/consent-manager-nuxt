/**
 * The pure half of the module: the cookie format, the gating rule, Consent Mode
 * signals and what a decision writes. No Vue, no Nuxt, no DOM — so every rule
 * the shared contract states can be proved without a browser.
 */
import type {
  ConsentCookie, ConsentState, Decision, DeliveredPolicy, GoogleSignal, LegalBasis, PolicyVendor, RecordAction,
} from './types'

export const GOOGLE_SIGNALS: GoogleSignal[] = [
  'ad_storage', 'analytics_storage', 'ad_user_data', 'ad_personalization',
  'functionality_storage', 'personalization_storage', 'security_storage',
]

const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const SHORT = new Set(['g', 'd', 'o'])

// ---- cookie ------------------------------------------------------------------

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text)
  let bin = ''
  for (const b of bytes) bin += String.fromCharCode(b)
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (value.length % 4)) % 4)
  const bin = atob(b64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  return new TextDecoder().decode(bytes)
}

export function encodeConsentCookie(cookie: ConsentCookie): string {
  return toBase64Url(JSON.stringify({ id: cookie.id, v: cookie.v, p: cookie.p, x: cookie.x, t: cookie.t }))
}

/** Decode `rvx_consent`, or null for anything that is not exactly the contract shape. */
export function decodeConsentCookie(raw: string | null | undefined): ConsentCookie | null {
  if (!raw || typeof raw !== 'string' || raw.length > 4096) return null
  try {
    const value = JSON.parse(fromBase64Url(raw))
    if (!value || typeof value !== 'object') return null
    if (typeof value.id !== 'string' || !UUID_V4.test(value.id)) return null
    if (!Number.isInteger(value.v) || value.v < 0) return null
    if (!Number.isFinite(value.t)) return null
    const map = (m: unknown) => {
      if (!m || typeof m !== 'object' || Array.isArray(m)) return null
      const out: Record<string, 'g' | 'd' | 'o'> = {}
      for (const [k, v] of Object.entries(m)) {
        if (!SHORT.has(v as string)) return null
        out[k] = v as 'g' | 'd' | 'o'
      }
      return out
    }
    const p = map(value.p)
    const x = map(value.x)
    if (!p || !x) return null
    return { id: value.id, v: value.v, p, x, t: value.t }
  }
  catch {
    return null
  }
}

export function newConsentId(): string {
  return globalThis.crypto.randomUUID()
}

// ---- context -------------------------------------------------------------------

export interface EditorOptions {
  enabled: boolean
  hosts: string[]
  paths: string[]
}

export const DEFAULT_EDITOR: EditorOptions = {
  enabled: true,
  hosts: ['*.theme.rvnxx.site'],
  paths: ['/admin', '/preview'],
}

function hostMatches(host: string, pattern: string): boolean {
  const h = host.toLowerCase().replace(/:\d+$/, '')
  const p = pattern.toLowerCase()
  if (p.startsWith('*.')) return h.endsWith(p.slice(1)) && h.length > p.length - 1
  return h === p
}

/** True on a theme editor host or under an editor/preview path: no banner, nothing optional. */
export function isEditorContext(host: string, path: string, options: EditorOptions = DEFAULT_EDITOR): boolean {
  if (!options.enabled) return false
  if (options.hosts.some(p => hostMatches(host || '', p))) return true
  const clean = (path || '/').split('?')[0]!.split('#')[0]!
  return options.paths.some(prefix => clean === prefix || clean.startsWith(`${prefix}/`))
}

// ---- the gating rule -------------------------------------------------------------

export const effectiveBasis = (vendor: PolicyVendor | undefined, basis: LegalBasis | undefined): LegalBasis =>
  vendor?.legal_basis_override ?? basis ?? 'consent'

/**
 * allows(vendor, purpose) — normative, from the shared contract:
 *   ¬editor ∧ policy loaded ∧ vendor ∈ policy ∧ purpose ∈ vendor.purposes ∧
 *   necessary → true · legitimate_interest → x[v] ≠ o ∧ p[p] ≠ o · consent → p[p] = g ∨ x[v] = g
 * Any uncertainty → false. A cookie from an older material version counts as
 * no cookie, so a consent purpose is not allowed until the visitor decides again.
 */
export function allows(
  policy: DeliveredPolicy | null,
  cookie: ConsentCookie | null,
  vendor: string,
  purpose: string,
  editor: boolean,
  now = Date.now(),
): boolean {
  if (editor || !policy) return false
  const v = policy.vendors.find(entry => entry.code === vendor)
  if (!v || !v.purposes.includes(purpose)) return false
  const p = policy.purposes.find(entry => entry.code === purpose)
  if (!p) return false
  const current = cookie && !isStale(policy, cookie, now) ? cookie : null
  const basis = effectiveBasis(v, p.legal_basis)
  if (basis === 'necessary') return true
  if (basis === 'legitimate_interest') return current?.x[vendor] !== 'o' && current?.p[purpose] !== 'o'
  if (basis === 'consent') return current?.p[purpose] === 'g' || current?.x[vendor] === 'g'
  return false
}

/** The number below which a decision has to be asked again. */
export function materialNumber(policy: DeliveredPolicy): number {
  const v = policy.version
  if (typeof v.material_number === 'number') return v.material_number
  return v.material ? v.number : 0
}

/** True when the cookie predates a material version or has expired. */
export function isStale(policy: DeliveredPolicy, cookie: ConsentCookie, now = Date.now()): boolean {
  if (cookie.v < materialNumber(policy)) return true
  const lifetime = Number(policy.settings?.consent_lifetime_days) || 365
  return cookie.t * 1000 + lifetime * 86_400_000 < now
}

/** Whether the first layer has to be shown. */
export function needsDecision(policy: DeliveredPolicy | null, cookie: ConsentCookie | null, editor: boolean, now = Date.now()): boolean {
  if (editor || !policy) return false
  if (policy.version.preview) return true
  return !cookie || isStale(policy, cookie, now)
}

// ---- state ------------------------------------------------------------------------

const LONG: Record<string, Decision> = { g: 'granted', d: 'denied', o: 'objected' }

/** The state hooks and events carry — explicit per purpose, never the id. */
export function stateOf(policy: DeliveredPolicy | null, cookie: ConsentCookie | null, editor = false, now = Date.now()): ConsentState {
  const state: ConsentState = { purposes: {}, vendors: {} }
  if (!policy) return state
  const current = cookie && !isStale(policy, cookie, now) ? cookie : null
  for (const p of policy.purposes) {
    if (editor) { state.purposes[p.code] = 'denied'; continue }
    const short = current?.p[p.code]
    if (p.legal_basis === 'necessary') state.purposes[p.code] = 'granted'
    else if (p.legal_basis === 'legitimate_interest') state.purposes[p.code] = short === 'o' ? 'objected' : 'granted'
    else state.purposes[p.code] = short === 'g' ? 'granted' : 'denied'
  }
  if (current && !editor) for (const [code, short] of Object.entries(current.x)) state.vendors[code] = LONG[short]!
  return state
}

/** Consent Mode v2 signals: all denied except security_storage, then each granted purpose's signals. */
export function googleSignals(policy: DeliveredPolicy | null, cookie: ConsentCookie | null, editor = false, now = Date.now()) {
  const out = Object.fromEntries(GOOGLE_SIGNALS.map(s => [s, 'denied'])) as Record<GoogleSignal, 'granted' | 'denied'>
  out.security_storage = 'granted'
  if (!policy || editor) return out
  const state = stateOf(policy, cookie, editor, now)
  for (const p of policy.purposes) {
    if (state.purposes[p.code] !== 'granted') continue
    for (const s of p.google_signals ?? []) if (s in out) out[s] = 'granted'
  }
  return out
}

/** The Consent Mode default — written first in <head>, before any tag. */
export function consentModeDefault(dataLayerName = 'dataLayer'): string {
  const denied = Object.fromEntries(GOOGLE_SIGNALS.map(s => [s, s === 'security_storage' ? 'granted' : 'denied']))
  const name = JSON.stringify(dataLayerName)
  return `window[${name}]=window[${name}]||[];function gtag(){window[${name}].push(arguments);}`
    + `gtag('consent','default',${JSON.stringify({ ...denied, wait_for_update: 500 })});`
    + `gtag('set','ads_data_redaction',true);`
}

/** The Consent Mode update for a returning visitor, written right after the default. */
export function consentModeUpdate(signals: Record<string, string>): string {
  return `gtag('consent','update',${JSON.stringify(signals)});`
}

// ---- decisions ------------------------------------------------------------------------

export interface Choices {
  purposes?: Record<string, Decision>
  vendors?: Record<string, Decision>
}

const SHORTEN: Record<Decision, 'g' | 'd' | 'o'> = { granted: 'g', denied: 'd', objected: 'o' }

/**
 * What one decision writes: the next cookie and the record's `decisions`.
 * accept_all grants every consent purpose; reject_all and withdraw deny every
 * consent purpose and object to every legitimate-interest purpose and vendor.
 */
export function decide(
  policy: DeliveredPolicy,
  previous: ConsentCookie | null,
  action: RecordAction,
  choices: Choices = {},
  now = Date.now(),
): { cookie: ConsentCookie, decisions: ConsentState } {
  const refuseAll = action === 'reject_all' || action === 'withdraw'
  const keepPrevious = action === 'vendor_grant' && previous && !isStale(policy, previous, now)
  const decisions: ConsentState = { purposes: {}, vendors: {} }
  for (const p of policy.purposes) {
    if (p.legal_basis === 'necessary') { decisions.purposes[p.code] = 'granted'; continue }
    const lb = p.legal_basis === 'legitimate_interest'
    if (action === 'accept_all') decisions.purposes[p.code] = 'granted'
    else if (refuseAll) decisions.purposes[p.code] = lb ? 'objected' : 'denied'
    else if (keepPrevious) decisions.purposes[p.code] = LONG[previous!.p[p.code] ?? (lb ? 'g' : 'd')]!
    else {
      const said = choices.purposes?.[p.code]
      decisions.purposes[p.code] = lb ? (said === 'objected' || said === 'denied' ? 'objected' : 'granted') : (said === 'granted' ? 'granted' : 'denied')
    }
  }
  const vendors: Record<string, Decision> = {}
  if (keepPrevious) for (const [k, v] of Object.entries(previous!.x)) vendors[k] = LONG[v]!
  if (!refuseAll) for (const [k, v] of Object.entries(choices.vendors ?? {})) {
    if (policy.vendors.some(entry => entry.code === k)) vendors[k] = v
  }
  if (refuseAll) for (const v of policy.vendors) if (v.legal_basis_override === 'legitimate_interest') vendors[v.code] = 'objected'
  decisions.vendors = vendors
  const id = action === 'withdraw' || !previous ? newConsentId() : previous.id
  const cookie: ConsentCookie = {
    id,
    v: policy.version.number,
    p: Object.fromEntries(Object.entries(decisions.purposes).map(([k, v]) => [k, SHORTEN[v]])),
    x: Object.fromEntries(Object.entries(vendors).map(([k, v]) => [k, SHORTEN[v]])),
    t: Math.floor(now / 1000),
  }
  return { cookie, decisions }
}

/** The vendors allowed before and not after — the ones whose scripts need a reload to go. */
export function revoked(policy: DeliveredPolicy, before: ConsentCookie | null, after: ConsentCookie | null, now = Date.now()): PolicyVendor[] {
  return policy.vendors.filter(v => v.purposes.some(p => allows(policy, before, v.code, p, false, now))
    && !v.purposes.some(p => allows(policy, after, v.code, p, false, now)))
}

/** The first-party cookies and storage keys a vendor declared — what a withdrawal deletes. */
export function firstPartyStorage(vendors: PolicyVendor[]) {
  const out: { name: string, kind: string }[] = []
  for (const v of vendors) for (const c of v.cookies) {
    if (c.host === 'first-party' || c.host === null) out.push({ name: c.name, kind: c.kind })
  }
  return out
}

/** A browser as family and major version — never the full user agent. */
export function userAgentClass(ua: string | null | undefined): string | null {
  if (!ua) return null
  const rules: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/(\d+)/, 'Edge'], [/OPR\/(\d+)/, 'Opera'], [/SamsungBrowser\/(\d+)/, 'Samsung Internet'],
    [/Firefox\/(\d+)/, 'Firefox'], [/FxiOS\/(\d+)/, 'Firefox'], [/CriOS\/(\d+)/, 'Chrome'], [/Chrome\/(\d+)/, 'Chrome'],
    [/Version\/(\d+)(?:\.\d+)* (?:Mobile\/\S+ )?Safari\//, 'Safari'],
  ]
  for (const [re, family] of rules) {
    const m = re.exec(ua)
    if (m) return `${family} ${m[1]}`
  }
  return 'Other'
}

/** The best locale of the policy for a requested one. */
export function pickLocale(policy: DeliveredPolicy | null, wanted: string | undefined): string {
  if (!policy) return wanted || 'de'
  const available = Object.keys(policy.locales)
  const base = (wanted || '').toLowerCase().split(/[-_]/)[0]!
  if (wanted && available.includes(wanted)) return wanted
  if (available.includes(base)) return base
  return available.includes('de') ? 'de' : available[0] ?? 'de'
}

/** Whether a path is one the banner must not cover. */
export function isExemptPath(policy: DeliveredPolicy | null, path: string): boolean {
  const clean = (path || '/').split('?')[0]!.replace(/\/+$/, '') || '/'
  return (policy?.settings.banner_exempt_paths ?? []).some(p => clean === (p.replace(/\/+$/, '') || '/'))
}
