import { pinyin } from 'pinyin-pro'

export function lineText(line) {
  return line.chars ? line.chars.map((ch) => ch.c).join('') : line.text
}

// Curated packs carry per-char pinyin; text-only packs get it generated here.
export function lineChars(line) {
  if (line.chars) return line.chars
  return pinyin(line.text, { type: 'all' }).map((x) => ({ c: x.origin, p: x.isZh ? x.pinyin : '' }))
}
