import { createError, defineEventHandler, getCookie, getRequestHeader, getRequestHeaders, readRawBody } from 'h3'
import { useRuntimeConfig } from '#imports'
import { MAX_RECORD_BYTES, RecordThrottle, decisionKey, gatewayHeaders, marketOf, resolveCredentials, sanitizeRecord, gatewayFetch, serverConfig } from '../shared'

const throttle = new RecordThrottle()

/**
 * POST /_consent-manager/record — one decision, forwarded to
 * consent-manager.records.create. At most 4 KB, at most one record per consent
 * id and second, identical consecutive decisions collapse into one. Only the
 * fields the app takes leave this route; no address and no full user agent.
 */
export default defineEventHandler(async (event) => {
  const declared = Number(getRequestHeader(event, 'content-length') ?? 0)
  if (declared > MAX_RECORD_BYTES) throw createError({ statusCode: 413, statusMessage: 'Payload Too Large' })
  const raw = (await readRawBody(event, 'utf8')) ?? ''
  if (Buffer.byteLength(raw, 'utf8') > MAX_RECORD_BYTES) throw createError({ statusCode: 413, statusMessage: 'Payload Too Large' })

  let parsed: unknown
  try { parsed = JSON.parse(raw) }
  catch { throw createError({ statusCode: 400, statusMessage: 'Bad Request' }) }

  const headers = getRequestHeaders(event) as Record<string, string | undefined>
  const body = sanitizeRecord(parsed, headers['user-agent'])
  if (!body) throw createError({ statusCode: 422, statusMessage: 'Unprocessable Entity' })

  const key = decisionKey(body)
  const verdict = throttle.check(String(body.consent_id), key)
  if (verdict === 'duplicate') return { ok: true, deduplicated: true }
  if (verdict === 'rate_limited') throw createError({ statusCode: 429, statusMessage: 'Too Many Requests' })

  const config = useRuntimeConfig(event)
  const own = config.consentManager as { apiUrl: string, tenant: string, apiKey: string, marketCookie: string }
  const server = { ...serverConfig(own), marketCookie: own.marketCookie }
  const credentials = resolveCredentials(headers, server)
  if (!credentials.tenant || (!credentials.jwt && !credentials.apiKey)) throw createError({ statusCode: 503, statusMessage: 'Service Unavailable' })
  const market = marketOf(headers, getCookie(event, server.marketCookie))
  const base = server.apiUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
  try {
    await gatewayFetch(`${base}/v1/consent-manager/records`, { method: 'POST', body, headers: gatewayHeaders(credentials, market), retry: 0, timeout: 5000 })
  }
  catch (err: unknown) {
    const status = (err as { statusCode?: number }).statusCode ?? 502
    throw createError({ statusCode: status >= 400 && status < 500 ? status : 502, statusMessage: 'Record not stored' })
  }
  throttle.remember(String(body.consent_id), key)
  return { ok: true }
})
