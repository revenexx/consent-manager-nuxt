import type { DeliveredPolicy } from '../../src/runtime/types'

const banner = (lang: 'de' | 'en') => ({
  title: lang === 'de' ? 'Ihre Privatsphäre' : 'Your privacy',
  body: lang === 'de' ? 'Wir verwenden Cookies.' : 'We use cookies.',
  accept_all: lang === 'de' ? 'Alle akzeptieren' : 'Accept all',
  reject_all: lang === 'de' ? 'Alle ablehnen' : 'Reject all',
  settings: lang === 'de' ? 'Einstellungen' : 'Settings',
  save: lang === 'de' ? 'Auswahl speichern' : 'Save selection',
  privacy_url: '/datenschutz',
  imprint_url: '/impressum',
})

const vendors = [
  { code: 'etracker', name: 'etracker Analytics', company: 'etracker GmbH', purposes: ['statistics'], cookies: [{ name: '_et_coid', kind: 'cookie', host: 'first-party', duration: '2 Jahre', description: 'Besucher' }] },
  { code: 'google-analytics', name: 'Google Analytics 4', company: 'Google Ireland Limited', purposes: ['statistics'], cookies: [{ name: '_ga', kind: 'cookie', host: 'first-party', duration: '2 Jahre', description: 'Besucher' }, { name: '_ga_<container-id>', kind: 'cookie', host: 'first-party', duration: '2 Jahre', description: 'Sitzung' }] },
  { code: 'youtube', name: 'YouTube', company: 'Google Ireland Limited', purposes: ['external_media'], cookies: [] },
]

export function makePolicy(overrides: Partial<DeliveredPolicy['version']> = {}): DeliveredPolicy {
  return {
    version: { id: '5d1e6c2a-7c51-4b8e-9a8f-1f0c1d2e3f40', number: 3, sha256: 'a'.repeat(64), material: true, material_number: 3, published_at: '2026-10-03T08:00:00.000Z', ...overrides },
    settings: { consent_lifetime_days: 365, banner_layout: 'box', show_cookie_details: true, banner_exempt_paths: ['/datenschutz', '/impressum'], google_consent_mode: 'basic' },
    locales: {
      de: {
        banner: banner('de'),
        purposes: [
          { code: 'necessary', name: 'Notwendig', description: 'Immer aktiv.' },
          { code: 'statistics', name: 'Statistik', description: 'Nutzung messen.' },
          { code: 'marketing', name: 'Marketing', description: 'Werbung.' },
          { code: 'external_media', name: 'Externe Medien', description: 'Videos.' },
        ],
        vendors,
      },
      en: { banner: banner('en'), purposes: [], vendors },
    },
    purposes: [
      { code: 'necessary', legal_basis: 'necessary', google_signals: ['security_storage'], position: 1 },
      { code: 'statistics', legal_basis: 'consent', google_signals: ['analytics_storage'], position: 2 },
      { code: 'marketing', legal_basis: 'consent', google_signals: ['ad_storage', 'ad_user_data', 'ad_personalization'], position: 3 },
      { code: 'external_media', legal_basis: 'consent', google_signals: [], position: 5 },
    ],
    vendors: [
      { code: 'etracker', purposes: ['statistics'], legal_basis_override: 'legitimate_interest', hosts: ['code.etracker.com'], cookies: [{ name: '_et_coid', kind: 'cookie', host: 'first-party', duration: { de: '2 Jahre' } }] },
      { code: 'google-analytics', purposes: ['statistics'], legal_basis_override: null, hosts: ['www.google-analytics.com', 'www.googletagmanager.com'], cookies: [{ name: '_ga', kind: 'cookie', host: 'first-party', duration: { de: '2 Jahre' } }, { name: '_ga_<container-id>', kind: 'cookie', host: 'first-party', duration: { de: '2 Jahre' } }] },
      { code: 'youtube', purposes: ['external_media'], legal_basis_override: null, hosts: ['www.youtube-nocookie.com', 'www.youtube.com', 'i.ytimg.com'], cookies: [] },
    ],
  }
}
