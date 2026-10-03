<script setup lang="ts">
const consents = useConsents()
const { $consentProvider } = useNuxtApp()

// A vendor loaded through @nuxt/scripts only once the visitor allows it.
useScript('https://www.googletagmanager.com/gtag/js?id=G-PLAYGROUND', {
  trigger: $consentProvider.trigger('google-analytics', 'statistics'),
})
</script>

<template>
  <main style="font-family: system-ui; max-width: 48rem; margin: 2rem auto; padding: 0 1rem">
    <h1>Consent Manager playground</h1>
    <p>Decided: {{ consents.decided.value }}</p>
    <pre>{{ consents.state.value }}</pre>
    <h2>Video</h2>
    <ConsentGate vendor="youtube">
      <iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/aqz-KE-bpKQ" title="Video" allowfullscreen />
    </ConsentGate>
    <footer style="margin-top: 3rem">
      <ConsentPreferencesLink />
      <button type="button" @click="consents.withdraw()">Withdraw everything</button>
    </footer>
    <ConsentBanner />
  </main>
</template>
