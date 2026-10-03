/** Fallbacks for the optional labels a published version may not carry. */
export const FALLBACK_LABELS: Record<string, Record<string, string>> = {
  de: {
    preferences_title: 'Cookie-Einstellungen',
    preferences_body: 'Hier entscheiden Sie für jeden Zweck einzeln. Notwendige Techniken sind immer aktiv.',
    object: 'Widersprechen',
    load_once: 'Einmal laden',
    gate_text: 'Dieser Inhalt wird von {vendor} bereitgestellt. Wenn Sie ihn laden, werden Daten an {vendor} übertragen.',
    privacy_link: 'Cookie-Einstellungen',
    cookie_details: 'Cookies anzeigen',
    always_active: 'Immer aktiv',
    close: 'Schließen',
    privacy: 'Datenschutz',
    imprint: 'Impressum',
  },
  en: {
    preferences_title: 'Cookie settings',
    preferences_body: 'Decide for each purpose separately. Necessary techniques are always active.',
    object: 'Object',
    load_once: 'Load once',
    gate_text: 'This content is provided by {vendor}. Loading it transfers data to {vendor}.',
    privacy_link: 'Cookie settings',
    cookie_details: 'Show cookies',
    always_active: 'Always active',
    close: 'Close',
    privacy: 'Privacy',
    imprint: 'Imprint',
  },
}

export function label(texts: Record<string, unknown> | undefined, locale: string, key: string): string {
  const own = texts?.[key]
  if (typeof own === 'string' && own.trim()) return own
  const base = locale.split(/[-_]/)[0]!
  return FALLBACK_LABELS[base]?.[key] ?? FALLBACK_LABELS.en![key] ?? key
}
