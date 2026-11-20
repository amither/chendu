<script setup>
import { computed } from 'vue'
import { lineChars } from '../lib/piece.js'

const props = defineProps({ line: Object, showPinyin: Boolean, active: Boolean, marks: Object })
const chars = computed(() => lineChars(props.line))
</script>

<template>
  <p class="cn-line" :class="{ active }">
    <ruby v-for="(ch, i) in chars" :key="i" :class="marks?.[i]">{{ ch.c }}<rt>{{ showPinyin ? ch.p : '' }}</rt></ruby>
  </p>
</template>

<style scoped>
.cn-line { font-size: 44px; line-height: 1.9; margin: 6px 0; padding: 0 12px; border-radius: 16px; transition: background .2s; }
.cn-line.active { background: var(--accent-soft); }
ruby { margin: 0 2px; }
ruby.wrong { color: #d93025; text-decoration: underline wavy #d93025; text-underline-offset: 8px; }
ruby.missed { color: #c4bcb2; }
rt { font-size: 20px; color: var(--muted); font-family: 'Helvetica Neue', sans-serif; }
</style>
