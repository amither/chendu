import { test, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto' // provides global IDBKeyRange
import { IDBFactory } from 'fake-indexeddb'
import { resetDB } from '../src/lib/db.js'
import {
  saveRecording, listRecordings, deleteRecording, deleteMonth, groupByDate, totalBytes,
} from '../src/lib/recordings.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetDB()
})

const rec = (date, pieceId, size = 10) => ({
  date, subject: 'cn', pieceId, round: 1, durationSec: 5, blob: new Blob([new Uint8Array(size)]),
})

test('save, list newest first, delete', async () => {
  const a = await saveRecording(rec('2026-11-17', 'cn-1'))
  await saveRecording(rec('2026-11-18', 'cn-2'))
  let all = await listRecordings()
  expect(all.map((r) => r.pieceId)).toEqual(['cn-2', 'cn-1'])
  await deleteRecording(a)
  all = await listRecordings()
  expect(all).toHaveLength(1)
})

test('deleteMonth removes only that month', async () => {
  await saveRecording(rec('2026-10-31', 'a'))
  await saveRecording(rec('2026-11-01', 'b'))
  await saveRecording(rec('2026-11-30', 'c'))
  expect(await deleteMonth('2026-11')).toBe(2)
  expect((await listRecordings()).map((r) => r.pieceId)).toEqual(['a'])
})

test('groupByDate and totalBytes', () => {
  const list = [
    { id: 3, date: '2026-11-18', blob: { size: 5 } },
    { id: 2, date: '2026-11-18', blob: { size: 5 } },
    { id: 1, date: '2026-11-17', blob: { size: 10 } },
  ]
  expect(groupByDate(list).map((g) => [g.date, g.items.length])).toEqual([['2026-11-18', 2], ['2026-11-17', 1]])
  expect(totalBytes(list)).toBe(20)
})
