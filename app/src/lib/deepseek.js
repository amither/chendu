import { fixWavHeader } from './wav.js'

const BASE = 'https://api.deepseek.com'

// kind: auth | balance | server | network | timeout | bad (unusable model
// output) | short (nothing to score)
export class ScoringError extends Error {
  constructor(kind, message) {
    super(message)
    this.kind = kind
  }
}

async function call(url, init, { fetchImpl = globalThis.fetch, timeoutMs, as = 'json' }) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    let res
    try {
      res = await fetchImpl(url, { ...init, signal: ctrl.signal })
    } catch (e) {
      throw new ScoringError(ctrl.signal.aborted ? 'timeout' : 'network', e.message)
    }
    if (res.status === 401 || res.status === 403) throw new ScoringError('auth', `HTTP ${res.status}`)
    if (res.status === 402) throw new ScoringError('balance', 'HTTP 402')
    if (!res.ok) throw new ScoringError('server', `HTTP ${res.status}`)
    try {
      return await (as === 'arrayBuffer' ? res.arrayBuffer() : res.json())
    } catch {
      throw new ScoringError(ctrl.signal.aborted ? 'timeout' : 'server', as === 'arrayBuffer' ? '返回内容读取失败' : '返回内容不是 JSON')
    }
  } finally {
    clearTimeout(timer)
  }
}

export async function transcribe(key, wav, opts = {}) {
  const form = new FormData()
  form.append('file', wav, 'reading.wav')
  const j = await call(`${BASE}/v1/tools/asr`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}` },
    body: form,
  }, { timeoutMs: 30000, ...opts })
  return { text: (j.text ?? '').trim(), durationMs: j.duration_ms ?? 0 }
}

export async function chatJSON(key, messages, opts = {}) {
  const j = await call(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ model: 'deepseek-reasoner', response_format: { type: 'json_object' }, messages }),
  }, { timeoutMs: 90000, ...opts })
  return j.choices?.[0]?.message?.content ?? ''
}

export async function synthesize(key, text, voice = 'stella', opts = {}) {
  const buf = await call(`${BASE}/v1/tools/tts`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ text, voice_id: voice, format: 'wav' }),
  }, { timeoutMs: 30000, as: 'arrayBuffer', ...opts })
  return new Blob([fixWavHeader(buf)], { type: 'audio/wav' })
}

export function messageFor(err) {
  switch (err?.kind) {
    case 'auth': return '打分密钥不对，请家长在设置里检查'
    case 'balance': return 'DeepSeek 账户余额不足，请家长充值'
    case 'short': return '没听清，再读一遍试试'
    default: return '这次没打成分，可以在录音管理里重新打分'
  }
}

export function ttsMessage(err) {
  const why = {
    auth: '密钥不对',
    balance: '账户余额不足',
    timeout: '网络太慢',
    network: '网络连不上',
  }[err?.kind] ?? '服务出错'
  const fix = err?.kind === 'auth' ? '请家长在设置里检查密钥。' : err?.kind === 'balance' ? '请家长充值。' : ''
  return `DeepSeek 朗读失败：${why}，这次用 iPad 语音朗读。${fix}`
}
