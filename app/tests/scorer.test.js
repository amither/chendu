import { test, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { getDB, resetDB } from '../src/lib/db.js'
import { saveRecording } from '../src/lib/recordings.js'
import { scoreRecording, referenceSeconds } from '../src/lib/scorer.js'
import { ScoringError } from '../src/lib/deepseek.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetDB()
})

const piece = {
  id: 'cn-1', subject: 'cn', title: '鹅', author: '骆宾王', dynasty: '唐代', audio: 'audio/a.mp3',
  lines: [{ chars: ['鹅', '鹅', '鹅', '曲', '项', '向', '天', '歌'].map((c) => ({ c, p: '' })) }],
}

async function seed() {
  const blob = new Blob(['r'], { type: 'audio/mp4' })
  const id = await saveRecording({ date: '2026-11-20', subject: 'cn', pieceId: 'cn-1', round: 1, durationSec: 4, blob })
  return { id, blob, subject: 'cn', pieceId: 'cn-1' }
}

const deps = (over = {}) => ({
  toWav: async () => ({ wav: new Blob(['w']), seconds: 4 }),
  asr: async () => ({ text: '鹅鹅鹅曲项向天哥', durationMs: 4000 }),
  chat: async () => '{"wrong":[],"missed":[6],"extra":0,"comment":"真棒"}',
  referenceSeconds: async () => null,
  ...over,
})

test('scores and saves the result on the recording', async () => {
  const rec = await seed()
  const s = await scoreRecording(rec, piece, 'sk', deps())
  // n=8, missed 1 → acc 7/8; child rate (8+6)/4s = 3.5/s vs default 2/s → r=1.75 → flu = 1-0.15/1.6 = 0.90625
  // score = 100*(0.7 + 0.18125) = 88
  expect(s).toMatchObject({ n: 8, missed: [6], wrong: [], extra: 0, comment: '真棒', score: 88, stars: 2, rate: 3.5, refRate: 2 })
  expect(s.recognized).toBe('鹅鹅鹅曲项向天哥')
  expect((await (await getDB()).get('recordings', rec.id)).score.score).toBe(88)
})

test('reference rate counts title/author/dynasty for chinese', async () => {
  const rec = await seed()
  const s = await scoreRecording(rec, piece, 'sk', deps({ referenceSeconds: async () => 6 }))
  // (8 + 鹅骆宾王唐代 6) / 6s
  expect(s.refRate).toBeCloseTo(14 / 6)
})

test('nothing to score is rejected', async () => {
  const rec = await seed()
  await expect(scoreRecording(rec, { ...piece, lines: [{ chars: [{ c: '，', p: '' }] }] }, 'sk', deps()))
    .rejects.toMatchObject({ kind: 'bad' })
})

test('retries once on unusable model output, then gives up', async () => {
  const rec = await seed()
  let calls = 0
  const flaky = async () => (++calls === 1 ? 'oops' : '{"wrong":[],"missed":[],"extra":0}')
  expect((await scoreRecording(rec, piece, 'sk', deps({ chat: flaky }))).score).toBeGreaterThan(0)
  expect(calls).toBe(2)
  await expect(scoreRecording(rec, piece, 'sk', deps({ chat: async () => 'oops' })))
    .rejects.toMatchObject({ kind: 'bad' })
})

test('short or silent recordings are rejected before calling the model', async () => {
  const rec = await seed()
  let chatCalled = false
  const chat = async () => { chatCalled = true; return '{}' }
  await expect(scoreRecording(rec, piece, 'sk', deps({ toWav: async () => ({ wav: new Blob(), seconds: 0.5 }), chat })))
    .rejects.toMatchObject({ kind: 'short' })
  await expect(scoreRecording(rec, piece, 'sk', deps({ asr: async () => ({ text: '', durationMs: 3000 }), chat })))
    .rejects.toMatchObject({ kind: 'short' })
  expect(chatCalled).toBe(false)
})

test('API errors propagate unchanged', async () => {
  const rec = await seed()
  const asr = async () => { throw new ScoringError('auth', 'HTTP 401') }
  await expect(scoreRecording(rec, piece, 'sk', deps({ asr }))).rejects.toMatchObject({ kind: 'auth' })
  expect((await (await getDB()).get('recordings', rec.id)).score).toBeUndefined()
})

test('referenceSeconds sums model audio durations, null when any is missing', async () => {
  const db = await getDB()
  await db.put('audio', new Blob(['a']), 'audio/a.mp3')
  await db.put('audio', new Blob(['b']), 'audio/b.mp3')
  const measure = async () => 5
  expect(await referenceSeconds(piece, measure)).toBe(5)
  const en = { subject: 'en', lines: [{ audio: 'audio/a.mp3' }, { audio: 'audio/b.mp3' }] }
  expect(await referenceSeconds(en, measure)).toBe(10)
  expect(await referenceSeconds({ subject: 'en', lines: [{ audio: 'audio/x.mp3' }] }, measure)).toBeNull()
  expect(await referenceSeconds({ subject: 'cn', lines: [{ text: '鹅' }] }, measure)).toBeNull()
})
