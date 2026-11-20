import { test, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { getDB, resetDB } from '../src/lib/db.js'
import { ttsKey, cachedSpeech, ttsCacheStats, clearTtsCache } from '../src/lib/ttscache.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetDB()
})

test('ttsKey depends on voice and text and never collides with pack audio', async () => {
  const a = await ttsKey('stella', '鹅')
  expect(a).toMatch(/^tts\/stella\/[0-9a-f]{40}$/)
  expect(await ttsKey('stella', '鹅')).toBe(a)
  expect(await ttsKey('tide', '鹅')).not.toBe(a)
  expect(await ttsKey('stella', '鸭')).not.toBe(a)
})

test('cachedSpeech synthesizes once, then serves from IndexedDB', async () => {
  let calls = 0
  const synth = async (key, text, voice) => {
    calls++
    expect([key, text, voice]).toEqual(['sk', '鹅', 'stella'])
    return new Blob(['wav'], { type: 'audio/wav' })
  }
  const a = await cachedSpeech('sk', 'stella', '鹅', synth)
  const b = await cachedSpeech('sk', 'stella', '鹅', synth)
  expect(calls).toBe(1)
  expect(await a.text()).toBe('wav')
  expect(await b.text()).toBe('wav')
})

test('stats and clear only touch tts entries', async () => {
  const db = await getDB()
  await db.put('audio', new Blob(['pack-audio']), 'audio/a.mp3')
  const synth = async () => new Blob(['12345'])
  await cachedSpeech('sk', 'stella', '一', synth)
  await cachedSpeech('sk', 'tide', '二', synth)
  expect(await ttsCacheStats()).toEqual({ count: 2, bytes: 10 })
  await clearTtsCache()
  expect(await ttsCacheStats()).toEqual({ count: 0, bytes: 0 })
  expect(await db.get('audio', 'audio/a.mp3')).toBeTruthy()
})

test('concurrent requests for the same line call the API once', async () => {
  let calls = 0
  const synth = async () => {
    calls++
    await new Promise((r) => setTimeout(r, 20))
    return new Blob(['wav'])
  }
  const [a, b] = await Promise.all([
    cachedSpeech('sk', 'stella', '鹅', synth),
    cachedSpeech('sk', 'stella', '鹅', synth),
  ])
  expect(calls).toBe(1)
  expect(await a.text()).toBe('wav')
  expect(await b.text()).toBe('wav')
})

test('a failed synthesis is not cached and can be retried', async () => {
  let calls = 0
  const synth = async () => {
    if (++calls === 1) throw new Error('boom')
    return new Blob(['ok'])
  }
  await expect(cachedSpeech('sk', 'stella', '鸭', synth)).rejects.toThrow('boom')
  expect(await (await cachedSpeech('sk', 'stella', '鸭', synth)).text()).toBe('ok')
  expect(calls).toBe(2)
})
