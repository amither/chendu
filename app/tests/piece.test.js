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

test('minReadSeconds: chinese by characters, at least 3s', () => {
  const short = { subject: 'cn', lines: [{ chars: [{ c: '鹅', p: 'é' }, { c: '，', p: '' }] }] }
  expect(minReadSeconds(short)).toBe(3)
  const long = { subject: 'cn', lines: [{ text: '一'.repeat(100) + '，' }] }
  expect(minReadSeconds(long)).toBe(15)
})

test('minReadSeconds: english by words, well under a model reading', () => {
  // 48 words; the model recording of this piece is about 18s.
  const text = Array.from({ length: 48 }, (_, i) => (i % 8 === 7 ? "it's." : 'see')).join(' ')
  const en = { subject: 'en', lines: [{ text }] }
  expect(minReadSeconds(en)).toBe(Math.round(48 * 0.3))
  expect(minReadSeconds({ subject: 'en', lines: [{ text: 'Hi, Tom!' }] })).toBe(3)
})
