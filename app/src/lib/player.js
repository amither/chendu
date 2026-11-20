import { getDB } from './db.js'
import { countChars, estimateTimings, activeIndex } from './highlight.js'
import { lineText } from './piece.js'
import { pickVoice } from './voices.js'

// Plays a piece's model reading. onLine(i) is called with the line being
// read (-1 when nothing is), only when the index changes. Chinese uses one
// whole-piece audio with timing estimated from char counts; English plays
// per-line audio; anything without audio (or when autoplay is blocked) falls
// back to speechSynthesis line by line.
//
// iOS Safari only lets a media element play when play() is called inside the
// user gesture, and a new element per line loses that permission. So there is
// one persistent element, and prepare() resolves blob URLs ahead of time so
// play() can call el.play() synchronously.
// opts.tts(): { cn: { voiceURI, rate }, en: { ... } } — the parent's TTS settings.
export function createPlayer(opts = {}) {
  const el = typeof Audio !== 'undefined' ? new Audio() : null
  let token = 0
  let prepSeq = 0
  let finish = null
  let blobUrl = null
  let prepared = { piece: null, map: new Map() }

  function stop() {
    token++
    if (el) {
      el.ontimeupdate = null
      el.onended = null
      el.onerror = null
      el.pause()
      el.removeAttribute('src')
      el.load()
    }
    if (
      typeof speechSynthesis !== 'undefined' &&
      (speechSynthesis.speaking || speechSynthesis.pending)
    ) {
      speechSynthesis.cancel()
    }
    const f = finish
    finish = null
    f?.()
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      blobUrl = null
    }
  }

  function revokePrepared() {
    prepared.map.forEach((u) => URL.revokeObjectURL(u))
    prepared = { piece: null, map: new Map() }
  }

  function dispose() {
    stop()
    prepSeq++
    revokePrepared()
  }

  async function blobFor(path) {
    if (!path) return null
    return (await (await getDB()).get('audio', path)) ?? null
  }

  async function prepare(piece) {
    const seq = ++prepSeq
    const paths = [piece.audio, ...piece.lines.map((l) => l.audio)].filter(Boolean)
    const map = new Map()
    for (const path of new Set(paths)) {
      const blob = await blobFor(path)
      if (blob) map.set(path, URL.createObjectURL(blob))
    }
    if (seq !== prepSeq) {
      map.forEach((u) => URL.revokeObjectURL(u))
      return
    }
    revokePrepared()
    prepared = { piece, map }
  }

  const isPrepared = (piece) =>
    prepared.piece === piece || (piece.id != null && prepared.piece?.id === piece.id)

  // Fallback when the piece was not prepared: resolve through IDB. The URL
  // lives in the prepared map so it is revoked on the next prepare()/dispose().
  async function urlFor(path) {
    if (!path) return null
    if (prepared.map.has(path)) return prepared.map.get(path)
    const blob = await blobFor(path)
    if (!blob) return null
    const u = URL.createObjectURL(blob)
    prepared.map.set(path, u)
    return u
  }

  // Resolves 'ended', 'blocked' (autoplay refused) or 'error'.
  function playUrl(url, onTime) {
    return new Promise((resolve) => {
      if (!el) return resolve('error')
      finish = resolve
      el.ontimeupdate = onTime ? () => onTime(el.currentTime, el.duration) : null
      el.onended = () => resolve('ended')
      el.onerror = () => resolve('error')
      el.src = url
      const p = el.play()
      if (p?.catch) {
        p.catch((e) => resolve(e?.name === 'NotAllowedError' ? 'blocked' : 'error'))
      }
    })
  }

  function speak(text, lang, subject) {
    return new Promise((resolve) => {
      if (typeof SpeechSynthesisUtterance === 'undefined' || typeof speechSynthesis === 'undefined') {
        return resolve()
      }
      let timer = null
      const done = () => {
        clearTimeout(timer)
        resolve()
      }
      finish = done
      timer = setTimeout(done, text.length * 400 + 2000)
      const u = new SpeechSynthesisUtterance(text)
      const tts = opts.tts?.()?.[subject] ?? {}
      const voice = pickVoice(speechSynthesis.getVoices?.() ?? [], subject, tts.voiceURI)
      if (voice) u.voice = voice
      u.lang = voice?.lang ?? lang
      u.rate = tts.rate ?? 0.8
      u.onend = done
      u.onerror = done
      speechSynthesis.speak(u)
    })
  }

  async function play(piece, onLine) {
    stop()
    const my = ++token
    const ready = isPrepared(piece)
    let last = null
    const emit = (i) => {
      if (i !== last) {
        last = i
        onLine(i)
      }
    }
    const lang = piece.subject === 'cn' ? 'zh-CN' : 'en-US'

    let wholeDone = false
    if (piece.subject === 'cn') {
      // `await` always yields a microtask, even for a plain value, which would
      // move el.play() out of the tap gesture on iOS. Only await when not prepared.
      const whole = ready ? (piece.audio ? prepared.map.get(piece.audio) ?? null : null) : await urlFor(piece.audio)
      if (my !== token) return
      if (whole) {
        const counts = piece.lines.map((l) => countChars(lineText(l)))
        const lead = countChars(piece.title + (piece.author ?? ''))
        let timings = null
        const r = await playUrl(whole, (t, d) => {
          if (!timings && Number.isFinite(d) && d > 0) timings = estimateTimings(counts, d, lead)
          if (timings && my === token) emit(activeIndex(timings, t))
        })
        wholeDone = r !== 'blocked'
      }
    }
    if (!wholeDone) {
      for (let i = 0; i < piece.lines.length && my === token; i++) {
        emit(i)
        const line = piece.lines[i]
        const u = ready ? (line.audio ? prepared.map.get(line.audio) ?? null : null) : await urlFor(line.audio)
        if (my !== token) return
        const r = u ? await playUrl(u) : 'none'
        if (my !== token) return
        if (r === 'none' || r === 'blocked') await speak(lineText(line), lang, piece.subject)
      }
    }
    if (my === token) {
      emit(-1)
      stop()
    }
  }

  // Plays a single Blob (a recording). Resolves when done or stopped.
  async function playBlob(blob) {
    stop()
    const my = ++token
    const u = URL.createObjectURL(blob)
    blobUrl = u
    try {
      if (my === token) await playUrl(u)
    } finally {
      URL.revokeObjectURL(u)
      if (blobUrl === u) blobUrl = null
    }
  }

  // Speaks one sample sentence with the current settings (for 试听).
  async function sample(text, subject) {
    stop()
    await speak(text, subject === 'cn' ? 'zh-CN' : 'en-US', subject)
  }

  return { prepare, play, playBlob, stop, dispose, sample }
}
