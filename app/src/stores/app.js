import { defineStore } from 'pinia'
import { ref } from 'vue'
import { getDB } from '../lib/db.js'
import { newProgress, recordRead, dayItems } from '../lib/progress.js'
import { dateKey, markCheckin, streak, starCount } from '../lib/streak.js'

// Reactive proxies can't be structured-cloned into IndexedDB.
const plain = (o) => JSON.parse(JSON.stringify(o))
const SUBJECTS = ['cn', 'en']

export const useAppStore = defineStore('app', () => {
  const plans = ref({})
  const progress = ref({})
  const checkins = ref({})
  const settings = ref({ pinyin: true })
  const loaded = ref(false)
  const pieceCache = new Map()
  const today = ref(dateKey())
  const refreshToday = () => { today.value = dateKey() }
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') refreshToday()
    })
    setInterval(refreshToday, 60_000)
  }

  async function load() {
    const db = await getDB()
    plans.value = Object.fromEntries((await db.getAll('plans')).map((p) => [p.id, p]))
    progress.value = Object.fromEntries((await db.getAll('progress')).map((p) => [p.subject, p]))
    checkins.value = Object.fromEntries((await db.getAll('checkins')).map((c) => [c.date, c]))
    settings.value = { pinyin: true, ...((await db.get('settings', 'app')) ?? {}) }
    pieceCache.clear()
    for (const subject of SUBJECTS) {
      const p = progress.value[subject]
      // Reset when the plan is gone or a re-import changed its weeks so the
      // saved position no longer exists.
      if (!p || !plans.value[p.planId] || !dayItems(plans.value[p.planId], p.week, p.day).length) {
        const first = plansFor(subject)[0]
        if (first) await setPlan(subject, first.id)
        else if (p) {
          delete progress.value[subject]
          await db.delete('progress', subject)
        }
      }
    }
    loaded.value = true
  }

  function plansFor(subject) {
    return Object.values(plans.value)
      .filter((p) => p.subject === subject)
      .sort((a, b) => a.order - b.order)
  }

  async function saveProgress(p) {
    progress.value[p.subject] = p
    await (await getDB()).put('progress', plain(p))
  }

  async function setPlan(subject, planId, week, day) {
    const plan = plans.value[planId]
    if (!plan) throw new Error('找不到这个计划')
    if (week && !dayItems(plan, week, day).length) throw new Error('这个计划没有这一天')
    const p = newProgress(subject, plan)
    if (week) Object.assign(p, { week, day })
    await saveProgress(p)
  }

  function todayItems(subject) {
    const p = progress.value[subject]
    return p ? dayItems(plans.value[p.planId], p.week, p.day) : []
  }

  async function getPiece(id) {
    if (!pieceCache.has(id)) pieceCache.set(id, await (await getDB()).get('pieces', id))
    return pieceCache.get(id)
  }

  async function read(subject, index) {
    const p = progress.value[subject]
    const { progress: next, dayComplete } = recordRead(plain(p), plans.value[p.planId], index)
    await saveProgress(next)
    if (dayComplete) {
      refreshToday()
      const day = today.value
      const entry = markCheckin(checkins.value[day], day, subject)
      checkins.value[day] = entry
      await (await getDB()).put('checkins', plain(entry))
    }
    return { dayComplete, finished: next.finished }
  }

  const streakOf = (subject) => streak(checkins.value, subject, today.value)
  const stars = () => starCount(checkins.value)
  const todayEntry = () => checkins.value[today.value]

  async function setSetting(key, value) {
    settings.value[key] = value
    await (await getDB()).put('settings', plain(settings.value), 'app')
  }

  function exportBackup() {
    return plain({
      version: 1,
      progress: Object.values(progress.value),
      checkins: Object.values(checkins.value),
      settings: settings.value,
    })
  }

  function validBackup(b) {
    const obj = (o) => o && typeof o === 'object' && !Array.isArray(o)
    return (
      b?.version === 1 &&
      Array.isArray(b.progress) &&
      b.progress.every(
        (p) =>
          obj(p) && SUBJECTS.includes(p.subject) && typeof p.planId === 'string' &&
          typeof p.week === 'number' && typeof p.day === 'number' && obj(p.done),
      ) &&
      Array.isArray(b.checkins) &&
      b.checkins.every((c) => obj(c) && typeof c.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(c.date)) &&
      (b.settings === undefined || obj(b.settings))
    )
  }

  async function importBackup(backup) {
    if (!validBackup(backup)) throw new Error('备份文件格式不对')
    const db = await getDB()
    const tx = db.transaction(['progress', 'checkins', 'settings'], 'readwrite')
    tx.done.catch(() => {})
    try {
      const reqs = [tx.objectStore('progress').clear(), tx.objectStore('checkins').clear()]
      for (const p of backup.progress) reqs.push(tx.objectStore('progress').put(p))
      for (const c of backup.checkins) reqs.push(tx.objectStore('checkins').put(c))
      reqs.push(tx.objectStore('settings').put(backup.settings ?? {}, 'app'))
      await Promise.all([...reqs, tx.done])
    } catch (e) {
      try { tx.abort() } catch { /* already finished */ }
      throw e
    }
    await load()
  }

  return {
    plans, progress, checkins, settings, loaded,
    load, plansFor, setPlan, todayItems, getPiece, read, streakOf, stars, todayEntry,
    setSetting, exportBackup, importBackup,
  }
})
