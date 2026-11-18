<script setup>
import { onMounted, ref } from 'vue'
import { useAppStore } from './stores/app.js'

const store = useAppStore()
const error = ref('')

async function load() {
  error.value = ''
  try {
    await store.load()
  } catch (e) {
    error.value = e?.message ?? String(e)
  }
}
onMounted(load)
</script>

<template>
  <RouterView v-if="store.loaded" />
  <div v-else-if="error" class="load-error">
    <p>加载失败：{{ error }}</p>
    <button @click="load">重试</button>
  </div>
</template>
