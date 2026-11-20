import { test, expect } from 'vitest'
import { lineText, lineChars, minReadSeconds } from '../src/lib/piece.js'

test('lineText for curated, text and english lines', () => {
  expect(lineText({ chars: [{ c: '鹅', p: 'é' }, { c: '，', p: '' }] })).toBe('鹅，')
  expect(lineText({ text: 'Apple red.' })).toBe('Apple red.')
})

test('lineChars keeps curated pinyin', () => {
  const chars = [{ c: '曲', p: 'qū' }]
  expect(lineChars({ chars })).toBe(chars)
})

test('lineChars generates pinyin for text-only lines', () => {
  expect(lineChars({ text: '白毛浮绿水。' })).toEqual([
    { c: '白', p: 'bái' }, { c: '毛', p: 'máo' }, { c: '浮', p: 'fú' },
    { c: '绿', p: 'lǜ' }, { c: '水', p: 'shuǐ' }, { c: '。', p: '' },
  ])
})

test('minReadSeconds scales with length, at least 3s', () => {
  const short = { lines: [{ chars: [{ c: '鹅', p: 'é' }, { c: '，', p: '' }] }] }
  expect(minReadSeconds(short)).toBe(3)
  const long = { lines: [{ text: '一'.repeat(100) }, { text: 'Good morning, everyone!' }] }
  expect(minReadSeconds(long)).toBe(Math.round((100 + 20) * 0.15))
})
