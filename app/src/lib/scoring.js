import { pinyin } from 'pinyin-pro'
import { lineChars } from './piece.js'

const HAN = /\p{Script=Han}/u
const WORD_SRC = "[A-Za-z0-9]+(?:['’][A-Za-z]+)*"
const WORD = new RegExp(WORD_SRC, 'g')

// Pinyin without tone marks, with ü written as v, for comparing readings.
export function toneless(p) {
  return p.toLowerCase().replace(/\u0261/g, 'g').normalize('NFD').replace(/u\u0308/g, 'v').replace(/[\u0300-\u036f]/g, '')
}

// The units the child is scored on: Chinese characters (with pinyin) or
// English words, numbered in reading order. line/col locate each one on
// screen (col = index in lineChars for Chinese, word index for English).
export function tokensFor(piece) {
  const tokens = []
  piece.lines.forEach((line, li) => {
    if (piece.subject === 'cn') {
      lineChars(line).forEach((ch, col) => {
        if (!HAN.test(ch.c)) return
        const p = ch.p || pinyin(ch.c, { toneType: 'none' })
        tokens.push({ text: ch.c, py: toneless(p), line: li, col })
      })
    } else {
      let col = 0
      for (const m of line.text.matchAll(WORD)) tokens.push({ text: m[0], line: li, col: col++ })
    }
  })
  return tokens
}

// Splits an English line into words and the text between them; word is the
// same per-line index tokensFor uses, or null for separators.
export function splitEnLine(text) {
  const parts = []
  let word = 0
  text.split(new RegExp(`(${WORD_SRC})`)).forEach((t, i) => {
    if (t) parts.push({ text: t, word: i % 2 ? word++ : null })
  })
  return parts
}

const SYSTEM_CN = `你在帮小学老师核对孩子的语文晨读录音。你会收到：
- 原文编号表：每个字一个编号，括号里是不带声调的拼音；
- 标题、作者、朝代（孩子朗读时读出这些是正常的，不算多读）；
- 语音识别得到的文字，以及它的不带声调拼音。
判断规则：
- 语音识别经常写成同音字，只要拼音相同（不看声调）就算读对，例如"清"识别成"轻"、"歌"识别成"哥"都算对。
- wrong：拼音不同的字；missed：原文有但没读到的字；extra：标题、作者、朝代以外多读出来的字数。
- comment 写给低年级孩子：一句话，先具体鼓励；只能提到 wrong、missed 里的字；不用"不及格""错误很多"等字眼；30 字以内。
只输出 JSON：{"wrong": [编号], "missed": [编号], "extra": 整数, "comment": "评语"}`

const SYSTEM_EN = `你在帮小学英语老师核对孩子的英语晨读录音。你会收到：原文编号表（每个单词一个编号）、标题，以及语音识别得到的文字。
判断规则：
- 不区分大小写，忽略标点；孩子读出标题是正常的，不算多读。
- wrong：读成了别的单词；missed：原文有但没读到的单词；extra：标题以外多读出来的单词数。
- 数字读成英文单词算读对。
- comment 用中文写给低年级孩子：一句话，先具体鼓励；只能提到 wrong、missed 里的单词；不用"不及格""错误很多"等字眼；30 字以内。
只输出 JSON：{"wrong": [编号], "missed": [编号], "extra": 整数, "comment": "评语"}`

export function buildMessages(piece, tokens, recognized) {
  const cn = piece.subject === 'cn'
  const table = tokens.map((t, i) => (cn ? `${i}:${t.text}(${t.py})` : `${i}:${t.text}`)).join(' ')
  const head = cn
    ? `标题：${piece.title}；作者：${piece.author ?? '无'}；朝代：${piece.dynasty ?? '无'}`
    : `标题：${piece.title}`
  let user = `原文编号表：${table}\n${head}\n识别文字：${recognized}`
  if (cn) {
    const han = recognized.replace(/[^\p{Script=Han}]/gu, '')
    const py = han ? pinyin(han, { toneType: 'none', type: 'array' }).map(toneless).join(' ') : ''
    user += `\n识别拼音：${py}`
  }
  return [
    { role: 'system', content: cn ? SYSTEM_CN : SYSTEM_EN },
    { role: 'user', content: user },
  ]
}

// Validates the model's JSON. Throws when it isn't usable.
export function parseResult(content, n) {
  const a = content.indexOf('{')
  const b = content.lastIndexOf('}')
  const obj = JSON.parse(a >= 0 && b > a ? content.slice(a, b + 1) : content)
  if (!obj || !Array.isArray(obj.wrong) || !Array.isArray(obj.missed)) throw new Error('模型返回格式不对')
  const num = (x) => (typeof x === 'string' && /^\d+$/.test(x) ? Number(x) : x)
  const ids = (a) => [...new Set(a.map(num).filter((x) => Number.isInteger(x) && x >= 0 && x < n))].sort((x, y) => x - y)
  const missed = ids(obj.missed)
  const wrong = ids(obj.wrong).filter((x) => !missed.includes(x))
  const ex = num(obj.extra)
  const extra = Number.isInteger(ex) && ex > 0 ? ex : 0
  const comment = typeof obj.comment === 'string' ? Array.from(obj.comment.trim()).slice(0, 60).join('') : ''
  return { wrong, missed, extra, comment }
}

export const DEFAULT_RATE = { cn: 2, en: 2 } // chars or words per second

export function referenceRate(subject, n, refSeconds) {
  return refSeconds > 0 ? n / refSeconds : DEFAULT_RATE[subject]
}

export function starsFor(score) {
  return score >= 90 ? 3 : score >= 75 ? 2 : score >= 60 ? 1 : 0
}

export function computeScore({ n, wrong, missed, extra, rate, refRate }) {
  const acc = n ? Math.max(0, n - wrong.length - missed.length - 0.5 * extra) / n : 0
  // Reference recitations are slow, so anything from 0.6x to 1.6x counts as fluent.
  const r = rate > 0 && refRate > 0 ? rate / refRate : 0
  const flu = r === 0 ? 0 : r < 0.6 ? Math.max(0, 1 - (0.6 - r) / 0.6) : r > 1.6 ? Math.max(0, 1 - (r - 1.6) / 1.6) : 1
  const score = Math.round(100 * (0.8 * acc + 0.2 * flu))
  return { score, stars: starsFor(score), acc, flu }
}

// { [line]: { [col]: 'wrong' | 'missed' } } for highlighting the text.
export function marksFor(tokens, result) {
  const marks = {}
  if (!result) return marks
  const mark = (i, kind) => {
    const t = tokens[i]
    if (t) (marks[t.line] ??= {})[t.col] = kind
  }
  result.wrong.forEach((i) => mark(i, 'wrong'))
  result.missed.forEach((i) => mark(i, 'missed'))
  return marks
}
