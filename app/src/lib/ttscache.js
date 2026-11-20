import { getDB } from './db.js'
import { synthesize } from './deepseek.js'

// Synthesized lines live in the `audio` store under tts/<voice>/<sha1(text)>,
// so a piece read again (337 repeats each piece over several days) costs
// nothing and works offline.
const PREFIX = 'tts/'
const range = () => IDBKeyRange.bound(PREFIX, `${PREFIX}\uffff`)

async function sha1(text) {
  const d = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export async function ttsKey(voice, text) {
  return `${PREFIX}${voice}/${await sha1(text)}`
}

// Requests already on their way, so two players asking for the same line at
// once (e.g. a piece reopened while still synthesizing) pay for it once.
const inflight = new Map()

export async function cachedSpeech(key, voice, text, synth = synthesize) {
  const k = await ttsKey(voice, text)
  if (!inflight.has(k)) {
    const p = (async () => {
      const db = await getDB()
      const hit = await db.get('audio', k)
      if (hit) return hit
      const blob = await synth(key, text, voice)
      await db.put('audio', blob, k)
      return blob
    })().finally(() => inflight.delete(k))
    inflight.set(k, p)
  }
  return inflight.get(k)
}

export async function ttsCacheStats() {
  const blobs = await (await getDB()).getAll('audio', range())
  return { count: blobs.length, bytes: blobs.reduce((n, b) => n + b.size, 0) }
}

export async function clearTtsCache() {
  await (await getDB()).delete('audio', range())
}
