// Builds the week-by-week view of a plan for the plan detail page.
// status: 'done' (already read), 'current' (today's day / week), 'todo'.
export function planOverview(plan, progress) {
  const active = progress?.planId === plan.id
  const order = (w, d) => w * 1000 + d
  const cur = active ? order(progress.week, progress.day) : -1

  const dayStatus = (week, day) => {
    if (!active) return 'todo'
    const o = order(week, day)
    if (o < cur || (o === cur && progress.finished)) return 'done'
    return o === cur ? 'current' : 'todo'
  }

  return plan.weeks.map((w) => {
    const days = w.days.map((d) => {
      const status = dayStatus(w.week, d.day)
      return {
        day: d.day,
        status,
        items: d.items.map((it, i) => ({
          pieceId: it.pieceId,
          times: it.times,
          isNew: it.times > 1,
          done: status === 'done' || (status === 'current' && (progress.done[i] ?? 0) >= it.times),
        })),
      }
    })
    const status = days.every((d) => d.status === 'done')
      ? 'done'
      : days.some((d) => d.status === 'current') ? 'current' : 'todo'
    return { week: w.week, status, days }
  })
}
