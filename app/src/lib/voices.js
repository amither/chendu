// Picking a speech-synthesis voice. iPad ships small "compact" voices; the
// downloadable Enhanced / Premium ones sound far more natural, so prefer them.

const LANGS = { cn: ['zh-CN', 'zh'], en: ['en-US', 'en'] }
const QUALITY_RANK = { premium: 3, enhanced: 2, standard: 1, robotic: 0 }

// Apple's novelty and Eloquence voices. Safari exposes them by voiceURI
// prefix, Chrome only by name ("Grandpa (English (US))").
const ROBOTIC_NAMES = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'good news', 'jester',
  'organ', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox', 'fred', 'junior', 'ralph', 'kathy',
  'eddy', 'flo', 'grandma', 'grandpa', 'reed', 'rocko', 'sandy', 'shelley',
])

export function voiceQuality(voice) {
  const id = `${voice.voiceURI} ${voice.name}`.toLowerCase()
  const baseName = voice.name.toLowerCase().replace(/\s*\(.*$/, '')
  if (id.includes('eloquence') || id.includes('speech.synthesis.voice') || ROBOTIC_NAMES.has(baseName))
    return 'robotic'
  if (id.includes('premium')) return 'premium'
  if (id.includes('enhanced') || id.includes('增强')) return 'enhanced'
  return 'standard'
}

// 2 = preferred region (zh-CN / en-US), 1 = same language, 0 = other.
function langMatch(voice, subject) {
  const [exact, base] = LANGS[subject]
  const lang = voice.lang.replace('_', '-')
  if (lang === exact) return 2
  return lang.startsWith(base) ? 1 : 0
}

export function voicesFor(voices, subject) {
  return voices
    .filter((v) => langMatch(v, subject) > 0 && voiceQuality(v) !== 'robotic')
    .sort((a, b) =>
      langMatch(b, subject) - langMatch(a, subject) ||
      QUALITY_RANK[voiceQuality(b)] - QUALITY_RANK[voiceQuality(a)] ||
      a.name.localeCompare(b.name))
}

export function pickVoice(voices, subject, voiceURI) {
  const list = voicesFor(voices, subject)
  return list.find((v) => v.voiceURI === voiceURI) ?? list[0] ?? null
}

// iOS fills getVoices() asynchronously; wait briefly for voiceschanged.
export function loadVoices() {
  if (typeof speechSynthesis === 'undefined') return Promise.resolve([])
  const now = speechSynthesis.getVoices()
  if (now.length) return Promise.resolve(now)
  return new Promise((resolve) => {
    const done = () => resolve(speechSynthesis.getVoices())
    speechSynthesis.addEventListener('voiceschanged', done, { once: true })
    setTimeout(done, 1500)
  })
}
