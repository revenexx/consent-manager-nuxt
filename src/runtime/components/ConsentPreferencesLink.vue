<script setup lang="ts">
import { computed, inject } from 'vue'
import { CONSENT_MANAGER } from '../manager'
import { label } from '../labels'

/** The link for the footer and the privacy page: reopens the choice, preset with the current decisions. */
const m = inject(CONSENT_MANAGER)!
const text = computed(() => label(m.policy.value?.locales[m.locale.value]?.banner as Record<string, unknown> | undefined, m.locale.value, 'privacy_link'))
</script>

<template>
  <button v-if="!m.editor" type="button" class="rvx-consent-link" data-consent-preferences-link @click="m.open('preferences', 'privacy_link')">
    <slot :text="text">{{ text }}</slot>
  </button>
</template>
