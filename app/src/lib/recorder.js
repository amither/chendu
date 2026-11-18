export function recorderSupported() {
  return typeof MediaRecorder !== 'undefined' && !!navigator.mediaDevices?.getUserMedia
}

// Resolves to a handle whose stop() resolves to { blob, durationSec }.
// Rejects (NotAllowedError) if the microphone permission is denied.
export async function startRecording() {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
  const mimeType = ['audio/mp4', 'audio/webm'].find((t) => MediaRecorder.isTypeSupported(t))
  let rec
  try {
    rec = new MediaRecorder(stream, mimeType ? { mimeType } : undefined)
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    throw e
  }
  const chunks = []
  const started = Date.now()
  rec.ondataavailable = (e) => e.data.size && chunks.push(e.data)
  rec.start()
  const finish = (resolve) => {
    stream.getTracks().forEach((t) => t.stop())
    resolve({
      blob: new Blob(chunks, { type: rec.mimeType }),
      durationSec: Math.max(1, Math.round((Date.now() - started) / 1000)),
    })
  }
  return {
    stop: () =>
      new Promise((resolve) => {
        if (rec.state === 'inactive') return finish(resolve)
        rec.onstop = () => finish(resolve)
        rec.stop()
      }),
  }
}
