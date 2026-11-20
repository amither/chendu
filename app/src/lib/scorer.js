import { getDB } from './db.js'
import { countChars } from './highlight.js'
import { tokensFor, buildMessages, parseResult, referenceRate, computeScore } from './scoring.js'
import { transcribe, chatJSON, ScoringError } from './deepseek.js'
import { blobToWav } from './wav.js'
import { saveScore } from './recordings.js'

// Browser only: duration of an audio Blob in seconds, or null.
export function mediaSeconds(blob) {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob)
    const a = new Audio()
    let settled = false
    const done = (v) => {
      if (settled) return
      settled = true
      URL.revokeObjectURL(url)
      resolve(v)
    }
    a.preload = 'metadata'
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? a.duration : null)
    a.onerror = () => done(null)
    setTimeout(() => done(null), 5000)
    a.src = url
  })
}

// Length of the model reading: the whole-piece audio for Chinese, the sum of
// line audio for English; null when there is no real audio.
export async function referenceSeconds(piece, measure = mediaSeconds) {
  const paths = piece.subject === 'cn' ? [piece.audio] : piece.lines.map((l) => l.audio)
  if (!paths.length || paths.some((p) => !p)) return null
  const db = await getDB()
  let total = 0
  for (const p of paths) {
    const blob = await db.get('audio', p)
    const s = blob ? await measure(blob) : null
    if (!s) return null
    total += s
  }
  return total
}

export async function scoreRecording(rec, piece, key, deps = {}) {
  const {
    toWav = blobToWav, asr = transcribe, chat = chatJSON, referenceSeconds: refSecs = referenceSeconds,
  } = deps
  const { wav, seconds } = await toWav(rec.blob)
  if (!(seconds >= 1)) throw new ScoringError('short', '录音太短')
  const tokens = tokensFor(piece)
  if (!tokens.length) throw new ScoringError('bad', '没有可打分的内容')
  const { text, durationMs } = await asr(key, wav)
  if (!text) throw new ScoringError('short', '没有识别到声音')

  const messages = buildMessages(piece, tokens, text)
  let result
  for (let attempt = 0; !result; attempt++) {
    try {
      result = parseResult(await chat(key, messages), tokens.length)
    } catch (e) {
      if (e instanceof ScoringError) throw e
      if (attempt >= 1) throw new ScoringError('bad', e.message)
    }
  }

  const n = tokens.length
  const lead = piece.subject === 'cn' ? countChars(`${piece.title}${piece.author ?? ''}${piece.dynasty ?? ''}`) : 0
  const rate = (n + lead) / ((durationMs || seconds * 1000) / 1000)
  const refRate = referenceRate(piece.subject, n + lead, await refSecs(piece))
  const score = {
    ...result,
    ...computeScore({ n, ...result, rate, refRate }),
    n, recognized: text, rate, refRate, scoredAt: Date.now(),
  }
  await saveScore(rec.id, score)
  return score
}
