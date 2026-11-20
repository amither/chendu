import { createRouter, createWebHashHistory } from 'vue-router'
import Home from './views/Home.vue'
import DayList from './views/DayList.vue'
import Reader from './views/Reader.vue'
import Settings from './views/Settings.vue'
import Recordings from './views/Recordings.vue'
import Plan from './views/Plan.vue'

export const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/day/:subject', component: DayList, props: true },
    {
      path: '/read/:subject/:index',
      component: Reader,
      props: (r) => ({ subject: r.params.subject, index: Number(r.params.index) }),
    },
    { path: '/settings', component: Settings },
    { path: '/recordings', component: Recordings },
    { path: '/plan/:subject', component: Plan, props: true },
  ],
})
