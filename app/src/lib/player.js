import { getDB } from './db.js'
import { countChars, estimateTimings, activeIndex } from './highlight.js'
import { lineText } from './piece.js'
import { pickVoice } from './voices.js'
import { cachedSpeech } from './ttscache.js'
import { encodeWav } from './wav.js'

// Longest wait for a line that DeepSeek is still synthesizing before it is
// read with the system voice instead.
const TTS_WAIT_MS = 15000

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
// opts.cloud(subject): { key, voice } to read lines without real audio with
// DeepSeek speech, or null for the system voice.
// opts.onTtsError(err): called once per prepared piece when synthesis fails.
export function createPlayer(opts = {}) {
  const el = typeof Audio !== 'undefined' ? new Audio() : null
  let token = 0
  let prepSeq = 0
  let finish = null
  let blobUrl = null
  // map: path or tts:<line> → object URL; tts: tts:<line> → Promise of that URL
  // (null on failure) while DeepSeek synthesis is still running.
  let prepared = { piece: null, map: new Map(), tts: new Map() }

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

  // iOS lets a media element play only when play() is first called inside a
  // tap. When the first sound isn't ready audio (system voice, or synthesis
  // still running), play a moment of silence now so later lines may play.
  let silentUrl = null
  function unlock() {
    // speechSynthesis has the same rule: a fallback line spoken after an
    // await stays silent on iOS unless something was spoken in the tap.
    if (typeof SpeechSynthesisUtterance !== 'undefined' && typeof speechSynthesis !== 'undefined') {
      const u = new SpeechSynthesisUtterance(' ')
      u.volume = 0
      speechSynthesis.speak(u)
    }
    if (!el) return
    silentUrl ??= URL.createObjectURL(new Blob([encodeWav(new Float32Array(1600), 16000)], { type: 'audio/wav' }))
    el.src = silentUrl
    el.play()?.catch?.(() => {})
  }

  function revokePrepared() {
    prepared.map.forEach((u) => URL.revokeObjectURL(u))
    prepared = { piece: null, map: new Map(), tts: new Map() }
  }

  function dispose() {
    stop()
    prepSeq++
    revokePrepared()
    if (silentUrl) URL.revokeObjectURL(silentUrl)
    silentUrl = null
  }

  async function blobFor(path) {
    if (!path) return null
    return (await (await getDB()).get('audio', path)) ?? null
  }

  // The piece as it will be read: without its real recordings when the parent
  // chose DeepSeek over them, so every line is synthesized instead.
  function asRead(piece) {
    if (!opts.cloud?.(piece.subject)?.replaceReal) return piece
    return { ...piece, audio: undefined, lines: piece.lines.map(({ audio, ...line }) => line) }
  }

  async function prepare(original) {
    const piece = asRead(original)
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
    prepared = { piece, map, tts: new Map() }
    synthesizeMissing(piece, seq)
  }

  // Synthesizes lines without real audio in the background, three at a time.
  // Each line gets a promise in prepared.tts so play() can wait for a line
  // that isn't ready yet; finished lines also land in prepared.map.
  function synthesizeMissing(piece, seq) {
    const cloud = opts.cloud?.(piece.subject)
    if (!cloud || (piece.subject === 'cn' && piece.audio)) return
    const todo = []
    piece.lines.forEach((line, i) => {
      if (line.audio) return
      let resolve
      prepared.tts.set(`tts:${i}`, new Promise((r) => { resolve = r }))
      todo.push({ i, resolve })
    })
    let reported = false
    const worker = async () => {
      while (todo.length && seq === prepSeq) {
        const { i, resolve } = todo.shift()
        try {
          const blob = await cachedSpeech(cloud.key, cloud.voice, lineText(piece.lines[i]))
          if (seq !== prepSeq) return resolve(null)
          const url = URL.createObjectURL(blob)
          prepared.map.set(`tts:${i}`, url)
          resolve(url)
        } catch (e) {
          resolve(null) // this line falls back to the system voice
          if (seq === prepSeq && !reported) {
            reported = true
            opts.onTtsError?.(e)
          }
        }
      }
    }
    worker(); worker(); worker()
  }

  // A line still being synthesized: wait for it, but not forever.
  function waitTts(name) {
    const p = prepared.tts.get(name)
    if (!p) return null
    return Promise.race([p, new Promise((r) => setTimeout(() => r(null), TTS_WAIT_MS))])
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

  async function play(original, onLine) {
    stop()
    const my = ++token
    const ready = isPrepared(original)
    const piece = ready ? prepared.piece : asRead(original)
    let last = null
    const emit = (i) => {
      if (i !== last) {
        last = i
        onLine(i)
      }
    }
    const lang = piece.subject === 'cn' ? 'zh-CN' : 'en-US'

    const firstPath = piece.subject === 'cn' && piece.audio ? piece.audio : (piece.lines[0]?.audio || 'tts:0')
    if (!ready || !prepared.map.get(firstPath)) unlock()

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
        const name = line.audio || `tts:${i}`
        // The sync lookup keeps a ready first line inside the tap gesture; when
        // a line is still synthesizing, unlock() has already run, so waiting is safe.
        let u = ready ? (prepared.map.get(name) ?? null) : await urlFor(line.audio)
        if (!u && ready && !line.audio && prepared.tts.has(name)) u = await waitTts(name)
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
    const cloud = opts.cloud?.(subject)
    if (cloud) {
      unlock()
      try {
        return await playBlob(await cachedSpeech(cloud.key, cloud.voice, text))
      } catch {
        // fall back to the system voice below
      }
    }
    await speak(text, subject === 'cn' ? 'zh-CN' : 'en-US', subject)
  }

  return { prepare, play, playBlob, stop, dispose, sample }
}
