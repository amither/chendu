import { test, expect } from 'vitest'
import {
  toneless, tokensFor, splitEnLine, buildMessages, parseResult,
  referenceRate, computeScore, starsFor, marksFor,
} from '../src/lib/scoring.js'

const cn = {
  id: 'cn-1172', subject: 'cn', title: '咏鹅', author: '骆宾王', dynasty: '唐代',
  lines: [
    { chars: [{ c: '鹅', p: 'é' }, { c: '，', p: '' }, { c: '曲', p: 'qū' }, { c: '绿', p: 'lǜ' }, { c: '。', p: '' }] },
    { text: '白毛' },
  ],
}
const en = {
  id: 'en-1', subject: 'en', title: 'Apple',
  lines: [{ text: "Apple round,\napple red." }, { text: "I don't know." }],
}

test('toneless strips tones and writes ü as v', () => {
  expect(toneless('qū')).toBe('qu')
  expect(toneless('lǜ')).toBe('lv')
  expect(toneless('lü')).toBe('lv')
  expect(toneless('É')).toBe('e')
})

test('tokensFor chinese: han chars only, with toneless pinyin and line/col', () => {
  expect(tokensFor(cn)).toEqual([
    { text: '鹅', py: 'e', line: 0, col: 0 },
    { text: '曲', py: 'qu', line: 0, col: 2 },
    { text: '绿', py: 'lv', line: 0, col: 3 },
    { text: '白', py: 'bai', line: 1, col: 0 },
    { text: '毛', py: 'mao', line: 1, col: 1 },
  ])
})

test('tokensFor english: words with per-line word index', () => {
  expect(tokensFor(en).map((t) => [t.text, t.line, t.col])).toEqual([
    ['Apple', 0, 0], ['round', 0, 1], ['apple', 0, 2], ['red', 0, 3],
    ['I', 1, 0], ["don't", 1, 1], ['know', 1, 2],
  ])
})

test('splitEnLine keeps separators and numbers words like tokensFor', () => {
  expect(splitEnLine("Hi, you!")).toEqual([
    { text: 'Hi', word: 0 }, { text: ', ', word: null }, { text: 'you', word: 1 }, { text: '!', word: null },
  ])
})

test('buildMessages chinese includes numbered table with pinyin, header and recognized pinyin', () => {
  const [sys, user] = buildMessages(cn, tokensFor(cn), '鹅，区绿白毛。')
  expect(sys.role).toBe('system')
  expect(sys.content).toContain('拼音相同')
  expect(user.content).toContain('0:鹅(e) 1:曲(qu) 2:绿(lv) 3:白(bai) 4:毛(mao)')
  expect(user.content).toContain('标题：咏鹅；作者：骆宾王；朝代：唐代')
  expect(user.content).toContain('识别文字：鹅，区绿白毛。')
  expect(user.content).toContain('识别拼音：e qu lv bai mao')
})

test('buildMessages english has no pinyin line', () => {
  const [sys, user] = buildMessages(en, tokensFor(en), 'apple round')
  expect(sys.content).toContain('不区分大小写')
  expect(user.content).toContain('0:Apple 1:round 2:apple 3:red')
  expect(user.content).toContain('标题：Apple')
  expect(user.content).not.toContain('识别拼音')
})

test('parseResult validates, dedupes, clamps and prefers missed over wrong', () => {
  const r = parseResult('```json\n{"wrong":[3,3,1,9,-1,1.5],"missed":[1,2],"extra":2,"comment":"  很好  "}\n```', 5)
  expect(r).toEqual({ wrong: [3], missed: [1, 2], extra: 2, comment: '很好' })
  expect(parseResult('{"wrong":[],"missed":[],"extra":-3}', 5)).toEqual({ wrong: [], missed: [], extra: 0, comment: '' })
  expect(parseResult(`{"wrong":[],"missed":[],"extra":0,"comment":"${'好'.repeat(80)}"}`, 5).comment).toHaveLength(60)
  expect(() => parseResult('not json', 5)).toThrow()
  expect(() => parseResult('{"wrong":"x","missed":[]}', 5)).toThrow()
})

test('referenceRate uses reference seconds or a default', () => {
  expect(referenceRate('cn', 30, 10)).toBe(3)
  expect(referenceRate('cn', 30, null)).toBe(2)
  expect(referenceRate('en', 30, 0)).toBe(2)
  expect(referenceRate('en', 30, 10)).toBe(3)
})

test('computeScore: 80% accuracy + 20% fluency', () => {
  expect(computeScore({ n: 10, wrong: [], missed: [], extra: 0, rate: 3, refRate: 3 }))
    .toEqual({ score: 100, stars: 3, acc: 1, flu: 1 })
  // 2 missed, 1 wrong, 2 extra → acc = (10-3-1)/10 = 0.6; rate 1.5x is inside the 0.6-1.6 band → flu 1
  // score = 100 * (0.8*0.6 + 0.2) = 68
  expect(computeScore({ n: 10, wrong: [1], missed: [2, 3], extra: 2, rate: 4.5, refRate: 3 }))
    .toEqual({ score: 68, stars: 1, acc: 0.6, flu: 1 })
  expect(computeScore({ n: 0, wrong: [], missed: [], extra: 0, rate: 0, refRate: 3 }).score).toBe(0)
})

test('starsFor thresholds', () => {
  expect([100, 90, 89, 75, 74, 60, 59, 0].map(starsFor)).toEqual([3, 3, 2, 2, 1, 1, 0, 0])
})

test('marksFor maps token indices to line/col', () => {
  const tokens = tokensFor(cn)
  expect(marksFor(tokens, { wrong: [1], missed: [3, 4] })).toEqual({
    0: { 2: 'wrong' },
    1: { 0: 'missed', 1: 'missed' },
  })
  expect(marksFor(tokens, null)).toEqual({})
})

test('fluency tolerance band 0.6x-1.6x', () => {
  const flu = (rate) => computeScore({ n: 10, wrong: [], missed: [], extra: 0, rate, refRate: 10 }).flu
  expect(flu(6)).toBe(1)
  expect(flu(16)).toBe(1)
  expect(flu(3)).toBeCloseTo(0.5) // r=0.3 → 1-(0.3)/0.6
  expect(flu(24)).toBeCloseTo(0.5) // r=2.4 → 1-0.8/1.6
  expect(flu(32)).toBeCloseTo(0)
  expect(flu(100)).toBe(0)
})

test('english curly and straight apostrophes stay inside words', () => {
  const p = { subject: 'en', lines: [{ text: 'It’s Tom’s cat, isn\'t it?' }] }
  expect(tokensFor(p).map((t) => [t.text, t.col])).toEqual([['It’s', 0], ['Tom’s', 1], ['cat', 2], ["isn't", 3], ['it', 4]])
  expect(splitEnLine(p.lines[0].text).filter((x) => x.word !== null).map((x) => [x.text, x.word]))
    .toEqual([['It’s', 0], ['Tom’s', 1], ['cat', 2], ["isn't", 3], ['it', 4]])
})

test('toneless handles script g, capitals and ü', () => {
  expect(toneless('tonɡ')).toBe('tong')
  expect(toneless('LÜ')).toBe('lv')
  expect(toneless('Ǜ')).toBe('v')
})

test('parseResult tolerates surrounding text, string ids and astral characters', () => {
  expect(parseResult('结果如下 {"wrong":["3"],"missed":[],"extra":"2","comment":"好"} 完毕', 5))
    .toEqual({ wrong: [3], missed: [], extra: 2, comment: '好' })
  expect(parseResult(`{"wrong":[],"missed":[],"extra":0,"comment":"${'😀'.repeat(70)}"}`, 5).comment).toBe('😀'.repeat(60))
})

test('buildMessages english rules', () => {
  const [sys] = buildMessages(en, tokensFor(en), 'x')
  expect(sys.content).toContain('不及格')
  expect(sys.content).toContain('数字')
})
