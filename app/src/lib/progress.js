export function dayItems(plan, week, day) {
  const w = plan.weeks.find((w) => w.week === week)
  return w?.days.find((d) => d.day === day)?.items ?? []
}

export function nextPosition(plan, week, day) {
  const wi = plan.weeks.findIndex((w) => w.week === week)
  if (wi < 0) return null
  const days = plan.weeks[wi].days
  const di = days.findIndex((d) => d.day === day)
  if (di < 0) return null
  if (di < days.length - 1) return { week, day: days[di + 1].day }
  const nextWeek = plan.weeks[wi + 1]
  return nextWeek ? { week: nextWeek.week, day: nextWeek.days[0].day } : null
}

export function newProgress(subject, plan) {
  return { subject, planId: plan.id, week: plan.weeks[0].week, day: plan.weeks[0].days[0].day, done: {}, finished: false }
}

// Returns a new progress object; when the day's items are all read enough
// times it moves to the next day (or marks the plan finished).
export function recordRead(progress, plan, index) {
  const items = dayItems(plan, progress.week, progress.day)
  const item = items[index]
  if (!item || progress.finished) return { progress, dayComplete: false }
  const done = { ...progress.done, [index]: Math.min((progress.done[index] ?? 0) + 1, item.times) }
  const complete = items.every((it, i) => (done[i] ?? 0) >= it.times)
  if (!complete) return { progress: { ...progress, done }, dayComplete: false }
  const next = nextPosition(plan, progress.week, progress.day)
  if (!next) return { progress: { ...progress, done, finished: true }, dayComplete: true }
  return { progress: { ...progress, ...next, done: {} }, dayComplete: true }
}

export function dayStatus(progress, plan) {
  const items = dayItems(plan, progress.week, progress.day)
  return { total: items.length, completed: items.filter((it, i) => (progress.done[i] ?? 0) >= it.times).length }
}
