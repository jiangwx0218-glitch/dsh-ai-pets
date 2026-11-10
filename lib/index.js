/**
 * dsh-ai-pets — 宿主半侧（Cordis 插件）。
 *
 * 作用只有一个：把 GPT / Claude / Gemini 三只桌宠装进 dsh-pet 的用户数据目录
 * （<DSH_HOME>/dsh-pet/pet/），装完 dsh-pet 自己就会发现它们。
 *
 * 素材（webm）不随 npm 包发布——单个宠物 100~155MB，塞进包里谁都装不动。
 * 真正装的时候从 GitHub Release 拉 tar.gz，校验 sha256 后解包。
 *
 * 目录约定（由 dsh-pet 决定，不能改）：
 *   <DSH_HOME>/dsh-pet/pet/<prefix>-config.json    宠物种类定义（动画池 + 素材目录名）
 *   <DSH_HOME>/dsh-pet/pet/<prefix>-animation/*.webm  透明视频素材
 * 前缀必须和配置文件名一致：dsh-pet 的素材路由按「配置条目前缀」找目录，
 * 找不到会安静地回落成内置大肥鱼的素材。
 */
import { createWriteStream, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir, tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { createHash } from 'node:crypto'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import { fileURLToPath } from 'node:url'

const PACKAGE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CATALOG = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'lib', 'catalog.json'), 'utf8'))

const TAG = '[dsh-ai-pets]'

/** DSH 用户数据根：优先 DSH_HOME，否则 ~/.dsh（与 dsh-pet 一致）。 */
function resolveDshHome() {
  const fromEnv = process.env.DSH_HOME
  if (fromEnv && fromEnv.trim()) return fromEnv.trim()
  return join(homedir(), '.dsh')
}

/** 目录里是否已经有可用素材（至少一个 webm）。 */
function hasAssets(dir) {
  try {
    return readdirSync(dir).some((f) => f.endsWith('.webm') || f.endsWith('.mov'))
  } catch {
    return false
  }
}

/** 流式下载并落盘，返回 sha256。 */
async function download(url, dest, onProgress) {
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error('HTTP ' + res.status + ' ' + url)
  const total = Number(res.headers.get('content-length') || 0)
  const hash = createHash('sha256')
  let got = 0
  let lastTick = 0
  const body = Readable.fromWeb(res.body)
  body.on('data', (chunk) => {
    hash.update(chunk)
    got += chunk.length
    const now = Date.now()
    if (onProgress && now - lastTick > 3000) {
      lastTick = now
      onProgress(got, total)
    }
  })
  await pipeline(body, createWriteStream(dest))
  return hash.digest('hex')
}

/** tar -xzf（macOS / Linux / Windows 10+ 都自带 tar）。 */
function untar(file, into) {
  return new Promise((resolve, reject) => {
    const p = spawn('tar', ['-xzf', file, '-C', into], { stdio: 'ignore' })
    p.on('error', reject)
    p.on('exit', (code) => (code === 0 ? resolve() : reject(new Error('tar exit ' + code))))
  })
}

/**
 * 装一只宠物：缺配置就补配置，缺素材就下载解包。
 * @returns {Promise<'ready'|'installed'|'skipped'>}
 */
async function installPack({ petDir, pack, baseUrl, log }) {
  const configSrc = join(PACKAGE_ROOT, 'packs', pack.prefix + '.json')
  const configDest = join(petDir, pack.prefix + '-config.json')
  const animDir = join(petDir, pack.prefix + '-animation')

  if (!existsSync(configDest)) {
    writeFileSync(configDest, readFileSync(configSrc))
    log(pack.name + ' 配置已写入 ' + configDest)
  }

  if (hasAssets(animDir)) return 'ready'

  const url = baseUrl.replace(/\/+$/, '') + '/' + pack.asset
  const tmp = join(tmpdir(), 'dsh-ai-pets-' + pack.prefix + '-' + process.pid + '.tar.gz')
  log(pack.name + ' 素材缺失，开始下载（约 ' + Math.round(pack.bytes / 1048576) + 'MB）：' + url)

  try {
    const sha = await download(url, tmp, (got, total) => {
      const pct = total ? Math.round((got / total) * 100) : 0
      log(pack.name + ' 下载中 ' + Math.round(got / 1048576) + 'MB' + (total ? ' / ' + Math.round(total / 1048576) + 'MB (' + pct + '%)' : ''))
    })
    if (pack.sha256 && pack.sha256 !== sha) {
      throw new Error('sha256 不匹配：期望 ' + pack.sha256 + '，实际 ' + sha)
    }
    mkdirSync(petDir, { recursive: true })
    await untar(tmp, petDir)
    if (!hasAssets(animDir)) throw new Error('解包后没有找到素材目录 ' + animDir)
    log(pack.name + ' 安装完成（' + readdirSync(animDir).length + ' 个动作）')
    return 'installed'
  } catch (err) {
    log(pack.name + ' 安装失败：' + (err && err.message ? err.message : String(err)))
    log('  → 可以手动下载后解压到 ' + petDir + '：' + url)
    return 'failed'
  } finally {
    try {
      rmSync(tmp, { force: true })
    } catch {}
  }
}

export default {
  name: 'dsh-ai-pets',
  apply(ctx, config) {
    const opts = {
      autoInstall: true,
      only: [],
      baseUrl: CATALOG.baseUrl,
      ...(config || {}),
    }

    const log = (msg) => {
      try {
        ctx.logger ? ctx.logger('info', TAG + ' ' + msg) : console.log(TAG, msg)
      } catch {
        console.log(TAG, msg)
      }
    }

    const petDir = join(resolveDshHome(), 'dsh-pet', 'pet')
    const packs = CATALOG.packs.filter((p) => !opts.only.length || opts.only.includes(p.prefix))

    // 不阻塞启动：DSH 起来之后再慢慢装（下载 100MB+ 会挡住建窗）。
    const timer = setTimeout(async () => {
      try {
        if (!existsSync(petDir)) {
          log('没有找到 dsh-pet 的用户目录 ' + petDir + '，先装 dsh-pet 再来装素材')
          return
        }
        if (!opts.autoInstall) {
          log('autoInstall 已关闭，只写入配置文件；素材请手动放到 ' + petDir)
        }
        for (const pack of packs) {
          if (!opts.autoInstall && !existsSync(join(petDir, pack.prefix + '-config.json'))) {
            writeFileSync(join(petDir, pack.prefix + '-config.json'), readFileSync(join(PACKAGE_ROOT, 'packs', pack.prefix + '.json')))
          }
          if (!opts.autoInstall) continue
          await installPack({ petDir, pack, baseUrl: opts.baseUrl, log })
        }
        log('全部处理完毕，重启 DSH 后桌面上就能看到（或到 dsh-pet 设置里启用）')
      } catch (err) {
        log('出错：' + (err && err.stack ? err.stack : String(err)))
      }
    }, 2500)

    // 插件卸载/进程退出时清掉定时器（Node 会自己退，这里只是礼貌）
    ctx.on?.('dispose', () => clearTimeout(timer))
  },
}
