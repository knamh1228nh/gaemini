// node scripts/check-keys.mjs
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envPath = resolve(__dirname, '../.env.local')
const envVars = {}
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const [k, ...v] = line.split('=')
  if (k?.trim()) envVars[k.trim()] = v.join('=').trim()
}

const KEYS = [
  { label: 'KEY_1', value: envVars['GEMINI_API_KEY_1'] },
  { label: 'KEY_2', value: envVars['GEMINI_API_KEY_2'] },
  { label: 'KEY_3', value: envVars['GEMINI_API_KEY_3'] },
]

const MODELS = ['gemini-2.5-flash']

async function test(apiKey, model) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ parts: [{ text: 'hi' }] }] }),
    })
    const json = await res.json()
    if (res.ok) return '✅ OK'
    const code = json?.error?.code
    const msg = (json?.error?.message ?? '').split('\n').find(l => l.trim()) ?? ''
    return `❌ ${code} — ${msg.slice(0, 80)}`
  } catch (e) {
    return `❌ FETCH ERROR — ${e.message}`
  }
}

console.log('\n=== Gemini API Key 진단 ===\n')
for (const model of MODELS) {
  console.log(`📌 ${model}`)
  for (const key of KEYS) {
    if (!key.value) { console.log(`  ${key.label}: ⚠️  키 없음`); continue }
    const result = await test(key.value, model)
    console.log(`  ${key.label}: ${result}`)
  }
  console.log()
}
