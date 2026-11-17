# dsh-ai-pets · DSH 桌宠素材包

![GPT / Claude / Gemini 三只桌宠在桌面右下角排排站](docs/preview.gif)

给 [DeepSeek Harness](https://github.com/deepseek-harness) 的桌宠插件 `dsh-pet` 加三只 AI 桌宠：**GPT / Claude / Gemini**。装完它们会在桌面右下角排排站：会待机呼吸、会左右张望、被拖起来会手脚乱蹬、点一下会回应你、干活的时候会自己去忙、钱包见底了会皱眉。右键还有一整棵三级菜单（动作 / 吃喝 / 玩耍 / 才艺 / 情绪 / 工作 …），每只 92–166 个动作。

> 大肥鱼（DSH 内置那只鲸鱼娘）不在这里——她是 `dsh-pet` 自带的。本包只管这三只外来的 AI。

## 两步装完

**前提**：这台机器上已经有 DSH 本体（桌面版 App 或 `dsh web` 都行）。桌宠宿主插件 `dsh-pet` 不用另外去找，第 1 步把它和本包一起装——没有它就没有 `pet/` 目录，本包的素材没地方放。

**第 1 步：装两个插件。** 命令行和图形界面二选一，两个都要装：`dsh-pet` 是桌宠宿主（`pet/` 目录是它建的，本包的素材往里面放），`dsh-ai-pets` 是本包。

命令行（可复制，已有 `dsh` 命令就用这个）：

```bash
# 1) 先装桌宠宿主 dsh-pet；已经装过就跳过这一行
dsh plugin --profile desktop add dsh-pet

# 2) 装本包
dsh plugin --profile desktop add github:jiangwx0218-glitch/dsh-ai-pets
```

`--profile` 按你的安装形态填：桌面版 App 用 `desktop`，`dsh web` 起的是 `web`。没有 `dsh` 命令就改用下面的图形界面。

图形界面（不用命令行）：DSH → 设置 → 插件 → 添加插件，**加两次**：

1. 粘贴 `dsh-pet` → 点添加（已经装过就跳过）
2. 粘贴 `github:jiangwx0218-glitch/dsh-ai-pets` → 点添加

> 只加第 2 个是不够的：没有 `dsh-pet` 就没有 `pet/` 目录，本包的素材无处可放，日志里会是一句「没有找到 dsh-pet 的用户目录」然后什么都不装。

**第 2 步：重启 DSH。装完不重启，什么都看不见。**

- 桌面版：`Cmd+Q` 完全退出，再重新打开。
- `dsh web`：`Ctrl+C` 停掉，再跑一次 `dsh web`。

为什么必须重启：插件列表和桌宠窗口都是在 DSH 启动时创建的。运行中的 DSH 不会热加载新插件，也不会给新宠物开窗口。所以「装完没反应」的第一处理永远是重启一次再判断，不要急着怀疑装错。

> **第一次启动会下载素材。** 单只 100MB 上下，三只一共约 390MB，从 GitHub Release 拉 tar.gz。
>
> - 进度行每 3 秒打一次，但**只有真的收到数据才刷新**。数字涨得慢（126MB 里几分钟才走 20MB）是网慢，正常，继续等。
> - **判据是收尾那行**：出现 `[dsh-ai-pets] 全部处理完毕` 才是全部装好；出现 `有 N 只没装上：…` 就是没装完，按上面日志里的兜底办法补。
> - 如果 `开始下载` 之后**整整 5 分钟一行新日志都没有**（不是数字不动，是完全没有新行），基本可以判定源卡住了：`Cmd+Q` 退出 DSH，按下一节换源或手动放素材。
>
> 拉不动就跳下文「下载慢、装不上怎么办」。

## 详细说明

### 它到底装了什么

```
<DSH_HOME>/dsh-pet/pet/
├── gpt-config.json        # 宠物种类定义：动画池 + 事件 + 位置
├── gpt-animation/         # 92 个透明 webm
├── claude-config.json
├── claude-animation/      # 166 个
├── gemini-config.json
└── gemini-animation/      # 100 个
```

`<DSH_HOME>` 默认是 `~/.dsh`（有 `DSH_HOME` 环境变量时以它为准）。

`dsh-pet` 扫这个目录，看到 `*-config.json` 就注册一只新宠物，看到同前缀的 `*-animation/` 就取素材。
**前缀必须和文件名一致**——写错不会报错，只会安静地回落到内置素材（症状：名字是 GPT、动的却是大肥鱼）。

**素材不在插件包里**：单只 100MB 上下，塞进包里既不现实也没必要。包内只有配置和下载逻辑，视频在装完之后从 GitHub Release 拉，校验 sha256 再解包。

### 配置

写在 profile 的 `cordis.patch.yml` 里覆盖默认值：

```yaml
- insert:
    - id: dsh-ai-pets
      name: dsh-ai-pets
      config:
        autoInstall: true        # false = 只写配置，素材自己手动放
        only: [gpt, gemini]      # 只装这几只，默认全装
        baseUrl: https://github.com/jiangwx0218-glitch/dsh-ai-pets/releases/latest/download  # 默认值，换源改这里
```

改完重启 DSH 生效。

`only` 只认 `gpt` / `claude` / `gemini` 这三个名字。**拼错不会报错**：写成 `gptt` 就是一只都不装，日志里只剩一行收尾，看着像「装完了但没东西」。

### 位置调整

三只默认 `bottom-right`，`marginX` 40 / 220 / 400 排开。想换位置就改 `packs/*.json` 里的 `position`：

```json
"position": { "corner": "bottom-right", "marginX": 40, "marginY": 80 }
```

- `corner`：`top-left` / `top-right` / `bottom-left` / `bottom-right`
- `marginX` / `marginY`：离屏幕边的像素
- ⚠️ **`marginX` 别写负数**：`bottom-right` 的 x 是 `屏宽 - size - marginX`，负数会把窗口推出屏幕外（窗口在，只是看不见，容易以为没装上）

改完重启 DSH：桌面窗口列表是启动时建的，运行中改配置不会重新布局。

### 下载慢、装不上怎么办

先分清卡在哪一步：

| 现象 | 卡在哪 | 怎么办 |
| --- | --- | --- |
| 日志里一条 `[dsh-ai-pets]` 都没有 | 插件没被加载 | 确认真的重启过 DSH；确认设置 → 插件里有 `dsh-ai-pets` |
| 有 `素材缺失，开始下载`，之后每 3 秒一行的进度在涨（哪怕很慢） | 正在从 GitHub 拉 | 等；这是网慢，不是卡死 |
| `开始下载` 之后 5 分钟一行新日志都没有 | 源接了连接却不回数据 | 退出 DSH，换 `baseUrl` 或手动放素材 |
| `有 N 只没装上：…` | 装失败了 | 看上面那条失败原因，按兜底办法补素材 |
| `安装失败：HTTP 4xx` / `HTTP 5xx` | 源取不到 | 换 `baseUrl` 或手动放素材 |
| `sha256 不匹配` | 下到的包内容不对（没下全，或源被改过/重新压缩过） | 重启重试；仍不行就手动放素材 |

**素材下载地址是可配置的。** 配置项叫 `baseUrl`，默认值：

```
https://github.com/jiangwx0218-glitch/dsh-ai-pets/releases/latest/download
```

这个地址下面必须正好能取到三个文件，**文件名不能改**：`gpt.tar.gz`、`claude.tar.gz`、`gemini.tar.gz`。插件是按 `baseUrl + '/' + 文件名` 拼出来取的，所以换源就是换这一个前缀。

改法（profile 的 `cordis.patch.yml`）：

```yaml
- insert:
    - id: dsh-ai-pets
      name: dsh-ai-pets
      config:
        baseUrl: https://你的存储桶域名/dsh-ai-pets
```

结尾带不带 `/` 都行，插件会自己处理掉多余的斜杠。

**换成国内对象存储（阿里云 OSS / 腾讯云 COS / Cloudflare R2 都可以）**

1. 从 GitHub Release 页面把三个 `*.tar.gz` 下载下来。**不要解压，不要重新压缩。**
2. 原样上传到对象存储的一个目录，设成公开读。
3. 把这三个文件的公开前缀填进 `baseUrl`，然后自己验一下：浏览器或 `curl` 能直接下到 `https://你的前缀/gpt.tar.gz`（返回 200 而不是 403/404）。
4. 重启 DSH。

为什么强调「原样上传」：`lib/catalog.json` 里写死了三个包的 sha256，插件下完会校验。**文件内容只要差一个字节（重新压过、多套了一层目录、被网关改过），就会 `sha256 不匹配` 并放弃安装。**

**手动放素材（完全不走下载）**

```bash
# 把三只（或任意一只）的 tar.gz 下下来，直接解到宠物目录
tar -xzf gpt.tar.gz -C ~/.dsh/dsh-pet/pet/
```

用 `DSH_HOME` 的话，`-C` 后面换成 `$DSH_HOME/dsh-pet/pet/`。解压完应该是 `pet/gpt-animation/*.webm`；如果变成 `pet/gpt-animation/gpt-animation/`，说明包被人重新压过，把里面那层挪上来。放完重启 DSH。插件下次启动看到素材目录里已经有 webm，就不会再下这一只。

**关于超时和重试**：插件不会阻塞 DSH 启动，失败只写日志、不弹窗。想重试就重启 DSH——已经装好的那几只会被跳过，只补缺的。

**没有超时保护的是这一种**：源连上了、但一个字节都不回。这时候插件会一直等，日志停在「开始下载」那行不动，也不会自己失败退出（这是当前实现的上限，改配置改不掉）。判据就是上面那条：5 分钟一行新行都没有，就自己退出 DSH，换源或手动放素材。

### 常见问题

**装完桌面上没有宠物**
先确认重启过 DSH（不是关窗口，是退出进程）。再确认设置 → 插件里 `dsh-ai-pets` 是启用状态，且 `<DSH_HOME>/dsh-pet/pet/` 下有 `*-config.json` 和对应的 `*-animation/`。素材没下来的话只有配置没有动画目录，宠物不会出现——看上一节。

**名字有了，动作还是大肥鱼的**
素材目录名和配置前缀对不上。检查 `pet/<prefix>-animation/` 是否存在、里面是否有 `.webm`。

**视频是黑底 / 不透明**
透明视频是 VP9 + `yuva420p` + `ALPHA_MODE=1` 元数据。`ffprobe` 里看不到 alpha 平面是正常的（显示 `yuv420p` 也不代表坏了），要用**支持 alpha 的 webm 解码**（Chromium / Electron 默认支持，Safari 不支持）。

**换了素材浏览器还是旧的**
素材路由带 `cache-control: max-age=3600`。改完素材要 `Cmd+Shift+R` 硬刷，或者重启。

**装坏了想卸掉**

```bash
dsh plugin --profile <profile> remove dsh-ai-pets
```

素材目录 `<DSH_HOME>/dsh-pet/pet/` 下的文件不会自动删，要清就自己删 `*-config.json` 和 `*-animation/`（**只删这三只前缀的，别动 dsh-pet 自带的 `dsh` 前缀**）。

### 素材从哪来 / 能不能商用

**能发内容，不能商用。** 详见 [NOTICE.md](NOTICE.md)：

- 素材原始作者：[PC2005-cloud/dsh-pet](https://github.com/PC2005-cloud/dsh-pet)（表情与动作原案）
- 整理与打包：[hunmer/aboutme-pets](https://github.com/hunmer/aboutme-pets)（精灵图 + 动作元数据 + 转换脚本）
- 本仓库做的是：精灵图 → 透明 webm、配置生成、插件化封装

上游明确要求：**素材禁止商用；二创在公开渠道须署名上游仓库**。所以拿去做视频、发抖音可以，接商单/带货/卖钱不行，并且要署名。

### 开发

```bash
# 本机素材（~/.dsh/dsh-pet/pet/）重新打 Release 包 + 算 sha256 写 catalog
node scripts/build-release.mjs --out dist \
  --base-url https://github.com/jiangwx0218-glitch/dsh-ai-pets/releases/latest/download

# 冒烟测试：本地起个静态服指 dist，用假 DSH_HOME 跑一遍安装链路
# （DSH_HOME 里必须先有 dsh-pet/pet 目录，模拟已装好桌宠宿主）
mkdir -p /tmp/aipets-home/dsh-pet/pet
python3 -m http.server 8791 --directory dist &
DSH_HOME=/tmp/aipets-home node test/apply-smoke.mjs '{"baseUrl":"http://127.0.0.1:8791","only":["gpt"]}'
```

`scripts/check-packs.mjs` 校验 `packs/*.json` 与 `lib/catalog.json` 的前缀/文件名是否对得上。

发布：`./scripts/publish.sh v0.1.0`（打包 → 自检 → `gh release create` 上传三只 tar.gz），然后提交代码、打 tag 推送。仓库目前没有自动发布 workflow，`.github/workflows/ci.yml` 只做语法与清单检查。

## License

- 代码（`lib/` `packs/` `scripts/`）：MIT
- 素材（`dist/*.tar.gz` 里的 webm，以及 `packs/` 里的动画清单）：CC BY-NC-SA 4.0，署名见 NOTICE.md
