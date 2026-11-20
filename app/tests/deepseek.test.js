import { test, expect } from 'vitest'
import { transcribe, chatJSON, synthesize, ScoringError, messageFor, ttsMessage } from '../src/lib/deepseek.js'

const ok = (body) => async () => new Response(JSON.stringify(body), { status: 200 })
const status = (code) => async () => new Response('{}', { status: code })

test('transcribe posts the wav as multipart with the key', async () => {
  let seen
  const fetchImpl = async (url, init) => {
    seen = { url, init }
    return new Response(JSON.stringify({ text: ' 鹅鹅鹅 ', duration_ms: 2300 }))
  }
  const r = await transcribe('sk-x', new Blob(['w'], { type: 'audio/wav' }), { fetchImpl })
  expect(r).toEqual({ text: '鹅鹅鹅', durationMs: 2300 })
  expect(seen.url).toBe('https://api.deepseek.com/v1/tools/asr')
  expect(seen.init.headers.Authorization).toBe('Bearer sk-x')
  expect(seen.init.body.get('file')).toBeInstanceOf(Blob)
})

test('chatJSON uses deepseek-reasoner with json output and returns the content', async () => {
  let body
  const fetchImpl = async (_url, init) => {
    body = JSON.parse(init.body)
    return new Response(JSON.stringify({ choices: [{ message: { content: '{"a":1}' } }] }))
  }
  expect(await chatJSON('sk-x', [{ role: 'user', content: 'hi' }], { fetchImpl })).toBe('{"a":1}')
  expect(body.model).toBe('deepseek-reasoner')
  expect(body.response_format).toEqual({ type: 'json_object' })
})

test('errors are classified', async () => {
  const kind = (p) => p.then(() => 'ok', (e) => e instanceof ScoringError && e.kind)
  const wav = new Blob(['w'])
  expect(await kind(transcribe('k', wav, { fetchImpl: status(401) }))).toBe('auth')
  expect(await kind(transcribe('k', wav, { fetchImpl: status(402) }))).toBe('balance')
  expect(await kind(transcribe('k', wav, { fetchImpl: status(500) }))).toBe('server')
  expect(await kind(transcribe('k', wav, { fetchImpl: async () => { throw new TypeError('x') } }))).toBe('network')
  const hang = (_u, init) => new Promise((_, rej) => init.signal.addEventListener('abort', () => rej(new Error('aborted'))))
  expect(await kind(transcribe('k', wav, { fetchImpl: hang, timeoutMs: 10 }))).toBe('timeout')
  expect(await kind(chatJSON('k', [], { fetchImpl: ok({ text: 'x' }) }))).toBe('ok')
})

test('messageFor gives parent/child friendly text', () => {
  expect(messageFor(new ScoringError('auth', ''))).toContain('密钥')
  expect(messageFor(new ScoringError('balance', ''))).toContain('余额')
  expect(messageFor(new ScoringError('short', ''))).toContain('再读一遍')
  expect(messageFor(new Error('boom'))).toContain('重新打分')
})

test('a 200 response that is not JSON is a server error', async () => {
  const fetchImpl = async () => new Response('<html>', { status: 200 })
  await expect(transcribe('k', new Blob(['w']), { fetchImpl })).rejects.toMatchObject({ kind: 'server' })
})

test('synthesize posts text and voice and returns a fixed WAV blob', async () => {
  let body
  const wav = new Uint8Array(46)
  wav.set([...'RIFF'].map((c) => c.charCodeAt(0)), 0)
  new DataView(wav.buffer).setUint32(4, 0xffffffff, true)
  wav.set([...'WAVEfmt '].map((c) => c.charCodeAt(0)), 8)
  new DataView(wav.buffer).setUint32(16, 0, true) // empty fmt chunk keeps the test small
  wav.set([...'data'].map((c) => c.charCodeAt(0)), 20)
  new DataView(wav.buffer).setUint32(24, 0xffffffff, true)
  const fetchImpl = async (url, init) => {
    body = { url, auth: init.headers.Authorization, json: JSON.parse(init.body) }
    return new Response(wav.slice(0, 30), { status: 200, headers: { 'content-type': 'audio/wav' } })
  }
  const blob = await synthesize('sk-x', '鹅鹅鹅', 'tide', { fetchImpl })
  expect(body).toEqual({
    url: 'https://api.deepseek.com/v1/tools/tts', auth: 'Bearer sk-x',
    json: { text: '鹅鹅鹅', voice_id: 'tide', format: 'wav' },
  })
  expect(blob.type).toBe('audio/wav')
  const v = new DataView(await blob.arrayBuffer())
  expect(v.getUint32(4, true)).toBe(22)
  expect(v.getUint32(24, true)).toBe(2)
})

test('synthesize classifies errors', async () => {
  const r = await synthesize('k', 'x', 'stella', { fetchImpl: async () => new Response('{}', { status: 401 }) })
    .catch((e) => e.kind)
  expect(r).toBe('auth')
})

test('ttsMessage tells the parent why DeepSeek reading fell back', () => {
  expect(ttsMessage(new ScoringError('auth', ''))).toBe('DeepSeek 朗读失败：密钥不对，这次用 iPad 语音朗读。请家长在设置里检查密钥。')
  expect(ttsMessage(new ScoringError('balance', ''))).toContain('余额不足')
  expect(ttsMessage(new ScoringError('timeout', ''))).toContain('网络')
  expect(ttsMessage(new Error('x'))).toContain('iPad 语音')
})
