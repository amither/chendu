// Recordings (audio/mp4 on iPad) → 16 kHz mono 16-bit WAV for speech recognition.

export function mixdown(channels) {
  if (channels.length === 1) return channels[0]
  const out = new Float32Array(channels[0].length)
  for (const ch of channels) for (let i = 0; i < out.length; i++) out[i] += ch[i] / channels.length
  return out
}

// Averages the source samples behind each output sample (a crude low-pass,
// good enough for speech).
export function resample(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples
  const ratio = fromRate / toRate
  const out = new Float32Array(Math.floor(samples.length / ratio))
  for (let i = 0; i < out.length; i++) {
    const start = Math.floor(i * ratio)
    const end = Math.min(samples.length, Math.max(start + 1, Math.floor((i + 1) * ratio)))
    let sum = 0
    for (let j = start; j < end; j++) sum += samples[j]
    out[i] = sum / (end - start)
  }
  return out
}

export function encodeWav(samples, rate) {
  const buf = new ArrayBuffer(44 + samples.length * 2)
  const v = new DataView(buf)
  const str = (o, s) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)))
  str(0, 'RIFF')
  v.setUint32(4, 36 + samples.length * 2, true)
  str(8, 'WAVEfmt ')
  v.setUint32(16, 16, true)
  v.setUint16(20, 1, true)
  v.setUint16(22, 1, true)
  v.setUint32(24, rate, true)
  v.setUint32(28, rate * 2, true)
  v.setUint16(32, 2, true)
  v.setUint16(34, 16, true)
  str(36, 'data')
  v.setUint32(40, samples.length * 2, true)
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]))
    v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true)
  }
  return buf
}

// Browser only. Resolves { wav: Blob, seconds }.
export async function blobToWav(blob, rate = 16000) {
  // An offline context decodes without touching the audio hardware or session.
  const Ctx = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext
  const ctx = new Ctx(1, 1, rate)
  const audio = await ctx.decodeAudioData(await blob.arrayBuffer())
  const channels = Array.from({ length: audio.numberOfChannels }, (_, i) => audio.getChannelData(i))
  const samples = resample(mixdown(channels), audio.sampleRate, rate)
  return { wav: new Blob([encodeWav(samples, rate)], { type: 'audio/wav' }), seconds: audio.duration }
}

// DeepSeek streams WAV with 0xFFFFFFFF in the RIFF and data sizes; fill in
// the real sizes so every player (Safari included) accepts the file.
export function fixWavHeader(buf) {
  const v = new DataView(buf)
  const id = (o) => String.fromCharCode(v.getUint8(o), v.getUint8(o + 1), v.getUint8(o + 2), v.getUint8(o + 3))
  if (buf.byteLength < 12 || id(0) !== 'RIFF' || id(8) !== 'WAVE') return buf
  v.setUint32(4, buf.byteLength - 8, true)
  for (let o = 12; o + 8 <= buf.byteLength; o += 8 + v.getUint32(o + 4, true)) {
    if (id(o) === 'data') {
      v.setUint32(o + 4, buf.byteLength - o - 8, true)
      break
    }
  }
  return buf
}
