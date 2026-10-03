import { inject } from 'vue'
import { CONSENT_MANAGER } from '../manager'
import type { ConsentManager } from '../manager'

/**
 * Headless access to the visitor's consent — for a theme that builds its own UI.
 *
 *   const c = useConsents()
 *   c.state / c.decided / c.allows(vendor) / c.trigger(vendor) / c.open()
 *   c.acceptAll() / c.rejectAll() / c.save(choices) / c.withdraw() / c.grantVendor(vendor)
 */
export function useConsents() {
  const manager = inject(CONSENT_MANAGER, null) as ConsentManager | null
  if (!manager) throw new Error('[consent-manager] useConsents() needs the @revenexx/consent-manager-nuxt module')
  return {
    state: manager.state,
    decided: manager.decided,
    policy: manager.policy,
    isOpen: manager.isOpen,
    locale: manager.locale,
    allows: manager.allows,
    /** A consent trigger for `useScript` from @nuxt/scripts: loads once the vendor is allowed. */
    trigger: (vendor: string, purpose?: string) => {
      const p = purpose ?? manager.policy.value?.vendors.find(v => v.code === vendor)?.purposes[0] ?? ''
      if (!manager.trigger) throw new Error('[consent-manager] trigger() is only available inside a Nuxt app')
      return manager.trigger(vendor, p)
    },
    googleSignals: manager.googleSignals,
    open: () => manager.open('preferences', 'privacy_link'),
    close: manager.close,
    acceptAll: manager.acceptAll,
    rejectAll: manager.rejectAll,
    save: manager.save,
    withdraw: manager.withdraw,
    grantVendor: manager.grantVendor,
    onChange: manager.onChange,
  }
}

