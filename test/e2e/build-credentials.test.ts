import { execFile } from 'node:child_process'
import { readdir, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { describe, expect, it } from 'vitest'

/**
 * A build must never carry the gateway credentials of the machine it ran on.
 * The fixture is built with every credential variable the module reads set to
 * a canary, and no file of the output may contain one of them.
 */
const rootDir = fileURLToPath(new URL('../fixtures/env-credentials', import.meta.url))
const CANARIES = {
  NUXT_REVENEXX_API_KEY: 'rvxk_canary_revenexx_key',
  NUXT_REVENEXX_TENANT: 'canary-revenexx-tenant',
  NUXT_REVENEXX_API_URL: 'https://canary-revenexx.invalid',
  NUXT_CONSENT_MANAGER_API_KEY: 'rvxk_canary_consent_key',
  NUXT_CONSENT_MANAGER_TENANT: 'canary-consent-tenant',
  NUXT_CONSENT_MANAGER_API_URL: 'https://canary-consent.invalid',
}

async function files(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])
  const nested = await Promise.all(entries.map(e => (e.isDirectory() ? files(join(dir, e.name)) : [join(dir, e.name)])))
  return nested.flat()
}

describe('a production build', () => {
  it('holds no credential that was in the environment at build time [@spec:module-contract:AC-12]', async () => {
    await rm(join(rootDir, '.output'), { recursive: true, force: true })
    await promisify(execFile)(fileURLToPath(new URL('../../node_modules/.bin/nuxi', import.meta.url)), ['build', rootDir], {
      env: { ...process.env, ...CANARIES },
      maxBuffer: 64 * 1024 * 1024,
    })
    const output = await files(join(rootDir, '.output'))
    expect(output.length).toBeGreaterThan(0)
    const leaks: string[] = []
    for (const file of output) {
      const content = await readFile(file, 'latin1')
      for (const [name, value] of Object.entries(CANARIES)) if (content.includes(value)) leaks.push(`${name} in ${file.slice(rootDir.length)}`)
    }
    expect(leaks).toEqual([])
  })
})
