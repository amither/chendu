import { getDB } from './db.js'

export async function saveRecording(rec) {
  return (await getDB()).add('recordings', rec)
}

export async function listRecordings() {
  return (await (await getDB()).getAll('recordings')).sort((a, b) => b.id - a.id)
}

export async function deleteRecording(id) {
  await (await getDB()).delete('recordings', id)
}

// month: 'YYYY-MM'. Returns how many recordings were deleted.
export async function deleteMonth(month) {
  const db = await getDB()
  const range = IDBKeyRange.bound(`${month}-01`, `${month}-31`)
  const keys = await db.getAllKeysFromIndex('recordings', 'date', range)
  const tx = db.transaction('recordings', 'readwrite')
  for (const k of keys) tx.store.delete(k)
  await tx.done
  return keys.length
}

export function groupByDate(list) {
  const groups = []
  for (const r of list) {
    const last = groups.at(-1)
    if (last?.date === r.date) last.items.push(r)
    else groups.push({ date: r.date, items: [r] })
  }
  return groups
}

export function totalBytes(list) {
  return list.reduce((sum, r) => sum + r.blob.size, 0)
}
