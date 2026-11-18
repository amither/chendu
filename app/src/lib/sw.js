import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

// A new version waits until the parent applies it from Settings, so a deploy
// never reloads the page in the middle of a reading or recording.
export const needRefresh = ref(false)
export const applyUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    needRefresh.value = true
  },
  // An installed PWA is rarely reloaded: look for updates whenever it resumes.
  onRegisteredSW(_url, registration) {
    if (!registration || typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') registration.update().catch(() => {})
    })
  },
})
