import 'fake-indexeddb/auto'
import { test, expect, beforeEach } from 'vitest'
import { IDBFactory } from 'fake-indexeddb'
import { getDB, resetDB } from '../src/lib/db.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetDB()
})

test('creates all stores', async () => {
  const db = await getDB()
  expect([...db.objectStoreNames].sort()).toEqual(
    ['audio', 'checkins', 'packs', 'pieces', 'plans', 'progress', 'recordings', 'settings'],
  )
})

test('recordings auto-increment and date index', async () => {
  const db = await getDB()
  const id = await db.add('recordings', { date: '2026-11-18', pieceId: 'cn-1' })
  expect(id).toBe(1)
  expect(await db.getAllFromIndex('recordings', 'date', '2026-11-18')).toHaveLength(1)
})
