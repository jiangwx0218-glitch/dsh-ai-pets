#!/usr/bin/env node
/**
 * 自检：packs/*.json 的动画引用是否都能在素材目录里找到、catalog 与 packs 是否一致。
 * 素材不在仓库里，所以默认检查「配置本身合法」；给了 --src 就顺手核对素材。
 *
 *   node scripts/check-packs.mjs --src ~/.dsh/dsh-pet/pet
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { homedir } from 'node:os'

const args = process.argv.slice(2)
const argOf = (k, d) => {
  const i = args.indexOf('--' + k)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}
const SRC = resolve(argOf('src', join(homedir(), '.dsh', 'dsh-pet', 'pet')))
const checkAssets = existsSync(SRC)

const catalog = JSON.parse(readFileSync('lib/catalog.json', 'utf8'))
const PREFIXES = ['gpt', 'claude', 'gemini']

let bad = 0
const fail = (msg) => {
  console.error('✗ ' + msg)
  bad++
}

for (const prefix of PREFIXES) {
  const config = JSON.parse(readFileSync(join('packs', prefix + '.json'), 'utf8'))
  const a = config.animations
  if (!a) {
    fail(prefix + ': 没有 animations')
    continue
  }
  for (const key of ['idle', 'turn', 'drag', 'clicks']) {
    if (!Array.isArray(a[key]) || !a[key].length) fail(prefix + ': animations.' + key + ' 为空')
  }
  if (!a.moves || !Array.isArray(a.moves.actions) || !a.moves.default) fail(prefix + ': moves 不完整')
  if (!Array.isArray(a.categories) || !a.categories.length) fail(prefix + ': categories 为空')
  if (!a.events || !Array.isArray(a.events.balance) || !a.events.balance.length) fail(prefix + ': events.balance 缺失（dsh-pet 校验会拒绝）')

  const cat = catalog.packs.find((p) => p.prefix === prefix)
  if (!cat) fail(prefix + ': catalog 里没有这一只')

  if (checkAssets) {
    // 只收「动作名」：animations 各数组里的字符串 + categories[].actions + moves.actions[].name
    const refs = new Set()
    for (const key of ['idle', 'turn', 'drag', 'clicks']) for (const n of a[key] || []) refs.add(n)
    for (const arr of Object.values(a.events || {})) for (const n of arr || []) refs.add(n)
    for (const arr of Object.values(a.ambient || {})) {
      const list = Array.isArray(arr) ? arr : []
      for (const item of list) if (typeof item === 'string') refs.add(item)
    }
    for (const c of a.categories || []) for (const n of c.actions || []) refs.add(n)
    for (const m of a.moves.actions || []) refs.add(m.name)
    for (const k of ['start', 'loop', 'end']) for (const n of (a.sleep || {})[k] || []) refs.add(n)
    // 本地目录名可能是历史命名（gpt → gpt1），都试一遍
    const candidates = [prefix + '-animation', prefix === 'gpt' ? 'gpt1-animation' : ''].filter(Boolean)
    const dir = candidates.map((d) => join(SRC, d)).find((d) => existsSync(d)) || join(SRC, prefix + '-animation')
    const files = new Set(existsSync(dir) ? readdirSync(dir).map((f) => f.replace(/\.(webm|mov)$/, '')) : [])
    const missing = [...refs].filter((n) => !files.has(n) && n !== '' && !n.includes('/'))
    if (missing.length) fail(prefix + ': 素材缺 ' + missing.length + ' 个 → ' + missing.slice(0, 5).join(', '))
    else console.log('✓ ' + prefix + ': 配置引用 ' + refs.size + ' 个动画，素材齐全')
  } else {
    console.log('✓ ' + prefix + ': 配置结构合法（未核对素材，加 --src 可核对）')
  }
}

if (bad) {
  console.error('\n共 ' + bad + ' 个问题')
  process.exit(1)
}
console.log('\n全部通过')
