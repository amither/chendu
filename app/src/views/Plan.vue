<script setup>
import { ref, computed, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.js'
import { planOverview } from '../lib/planview.js'
import { lineText } from '../lib/piece.js'

const props = defineProps({ subject: String })
const store = useAppStore()
const router = useRouter()
const NAMES = { cn: '语文', en: '英语' }
const STATUS = { done: '已读', current: '今天', todo: '' }

const planId = ref('')
const week = ref(1)
const pieces = ref({})

const plans = computed(() => store.plansFor(props.subject))
const plan = computed(() => store.plans[planId.value])
const progress = computed(() => store.progress[props.subject])
const overview = computed(() => (plan.value ? planOverview(plan.value, progress.value) : []))
const shownWeek = computed(() => overview.value.find((w) => w.week === week.value))

// Open on the subject's current plan and week.
watch(
  () => props.subject,
  () => {
    const p = progress.value
    if (!p) return router.replace('/')
    planId.value = p.planId
    week.value = p.week
  },
  { immediate: true },
)

function onPlanChange() {
  const p = progress.value
  week.value = p?.planId === planId.value ? p.week : plan.value.weeks[0].week
}

// Load titles for the week on screen; getPiece caches.
watch(
  shownWeek,
  async (w) => {
    if (!w) return
    const ids = [...new Set(w.days.flatMap((d) => d.items.map((it) => it.pieceId)))]
    const loaded = await Promise.all(ids.map((id) => store.getPiece(id)))
    pieces.value = { ...pieces.value, ...Object.fromEntries(ids.map((id, i) => [id, loaded[i]])) }
    await nextTick()
    document.querySelector('.day.current')?.scrollIntoView({ block: 'start', behavior: 'smooth' })
  },
  { immediate: true },
)

function subtitle(piece) {
  if (!piece) return ''
  if (piece.subject === 'en') return piece.titleTranslate ?? ''
  return [piece.dynasty, piece.author].filter(Boolean).join(' · ')
}

function firstLine(piece) {
  return piece?.lines?.[0] ? lineText(piece.lines[0]) : ''
}

async function setCurrent(day) {
  const msg = `把${NAMES[props.subject]}进度改到「${plan.value.title} 第 ${week.value} 周第 ${day} 天」？当天已读遍数会清零。`
  if (!confirm(msg)) return
  try {
    await store.setPlan(props.subject, planId.value, week.value, day)
  } catch (err) {
    alert(err.message)
  }
}
</script>

<template>
  <main class="page plan-page">
    <div class="topbar">
      <button @click="router.back()">← 返回</button>
      <h1>{{ NAMES[subject] }}计划</h1>
      <select v-model="planId" @change="onPlanChange">
        <option v-for="p in plans" :key="p.id" :value="p.id">{{ p.title }}</option>
      </select>
    </div>

    <div class="body">
      <nav class="weeks">
        <button v-for="w in overview" :key="w.week" :class="[w.status, { on: w.week === week }]"
                @click="week = w.week">
          第 {{ w.week }} 周
          <small v-if="w.status === 'done'">✓</small>
          <small v-else-if="w.status === 'current'">●</small>
        </button>
      </nav>

      <section class="days" v-if="shownWeek">
        <div v-for="d in shownWeek.days" :key="d.day" class="card day" :class="d.status">
          <div class="day-head">
            <h2>第 {{ d.day }} 天</h2>
            <span v-if="STATUS[d.status]" class="badge" :class="d.status">{{ STATUS[d.status] }}</span>
            <span class="spacer" />
            <button v-if="d.status !== 'current'" class="set" @click="setCurrent(d.day)">从这天开始</button>
          </div>
          <div v-for="(it, i) in d.items" :key="i" class="item">
            <span class="tag" :class="it.isNew ? 'new' : 'review'">{{ it.isNew ? '新学' : '复习' }}</span>
            <div class="info">
              <div class="title">{{ pieces[it.pieceId]?.title ?? '…' }}
                <span class="muted sub">{{ subtitle(pieces[it.pieceId]) }}</span>
              </div>
              <div class="muted line">{{ firstLine(pieces[it.pieceId]) }}</div>
            </div>
            <span class="times">{{ it.done ? '✓' : `×${it.times}` }}</span>
          </div>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.plan-page { display: flex; flex-direction: column; height: 100vh; height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)); }
.topbar select { font-size: 22px; padding: 12px; border-radius: 12px; }
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: 170px 1fr; gap: 24px; }
.weeks { display: flex; flex-direction: column; gap: 10px; overflow-y: auto; padding-bottom: 24px; }
.weeks button { min-height: 56px; font-size: 22px; padding: 10px 14px; text-align: left; }
.weeks button.done { color: var(--muted); }
.weeks button.current small { color: var(--accent); }
.weeks button.on { background: var(--accent); color: #fff; }
.weeks button.on small { color: #fff; }
.days { overflow-y: auto; display: flex; flex-direction: column; gap: 18px; padding-bottom: 24px; }
.day { padding: 20px 24px; }
.day.current { outline: 4px solid var(--accent); }
.day.done { opacity: .75; }
.day-head { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.day-head h2 { margin: 0; font-size: 26px; }
.spacer { flex: 1; }
.badge { font-size: 18px; padding: 4px 12px; border-radius: 10px; background: #eee; }
.badge.current { background: var(--accent); color: #fff; }
.badge.done { background: #dff3e5; color: var(--ok); }
.set { min-height: 48px; font-size: 18px; padding: 8px 16px; }
.item { display: flex; align-items: center; gap: 16px; padding: 10px 0; border-top: 1px solid #f1e8da; }
.tag { font-size: 18px; padding: 4px 12px; border-radius: 10px; color: #fff; flex: none; }
.tag.new { background: var(--accent); }
.tag.review { background: #9aa7b4; }
.info { flex: 1; min-width: 0; }
.title { font-size: 24px; }
.sub { font-size: 18px; margin-left: 8px; }
.line { font-size: 18px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.times { font-size: 22px; color: var(--muted); flex: none; }
@media (orientation: portrait) { .body { grid-template-columns: 130px 1fr; } }
</style>
