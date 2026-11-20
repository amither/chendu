import { test, expect } from 'vitest'
import { mixdown, resample, encodeWav } from '../src/lib/wav.js'

test('mixdown averages channels', () => {
  expect([...mixdown([new Float32Array([1, 0]), new Float32Array([0, 1])])]).toEqual([0.5, 0.5])
  const mono = new Float32Array([0.25])
  expect(mixdown([mono])).toBe(mono)
})

test('resample to a lower rate averages blocks and keeps duration', () => {
  const out = resample(new Float32Array([1, 1, 1, 0, 0, 0]), 48000, 16000)
  expect([...out]).toEqual([1, 0])
  expect(resample(new Float32Array(44100), 44100, 16000)).toHaveLength(16000)
  const same = new Float32Array([1])
  expect(resample(same, 16000, 16000)).toBe(same)
})

test('encodeWav writes a 16-bit mono PCM header and clamped samples', () => {
  const buf = encodeWav(new Float32Array([0, 1, -1, 2]), 16000)
  const v = new DataView(buf)
  const str = (o, n) => String.fromCharCode(...new Uint8Array(buf, o, n))
  expect(buf.byteLength).toBe(44 + 8)
  expect(str(0, 4)).toBe('RIFF')
  expect(v.getUint32(4, true)).toBe(36 + 8)
  expect(str(8, 8)).toBe('WAVEfmt ')
  expect(v.getUint16(20, true)).toBe(1) // PCM
  expect(v.getUint16(22, true)).toBe(1) // mono
  expect(v.getUint32(24, true)).toBe(16000)
  expect(v.getUint32(28, true)).toBe(32000)
  expect(v.getUint16(34, true)).toBe(16)
  expect(str(36, 4)).toBe('data')
  expect(v.getUint32(40, true)).toBe(8)
  expect([0, 1, 2, 3].map((i) => v.getInt16(44 + i * 2, true))).toEqual([0, 32767, -32768, 32767])
})
