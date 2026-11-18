const SKIP = /[\p{P}\p{S}\s]/u

export function countChars(text) {
  let n = 0
  for (const ch of text) if (!SKIP.test(ch)) n++
  return n
}

// `lead` is the char count read before the first line (title, author).
export function estimateTimings(counts, duration, lead = 0) {
  const total = lead + counts.reduce((a, b) => a + b, 0)
  if (!total || !Number.isFinite(duration) || duration <= 0) return counts.map(() => ({ start: 0, end: 0 }))
  let t = (duration * lead) / total
  return counts.map((c) => {
    const start = t
    t += (duration * c) / total
    return { start, end: t }
  })
}

export function activeIndex(timings, time) {
  return timings.findIndex((x) => time >= x.start && time < x.end)
}
