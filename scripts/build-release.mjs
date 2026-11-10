#!/usr/bin/env node
/**
 * 打包三只宠物的素材 → dist/<prefix>.tar.gz，并写 lib/catalog.json。
 *
 * 用法：
 *   node scripts/build-release.mjs \
 *     --src ~/.dsh/dsh-pet/pet \
 *     --out dist \
 *     --base-url https://github.com/<owner>/dsh-ai-pets/releases/latest/download
 *
 * 素材目录名（<src>/<from>-animation）和发布名（<prefix>-animation）可以不同：
 * 本地装的可能是 gpt1，发布统一叫 gpt。
 */
import { createHash } from 'node:crypto'
import { createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { spawn } from 'node:child_process'
import { homedir } from 'node:os'

const PACKS = [
  { prefix: 'gpt', from: 'gpt1', name: 'GPT' },
  { prefix: 'claude', from: 'claude', name: 'Claude' },
  { prefix: 'gemini', from: 'gemini', name: 'Gemini' },
]

const args = process.argv.slice(2)
const argOf = (k, d) => {
  const i = args.indexOf('--' + k)
  return i >= 0 && args[i + 1] ? args[i + 1] : d
}

const SRC = resolve(argOf('src', join(homedir(), '.dsh', 'dsh-pet', 'pet')))
const OUT = resolve(argOf('out', 'dist'))
const BASE_URL = argOf('base-url', 'https://github.com/OWNER/dsh-ai-pets/releases/latest/download')

function tar(fromDir, outFile, innerRename) {
  return new Promise((res, rej) => {
    // bsdtar（macOS 自带）的 -s 用 sed 风格分隔符：/正则/替换/
    const rule = '/' + innerRename[0] + '/' + innerRename[1] + '/'
    const p = spawn('tar', ['-czf', outFile, '-s', rule, '-C', SRC, fromDir], {
      stdio: 'inherit',
    })
    p.on('error', rej)
    p.on('exit', (c) => (c === 0 ? res() : rej(new Error('tar exit ' + c))))
  })
}

function sha256(file) {
  return new Promise((res, rej) => {
    const h = createHash('sha256')
    createReadStream(file)
      .on('data', (d) => h.update(d))
      .on('end', () => res(h.digest('hex')))
      .on('error', rej)
  })
}

rmSync(OUT, { recursive: true, force: true })
mkdirSync(OUT, { recursive: true })

const packs = []
for (const pack of PACKS) {
  const srcDir = join(SRC, pack.from + '-animation')
  if (!existsSync(srcDir)) {
    console.error('跳过 ' + pack.prefix + '：没找到 ' + srcDir)
    continue
  }
  const asset = pack.prefix + '.tar.gz'
  const outFile = join(OUT, asset)
  process.stderr.write('打包 ' + pack.name + ' …\n')
  await tar(pack.from + '-animation', outFile, [pack.from + '-animation', pack.prefix + '-animation'])
  const st = statSync(outFile)
  const sum = await sha256(outFile)
  const actions = readdirSync(srcDir).filter((f) => f.endsWith('.webm')).length
  packs.push({
    prefix: pack.prefix,
    name: pack.name,
    asset,
    bytes: st.size,
    sha256: sum,
    actions,
  })
  process.stderr.write('  → ' + asset + ' ' + (st.size / 1048576).toFixed(1) + 'MB / ' + actions + ' 个动作\n')
}

const catalog = { schemaVersion: 1, baseUrl: BASE_URL, packs }
writeFileSync(join(process.cwd(), 'lib', 'catalog.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(JSON.stringify(catalog, null, 2))
