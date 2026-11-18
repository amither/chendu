import { Unzip, UnzipInflate, UnzipPassThrough } from 'fflate'
import { getDB } from './db.js'

const JSON_RE = /^(manifest\.json|plans\/[^/]+\.json|pieces\/[^/]+\.json)$/

function ignored(name) {
  return name.split('/').some((seg) => seg === '__MACOSX' || seg.startsWith('.'))
}

// Streams a zip Blob, calling `onEntry(name, Blob)` one file at a time so a
// few-hundred-MB pack never sits in memory at once. `wanted(name)` lets the
// caller skip entries cheaply (their data is dropped, not buffered).
async function readZip(blob, wanted, onEntry) {
  const queue = []
  let zipError = null
  const unzip = new Unzip((file) => {
    if (file.name.endsWith('/') || ignored(file.name)) return
    const keep = wanted(file.name)
    const chunks = []
    file.ondata = (err, chunk, final) => {
      if (err) { zipError ??= err; return }
      if (keep) chunks.push(chunk)
      if (final) queue.push({ name: file.name, data: keep ? new Blob(chunks) : null })
    }
    file.start()
  })
  unzip.register(UnzipInflate)
  unzip.register(UnzipPassThrough)
  const reader = blob.stream().getReader()
  let finished = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      unzip.push(done ? new Uint8Array(0) : value, done)
      if (zipError) throw zipError
      while (queue.length) {
        const e = queue.shift()
        await onEntry(e.name, e.data)
      }
      if (done) {
        if (zipError) throw zipError
        finished = true
        return
      }
    }
  } finally {
    if (!finished) reader.cancel().catch(() => {})
  }
}

export function validatePack(manifest, plans, pieces, audioPaths) {
  if (!manifest?.id || !Array.isArray(manifest.plans)) throw new Error('manifest.json 缺失或格式错误')
  for (const planId of manifest.plans) {
    const plan = plans[planId]
    if (!plan) throw new Error(`缺少计划 ${planId}`)
    if (!['cn', 'en'].includes(plan.subject) || !plan.weeks?.length) throw new Error(`计划 ${planId} 格式错误`)
    for (const w of plan.weeks)
      for (const d of w.days)
        for (const it of d.items) {
          if (!pieces[it.pieceId]) throw new Error(`计划 ${planId} 引用了不存在的篇目 ${it.pieceId}`)
          if (!(it.times >= 1)) throw new Error(`计划 ${planId} 的遍数错误`)
        }
  }
  for (const piece of Object.values(pieces)) {
    const paths = [piece.audio, ...piece.lines.map((l) => l.audio)].filter(Boolean)
    for (const p of paths) if (!audioPaths.has(p)) throw new Error(`篇目 ${piece.id} 缺少音频 ${p}`)
  }
}

export async function importPack(file, onStatus = () => {}) {
  try { navigator.storage?.persist?.()?.catch?.(() => {}) } catch { /* best effort */ }
  const db = await getDB()
  const json = {}
  const audioNames = []
  const written = [] // only keys that did not exist before this import
  try {
    onStatus('读取中…')
    await readZip(
      file,
      (name) => JSON_RE.test(name),
      async (name, data) => {
        if (data) json[name] = JSON.parse(await data.text())
        else if (name.startsWith('audio/')) audioNames.push(name)
      },
    )
    const pick = (prefix) =>
      Object.fromEntries(Object.entries(json).filter(([n]) => n.startsWith(prefix)).map(([, v]) => [v.id, v]))
    const manifest = json['manifest.json']
    const plans = pick('plans/')
    const pieces = pick('pieces/')
    validatePack(manifest, plans, pieces, new Set(audioNames))

    let n = 0
    await readZip(file, (name) => name.startsWith('audio/'), async (name, data) => {
      if (!data) return
      const existed = (await db.getKey('audio', name)) !== undefined
      if (!existed) written.push(name)
      await db.put('audio', new Blob([data], { type: 'audio/mpeg' }), name)
      onStatus(`写入音频 ${++n} 个`)
    })
    onStatus('保存篇目…')
    const tx = db.transaction(['packs', 'plans', 'pieces'], 'readwrite')
    tx.objectStore('packs').put(manifest)
    for (const p of Object.values(plans)) tx.objectStore('plans').put(p)
    for (const p of Object.values(pieces)) tx.objectStore('pieces').put(p)
    await tx.done
    onStatus('完成')
    return manifest
  } catch (e) {
    try {
      const tx = db.transaction('audio', 'readwrite')
      for (const name of written) tx.store.delete(name)
      await tx.done
    } catch { /* never mask the original error */ }
    throw e
  }
}
