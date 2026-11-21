import { test, expect, beforeEach } from 'vitest'
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { setActivePinia, createPinia } from 'pinia'
import { getDB, resetDB } from '../src/lib/db.js'
import { useAppStore } from '../src/stores/app.js'
import { dateKey } from '../src/lib/streak.js'

const plan = (id, subject, order) => ({
  id, subject, title: id, order,
  weeks: [{ week: 1, days: [
    { day: 1, items: [{ pieceId: 'p1', times: 1 }, { pieceId: 'p2', times: 1 }] },
    { day: 2, items: [{ pieceId: 'p1', times: 1 }] },
  ] }],
})

beforeEach(async () => {
  globalThis.indexedDB = new IDBFactory()
  resetDB()
  setActivePinia(createPinia())
  const db = await getDB()
  await db.put('plans', plan('cn-31', 'cn', 1))
  await db.put('plans', plan('cn-7', 'cn', 0))
  await db.put('plans', plan('en-1', 'en', 1))
})

test('load creates default progress on the first plan of each subject', async () => {
  const s = useAppStore()
  await s.load()
  expect(s.progress.cn).toMatchObject({ planId: 'cn-7', week: 1, day: 1 })
  expect(s.progress.en).toMatchObject({ planId: 'en-1' })
  expect(s.plansFor('cn').map((p) => p.id)).toEqual(['cn-7', 'cn-31'])
  expect(s.settings.pinyin).toBe(true)
})

test('read completes the day, checks in, and persists', async () => {
  const s = useAppStore()
  await s.load()
  expect(await s.read('cn', 0)).toEqual({ dayComplete: false, finished: false })
  expect(await s.read('cn', 1)).toEqual({ dayComplete: true, finished: false })
  const today = dateKey()
  expect(s.checkins[today]).toEqual({ date: today, cn: true, en: false })
  expect(s.stars()).toBe(1)
  expect(s.streakOf('cn')).toBe(1)
  expect(s.progress.cn).toMatchObject({ week: 1, day: 2, done: {} })

  setActivePinia(createPinia())
  const again = useAppStore()
  await again.load()
  expect(again.progress.cn).toMatchObject({ week: 1, day: 2 })
  expect(again.checkins[today].cn).toBe(true)
})

test('setPlan with position, backup round-trip', async () => {
  const s = useAppStore()
  await s.load()
  await s.setPlan('cn', 'cn-31', 1, 2)
  expect(s.progress.cn).toMatchObject({ planId: 'cn-31', week: 1, day: 2 })
  await s.setSetting('pinyin', false)
  const backup = s.exportBackup()
  await s.importBackup({ ...backup, progress: [], checkins: [] })
  expect(s.progress.cn).toMatchObject({ planId: 'cn-7' })
  await s.importBackup(backup)
  expect(s.progress.cn).toMatchObject({ planId: 'cn-31', day: 2 })
  expect(s.settings.pinyin).toBe(false)
})

test('load resets stale progress whose position no longer exists', async () => {
  const db = await getDB()
  await db.put('progress', { subject: 'cn', planId: 'cn-7', week: 9, day: 9, done: {}, finished: false })
  const s = useAppStore()
  await s.load()
  expect(s.progress.cn).toMatchObject({ planId: 'cn-7', week: 1, day: 1 })
})

test('importBackup rejects a malformed backup and leaves data intact', async () => {
  const s = useAppStore()
  await s.load()
  await s.read('cn', 0)
  await s.read('cn', 1)
  const before = s.exportBackup()
  await expect(s.importBackup({ version: 1, progress: [{}], checkins: [] })).rejects.toThrow('备份文件格式不对')
  await expect(s.importBackup({ ...before, checkins: [{ date: 'x' }] })).rejects.toThrow('备份文件格式不对')
  const again = useAppStore()
  await again.load()
  expect(again.exportBackup()).toEqual(before)
})

test('setPlan rejects a position that does not exist', async () => {
  const s = useAppStore()
  await s.load()
  await expect(s.setPlan('cn', 'cn-31', 5, 5)).rejects.toThrow()
  expect(s.progress.cn).toMatchObject({ planId: 'cn-7', week: 1, day: 1 })
})

test('load drops progress whose plan is gone and has no replacement', async () => {
  const db = await getDB()
  await db.delete('plans', 'en-1')
  await db.put('progress', { subject: 'en', planId: 'en-1', week: 1, day: 1, done: {}, finished: false })
  const s = useAppStore()
  await s.load()
  expect(s.progress.en).toBeUndefined()
  expect(await db.get('progress', 'en')).toBeUndefined()
})

test('scoring settings default, backup leaves the key out, restore keeps the local key', async () => {
  const s = useAppStore()
  await s.load()
  expect(s.settings.scoring).toEqual({ key: '', auto: true })
  await s.setSetting('scoring', { key: 'sk-secret', auto: false })
  const backup = s.exportBackup()
  expect(JSON.stringify(backup)).not.toContain('sk-secret')
  expect(backup.settings.scoring.auto).toBe(false)
  await s.importBackup(backup)
  expect(s.settings.scoring).toEqual({ key: 'sk-secret', auto: false })
})

test('tts engine defaults to system; cloudTts needs deepseek engine and a key', async () => {
  const s = useAppStore()
  await s.load()
  expect(s.settings.tts.cn).toMatchObject({ engine: 'system', dsVoice: 'stella' })
  expect(s.cloudTts('cn')).toBeNull()
  await s.setSetting('tts', { ...s.settings.tts, cn: { ...s.settings.tts.cn, engine: 'deepseek' } })
  expect(s.cloudTts('cn')).toBeNull() // no key yet
  await s.setSetting('scoring', { key: 'sk-x', auto: true })
  expect(s.cloudTts('cn')).toEqual({ key: 'sk-x', voice: 'stella', replaceReal: false })
  expect(s.cloudTts('en')).toBeNull()
})

test('cloudTts says whether DeepSeek also replaces real recordings', async () => {
  const s = useAppStore()
  await s.load()
  expect(s.settings.tts.en.preferReal).toBe(true)
  await s.setSetting('scoring', { key: 'sk-x', auto: true })
  await s.setSetting('tts', { ...s.settings.tts, en: { ...s.settings.tts.en, engine: 'deepseek' } })
  expect(s.cloudTts('en')).toEqual({ key: 'sk-x', voice: 'stella', replaceReal: false })
  await s.setSetting('tts', { ...s.settings.tts, en: { ...s.settings.tts.en, preferReal: false } })
  expect(s.cloudTts('en')).toEqual({ key: 'sk-x', voice: 'stella', replaceReal: true })
  // Without DeepSeek selected the real-recording choice doesn't matter.
  await s.setSetting('tts', { ...s.settings.tts, en: { ...s.settings.tts.en, engine: 'system' } })
  expect(s.cloudTts('en')).toBeNull()
})
