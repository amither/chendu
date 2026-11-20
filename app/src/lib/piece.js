import { pinyin } from 'pinyin-pro'

export function lineText(line) {
  return line.chars ? line.chars.map((ch) => ch.c).join('') : line.text
}

// Curated packs carry per-char pinyin; text-only packs get it generated here.
export function lineChars(line) {
  if (line.chars) return line.chars
  return pinyin(line.text, { type: 'all' }).map((x) => ({ c: x.origin, p: x.isZh ? x.pinyin : '' }))
}

// Shortest plausible time to read the piece aloud once, used to ignore
// accidental double taps on 读完一遍: about 0.15s per Chinese character and
// 0.3s per English word (both faster than any model recording), at least 3s.
export function minReadSeconds(piece) {
  const text = piece.lines.map(lineText).join(' ')
  const units = piece.subject === 'en'
    ? (text.match(/[A-Za-z0-9]+(?:['’][A-Za-z]+)*/g) ?? []).length * 0.3
    : text.replace(/[\p{P}\p{S}\s]/gu, '').length * 0.15
  return Math.max(3, Math.round(units))
}
