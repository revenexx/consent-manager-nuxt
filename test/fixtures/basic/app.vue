<script setup lang="ts">
const { $consentProvider } = useNuxtApp()
useScript('https://www.googletagmanager.com/gtag/js?id=G-FIXTURE', {
  trigger: $consentProvider.trigger('google-analytics', 'statistics'),
})
useHead({ script: [{ src: '/some-tag.js', tagPosition: 'head' }] })
</script>

<template>
  <div>
    <h1>Fixture</h1>
    <ConsentGate vendor="youtube">
      <iframe src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="Video" />
    </ConsentGate>
    <ConsentPreferencesLink />
    <ConsentBanner />
  </div>
</template>
