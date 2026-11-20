<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.js'
import { listRecordings, deleteRecording, deleteMonth, groupByDate, totalBytes } from '../lib/recordings.js'
import { createPlayer } from '../lib/player.js'
import { scoreRecording } from '../lib/scorer.js'
import { messageFor } from '../lib/deepseek.js'

const store = useAppStore()
const router = useRouter()
const player = createPlayer()
const list = ref([])
const titles = ref({})
const playingId = ref(null)

const groups = computed(() => groupByDate(list.value))
const months = computed(() => [...new Set(list.value.map((r) => r.date.slice(0, 7)))])
const totalMB = computed(() => (totalBytes(list.value) / 1e6).toFixed(1))

async function refresh() {
  list.value = await listRecordings()
  const ids = [...new Set(list.value.map((r) => r.pieceId))].filter((id) => !titles.value[id])
  await Promise.all(ids.map(async (id) => {
    titles.value[id] = (await store.getPiece(id))?.title ?? id
  }))
}

async function play(r) {
  if (playingId.value === r.id) {
    player.stop()
    playingId.value = null
    return
  }
  playingId.value = r.id
  await player.playBlob(r.blob)
  if (playingId.value === r.id) playingId.value = null
}

async function remove(r) {
  if (!confirm(`删除这条录音（${titles.value[r.pieceId]}）？`)) return
  if (playingId.value === r.id) {
    player.stop()
    playingId.value = null
  }
  try {
    await deleteRecording(r.id)
    await refresh()
  } catch (err) {
    alert(err.message)
  }
}

async function removeMonth(m) {
  const n = list.value.filter((r) => r.date.startsWith(m)).length
  if (!confirm(`删除 ${m} 的全部 ${n} 条录音？`)) return
  if (list.value.some((x) => x.id === playingId.value && x.date.startsWith(m))) {
    player.stop()
    playingId.value = null
  }
  try {
    await deleteMonth(m)
    await refresh()
  } catch (err) {
    alert(err.message)
  }
}

const scoringIds = ref({})
async function rescore(r) {
  const piece = await store.getPiece(r.pieceId)
  if (!piece) return alert('找不到这篇课文，可能需要重新导入内容包')
  scoringIds.value = { ...scoringIds.value, [r.id]: true }
  try {
    await scoreRecording(r, piece, store.settings.scoring.key)
    await refresh()
  } catch (e) {
    alert(messageFor(e))
  } finally {
    const { [r.id]: _, ...rest } = scoringIds.value
    scoringIds.value = rest
  }
}

onMounted(refresh)
onUnmounted(() => player.dispose())
</script>

<template>
  <main class="page">
    <div class="topbar">
      <button @click="router.push('/settings')">← 设置</button>
      <h1>录音管理</h1>
      <span class="muted">{{ list.length }} 条 · {{ totalMB }} MB</span>
    </div>

    <div class="row months" v-if="months.length">
      <button v-for="m in months" :key="m" @click="removeMonth(m)">删除 {{ m }}</button>
    </div>
    <p v-else class="muted">还没有录音。</p>

    <section v-for="g in groups" :key="g.date" class="card group">
      <h2>{{ g.date }}</h2>
      <div v-for="r in g.items" :key="r.id" class="item">
        <span class="subj">{{ r.subject === 'cn' ? '语' : '英' }}</span>
        <span class="title">
          {{ titles[r.pieceId] }} · 第 {{ r.round }} 遍 · {{ r.durationSec }} 秒
          <template v-if="r.score">
            · <b class="score">{{ r.score.stars ? '⭐'.repeat(r.score.stars) : '' }} {{ r.score.score }} 分</b>
            <small v-if="r.score.comment" class="muted comment">{{ r.score.comment }}</small>
          </template>
        </span>
        <button v-if="store.settings.scoring.key" :disabled="scoringIds[r.id]" @click="rescore(r)">
          {{ scoringIds[r.id] ? '打分中…' : r.score ? '重新打分' : '打分' }}
        </button>
        <button @click="play(r)">{{ playingId === r.id ? '⏹' : '▶' }}</button>
        <button @click="remove(r)">🗑</button>
      </div>
    </section>
  </main>
</template>

<style scoped>
.months { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; }
.months button { font-size: 18px; min-height: 48px; }
.group { margin-bottom: 20px; }
.group h2 { margin-top: 0; }
.item { display: flex; align-items: center; gap: 16px; padding: 8px 0; font-size: 22px; }
.title { flex: 1; }
.score { color: var(--accent); }
.comment { display: block; font-size: 18px; }
.subj { background: var(--accent-soft); border-radius: 10px; padding: 4px 10px; }
.item button { min-height: 52px; padding: 8px 18px; }
</style>
