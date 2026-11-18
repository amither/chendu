<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.js'
import { createPlayer } from '../lib/player.js'
import { recorderSupported, startRecording } from '../lib/recorder.js'
import { saveRecording } from '../lib/recordings.js'
import { dateKey } from '../lib/streak.js'
import PinyinLine from '../components/PinyinLine.vue'

const props = defineProps({ subject: String, index: Number })
const store = useAppStore()
const router = useRouter()
const player = createPlayer()

const piece = ref(null)
const activeLine = ref(-1)
const playing = ref(false)
const recording = ref(null) // handle from startRecording
const lastRecording = ref(null) // Blob
const micError = ref('')
const micDenied = ref(false)
const celebrate = ref('') // '', 'done', 'star'
const busy = ref(false)
const starting = ref(false)
let playToken = 0

const items = computed(() => store.todayItems(props.subject))
const item = computed(() => items.value[props.index])
const count = computed(() => store.progress[props.subject]?.done[props.index] ?? 0)
const canRecord = recorderSupported()

watch(
  () => [props.subject, props.index],
  async () => {
    const idx = props.index
    const subj = props.subject
    stopAll()
    lastRecording.value = null
    celebrate.value = ''
    micError.value = ''
    const it = item.value
    if (!it) {
      piece.value = null
      router.replace(`/day/${subj}`)
      return
    }
    const p = await store.getPiece(it.pieceId)
    if (idx !== props.index || subj !== props.subject) return
    piece.value = p
    // Resolve audio URLs now so the play tap can start audio synchronously
    // (iOS drops the user gesture across an IndexedDB await).
    if (p) await player.prepare(p)
  },
  { immediate: true },
)

function stopAll() {
  playToken++
  player.stop()
  playing.value = false
  activeLine.value = -1
}

async function togglePlay() {
  if (playing.value) return stopAll()
  // Don't await: play() must start inside the tap gesture (iOS).
  if (recording.value) toggleRecord().catch(() => {})
  const my = ++playToken
  playing.value = true
  try {
    await player.play(piece.value, (i) => (activeLine.value = i))
  } finally {
    if (my === playToken) playing.value = false
  }
}

async function toggleRecord() {
  if (recording.value) {
    const { blob, durationSec } = await recording.value.stop()
    recording.value = null
    lastRecording.value = blob
    try {
      await saveRecording({
        date: dateKey(), subject: props.subject, pieceId: piece.value.id,
        round: count.value + 1, durationSec, blob,
      })
    } catch {
      micError.value = '录音保存失败'
    }
    return
  }
  if (starting.value) return
  stopAll()
  starting.value = true
  try {
    recording.value = await startRecording()
    micError.value = ''
  } catch (e) {
    if (e?.name === 'NotAllowedError') micDenied.value = true
    micError.value = '没有麦克风权限：请家长到 iPad 设置 → Safari → 麦克风 里允许'
  } finally {
    starting.value = false
  }
}

async function playMine() {
  stopAll()
  const my = ++playToken
  playing.value = true
  try {
    await player.playBlob(lastRecording.value)
  } finally {
    if (my === playToken) playing.value = false
  }
}

async function markRead() {
  if (busy.value || !item.value) return
  busy.value = true
  try {
    const times = item.value.times
    const subject = props.subject
    const index = props.index
    stopAll()
    if (recording.value) await toggleRecord()
    const { dayComplete } = await store.read(subject, index)
    if (dayComplete) {
      celebrate.value = store.todayEntry()?.star ? 'star' : 'done'
      return
    }
    const done = store.progress[subject].done
    if ((done[index] ?? 0) >= times) {
      const next = items.value.findIndex((it, i) => (done[i] ?? 0) < it.times)
      if (next >= 0) router.replace(`/read/${subject}/${next}`)
    }
  } finally {
    busy.value = false
  }
}

onUnmounted(() => {
  player.dispose()
  const r = recording.value
  recording.value = null
  if (r && piece.value) {
    const meta = { date: dateKey(), subject: props.subject, pieceId: piece.value.id, round: count.value + 1 }
    r.stop()
      .then(({ blob, durationSec }) => saveRecording({ ...meta, durationSec, blob }))
      .catch(() => {})
  } else {
    r?.stop().catch(() => {})
  }
})
</script>

<template>
  <main v-if="celebrate" class="page celebrate">
    <div class="big">{{ celebrate === 'star' ? '⭐' : '🎉' }}</div>
    <p>{{ celebrate === 'star' ? '语文和英语都读完啦，得到一颗星！' : '今天这一科读完啦！' }}</p>
    <button class="primary" @click="router.push('/')">回首页</button>
  </main>

  <main v-else-if="piece && item" class="page reader">
    <div class="topbar">
      <button @click="router.push(`/day/${subject}`)">← 清单</button>
      <h1>{{ piece.title }}</h1>
      <button v-if="subject === 'cn'" @click="store.setSetting('pinyin', !store.settings.pinyin)">
        拼音 {{ store.settings.pinyin ? '开' : '关' }}
      </button>
      <span class="rounds">第 {{ Math.min(count + 1, item.times) }} / {{ item.times }} 遍</span>
    </div>

    <div class="body">
      <section class="text card">
        <p class="meta muted" v-if="piece.author || piece.titleTranslate">
          {{ piece.subject === 'cn' ? [piece.dynasty, piece.author].filter(Boolean).join(' · ') : piece.titleTranslate }}
        </p>
        <template v-if="piece.subject === 'cn'">
          <PinyinLine v-for="(line, i) in piece.lines" :key="i" :line="line"
                      :show-pinyin="store.settings.pinyin" :active="i === activeLine" />
        </template>
        <template v-else>
          <div v-for="(line, i) in piece.lines" :key="i" class="en-line" :class="{ active: i === activeLine }">
            <p class="en">{{ line.text }}</p>
            <p class="zh muted">{{ line.translate }}</p>
          </div>
        </template>
      </section>

      <section class="actions">
        <button @click="togglePlay">{{ playing ? '⏹ 停止' : '▶ 听范读' }}</button>
        <button :disabled="!canRecord || micDenied" :class="{ rec: recording }" @click="toggleRecord">
          {{ recording ? '⏺ 录音中…点击结束' : '🎙 录一遍' }}
        </button>
        <button :disabled="!lastRecording" @click="playMine">👂 听我读的</button>
        <button class="primary" :disabled="busy" @click="markRead">读完一遍 ✓</button>
        <p v-if="micError" class="error">{{ micError }}</p>
      </section>
    </div>
  </main>
</template>

<style scoped>
.reader { display: flex; flex-direction: column; height: calc(100vh - env(safe-area-inset-top) - env(safe-area-inset-bottom)); height: calc(100dvh - env(safe-area-inset-top) - env(safe-area-inset-bottom)); overflow: hidden; }
.reader .topbar { flex: none; }
.body { flex: 1; min-height: 0; display: grid; grid-template-columns: 1fr 260px; gap: 28px; align-items: stretch; }
@media (orientation: portrait) {
  .body { display: flex; flex-direction: column; gap: 16px; }
  .text { flex: 1; min-height: 0; }
  .actions { flex: none; flex-direction: row !important; flex-wrap: wrap; align-self: stretch; }
  .actions button { flex: 1 1 40%; }
}
.text { min-height: 0; overflow-y: auto; }
.meta { font-size: 24px; margin-top: 0; }
.actions { display: flex; flex-direction: column; gap: 18px; align-self: start; }
.actions button { min-height: 88px; font-size: 26px; }
.actions .rec { background: #e8453c; color: #fff; }
.rounds { font-size: 24px; color: var(--accent); }
.en-line { padding: 8px 14px; border-radius: 16px; margin-bottom: 14px; transition: background .2s; }
.en-line.active { background: var(--accent-soft); }
.en { font-size: 36px; line-height: 1.5; margin: 0; white-space: pre-line; }
.zh { font-size: 22px; margin: 4px 0 0; white-space: pre-line; }
.error { color: #c0392b; font-size: 18px; }
.celebrate { text-align: center; padding-top: 120px; font-size: 32px; }
.celebrate .big { font-size: 160px; animation: pop-in 0.6s ease-out; }
@keyframes pop-in {
  0% { transform: scale(0.3); opacity: 0; }
  70% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); }
}
</style>
