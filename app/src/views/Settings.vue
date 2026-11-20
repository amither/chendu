<script setup>
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.js'
import { importPack } from '../lib/pack.js'
import { dateKey } from '../lib/streak.js'
import { needRefresh, applyUpdate } from '../lib/sw.js'

const store = useAppStore()
const router = useRouter()
const NAMES = { cn: '语文', en: '英语' }

// ---- 导入内容包
const importStatus = ref('')
const importing = ref(false)
async function onPack(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  importing.value = true
  try {
    const m = await importPack(file, (s) => (importStatus.value = s))
    await store.load()
    resetPicks()
    await refreshStorage()
    importStatus.value = `导入成功：${m.title}`
  } catch (err) {
    importStatus.value = `导入失败：${err.message}`
  } finally {
    importing.value = false
  }
}

// ---- 计划和位置
const picks = ref({})
function resetPicks() {
  for (const s of ['cn', 'en']) {
    const p = store.progress[s]
    if (p) picks.value[s] = { planId: p.planId, week: p.week, day: p.day }
  }
}
const weeksOf = (s) => store.plans[picks.value[s].planId]?.weeks ?? []
const daysOf = (s) => weeksOf(s).find((w) => w.week === picks.value[s].week)?.days ?? []
function onPlanChange(s) {
  const w = weeksOf(s)[0]
  if (!w?.days?.length) return
  picks.value[s].week = w.week
  picks.value[s].day = w.days[0].day
}
function onWeekChange(s) {
  picks.value[s].day = daysOf(s)[0].day
}
async function savePlan(s) {
  const { planId, week, day } = picks.value[s]
  if (!confirm(`把${NAMES[s]}进度改到「${store.plans[planId].title} 第 ${week} 周第 ${day} 天」？当天已读遍数会清零。`)) return
  try {
    await store.setPlan(s, planId, week, day)
  } catch (err) {
    alert(err.message)
  }
}

// ---- 打卡日历
const month = ref(dateKey().slice(0, 7))
const calendar = computed(() => {
  const [y, m] = month.value.split('-').map(Number)
  const first = new Date(y, m - 1, 1)
  const days = new Date(y, m, 0).getDate()
  const cells = Array((first.getDay() + 6) % 7).fill(null)
  for (let d = 1; d <= days; d++) {
    const key = `${month.value}-${String(d).padStart(2, '0')}`
    cells.push({ d, entry: store.checkins[key] })
  }
  return cells
})
function shiftMonth(n) {
  const [y, m] = month.value.split('-').map(Number)
  month.value = dateKey(new Date(y, m - 1 + n, 1)).slice(0, 7)
}

// ---- 备份
const backupStatus = ref('')
async function exportBackup() {
  const name = `chendu-backup-${dateKey()}.json`
  const json = JSON.stringify(store.exportBackup())
  const file = new File([json], name, { type: 'application/json' })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
    } catch (err) {
      if (err?.name !== 'AbortError') backupStatus.value = `导出失败：${err.message}`
    }
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(file)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 30000)
}
async function onBackup(e) {
  const file = e.target.files[0]
  e.target.value = ''
  if (!file) return
  importing.value = true
  try {
    await store.importBackup(JSON.parse(await file.text()))
    resetPicks()
    backupStatus.value = '已恢复进度和打卡'
  } catch (err) {
    backupStatus.value = err instanceof SyntaxError ? '恢复失败：备份文件格式不对' : `恢复失败：${err.message}`
  } finally {
    importing.value = false
  }
}

// ---- 存储
const storage = ref({ persisted: null, usageMB: 0 })
async function refreshStorage() {
  const est = await navigator.storage?.estimate?.()
  storage.value = {
    persisted: await navigator.storage?.persisted?.(),
    usageMB: est ? Math.round(est.usage / 1e6) : 0,
  }
}
onMounted(() => {
  resetPicks()
  refreshStorage()
})
</script>

<template>
  <main class="page settings">
    <div class="topbar">
      <button @click="router.push('/')">← 返回</button>
      <h1>家长设置</h1>
    </div>

    <section v-if="needRefresh" class="card">
      <h2>有新版本</h2>
      <button class="primary" @click="applyUpdate(true)">立即更新</button>
    </section>

    <section class="card">
      <h2>导入内容包</h2>
      <p class="muted">从"文件"App 选择 chendu-g1.zip 或 chendu-text.zip。重新导入同一个包会更新内容，不影响进度和录音。</p>
      <input type="file" accept=".zip,application/zip" :disabled="importing" @change="onPack" />
      <p>{{ importStatus }}</p>
    </section>

    <section class="card" v-for="s in ['cn', 'en']" :key="s">
      <h2>{{ NAMES[s] }}进度 <button v-if="picks[s]" class="plan-btn" @click="router.push(`/plan/${s}`)">📋 查看每周计划</button></h2>
      <p v-if="!picks[s]" class="muted">还没有{{ NAMES[s] }}内容。</p>
      <div v-else class="row">
        <select v-model="picks[s].planId" @change="onPlanChange(s)">
          <option v-for="p in store.plansFor(s)" :key="p.id" :value="p.id">{{ p.title }}</option>
        </select>
        <select v-model.number="picks[s].week" @change="onWeekChange(s)">
          <option v-for="w in weeksOf(s)" :key="w.week" :value="w.week">第 {{ w.week }} 周</option>
        </select>
        <select v-model.number="picks[s].day">
          <option v-for="d in daysOf(s)" :key="d.day" :value="d.day">第 {{ d.day }} 天</option>
        </select>
        <button class="primary" @click="savePlan(s)">保存</button>
      </div>
    </section>

    <section class="card">
      <h2>打卡日历</h2>
      <div class="row">
        <button @click="shiftMonth(-1)">‹</button>
        <strong>{{ month }}</strong>
        <button @click="shiftMonth(1)">›</button>
      </div>
      <div class="cal">
        <span v-for="w in ['一','二','三','四','五','六','日']" :key="w" class="muted">{{ w }}</span>
        <span v-for="(c, i) in calendar" :key="i" class="cell">
          <template v-if="c">
            <b>{{ c.d }}</b>
            <small>{{ c.entry?.star ? '⭐' : [c.entry?.cn && '语', c.entry?.en && '英'].filter(Boolean).join('') }}</small>
          </template>
        </span>
      </div>
    </section>

    <section class="card">
      <h2>录音</h2>
      <button @click="router.push('/recordings')">录音管理 →</button>
    </section>

    <section class="card">
      <h2>备份进度和打卡</h2>
      <p class="muted">备份不包含录音和内容包。</p>
      <div class="row">
        <button @click="exportBackup">导出备份</button>
        <label class="file-btn">导入备份<input type="file" accept=".json,application/json" :disabled="importing" @change="onBackup" /></label>
      </div>
      <p>{{ backupStatus }}</p>
    </section>

    <section class="card">
      <h2>存储</h2>
      <p>已用约 {{ storage.usageMB }} MB</p>
      <p v-if="storage.persisted === false" class="warn">
        尚未获得持久存储，iPad 空间不足时数据可能被系统清理。请先把 App 添加到主屏幕，再从主屏幕打开并导入一次内容包。
      </p>
    </section>
  </main>
</template>

<style scoped>
.settings section { margin-bottom: 24px; font-size: 22px; }
h2 { margin-top: 0; }
.plan-btn { min-height: 48px; font-size: 18px; padding: 8px 16px; margin-left: 12px; vertical-align: middle; }
.row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
select, input[type=file] { font-size: 22px; padding: 12px; border-radius: 12px; }
.cal { display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; margin-top: 16px; text-align: center; }
.cell { min-height: 64px; background: var(--bg); border-radius: 12px; display: flex; flex-direction: column; justify-content: center; }
.file-btn { position: relative; padding: 16px 24px; background: var(--card); border-radius: 20px; box-shadow: 0 2px 6px rgba(0,0,0,.08); }
.file-btn input { position: absolute; opacity: 0; width: 1px; height: 1px; overflow: hidden; }
.warn { color: #c0392b; }
</style>
