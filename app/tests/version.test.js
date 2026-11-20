import { test, expect } from 'vitest'
import { buildVersion, updateStatus } from '../src/lib/version.js'

test('buildVersion uses Beijing time and a short sha', () => {
  // 2026-11-20 02:05 UTC = 10:05 in Beijing
  expect(buildVersion(new Date(Date.UTC(2026, 10, 20, 2, 5)), '63ccae0f1234')).toBe('2026.11.20-1005-63ccae0')
  expect(buildVersion(new Date(Date.UTC(2026, 10, 20, 2, 5)), '')).toBe('2026.11.20-1005')
})

test('updateStatus', () => {
  expect(updateStatus({ current: 'a', latest: 'b', needRefresh: true })).toEqual({ kind: 'ready', text: '发现新版本 b' })
  expect(updateStatus({ current: 'a', latest: 'a', needRefresh: false })).toEqual({ kind: 'latest', text: '已是最新版本' })
  expect(updateStatus({ current: 'a', latest: 'b', needRefresh: false }).kind).toBe('downloading')
  expect(updateStatus({ current: 'a', latest: null, needRefresh: false }).kind).toBe('offline')
  expect(updateStatus({ current: 'a', latest: null, needRefresh: true }).kind).toBe('ready')
})
