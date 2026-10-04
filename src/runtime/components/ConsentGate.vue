<script setup lang="ts">
import { computed, inject } from 'vue'
import { CONSENT_MANAGER } from '../manager'
import { label } from '../labels'

/**
 * Content blocking. Until the vendor is allowed, the slot is NOT rendered — not
 * hidden, not rendered — and a local placeholder stands in its place, so no
 * request reaches the vendor's hosts. "Load once" records a vendor grant;
 * "Settings" opens the second layer. A thumbnail, if any, must be self-hosted.
 */
const props = defineProps<{
  vendor: string
  /**
   * The purpose to check. Without it the gate opens as soon as ANY purpose of
   * the vendor is allowed — name one to require that purpose specifically.
   */
  purpose?: string
  /** A self-hosted preview image — never the vendor's own thumbnail URL. */
  thumbnail?: string
  thumbnailAlt?: string
}>()

const m = inject(CONSENT_MANAGER)!
const allowed = computed(() => m.allows(props.vendor, props.purpose))
const localVendor = computed(() => m.policy.value?.locales[m.locale.value]?.vendors.find(v => v.code === props.vendor))
const vendorName = computed(() => localVendor.value?.name ?? props.vendor)
const banner = computed(() => m.policy.value?.locales[m.locale.value]?.banner as Record<string, unknown> | undefined)
const t = (key: string) => label(banner.value, m.locale.value, key)
const text = computed(() => t('gate_text').replaceAll('{vendor}', vendorName.value))
const load = () => m.grantVendor(props.vendor)
const settings = () => m.open('preferences', 'content_gate')
</script>

<template>
  <slot v-if="allowed" />
  <div v-else class="rvx-consent-gate" :data-consent-gate="vendor">
    <slot name="placeholder" :vendor="vendor" :vendor-name="vendorName" :text="text" :load="load" :open="settings">
      <img v-if="thumbnail" class="rvx-consent-gate__thumbnail" :src="thumbnail" :alt="thumbnailAlt ?? ''" loading="lazy">
      <p class="rvx-consent-gate__text">{{ text }}</p>
      <div v-if="!m.editor && m.policy.value" class="rvx-consent-gate__actions">
        <button type="button" class="rvx-consent__btn rvx-consent__btn--choice" data-consent-action="load_once" @click="load">{{ t('load_once') }}</button>
        <button type="button" class="rvx-consent__btn rvx-consent__btn--secondary" data-consent-action="settings" @click="settings">{{ t('settings') }}</button>
      </div>
    </slot>
  </div>
</template>

<style>
.rvx-consent-gate { display: grid; gap: 0.75rem; place-items: center; text-align: center; padding: 1.5rem; background: #f3f4f6; border-radius: 8px; aspect-ratio: 16 / 9; }
.rvx-consent-gate__thumbnail { max-width: 100%; border-radius: 4px; }
.rvx-consent-gate__actions { display: flex; gap: 0.5rem; flex-wrap: wrap; justify-content: center; }
</style>
