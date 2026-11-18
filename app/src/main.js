import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { router } from './router.js'
import './style.css'
import './lib/sw.js'

createApp(App).use(createPinia()).use(router).mount('#app')
