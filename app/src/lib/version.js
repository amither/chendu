// Version label baked in at build time: Beijing date and time plus commit.
export function buildVersion(date, sha) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(date).map((p) => [p.type, p.value]),
  )
  const v = `${parts.year}.${parts.month}.${parts.day}-${parts.hour}${parts.minute}`
  return sha ? `${v}-${sha.slice(0, 7)}` : v
}

// What to tell the parent after "检查更新". latest is the deployed version
// (null when it couldn't be fetched); needRefresh means a new version has
// been downloaded and is waiting to be applied.
export function updateStatus({ current, latest, needRefresh }) {
  if (needRefresh) return { kind: 'ready', text: `发现新版本${latest ? ' ' + latest : ''}` }
  if (!latest) return { kind: 'offline', text: '无法连接服务器，请联网后再试' }
  if (latest === current) return { kind: 'latest', text: '已是最新版本' }
  return { kind: 'downloading', text: `新版本 ${latest} 正在下载，请稍后再点检查更新` }
}
