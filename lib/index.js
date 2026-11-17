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

/** 为什么装完必须重启：接在各条日志的「重启 DSH 才生效」后面。 */
const WHY_RESTART = '插件列表和桌面窗口在 DSH 启动时创建，运行中不会热加载'

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
 * @returns {Promise<'ready'|'installed'|'failed'>}
 */
async function installPack({ petDir, pack, baseUrl, log }) {
  const configSrc = join(PACKAGE_ROOT, 'packs', pack.prefix + '.json')
  const configDest = join(petDir, pack.prefix + '-config.json')
  const animDir = join(petDir, pack.prefix + '-animation')

  if (!existsSync(configDest)) {
    writeFileSync(configDest, readFileSync(configSrc))
    log(pack.name + ' 配置已写入 ' + configDest + '；装完需要重启 DSH 才生效：' + WHY_RESTART)
  }

  if (hasAssets(animDir)) return 'ready'

  const url = baseUrl.replace(/\/+$/, '') + '/' + pack.asset
  const tmp = join(tmpdir(), 'dsh-ai-pets-' + pack.prefix + '-' + process.pid + '.tar.gz')
  const mb = Math.round(pack.bytes / 1048576)
  log(pack.name + ' 素材缺失，开始下载：' + url)
  log('  素材是从 GitHub Release 下的 tar.gz，单个 100~155MB（' + pack.name + ' 约 ' + mb + 'MB）；网络慢的时候几分钟看不到一行进度是正常的，不代表卡死')
  log('  进度每 3 秒一行；源慢可以在 profile 的 cordis.patch.yml 里改 config.baseUrl 换下载源')

  try {
    const sha = await download(url, tmp, (got, total) => {
      const pct = total ? Math.round((got / total) * 100) : 0
      const gotMb = Math.round(got / 1048576)
      const totalMb = total ? Math.round(total / 1048576) : 0
      log(pack.name + ' 下载中 ' + gotMb + 'MB' + (total ? ' / ' + totalMb + 'MB (' + pct + '%)' : '') + '  源 ' + url + '（GitHub Release 的 tar.gz，网络慢会长时间没进度，慢可换 config.baseUrl）')
    })
    if (pack.sha256 && pack.sha256 !== sha) {
      const err = new Error('sha256 不匹配：期望 ' + pack.sha256 + '，实际 ' + sha)
      err.code = 'SHA_MISMATCH'
      throw err
    }
    mkdirSync(petDir, { recursive: true })
    await untar(tmp, petDir)
    if (!hasAssets(animDir)) throw new Error('解包后没有找到素材目录 ' + animDir)
    log(pack.name + ' 安装完成（' + readdirSync(animDir).length + ' 个动作，已解包到 ' + animDir + '）；装完需要重启 DSH 才生效：' + WHY_RESTART)
    return 'installed'
  } catch (err) {
    const reason = err && err.message ? err.message : String(err)
    log(pack.name + ' 安装失败：' + reason)
    if (err && err.code === 'SHA_MISMATCH') {
      log('  sha256 对不上：包可能没下全（网络中断、被截断），也可能下载源里的包被改过，先别拿它解包')
      log('  重试：素材仍然缺失，下次启动 DSH 会自动重下；也可以把 config.baseUrl 换成可信的源再试')
    } else {
      log('  下载没有成功（网络断开、源返回 404、超时都会这样），素材仍然缺失，下次启动 DSH 会自动重下；也可以把 config.baseUrl 换成别的源')
    }
    log('  手动兜底三步：')
    log('    1. 下载：' + url)
    log('    2. 解包：tar -xzf ~/Downloads/' + pack.asset + ' -C ' + petDir)
    log('    3. 重启 DSH 才生效：' + WHY_RESTART)
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

    const dshHome = resolveDshHome()
    const petDir = join(dshHome, 'dsh-pet', 'pet')
    const packs = CATALOG.packs.filter((p) => !opts.only.length || opts.only.includes(p.prefix))
    const packPrefixes = packs.map((p) => p.prefix).join(' / ') || '（当前 only 没有匹配到任何一只，检查 only 配置）'

    // 不阻塞启动：DSH 起来之后再慢慢装（下载 100MB+ 会挡住建窗）。
    const timer = setTimeout(async () => {
      try {
        if (!existsSync(petDir)) {
          log('没有找到 dsh-pet 的用户目录 ' + petDir)
          log('  缺的是 dsh-pet：素材要装进它建出来的目录，它没装就没有这个目录（当前 DSH_HOME 是 ' + dshHome + '）')
          log('  怎么补：先把 dsh-pet 插件装上，它启动时会建出这个目录；补完重启 DSH，本插件下次启动时再来装素材，本次跳过不影响 DSH 启动')
          return
        }
        if (!opts.autoInstall) {
          log('autoInstall 已关闭：只写配置文件，不下载素材')
          log('  素材请手动解压到 ' + petDir + '/<prefix>-animation/，其中 <prefix> 是 ' + packPrefixes + '，目录里要有 .webm 文件')
          log('  放完重启 DSH 才生效：' + WHY_RESTART)
        }
        // 每只的结果：ready=本来就有素材，installed=这次装上，failed=没装上。
        const results = []
        for (const pack of packs) {
          if (!opts.autoInstall && !existsSync(join(petDir, pack.prefix + '-config.json'))) {
            writeFileSync(join(petDir, pack.prefix + '-config.json'), readFileSync(join(PACKAGE_ROOT, 'packs', pack.prefix + '.json')))
          }
          if (!opts.autoInstall) continue
          const status = await installPack({ petDir, pack, baseUrl: opts.baseUrl, log })
          results.push({ prefix: pack.prefix, status })
        }
        const failed = results.filter((r) => r.status === 'failed')
        if (failed.length) {
          // 有失败就不许说「全部处理完毕」：README 拿那一行当「都装好了」的判据。
          log('有 ' + failed.length + ' 只没装上：' + failed.map((r) => r.prefix).join('、') + '（原因见上）；重启 DSH 后' + (failed.length === 1 ? '这只' : '这几只') + '不会出现')
          log('已经装好的不受影响；按上面的兜底办法补齐素材，再重启 DSH')
        } else {
          log('全部处理完毕，需要重启 DSH 才生效：' + WHY_RESTART + '；重启后桌面上就能看到（或到 dsh-pet 设置里启用）')
        }
      } catch (err) {
        log('出错：' + (err && err.stack ? err.stack : String(err)))
        log('  本次安装中断，不影响 DSH 启动；把上面的问题处理掉，重启 DSH 会重新尝试装素材')
      }
    }, 2500)

    // 插件卸载/进程退出时清掉定时器（Node 会自己退，这里只是礼貌）
    ctx.on?.('dispose', () => clearTimeout(timer))
  },
}
