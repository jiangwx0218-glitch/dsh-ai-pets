/**
 * 冒烟测试：用假的 ctx 跑一遍插件逻辑，验证「写配置 + 下载 + 解包」这条链路。
 *
 *   DSH_HOME=/tmp/aipets-home node test/apply-smoke.mjs '{"baseUrl":"http://127.0.0.1:8791","only":["gpt"]}'
 *
 * 真跑 DSH 之前先用它确认，不然每次都要重启 DSH 才知道错在哪。
 */
import plugin from '../lib/index.js'

const config = process.argv[2] ? JSON.parse(process.argv[2]) : {}

const ctx = {
  logger(level, msg) {
    console.log(msg)
  },
  on() {},
}

const done = new Promise((resolve) => {
  const orig = console.log
  console.log = (...a) => {
    orig(...a)
    if (String(a[0]).includes('全部处理完毕')) resolve()
  }
})

plugin.apply(ctx, config)
await done
