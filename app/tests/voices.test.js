import { test, expect } from 'vitest'
import { voiceQuality, voicesFor, pickVoice } from '../src/lib/voices.js'

const v = (name, lang, voiceURI = name) => ({ name, lang, voiceURI })
const voices = [
  v('Tingting', 'zh-CN', 'com.apple.voice.compact.zh-CN.Tingting'),
  v('Tingting (Enhanced)', 'zh-CN', 'com.apple.voice.enhanced.zh-CN.Tingting'),
  v('Lilian (Premium)', 'zh-CN', 'com.apple.voice.premium.zh-CN.Lilian'),
  v('Meijia', 'zh-TW', 'com.apple.voice.compact.zh-TW.Meijia'),
  v('Sinji', 'zh-HK', 'com.apple.voice.compact.zh-HK.Sinji'),
  v('Grandpa (Chinese (China mainland))', 'zh-CN', 'com.apple.eloquence.zh-CN.Grandpa'),
  v('Samantha', 'en-US', 'com.apple.voice.compact.en-US.Samantha'),
  v('Ava (Enhanced)', 'en-US', 'com.apple.voice.enhanced.en-US.Ava'),
  v('Daniel', 'en-GB', 'com.apple.voice.compact.en-GB.Daniel'),
  v('Bad News', 'en-US', 'com.apple.speech.synthesis.voice.BadNews'),
]

test('voiceQuality ranks premium > enhanced > compact and flags robotic voices', () => {
  expect(voiceQuality(voices[2])).toBe('premium')
  expect(voiceQuality(voices[1])).toBe('enhanced')
  expect(voiceQuality(voices[0])).toBe('standard')
  expect(voiceQuality(voices[5])).toBe('robotic')
  expect(voiceQuality(voices[9])).toBe('robotic')
})

test('novelty voices are robotic even when the voiceURI is just the name (Chrome)', () => {
  for (const name of ['Bad News', 'Albert', 'Zarvox', 'Grandpa (English (US))', 'Whisper'])
    expect(voiceQuality(v(name, 'en-US'))).toBe('robotic')
  expect(voiceQuality(v('Samantha', 'en-US'))).toBe('standard')
})

test('voicesFor lists mainland Chinese first, best quality first, no robotic voices', () => {
  expect(voicesFor(voices, 'cn').map((x) => x.name)).toEqual([
    'Lilian (Premium)', 'Tingting (Enhanced)', 'Tingting', 'Meijia', 'Sinji',
  ])
  expect(voicesFor(voices, 'en').map((x) => x.name)).toEqual(['Ava (Enhanced)', 'Samantha', 'Daniel'])
})

test('pickVoice honours a saved choice, else the best available', () => {
  expect(pickVoice(voices, 'cn', 'com.apple.voice.compact.zh-CN.Tingting').name).toBe('Tingting')
  expect(pickVoice(voices, 'cn', 'gone').name).toBe('Lilian (Premium)')
  expect(pickVoice(voices, 'en', '').name).toBe('Ava (Enhanced)')
  expect(pickVoice([], 'cn', '')).toBeNull()
})
