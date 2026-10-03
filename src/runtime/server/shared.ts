/**
 * Server-side helpers shared by the two Nitro routes. Pure where possible, so
 * the credential resolution and the record sanitizing are unit-tested without a
 * Nitro build.
 */
import { userAgentClass } from '../core'

export interface GatewayCredentials {
  tenant: string
  apiKey: string
  jwt: string
  source: 'brokered' | 'config'
}

export interface ServerConfig {
  apiUrl: string
  tenant: string
  apiKey: string
}

/**
 * Who this request talks to the gateway as — the approach of
 * `@revenexx/cover`'s revenexxCredentials, without importing it:
 *
 *   1. the platform's brokered context (ADR-0057 §8 / ADR-0062): a deployed Site
 *      gets `x-revenexx-tenant` + `x-revenexx-context` injected per request. Always
 *      wins. A tenant header without a token takes a key only from config that
 *      names the SAME tenant — never another tenant's key.
 *   2. runtime config: tenant + API key (local dev, the demo shop).
 */
export function resolveCredentials(headers: Record<string, string | undefined>, config: ServerConfig): GatewayCredentials {
  const tenant = (headers['x-revenexx-tenant'] ?? '').trim()
  if (tenant) {
    const jwt = (headers['x-revenexx-context'] ?? '').trim()
    const apiKey = jwt ? '' : (config.tenant === tenant ? config.apiKey : '')
    return { tenant, apiKey, jwt, source: 'brokered' }
  }
  return { tenant: config.tenant, apiKey: config.apiKey, jwt: '', source: 'config' }
}

/** The headers a gateway call carries. Never forwards an address or a user agent. */
export function gatewayHeaders(credentials: GatewayCredentials, market: string): Record<string, string> {
  const headers: Record<string, string> = {
    'accept': 'application/json',
    'content-type': 'application/json',
    'x-revenexx-tenant': credentials.tenant,
  }
  if (credentials.jwt) headers.authorization = `Bearer ${credentials.jwt}`
  else if (credentials.apiKey) headers['x-revenexx-api-key'] = credentials.apiKey
  if (market) headers['x-revenexx-market'] = market
  return headers
}

export const MAX_RECORD_BYTES = 4096
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FIELDS = ['consent_id', 'action', 'surface', 'policy_version_id', 'locale', 'decisions', 'client_ts', 'user_agent_class', 'page_path'] as const

/**
 * The record body as it leaves for the gateway: only the fields the app takes,
 * the path cut at its query, the browser reduced to family + major version.
 * Anything else the client sent — an address, a full user agent, a contact —
 * is dropped here, before it ever leaves the shop.
 */
export function sanitizeRecord(input: unknown, userAgentHeader?: string): Record<string, unknown> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null
  const body = input as Record<string, unknown>
  if (typeof body.consent_id !== 'string' || !UUID.test(body.consent_id)) return null
  if (typeof body.policy_version_id !== 'string' || !UUID.test(body.policy_version_id)) return null
  const out: Record<string, unknown> = {}
  for (const k of FIELDS) if (body[k] !== undefined) out[k] = body[k]
  if (typeof out.page_path === 'string') out.page_path = (out.page_path as string).split('#')[0]!.split('?')[0]!.slice(0, 512)
  const ua = typeof body.user_agent_class === 'string' && /^[A-Z][A-Z ]{1,29} \d{1,4}$/i.test(body.user_agent_class)
    ? body.user_agent_class
    : userAgentClass(userAgentHeader)
  out.user_agent_class = ua
  return out
}

/** A stable fingerprint of what a record decides — for the dedupe. */
export function decisionKey(body: Record<string, unknown>): string {
  const sort = (v: unknown): unknown => {
    if (Array.isArray(v)) return v.map(sort)
    if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map(k => [k, sort((v as Record<string, unknown>)[k])]))
    return v
  }
  return JSON.stringify(sort({ a: body.action, v: body.policy_version_id, d: body.decisions }))
}

/**
 * At most one record per consent id and second, and two identical consecutive
 * decisions of one browser make one record. Process-local by design: the edge
 * carries the real rate limit; this keeps a single misbehaving page from
 * flooding the evidence.
 */
export class RecordThrottle {
  private last = new Map<string, { at: number, key: string }>()
  constructor(private windowMs = 1000, private max = 10_000) {}

  check(consentId: string, key: string, now = Date.now()): 'ok' | 'rate_limited' | 'duplicate' {
    const seen = this.last.get(consentId)
    if (seen && seen.key === key) return 'duplicate'
    if (seen && now - seen.at < this.windowMs) return 'rate_limited'
    return 'ok'
  }

  remember(consentId: string, key: string, now = Date.now()) {
    if (this.last.size >= this.max) {
      const first = this.last.keys().next().value
      if (first !== undefined) this.last.delete(first)
    }
    this.last.delete(consentId)
    this.last.set(consentId, { at: now, key })
  }
}

/** The market of a request: the pass-through header, else the configured cookie. */
export function marketOf(headers: Record<string, string | undefined>, cookieValue?: string): string {
  const header = (headers['x-revenexx-market'] ?? '').trim()
  if (header) return header
  const fromCookie = (cookieValue ?? '').trim()
  return /^[\w-]{1,32}$/.test(fromCookie) ? fromCookie : ''
}

/**
 * A per-process cache with a fixed lifetime and in-flight sharing: N requests
 * for one tenant and market within the window cost one gateway call. Failures
 * are not cached.
 */
export class TtlCache<T> {
  private entries = new Map<string, { at: number, value: Promise<T> }>()
  constructor(private ttlMs: number, private max = 1000) {}

  get(key: string, load: () => Promise<T>, now = Date.now()): Promise<T> {
    const hit = this.entries.get(key)
    if (hit && now - hit.at < this.ttlMs) return hit.value
    if (this.entries.size >= this.max) this.entries.clear()
    const value = load()
    this.entries.set(key, { at: now, value })
    value.catch(() => this.entries.delete(key))
    return value
  }
}
