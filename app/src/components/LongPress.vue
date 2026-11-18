<script setup>
import { ref, onUnmounted } from 'vue'

const props = defineProps({ ms: { type: Number, default: 2000 } })
const emit = defineEmits(['long'])
const pressing = ref(false)
let timer = null

function down() {
  clearTimeout(timer)
  pressing.value = true
  timer = setTimeout(() => {
    pressing.value = false
    emit('long')
  }, props.ms)
}
onUnmounted(() => clearTimeout(timer))

function up() {
  pressing.value = false
  clearTimeout(timer)
}
</script>

<template>
  <button class="long-press" :class="{ pressing }" :style="{ '--ms': ms + 'ms' }"
          @pointerdown="down" @pointerup="up" @pointerleave="up" @pointercancel="up" @contextmenu.prevent>
    <slot />
  </button>
</template>

<style scoped>
.long-press { position: relative; overflow: hidden; background: transparent; box-shadow: none; touch-action: none; -webkit-touch-callout: none; }
.long-press::after { content: ''; position: absolute; left: 0; bottom: 0; height: 4px; width: 0; background: var(--accent); }
.long-press.pressing::after { width: 100%; transition: width var(--ms) linear; }
</style>
