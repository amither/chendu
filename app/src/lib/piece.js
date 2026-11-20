import { pinyin } from 'pinyin-pro'

export function lineText(line) {
  return line.chars ? line.chars.map((ch) => ch.c).join('') : line.text
}

// Curated packs carry per-char pinyin; text-only packs get it generated here.
export function lineChars(line) {
  if (line.chars) return line.chars
  return pinyin(line.text, { type: 'all' }).map((x) => ({ c: x.origin, p: x.isZh ? x.pinyin : '' }))
}

// Shortest plausible time to read the piece aloud once (~0.15s per char,
// letters counted individually), used to ignore accidental double taps on
// 读完一遍.
export function minReadSeconds(piece) {
  const chars = piece.lines.map(lineText).join('').replace(/[\p{P}\p{S}\s]/gu, '').length
  return Math.max(3, Math.round(chars * 0.15))
}
