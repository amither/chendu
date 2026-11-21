import { test, expect } from 'vitest'
import { dateKey, addDays, markCheckin, streak, starCount } from '../src/lib/streak.js'

test('dateKey uses local date', () => {
  expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
})

test('addDays crosses month and year', () => {
  expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
})

test('markCheckin records each subject on its own', () => {
  const a = markCheckin(undefined, '2026-11-18', 'cn')
  expect(a).toEqual({ date: '2026-11-18', cn: true, en: false })
  expect(markCheckin(a, '2026-11-18', 'en')).toEqual({ date: '2026-11-18', cn: true, en: true })
  expect(markCheckin(a, '2026-11-18', 'cn')).toEqual(a)
})

const c = (date, cn, en) => ({ date, cn, en })
const checkins = Object.fromEntries([
  c('2026-11-14', true, false),
  c('2026-11-15', true, true),
  c('2026-11-16', true, true),
  c('2026-11-17', true, false),
].map((e) => [e.date, e]))

test('streak counts per subject back from yesterday when today not done', () => {
  expect(streak(checkins, 'cn', '2026-11-18')).toBe(4)
  expect(streak(checkins, 'en', '2026-11-18')).toBe(0)
  expect(streak(checkins, 'en', '2026-11-17')).toBe(2)
})

test('streak includes today when done', () => {
  const withToday = { ...checkins, '2026-11-18': c('2026-11-18', true, false) }
  expect(streak(withToday, 'cn', '2026-11-18')).toBe(5)
})

test('starCount: one star per subject finished per day', () => {
  // 14: cn · 15: cn+en · 16: cn+en · 17: cn
  expect(starCount(checkins)).toBe(6)
  expect(starCount({})).toBe(0)
  expect(starCount({ '2026-11-18': { date: '2026-11-18', cn: false, en: true, star: false } })).toBe(1)
})
