import { test, expect } from 'vitest'
import { dayItems, nextPosition, newProgress, recordRead, dayStatus } from '../src/lib/progress.js'

const plan = {
  id: 'cn-7',
  weeks: [
    { week: 1, days: [
      { day: 1, items: [{ pieceId: 'a', times: 2 }, { pieceId: 'b', times: 1 }] },
      { day: 2, items: [{ pieceId: 'a', times: 1 }] },
    ] },
    { week: 2, days: [{ day: 1, items: [{ pieceId: 'c', times: 1 }] }] },
  ],
}

test('newProgress starts at first day', () => {
  expect(newProgress('cn', plan)).toEqual({ subject: 'cn', planId: 'cn-7', week: 1, day: 1, done: {}, finished: false })
})

test('dayItems', () => {
  expect(dayItems(plan, 1, 2)).toEqual([{ pieceId: 'a', times: 1 }])
  expect(dayItems(plan, 9, 9)).toEqual([])
})

test('nextPosition within week, across weeks, at end', () => {
  expect(nextPosition(plan, 1, 1)).toEqual({ week: 1, day: 2 })
  expect(nextPosition(plan, 1, 2)).toEqual({ week: 2, day: 1 })
  expect(nextPosition(plan, 2, 1)).toBeNull()
})

test('recordRead counts reads and caps at times', () => {
  let p = newProgress('cn', plan)
  let r = recordRead(p, plan, 0)
  expect(r).toEqual({ progress: { ...p, done: { 0: 1 } }, dayComplete: false })
  r = recordRead(r.progress, plan, 0)
  r = recordRead(r.progress, plan, 0)
  expect(r.progress.done[0]).toBe(2)
  expect(r.dayComplete).toBe(false)
})

test('completing the day advances and resets done', () => {
  let p = newProgress('cn', plan)
  p = recordRead(p, plan, 0).progress
  p = recordRead(p, plan, 0).progress
  const r = recordRead(p, plan, 1)
  expect(r.dayComplete).toBe(true)
  expect(r.progress).toMatchObject({ week: 1, day: 2, done: {}, finished: false })
})

test('completing the last day marks finished', () => {
  const p = { ...newProgress('cn', plan), week: 2, day: 1 }
  const r = recordRead(p, plan, 0)
  expect(r.dayComplete).toBe(true)
  expect(r.progress).toMatchObject({ week: 2, day: 1, finished: true })
})

test('reads after finished are ignored', () => {
  const p = { ...newProgress('cn', plan), week: 2, day: 1, finished: true }
  expect(recordRead(p, plan, 0)).toEqual({ progress: p, dayComplete: false })
})

test('dayStatus counts completed items', () => {
  const p = { ...newProgress('cn', plan), done: { 0: 2 } }
  expect(dayStatus(p, plan)).toEqual({ total: 2, completed: 1 })
})

test('nextPosition returns null for unknown week or day', () => {
  expect(nextPosition(plan, 9, 1)).toBeNull()
  expect(nextPosition(plan, 1, 9)).toBeNull()
})
