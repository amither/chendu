import { test, expect } from 'vitest'
import { countChars, estimateTimings, activeIndex } from '../src/lib/highlight.js'

test('countChars ignores punctuation and spaces', () => {
  expect(countChars('鹅，鹅，鹅，曲项向天歌。')).toBe(8)
  expect(countChars('“我是春天。”')).toBe(4)
  expect(countChars('Hi, you!')).toBe(5)
})

test('estimateTimings splits duration by char count after a lead-in', () => {
  const t = estimateTimings([4, 4], 10, 2)
  expect(t).toEqual([{ start: 2, end: 6 }, { start: 6, end: 10 }])
})

test('estimateTimings with no duration returns zero ranges', () => {
  expect(estimateTimings([3], 0)).toEqual([{ start: 0, end: 0 }])
})

test('activeIndex', () => {
  const t = [{ start: 2, end: 6 }, { start: 6, end: 10 }]
  expect(activeIndex(t, 1)).toBe(-1)
  expect(activeIndex(t, 2)).toBe(0)
  expect(activeIndex(t, 6.5)).toBe(1)
  expect(activeIndex(t, 10)).toBe(-1)
})

test('estimateTimings treats non-finite or negative duration as none', () => {
  const zero = [{ start: 0, end: 0 }]
  expect(estimateTimings([3], Infinity)).toEqual(zero)
  expect(estimateTimings([3], NaN)).toEqual(zero)
  expect(estimateTimings([3], -5)).toEqual(zero)
})
