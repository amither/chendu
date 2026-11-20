<script setup>
import { ref, computed, watch, onUnmounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAppStore } from '../stores/app.js'
import { createPlayer } from '../lib/player.js'
import { recorderSupported, startRecording } from '../lib/recorder.js'
import { saveRecording } from '../lib/recordings.js'
import { dateKey } from '../lib/streak.js'
import PinyinLine from '../components/PinyinLine.vue'
import { minReadSeconds } from '../lib/piece.js'
import { scoreRecording } from '../lib/scorer.js'
import { messageFor } from '../lib/deepseek.js'
import { tokensFor, marksFor, splitEnLine } from '../lib/scoring.js'

const props = defineProps({ subject: String, index: Number })
const store = useAppStore()
const router = useRouter()
const player = createPlayer({ tts: () => store.settings.tts })

const piece = ref(null)
const activeLine = ref(-1)
const playing = ref(false)
const recording = ref(null) // handle from startRecording
const lastRecording = ref(null) // Blob
const micError = ref('')
const micDenied = ref(false)
const celebrate = ref('') // '', 'done', 'star'
const busy = ref(false)
// A read only counts after a plausible reading time, so two quick taps on
// 读完一遍 can't finish a piece. The countdown starts when the piece opens
// and restarts after each counted read.
const cooldown = ref(0)
let cooldownTimer = null
function startCooldown(seconds) {
  clearInterval(cooldownTimer)
  cooldown.value = seconds
  cooldownTimer = setInterval(() => {
    if (--cooldown.value <= 0) clearInterval(cooldownTimer)
  }, 1000)
}
const starting = ref(false)

// Latest score for this piece: { status: 'scoring' | 'done' | 'error', score?, message? }
const scoring = ref(null)
let scoreToken = 0
const marks = computed(() =>
  scoring.value?.status === 'done' && piece.value ? marksFor(tokensFor(piece.value), scoring.value.score) : {})

function clearScore() {
  scoreToken++
  scoring.value = null
}

// Runs in the background: the child can keep reading while it scores.
async function maybeScore(rec, p) {
  const { key, auto } = store.settings.scoring
  if (!key || !auto) return
  const my = ++scoreToken
  scoring.value = { status: 'scoring' }
  try {
    const score = await scoreRecording(rec, p, key)
    if (my === scoreToken) scoring.value = { status: 'done', score }
  } catch (e) {
    if (my === scoreToken) scoring.value = { status: 'error', message: messageFor(e) }
  }
}
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
    clearScore()
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
    if (p) startCooldown(minReadSeconds(p))
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
    const p = piece.value
    try {
      const rec = { date: dateKey(), subject: props.subject, pieceId: p.id, round: count.value + 1, durationSec, blob }
      const id = await saveRecording(rec)
      maybeScore({ ...rec, id }, p)
    } catch {
      micError.value = '录音保存失败'
    }
    return
  }
  if (starting.value) return
  stopAll()
  clearScore()
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
  if (busy.value || cooldown.value > 0 || !item.value) return
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
    } else if (piece.value) {
      startCooldown(minReadSeconds(piece.value))
    }
  } finally {
    busy.value = false
  }
}

onUnmounted(() => {
  clearInterval(cooldownTimer)
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
          <PinyinLine v-for="(line, i) in piece.lines" :key="i" :line="line" :marks="marks[i]"
                      :show-pinyin="store.settings.pinyin" :active="i === activeLine" />
        </template>
        <template v-else>
          <div v-for="(line, i) in piece.lines" :key="i" class="en-line" :class="{ active: i === activeLine }">
            <p class="en">
              <template v-for="(part, k) in splitEnLine(line.text)" :key="k">
                <span v-if="part.word !== null" :class="marks[i]?.[part.word]">{{ part.text }}</span>
                <template v-else>{{ part.text }}</template>
              </template>
            </p>
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
        <button class="primary" :disabled="busy || cooldown > 0" @click="markRead">
          {{ cooldown > 0 ? `读完一遍 ✓（${cooldown}）` : '读完一遍 ✓' }}
        </button>
        <div v-if="scoring" class="score-card" :class="scoring.status">
          <template v-if="scoring.status === 'scoring'">打分中…</template>
          <template v-else-if="scoring.status === 'error'">{{ scoring.message }}</template>
          <template v-else>
            <div class="stars">{{ scoring.score.stars ? '⭐'.repeat(scoring.score.stars) : '再试一次也很棒' }}</div>
            <div class="num">{{ scoring.score.score }} 分</div>
            <div class="muted">读对 {{ scoring.score.n - scoring.score.wrong.length - scoring.score.missed.length }}/{{ scoring.score.n }} {{ subject === 'cn' ? '字' : '词' }}</div>
            <div v-if="scoring.score.comment" class="comment">{{ scoring.score.comment }}</div>
          </template>
        </div>
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
  .score-card { flex: 1 1 100%; }
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
.score-card { background: var(--card); border-radius: 20px; padding: 16px; text-align: center; font-size: 22px; box-shadow: 0 2px 6px rgba(0,0,0,.08); }
.score-card.scoring { color: var(--muted); }
.score-card .stars { font-size: 34px; }
.score-card .num { font-size: 30px; font-weight: 700; color: var(--accent); }
.score-card .comment { font-size: 20px; margin-top: 6px; }
.en span.wrong { color: #d93025; text-decoration: underline wavy #d93025; }
.en span.missed { color: #c4bcb2; }
.celebrate { text-align: center; padding-top: 120px; font-size: 32px; }
.celebrate .big { font-size: 160px; animation: pop-in 0.6s ease-out; }
@keyframes pop-in {
  0% { transform: scale(0.3); opacity: 0; }
  70% { transform: scale(1.1); opacity: 1; }
  100% { transform: scale(1); }
}
</style>
