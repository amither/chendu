import { ref } from 'vue'
import { registerSW } from 'virtual:pwa-register'

// A new version waits until the parent applies it from Settings, so a deploy
// never reloads the page in the middle of a reading or recording.
export const needRefresh = ref(false)
export const APP_VERSION = typeof __APP_VERSION__ === 'undefined' ? 'dev' : __APP_VERSION__
let registration = null
const wbUpdate = registerSW({
  immediate: true,
  onNeedRefresh() {
    needRefresh.value = true
  },
  // An installed PWA is rarely reloaded: look for updates whenever it resumes.
  onRegisteredSW(_url, reg) {
    registration = reg
    if (reg?.waiting) needRefresh.value = true
    if (!reg || typeof document === 'undefined') return
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reg.update().catch(() => {})
    })
  },
})

// Resolves once an update found by reg.update() has finished installing
// (onNeedRefresh then fires), or after a timeout.
function waitForInstall(reg, ms = 30000) {
  const sw = reg.installing
  if (!sw) return Promise.resolve()
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms)
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' || sw.state === 'redundant') {
        clearTimeout(timer)
        resolve()
      }
    })
  })
}

// Asks the server for a new version. Returns the deployed version string,
// or null when offline.
export async function checkForUpdate() {
  const latest = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null))
    .then((j) => j?.version ?? null)
    .catch(() => null)
  if (registration && latest && latest !== APP_VERSION) {
    await registration.update().catch(() => {})
    await waitForInstall(registration)
  }
  // workbox-window doesn't always report a worker found by update() itself.
  if (registration?.waiting) needRefresh.value = true
  return latest
}

// Activates the waiting worker and reloads into the new version.
export function applyUpdate() {
  const waiting = registration?.waiting
  if (!waiting) return wbUpdate(true)
  navigator.serviceWorker.addEventListener('controllerchange', () => location.reload(), { once: true })
  waiting.postMessage({ type: 'SKIP_WAITING' })
}
