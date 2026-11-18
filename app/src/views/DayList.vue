<script setup>
import { ref, computed, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.js'

const props = defineProps({ subject: String })
const store = useAppStore()
const router = useRouter()
const pieces = ref([])
const items = computed(() => store.todayItems(props.subject))
const p = computed(() => store.progress[props.subject])
const firstTodo = computed(() => items.value.findIndex((it, i) => (p.value.done[i] ?? 0) < it.times))

watch(
  () => props.subject,
  async (subject) => {
    if (!store.progress[subject]) {
      router.replace('/')
      return
    }
    const list = await Promise.all(items.value.map((it) => store.getPiece(it.pieceId)))
    if (subject === props.subject) pieces.value = list
  },
  { immediate: true },
)
</script>

<template>
  <main v-if="p" class="page">
    <div class="topbar">
      <button @click="router.push('/')">← 返回</button>
      <h1>第 {{ p.week }} 周 · 第 {{ p.day }} 天</h1>
      <button v-if="firstTodo >= 0" class="primary" @click="router.push(`/read/${subject}/${firstTodo}`)">开始读 ▶</button>
    </div>
    <div class="list">
      <div v-for="(it, i) in items" :key="i" class="card row" @click="router.push(`/read/${subject}/${i}`)">
        <span class="tag" :class="it.times > 1 ? 'new' : 'review'">{{ it.times > 1 ? '新学' : '复习' }}</span>
        <span class="title">{{ pieces[i]?.title }}</span>
        <span class="dots">
          <span v-for="n in it.times" :key="n" :class="{ on: (p.done[i] ?? 0) >= n }">●</span>
        </span>
      </div>
    </div>
  </main>
</template>

<style scoped>
.list { display: flex; flex-direction: column; gap: 16px; }
.row { display: flex; align-items: center; gap: 20px; padding: 22px 28px; }
.title { flex: 1; font-size: 32px; }
.tag { font-size: 20px; padding: 6px 14px; border-radius: 12px; color: #fff; }
.tag.new { background: var(--accent); }
.tag.review { background: #9aa7b4; }
.dots span { font-size: 28px; color: #ddd; margin-left: 6px; }
.dots span.on { color: var(--ok); }
</style>
