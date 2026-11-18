const pad = (n) => String(n).padStart(2, '0')

export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

export function addDays(key, n) {
  const [y, m, d] = key.split('-').map(Number)
  return dateKey(new Date(y, m - 1, d + n))
}

export function markCheckin(entry, date, subject) {
  const e = { date, cn: false, en: false, ...entry, [subject]: true }
  e.star = e.cn && e.en
  return e
}

export function streak(checkins, subject, today) {
  let day = checkins[today]?.[subject] ? today : addDays(today, -1)
  let n = 0
  while (checkins[day]?.[subject]) {
    n++
    day = addDays(day, -1)
  }
  return n
}

export function starCount(checkins) {
  return Object.values(checkins).filter((e) => e.star).length
}
