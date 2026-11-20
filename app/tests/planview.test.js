import { test, expect } from 'vitest'
import { planOverview } from '../src/lib/planview.js'

const plan = {
  id: 'cn-7',
  weeks: [
    { week: 1, days: [
      { day: 1, items: [{ pieceId: 'a', times: 2 }, { pieceId: 'b', times: 2 }] },
      { day: 2, items: [{ pieceId: 'a', times: 1 }, { pieceId: 'c', times: 2 }] },
    ] },
    { week: 2, days: [{ day: 1, items: [{ pieceId: 'd', times: 2 }] }] },
  ],
}

const progress = (week, day, done = {}, finished = false) =>
  ({ subject: 'cn', planId: 'cn-7', week, day, done, finished })

test('marks days before, at and after the current position', () => {
  const o = planOverview(plan, progress(1, 2, { 0: 1 }))
  expect(o.map((w) => w.status)).toEqual(['current', 'todo'])
  expect(o[0].days.map((d) => d.status)).toEqual(['done', 'current'])
  expect(o[1].days[0].status).toBe('todo')
})

test('items carry new/review and done flags', () => {
  const o = planOverview(plan, progress(1, 2, { 0: 1 }))
  expect(o[0].days[1].items).toEqual([
    { pieceId: 'a', times: 1, isNew: false, done: true },
    { pieceId: 'c', times: 2, isNew: true, done: false },
  ])
  expect(o[0].days[0].items.every((it) => it.done)).toBe(true)
  expect(o[1].days[0].items[0].done).toBe(false)
})

test('a finished plan shows every day done', () => {
  const o = planOverview(plan, progress(2, 1, {}, true))
  expect(o.map((w) => w.status)).toEqual(['done', 'done'])
  expect(o[1].days[0].status).toBe('done')
})

test('a plan that is not the current one is all todo', () => {
  const o = planOverview(plan, { ...progress(2, 1), planId: 'cn-31' })
  expect(o.flatMap((w) => w.days.map((d) => d.status))).toEqual(['todo', 'todo', 'todo'])
})

test('missing progress is all todo', () => {
  expect(planOverview(plan, undefined)[0].status).toBe('todo')
})
