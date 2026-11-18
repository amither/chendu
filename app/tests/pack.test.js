import { test, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { zipSync, strToU8 } from 'fflate'
import { getDB, resetDB } from '../src/lib/db.js'
import { validatePack, importPack } from '../src/lib/pack.js'

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory()
  resetDB()
})

const manifest = { id: 'g1', version: 1, title: 't', plans: ['cn-7'] }
const plan = { id: 'cn-7', subject: 'cn', title: '一年级上', order: 0,
  weeks: [{ week: 1, days: [{ day: 1, items: [{ pieceId: 'cn-1', times: 2 }] }] }] }
const piece = { id: 'cn-1', subject: 'cn', title: '咏鹅', lines: [{ chars: [{ c: '鹅', p: 'é' }] }], audio: 'audio/a.mp3' }

function zip(files) {
  const entries = {}
  for (const [name, v] of Object.entries(files)) {
    entries[name] = typeof v === 'string' ? strToU8(v) : [v, { level: 0 }]
  }
  return new Blob([zipSync(entries)])
}

const good = () => zip({
  'manifest.json': JSON.stringify(manifest),
  'plans/cn-7.json': JSON.stringify(plan),
  'pieces/cn-1.json': JSON.stringify(piece),
  'audio/a.mp3': new Uint8Array(1000).fill(1),
})

test('validatePack accepts a consistent pack', () => {
  expect(() => validatePack(manifest, { 'cn-7': plan }, { 'cn-1': piece }, new Set(['audio/a.mp3']))).not.toThrow()
})

test('validatePack rejects missing piece and missing audio', () => {
  expect(() => validatePack(manifest, { 'cn-7': plan }, {}, new Set(['audio/a.mp3']))).toThrow(/cn-1/)
  expect(() => validatePack(manifest, { 'cn-7': plan }, { 'cn-1': piece }, new Set())).toThrow(/audio\/a.mp3/)
  expect(() => validatePack({ id: 'x' }, {}, {}, new Set())).toThrow(/manifest/)
})

test('importPack writes everything', async () => {
  const statuses = []
  const m = await importPack(good(), (s) => statuses.push(s))
  expect(m.id).toBe('g1')
  const db = await getDB()
  expect(await db.get('plans', 'cn-7')).toEqual(plan)
  expect(await db.get('pieces', 'cn-1')).toEqual(piece)
  const blob = await db.get('audio', 'audio/a.mp3')
  expect(blob.size).toBe(1000)
  expect(blob.type).toBe('audio/mpeg')
  expect(await db.get('packs', 'g1')).toEqual(manifest)
  expect(statuses.length).toBeGreaterThan(0)
})

test('importPack rolls back audio on invalid pack', async () => {
  const bad = zip({
    'manifest.json': JSON.stringify(manifest),
    'plans/cn-7.json': JSON.stringify(plan),
    'audio/a.mp3': new Uint8Array(10),
  })
  await expect(importPack(bad)).rejects.toThrow(/cn-1/)
  const db = await getDB()
  expect(await db.count('audio')).toBe(0)
  expect(await db.count('plans')).toBe(0)
})

test('re-import keeps progress', async () => {
  await importPack(good())
  const db = await getDB()
  await db.put('progress', { subject: 'cn', planId: 'cn-7', week: 1, day: 1, done: { 0: 1 }, finished: false })
  await importPack(good())
  expect((await db.get('progress', 'cn')).done).toEqual({ 0: 1 })
})

test('failed re-import leaves earlier good audio intact', async () => {
  await importPack(good())
  const db = await getDB()
  const bad = zip({
    'manifest.json': JSON.stringify(manifest),
    'plans/cn-7.json': JSON.stringify(plan),
    'audio/a.mp3': new Uint8Array(10),
  })
  await expect(importPack(bad)).rejects.toThrow(/cn-1/)
  expect(await db.count('audio')).toBe(1)
  expect((await db.get('audio', 'audio/a.mp3')).size).toBe(1000)
})

test('rollback after audio write failure keeps pre-existing audio and rethrows original', async () => {
  await importPack(good())
  const db = await getDB()
  const m2 = { ...manifest, id: 'g2' }
  const p2 = { ...piece, id: 'cn-2', audio: 'audio/b.mp3' }
  const plan2 = { ...plan, id: 'cn-8', weeks: [{ week: 1, days: [{ day: 1, items: [{ pieceId: 'cn-2', times: 1 }] }] }] }
  const pack = zip({
    'manifest.json': JSON.stringify({ ...m2, plans: ['cn-8'] }),
    'plans/cn-8.json': JSON.stringify(plan2),
    'pieces/cn-2.json': JSON.stringify({ ...p2, audio: 'audio/a.mp3', lines: [{ audio: 'audio/b.mp3' }] }),
    'audio/a.mp3': new Uint8Array(1000).fill(1),
    'audio/b.mp3': new Uint8Array(5),
  })
  const origPut = db.put.bind(db)
  const spy = (store, v, k) => {
    if (k === 'audio/b.mp3') throw new Error('quota')
    return origPut(store, v, k)
  }
  const real = await getDB()
  real.put = spy
  await expect(importPack(pack)).rejects.toThrow('quota')
  expect(await real.getKey('audio', 'audio/a.mp3')).toBe('audio/a.mp3')
  expect(await real.getKey('audio', 'audio/b.mp3')).toBeUndefined()
})

test('ignores __MACOSX and dotfile entries', async () => {
  const p = zip({
    '__MACOSX/._manifest.json': 'garbage',
    'plans/.hidden.json': 'garbage',
    'manifest.json': JSON.stringify(manifest),
    'plans/cn-7.json': JSON.stringify(plan),
    'pieces/cn-1.json': JSON.stringify(piece),
    'audio/a.mp3': new Uint8Array(10).fill(1),
    'audio/.DS_Store': new Uint8Array(3),
  })
  await importPack(p)
  const db = await getDB()
  expect(await db.count('audio')).toBe(1)
})

test('validation failure writes zero audio', async () => {
  const bad = zip({
    'manifest.json': JSON.stringify(manifest),
    'plans/cn-7.json': JSON.stringify(plan),
    'audio/a.mp3': new Uint8Array(10),
  })
  const db = await getDB()
  let puts = 0
  const orig = db.put.bind(db)
  db.put = (...a) => { puts++; return orig(...a) }
  await expect(importPack(bad)).rejects.toThrow(/cn-1/)
  expect(puts).toBe(0)
})

test('a corrupted deflated entry rejects instead of hanging', async () => {
  const bytes = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest).repeat(50)) })
  // Corrupt the middle of the compressed data (after the 30+name header).
  for (let i = 45; i < bytes.length - 80; i++) bytes[i] = 0xff
  await expect(importPack(new Blob([bytes]))).rejects.toThrow()
}, 5000)
