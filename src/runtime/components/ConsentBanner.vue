<script setup lang="ts">
import { computed, inject, nextTick, reactive, ref, useId, watch } from 'vue'
import { CONSENT_MANAGER } from '../manager'
import { isExemptPath } from '../core'
import { label } from '../labels'
import type { Decision } from '../types'

/**
 * The consent banner — first layer and settings, SSR-rendered from the
 * published policy. "Reject all" and "Accept all" are the same button, in the
 * same place, at the same level, in every layout: that is not configurable.
 * Every surface has a slot; the theme styles it through the CSS variables
 * below or replaces it entirely.
 */
const props = defineProps<{
  /** Force a layout instead of the policy's (box | bar | modal). */
  layout?: 'box' | 'bar' | 'modal'
  /** The current path, when it cannot be read from the window (SSR in tests). */
  path?: string
}>()

const m = inject(CONSENT_MANAGER)!
const titleId = `rvx-consent-title-${useId()}`
const root = ref<HTMLElement | null>(null)
let returnFocus: HTMLElement | null = null

const policy = computed(() => m.policy.value)
const texts = computed(() => policy.value?.locales[m.locale.value]?.banner)
const localized = computed(() => policy.value?.locales[m.locale.value])
const t = (key: string) => label(texts.value as Record<string, unknown> | undefined, m.locale.value, key)
const currentPath = computed(() => props.path ?? (import.meta.client ? window.location.pathname : '/'))
const exempt = computed(() => isExemptPath(policy.value, currentPath.value))
const layout = computed(() => (exempt.value ? 'bar' : props.layout ?? policy.value?.settings.banner_layout ?? 'box'))
const showCookies = computed(() => policy.value?.settings.show_cookie_details !== false)

const basisOf = (code: string) => policy.value?.purposes.find(p => p.code === code)?.legal_basis ?? 'consent'
const choices = reactive<{ purposes: Record<string, Decision> }>({ purposes: {} })
function preset() {
  choices.purposes = { ...m.state.value.purposes }
}
const isActive = (code: string) => choices.purposes[code] === 'granted'
function toggle(code: string, on: boolean) {
  choices.purposes[code] = on ? 'granted' : basisOf(code) === 'legitimate_interest' ? 'objected' : 'denied'
}

function showPreferences() {
  preset()
  m.layer.value = 'preferences'
  if (!m.isOpen.value) m.open('preferences', 'preferences')
}

watch(() => [m.isOpen.value, m.layer.value], ([open, which]) => {
  if (open && which === 'preferences') preset()
}, { immediate: true })

watch(() => m.showBanner.value, async (shown) => {
  if (!import.meta.client) return
  if (shown) {
    returnFocus = document.activeElement as HTMLElement | null
    await nextTick()
    root.value?.querySelector<HTMLElement>('button, [href], input')?.focus()
  }
  else {
    returnFocus?.focus?.()
    returnFocus = null
  }
}, { immediate: true })

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && m.decided.value) {
    m.close()
    return
  }
  // A focus trap only where the page behind is blocked: the modal.
  if (event.key !== 'Tab' || layout.value !== 'modal' || !root.value) return
  const focusable = [...root.value.querySelectorAll<HTMLElement>('button, [href], input:not([disabled])')]
  if (!focusable.length) return
  const first = focusable[0]!
  const last = focusable[focusable.length - 1]!
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}

const api = computed(() => ({
  texts: texts.value,
  layout: layout.value,
  acceptAll: m.acceptAll,
  rejectAll: m.rejectAll,
  showPreferences,
  save: () => m.save({ purposes: { ...choices.purposes } }),
  close: m.close,
  purposes: localized.value?.purposes ?? [],
  vendors: localized.value?.vendors ?? [],
  choices,
  toggle,
}))
</script>

<template>
  <div
    v-if="m.showBanner.value"
    ref="root"
    class="rvx-consent"
    :class="[`rvx-consent--${layout}`, { 'rvx-consent--exempt': exempt }]"
    role="dialog"
    :aria-modal="layout === 'modal' ? 'true' : 'false'"
    :aria-labelledby="titleId"
    data-consent-banner
    @keydown="onKeydown"
  >
    <div v-if="layout === 'modal'" class="rvx-consent__backdrop" aria-hidden="true" />
    <div class="rvx-consent__panel">
      <template v-if="m.layer.value === 'first'">
        <slot name="first-layer" v-bind="api">
          <h2 :id="titleId" class="rvx-consent__title">
            <slot name="title" :text="t('title')">{{ t('title') }}</slot>
          </h2>
          <div class="rvx-consent__body">
            <slot name="body" :text="t('body')"><p>{{ t('body') }}</p></slot>
          </div>
          <p class="rvx-consent__links">
            <a v-if="texts?.privacy_url" :href="texts.privacy_url">{{ t('privacy') }}</a>
            <a v-if="texts?.imprint_url" :href="texts.imprint_url">{{ t('imprint') }}</a>
          </p>
          <div class="rvx-consent__actions">
            <slot name="actions" v-bind="api">
              <button type="button" class="rvx-consent__btn rvx-consent__btn--choice" data-consent-action="reject_all" @click="m.rejectAll()">
                {{ t('reject_all') }}
              </button>
              <button type="button" class="rvx-consent__btn rvx-consent__btn--choice" data-consent-action="accept_all" @click="m.acceptAll()">
                {{ t('accept_all') }}
              </button>
              <button type="button" class="rvx-consent__btn rvx-consent__btn--secondary" data-consent-action="settings" @click="showPreferences">
                {{ t('settings') }}
              </button>
            </slot>
          </div>
        </slot>
      </template>
      <template v-else>
        <slot name="preferences" v-bind="api">
          <h2 :id="titleId" class="rvx-consent__title">{{ t('preferences_title') }}</h2>
          <p class="rvx-consent__body">{{ t('preferences_body') }}</p>
          <div class="rvx-consent__purposes">
            <section v-for="purpose in api.purposes" :key="purpose.code" class="rvx-consent__purpose" :data-purpose="purpose.code">
              <slot name="purpose" :purpose="purpose" :active="isActive(purpose.code)" :toggle="toggle">
                <label class="rvx-consent__purpose-head">
                  <input
                    type="checkbox"
                    :name="`rvx-consent-${purpose.code}`"
                    :checked="isActive(purpose.code)"
                    :disabled="basisOf(purpose.code) === 'necessary'"
                    @change="toggle(purpose.code, ($event.target as HTMLInputElement).checked)"
                  >
                  <span class="rvx-consent__purpose-name">{{ purpose.name }}</span>
                  <span v-if="basisOf(purpose.code) === 'necessary'" class="rvx-consent__badge">{{ t('always_active') }}</span>
                  <span v-else-if="basisOf(purpose.code) === 'legitimate_interest'" class="rvx-consent__badge">{{ t('object') }}?</span>
                </label>
                <p class="rvx-consent__purpose-text">{{ purpose.description }}</p>
                <details class="rvx-consent__vendors">
                  <summary>{{ api.vendors.filter(v => v.purposes.includes(purpose.code)).length }} × {{ t('cookie_details') }}</summary>
                  <div v-for="vendor in api.vendors.filter(v => v.purposes.includes(purpose.code))" :key="vendor.code" class="rvx-consent__vendor" :data-vendor="vendor.code">
                    <slot name="vendor" :vendor="vendor">
                      <strong>{{ vendor.name }}</strong><span v-if="vendor.company"> — {{ vendor.company }}</span>
                      <p v-if="vendor.description">{{ vendor.description }}</p>
                      <p v-if="vendor.third_country_transfer && vendor.transfer_basis" class="rvx-consent__transfer">{{ vendor.transfer_basis }}</p>
                      <a v-if="vendor.privacy_policy_url" :href="String(vendor.privacy_policy_url)" rel="noopener" target="_blank">{{ t('privacy') }}</a>
                      <table v-if="showCookies && vendor.cookies.length" class="rvx-consent__cookies">
                        <tbody>
                          <tr v-for="cookie in vendor.cookies" :key="cookie.name">
                            <td>{{ cookie.name }}</td><td>{{ cookie.duration }}</td><td>{{ cookie.description }}</td>
                          </tr>
                        </tbody>
                      </table>
                    </slot>
                  </div>
                </details>
              </slot>
            </section>
          </div>
          <div class="rvx-consent__actions">
            <button type="button" class="rvx-consent__btn rvx-consent__btn--choice" data-consent-action="reject_all" @click="m.rejectAll()">
              {{ t('reject_all') }}
            </button>
            <button type="button" class="rvx-consent__btn rvx-consent__btn--choice" data-consent-action="accept_all" @click="m.acceptAll()">
              {{ t('accept_all') }}
            </button>
            <button type="button" class="rvx-consent__btn rvx-consent__btn--secondary" data-consent-action="save" @click="api.save()">
              {{ t('save') }}
            </button>
          </div>
        </slot>
      </template>
    </div>
  </div>
</template>

<style>
.rvx-consent {
  --rvx-consent-bg: #fff;
  --rvx-consent-fg: #1a1a1a;
  --rvx-consent-accent: #0f2a44;
  --rvx-consent-accent-fg: #fff;
  --rvx-consent-radius: 8px;
  --rvx-consent-focus: 3px solid #3b82f6;
  position: fixed;
  z-index: 2147483000;
  color: var(--rvx-consent-fg);
  font: inherit;
}
.rvx-consent--box { right: 1rem; bottom: 1rem; max-width: 28rem; }
.rvx-consent--bar { left: 0; right: 0; bottom: 0; }
.rvx-consent--modal { inset: 0; display: grid; place-items: center; }
.rvx-consent__backdrop { position: fixed; inset: 0; background: rgb(0 0 0 / 0.45); }
.rvx-consent__panel {
  position: relative; background: var(--rvx-consent-bg); border-radius: var(--rvx-consent-radius);
  box-shadow: 0 8px 32px rgb(0 0 0 / 0.2); padding: 1.25rem; max-height: 85vh; overflow: auto;
}
.rvx-consent--modal .rvx-consent__panel { max-width: 40rem; width: calc(100% - 2rem); }
.rvx-consent--bar .rvx-consent__panel { border-radius: 0; }
.rvx-consent__title { font-size: 1.125rem; margin: 0 0 0.5rem; }
.rvx-consent__actions { display: flex; flex-wrap: wrap; gap: 0.5rem; margin-top: 1rem; }
.rvx-consent__btn {
  font: inherit; cursor: pointer; padding: 0.625rem 1rem; border-radius: var(--rvx-consent-radius);
  border: 2px solid var(--rvx-consent-accent);
}
/* Reject all and accept all: one rule, so neither can be styled down. */
.rvx-consent__btn--choice { flex: 1 1 10rem; background: var(--rvx-consent-accent); color: var(--rvx-consent-accent-fg); }
.rvx-consent__btn--secondary { background: transparent; color: var(--rvx-consent-accent); }
.rvx-consent__btn:focus-visible, .rvx-consent a:focus-visible, .rvx-consent input:focus-visible { outline: var(--rvx-consent-focus); outline-offset: 2px; }
.rvx-consent__links { display: flex; gap: 1rem; font-size: 0.875rem; }
.rvx-consent__purpose { border-top: 1px solid rgb(0 0 0 / 0.1); padding: 0.75rem 0; }
.rvx-consent__purpose-head { display: flex; align-items: center; gap: 0.5rem; font-weight: 600; }
.rvx-consent__badge { font-size: 0.75rem; font-weight: 400; opacity: 0.75; }
.rvx-consent__cookies { font-size: 0.8125rem; border-collapse: collapse; width: 100%; }
.rvx-consent__cookies td { padding: 0.25rem 0.5rem 0.25rem 0; vertical-align: top; }
</style>
