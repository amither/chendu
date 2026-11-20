<script setup>
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.js'
import { dayStatus } from '../lib/progress.js'

const store = useAppStore()
const router = useRouter()
const NAMES = { cn: '语文', en: '英语' }

const cards = computed(() =>
  ['cn', 'en']
    .filter((s) => store.progress[s])
    .map((s) => {
      const p = store.progress[s]
      const plan = store.plans[p.planId]
      return {
        subject: s,
        name: NAMES[s],
        plan: plan.title,
        where: `第 ${p.week} 周 · 第 ${p.day} 天`,
        status: dayStatus(p, plan),
        finished: p.finished,
        doneToday: !!store.todayEntry()?.[s],
        streak: store.streakOf(s),
      }
    }),
)
</script>

<template>
  <main class="page">
    <div class="topbar">
      <h1>⭐ {{ store.stars() }}</h1>
      <button class="gear" @click="router.push('/settings')">⚙️</button>
    </div>

    <div v-if="!cards.length" class="card empty">
      <p>还没有晨读内容</p>
      <p class="muted">请家长点右上角 ⚙️ 进入设置，导入内容包。</p>
    </div>

    <div class="cards">
      <div v-for="c in cards" :key="c.subject" class="card subject" :class="c.subject"
           @click="!c.finished && router.push(`/day/${c.subject}`)">
        <div class="name">{{ c.name }}</div>
        <div class="muted">{{ c.plan }}</div>
        <template v-if="c.finished">
          <div class="where">这一册读完啦 🎉</div>
          <div class="muted">请家长在设置里选下一册</div>
        </template>
        <template v-else>
          <div class="where">{{ c.where }}</div>
          <div class="count">{{ c.status.completed }} / {{ c.status.total }} 篇</div>
        </template>
        <button class="plan-link" @click.stop="router.push(`/plan/${c.subject}`)">📋 查看计划</button>
        <div class="foot">
          <span>🔥 连续 {{ c.streak }} 天</span>
          <span v-if="c.doneToday" class="done">今天已完成 ✓</span>
        </div>
      </div>
    </div>
  </main>
</template>

<style scoped>
.cards { display: grid; grid-template-columns: 1fr 1fr; gap: 32px; }
@media (orientation: portrait) { .cards { grid-template-columns: 1fr; } }
.subject { min-height: 300px; display: flex; flex-direction: column; gap: 10px; }
.subject.cn { border-top: 10px solid #e85d3f; }
.subject.en { border-top: 10px solid #3f8ce8; }
.name { font-size: 48px; font-weight: 700; }
.where { font-size: 30px; margin-top: auto; }
.count { font-size: 26px; color: var(--accent); }
.foot { display: flex; justify-content: space-between; font-size: 22px; }
.done { color: var(--ok); }
.empty { text-align: center; font-size: 28px; }
.gear { background: transparent; box-shadow: none; font-size: 32px; }
.plan-link { align-self: flex-start; min-height: 52px; font-size: 20px; padding: 8px 18px; background: var(--bg); }
</style>
