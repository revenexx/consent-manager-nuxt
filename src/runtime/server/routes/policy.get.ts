import { defineEventHandler, getCookie, getQuery, getRequestHeaders, setResponseStatus } from 'h3'
import { useRuntimeConfig } from '#imports'
import { TtlCache, gatewayHeaders, marketOf, resolveCredentials } from '../shared'

/**
 * GET /_consent-manager/policy — the published policy of this shop's market,
 * read from consent-manager.delivery.policy and cached here for 60 seconds per
 * tenant and market. Fails closed: anything other than a policy is answered as
 * `{ policy: null, reason }`, which the module treats as everything denied.
 */
const cache = new TtlCache<{ policy: unknown, reason: string | null }>(60_000)

async function fetchPolicy(url: string, headers: Record<string, string>, key: string) {
  return cache.get(key, async () => {
    try {
      const policy = await $fetch(url, { headers, retry: 0, timeout: 4000 })
      return { policy, reason: null }
    }
    catch (err: unknown) {
      const status = (err as { statusCode?: number, status?: number }).statusCode ?? (err as { status?: number }).status
      // Nothing published is an answer worth caching; an outage is not.
      if (status === 404) return { policy: null, reason: 'nothing_published' }
      throw err
    }
  }).catch(() => ({ policy: null, reason: 'unavailable' }))
}

export default defineEventHandler(async (event) => {
  const config = useRuntimeConfig(event)
  const server = config.consentManager as { apiUrl: string, tenant: string, apiKey: string, marketCookie: string }
  const headers = getRequestHeaders(event) as Record<string, string | undefined>
  const credentials = resolveCredentials(headers, server)
  if (!credentials.tenant || (!credentials.jwt && !credentials.apiKey)) {
    setResponseStatus(event, 200)
    return { policy: null, reason: 'not_configured' }
  }
  const market = marketOf(headers, getCookie(event, server.marketCookie))
  const base = server.apiUrl.replace(/\/+$/, '').replace(/\/v1$/, '')
  const preview = String(getQuery(event).preview ?? '')
  if (preview) {
    // A preview is never cached: it is one person reading a draft.
    try {
      const policy = await $fetch(`${base}/v1/consent-manager/delivery/preview/${encodeURIComponent(preview)}`, { headers: gatewayHeaders(credentials, market), retry: 0, timeout: 4000 })
      return { policy, reason: null }
    }
    catch {
      return { policy: null, reason: 'preview_unavailable' }
    }
  }
  return fetchPolicy(`${base}/v1/consent-manager/delivery/policy`, gatewayHeaders(credentials, market), `${credentials.tenant}:${market || '-'}`)
})
