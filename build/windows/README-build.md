# build/windows/ · Windows 安装包构建说明

给谁看：以后要重新打这个 exe、或者想知道这个包到底装了什么的人。

**最重要的一句先说：exe 编出来了，但一次都没在 Windows 上跑过。** 能编出来 ≠ 能用。

## 现在什么状态

| 项 | 状态 |
| --- | --- |
| `installer.nsi` | **已编译通过**（2026-11-18，makensis 3.13）。编译全程未改动，sha256 `51822d60…` 与编译前备份一致 |
| `build.sh` | 写好，**本次没跑**；实际是直接调 `makensis`（见下「怎么编」）。脚本逻辑未在本机验证 |
| `NOTICE-summary.txt` | 许可页正文，UTF-8 带 BOM |
| 产物 `dist/dsh-pet-Setup.exe` | **已生成**：586,138,102 字节（559 MiB），sha256 `2df6740b187ce25342ff6bfd8eced670689d29906af61834230212dde3f30e61` |
| 在 Windows 上装一遍 | **没做过**。双击、托盘、右键菜单、覆盖安装、卸载、`/S` 静默全部未验证 |

## 工具从哪来（Homebrew）

NSIS 和 7-Zip 都用 Homebrew 装。**这台机器上 Homebrew 本来就有**（`/opt/homebrew`，Apple Silicon），装的时候没要 sudo、没弹密码。

```sh
brew install nsis sevenzip
```

- `nsis` 提供 `makensis`（v3.13），是编译本身要用的。
- `sevenzip`（26.06）**只用来列包内清单**，不参与编译。`bsdtar` 认不出 NSIS 归档，没有它就只能知道 exe 多大、不知道里面装了什么。只想编译、不想装它也行。

装完核对：

```sh
which makensis        # /opt/homebrew/bin/makensis
makensis -VERSION     # v3.13
brew list --versions nsis sevenzip
```

这条 `brew install` 是幂等的：已经装了只会说 `already installed and up-to-date`，不会重装、不会动别的东西。实测输出：

```
Warning: makensis 3.13 is already installed and up-to-date.
Warning: sevenzip 26.06 is already installed and up-to-date.
```

## 怎么编

```sh
# 0. 装工具（只装一次，重复跑无害）
brew install nsis sevenzip

# 1. 脚本方式：先做 payload / makensis 前置检查，再编译，最后打 sha256
sh build/windows/build.sh

# 2. 直接跑 makensis（2026-11-18 实际用的方式：两个路径都喂绝对路径）
makensis -DPAYLOAD="/abs/path/build/payload" \
         -DOUT_FILE="/abs/path/dist/dsh-pet-Setup.exe" \
         /abs/path/build/windows/installer.nsi

# 3. 或者 cd 到脚本所在目录再编，让默认的 ..\payload 生效
cd build/windows && makensis installer.nsi

# 换 payload 来源
sh -c 'PAYLOAD=/tmp/payload sh build/windows/build.sh'
```

> 相对路径基准：`.nsi` 里的 `PAYLOAD` 默认是 `..\payload`（相对 build/windows/）。
> makensis 按「脚本所在目录」还是「当前工作目录」解析相对路径，不同指南说法不一致，
> 所以一律传绝对路径，不受这个影响。手敲 `makensis` 时也请用带绝对路径的写法。

产物：`dist/dsh-pet-Setup.exe`（`OUT_FILE` 可用 `-DOUT_FILE=` 覆盖）。

**编译时它不吭声是正常的。** `-V2` 下脚本没错、没 warning，makensis 一行 stdout 都不打，
看起来像卡住了。真想看进度加 `-V4`。

编译耗时：811 MB payload、solid LZMA，**实测 171 秒**（M4 / 16 GB）。构建机建议 ≥8 GB 空闲内存；
内存吃紧把 `installer.nsi` 里的 `SetCompressor /SOLID lzma` 换成下一行的 `zlib`（包更大、更快）。

## 本次编译实测（2026-11-18）

| 项 | 实测值 |
| --- | --- |
| `makensis` | `/opt/homebrew/bin/makensis`，`v3.13` |
| 退出码 | `COMPILE_RC=0` |
| 耗时 | 171 秒 |
| 标准输出 | 空（无错、无 warning；告警扫描 `warning\|error\|no files found` 命中 0 行） |
| 产物 | `dist/dsh-pet-Setup.exe`，586,138,102 字节 |
| sha256 | `2df6740b187ce25342ff6bfd8eced670689d29906af61834230212dde3f30e61`（2026-11-18 独立重算核对过） |
| `file(1)` | `PE32 executable (GUI) Intel 80386, for MS Windows, Nullsoft Installer self-extracting archive` |
| PE 头 | `4d5a`（MZ）；`NullsoftInst` 命中 1 次；不是 Mach-O（`lipo` 认不出，正常） |
| 7z 识别 | `SubType = NSIS-3 Unicode`，`Method = LZMA:23`，`Solid = +`，`Embedded Stub Size = 54272` |

包内清单（`7zz l`，只列名字、未导出素材）：归档共 442 条，扣掉 7z 自身元信息 = 441。

| 一级路径 | 条数 | 是什么 |
| --- | --- | --- |
| `$PROFILE/` | 362 | 用户数据 `.dsh/dsh-pet/…`：1 个 `main-config.jsonc` + 3 个 `*-config.json` + 358 个 `*.webm` |
| `locales/` | 55 | 语言包 |
| `<根>` | 19 | 18 个 payload 根文件 + 编译时生成的 `uninstall.exe` |
| `$PLUGINSDIR/` | 4 | `modern-wizard.bmp`、`nsDialogs.dll`、`System.dll`、`nsExec.dll` |
| `resources/` | 1 | `app.asar` |

`18 + 55 + 1 + 362 = 436`，与 `build/payload` 的 436 个文件、`payload-manifest.sha256` 的 436 行三方对齐。

扩展名分布：`webm 358 / pak 58 / dll 11 / json 4 / exe 2 / bin 2 / jsonc 1 / asar 1 / html 1 / txt 1 / dat 1 / bmp 1`。

另外核对了包内 `main-config.jsonc` 确实是改名后的版本（`"name": "蓝毛小女仆"`、`"display": "none"`），
`gpt-config.json` 的 `display` 是 `desktop`，claude/gemini 是 `none`。

## 这个 exe 没有签名

没有拿到代码签名证书，`dsh-pet-Setup.exe` 是未签名二进制。用户双击时
Windows SmartScreen 会拦一道「Windows 已保护你的电脑」，要点「更多信息 → 仍要运行」。
这不是 bug，是真实现状；要消掉它只有买 EV/OV 证书做 Authenticode 签名（另开任务）。
安装器本身不申请管理员权限（`RequestExecutionLevel user`），所以不会有 UAC 弹窗。

## 安装器做什么

| 阶段 | 行为 |
| --- | --- |
| 权限 | 每用户安装，写 `$LOCALAPPDATA` 和 `HKCU`，不碰系统和 Program Files |
| 页面 | 欢迎 → 许可/说明（NOTICE 摘要）→ 目录选择 → 安装 → 完成（「立即运行」默认勾选） |
| 默认目录 | `%LOCALAPPDATA%\dsh-pet` |
| 程序文件 | payload 根下 18 个文件 → `$INSTDIR`；`locales\` 55 个、`resources\app.asar` 1 个 → 各自子目录 |
| 用户数据 | `payload\userdata\.dsh\*` → `%USERPROFILE%\.dsh\`（362 个文件：main-config.jsonc + 三套 pet 配置 + 358 个 webm） |
| 已存在文件 | 用户数据段 `SetOverwrite off`：目标已存在就跳过，用户改过的配置和已有动画不被覆盖 |
| 旧安装 | 交互模式：检测到 `$INSTDIR\dsh-pet.exe` 就弹一次确认，选「否」中止；`/S` 静默安装直接覆盖 |
| 覆盖前 | `taskkill /f /im dsh-pet.exe`，失败不中断（防止 exe 被占用导致拷贝失败） |
| 快捷方式 | 开始菜单、桌面各一个 **`dsh-pet.lnk`**（`SHORTCUT_NAME` 常量），指向 `$INSTDIR\dsh-pet.exe` |
| 卸载登记 | `HKCU\Software\Microsoft\Windows\CurrentVersion\Uninstall\dsh-pet`：DisplayName / DisplayVersion / Publisher / DisplayIcon / EstimatedSize / UninstallString / QuietUninstallString / NoModify / NoRepair（另加 InstallLocation、URLInfoAbout）。DisplayName 仍是「dsh-pet 桌面版」 |
| EstimatedSize | `427080` KB = 装进 `$INSTDIR` 的 437,329,277 字节；全量（含用户数据）是 829,966 KB |
| 卸载·程序 | taskkill（失败不中断）→ 删两个 `dsh-pet.lnk` → 删 HKCU 登记项 → `RMDir /r $INSTDIR` |
| 卸载·宠物数据 | 交互卸载弹一次「是否一并删除宠物数据？」：选「是」→ `RMDir /r %USERPROFILE%\.dsh\dsh-pet`，随后 `RMDir %USERPROFILE%\.dsh`（不带 `/r`，目录空了才删得掉；机器上还装着 DSH 插件版时它删不掉，这是故意的）；选「否」→ 原样保留约 394 MB |
| 卸载·静默 `/S` | `IfSilent keep_userdata` 排在 `MessageBox` **之前**：静默卸载一律**保留**宠物数据，不会在没有用户点确认的情况下删 394 MB |

## 与任务书的一处偏差：没用 `File /r "${PAYLOAD}\*.*"` 全树拷

任务书写的是「拷贝 payload 全树」+ `File /r "${PAYLOAD}\*.*"`。实际 payload 里有一个
`userdata\` 目录，它的落点是 `%USERPROFILE%\.dsh`，不是安装目录（`build/PAYLOAD-LAYOUT.md`
第 1–2 条，「别把 userdata\ 塞进安装目录」）。照字面全树拷进 `$INSTDIR` 的后果是
`%USERPROFILE%\.dsh\dsh-pet\pet` 里一个文件都没有，程序起来一只宠物都不显示。

所以脚本写成两段（`PAYLOAD` 宏照样可覆盖，换路径的能力没变）：

1. `$INSTDIR` ← 根下 18 个文件按扩展名掩码 + `locales\*.*` + `resources\*.*`（= 74 个文件）
2. `%USERPROFILE%\.dsh` ← `userdata\.dsh\*.*`（= 362 个文件）

覆盖率已核对：掩码枚举出来的 18 个根文件与 `ls -1p` 的实际根文件
`diff` 为空；`436 = 74 + 362` 与 `build/payload-manifest.sha256` 的 436 行一致。
如果后端以后往 payload 根加新扩展名（比如 `.png`、无扩展名文件），必须同步加一条 `File`，
否则那类文件会漏装 —— 现在没有这种文件。

## 语法自查清单（编译前逐条核过，建议改 .nsi 时重跑）

编译在 2026-11-18 已通过，下表是编译前的静态核对记录，留作以后改脚本时的检查清单。

| 检查点 | 怎么查的 | 结论 |
| --- | --- | --- |
| `Unicode true` 位置 | 放在文件第一行（`!include` 之前） | 正确；晚于 UI 宏会让语言串按 ANSI 编 |
| 源文件编码 | 写入时带 UTF-8 BOM（`EF BB BF`），`head -c 3` 验过 | NSIS 3 见到 BOM 按 UTF-8 读中文，不会乱码 |
| `!define` 位置 | 全部在第一次使用之前：产品常量 → `SHORTCUT_NAME` → `PAYLOAD`/`OUT_FILE`/`NOTICE_FILE`（`!ifndef` 包裹）→ `MUI_*` 文案 → 页面宏 | `Name`/`OutFile`/`InstallDir` 用到常量时都已定义 |
| 快捷方式名 | 新增独立常量 `!define SHORTCUT_NAME "dsh-pet"`，`PRODUCT_NAME` 不动 | 两个 `CreateShortCut`、两个 `Delete` 都用 `${SHORTCUT_NAME}.lnk`，产物是 `dsh-pet.lnk`，与 README-Windows.md 口径一致；「设置 → 应用」仍显示「dsh-pet 桌面版」 |
| `Section`/`SectionEnd` 配对 | 安装段 `Section "安装 …" SecApp`（1）与 `Section "Uninstall"`（1），`SectionEnd` 2 个；`Function`/`FunctionEnd` 各 2 对 | 配平。数的时候 `grep -cE '^Section '`（带空格）与 `grep -cE '^SectionEnd$'` 分开数，`grep -c '^Section'` 会把 `SectionEnd` 和 `SectionIn` 一起算进去 |
| MUI 页面顺序 | Welcome → License → Directory → InstFiles → Finish；Uninstall：Confirm → InstFiles；`MUI_LANGUAGE` 在所有页面宏之后 | 符合 MUI2 要求（语言必须最后插入） |
| 字符串引号 | 带空格/中文的串全部双引号包住；`UninstallString` 用单引号包着 `\"$INSTDIR\uninstall.exe\"` 以保留内层双引号 | 注册表里存成带引号的可执行路径，含空格也不裂 |
| 续行 `\` | 多行 `MessageBox`/`!define` 文案用行尾 `\` 续行，续行首不留空格 | 续行符只在行尾有效，首部空格会进字符串 |
| `$\r$\n` | 文案里的换行用 NSIS 的 `$\r$\n`，没写裸 `\n` | 正确 |
| `$` 转义 | 文案里需要字面 `$` 的地方没有；`$INSTDIR`/`$PROFILE` 是有意变量 | 无需 `$$` |
| `IfSilent` 跳转（安装） | 用命名标签 `skip_old_check:`，没用相对偏移（`+3`） | 命名标签不会被 LogicLib 的 `${If}` 展开打断 |
| `IfSilent` 跳转（卸载） | 卸载段 `IfSilent keep_userdata` 紧接在 `MessageBox` 之前，中间无其它指令 | 静默卸载走保留分支；顺序反了就会在无确认的情况下删掉 394 MB |
| `MessageBox` 返回值 | 用 `IDNO keep_userdata` 显式跳「保留」分支，没靠 `IDYES` 落空 | 用户按 × / 关窗时的行为是「保留」，安全侧 |
| `nsExec::Exec` | 两处都跟了 `Pop $0` 丢弃返回值 | 不 Pop 会留返回值在栈上，且不会报错但行为怪 |
| `SetOverwrite` | 用户数据段前 `off`，段后立刻 `on` | 不影响程序文件段（程序文件必须覆盖） |
| `EstimatedSize` 单位 | 写 427080（KB），来源 `stat -f%z` 求和 | 注册表要求 KB；量级正确（约 417 MB） |
| `File` 掩码 | `*.dll` `*.pak` `*.bin` `*.dat` `*.json` `*.html` `*.txt` `dsh-pet.exe` 八个掩码，实测合计 18 个文件，与实际根文件 `diff` 为空 | 无遗漏、无重复 |
| `File /r` 语义 | `SetOutPath` 先切目录，再用 `目录\*.*` | `File /r "dir"` 会多套一层目录名，`dir\*.*` 才是「拷内容」，本脚本统一用后者 |
| 中文路径 | 快捷方式是 `dsh-pet.lnk`（纯 ASCII）；界面文案、`$PROFILE\.dsh` 在 `Unicode true` 下合法 | 安装目录默认在 `%LOCALAPPDATA%` 下，避免 System32 等受保护路径 |
| `RMDir` 与 `RMDir /r` | 宠物数据用 `RMDir /r`，`.dsh` 父目录用不带 `/r` 的 `RMDir` | 父目录只在空时删掉；别的 DSH 数据还在就静默失败，不会连带删 |
| `VIProductVersion` | 四段式 `0.4.9.0` | 四段是硬要求，两段会编译报错 |
| 卸载顺序 | 先删 `uninstall.exe` 再 `RMDir /r $INSTDIR`；宠物数据询问放在 `$INSTDIR` 删完之后 | 卸载器运行中删自己由 NSIS 复制到临时目录处理；问宠物数据时程序已删干净，用户看到的是「只剩数据」 |
| 许可页文件 | `NOTICE-summary.txt` 与 `.nsi` 同目录，UTF-8 带 BOM | 文件不存在会在编译期报 `!include`/license 错，不会拖到运行时 |

## 已在本机验证（编译层面，2026-11-18）

1. ✅ `makensis` 退出码 0。
2. ✅ `dist/dsh-pet-Setup.exe` 存在，586,138,102 字节，sha256 已独立重算核对。
3. ✅ `file(1)` 认出是 Windows PE + Nullsoft Installer；7z 认出 `NSIS-3 Unicode`。
4. ✅ 包内 441 条（含生成的 `uninstall.exe` 与 `$PLUGINSDIR`）与 payload 436 个文件对得上。
5. ✅ `build/payload` 的 `payload-manifest.sha256` 全量校验：`OK=436`、`FAILED=0`。

## 还要在 Windows 上验的（一条都没做）

1. Windows 10/11 干净用户上跑一遍：不弹 UAC；装完 `%LOCALAPPDATA%\dsh-pet\dsh-pet.exe` 在；
   `%USERPROFILE%\.dsh\dsh-pet\pet\gpt-config.json` 在；开始菜单和桌面各有一个 **`dsh-pet`** 快捷方式。
2. 启动后桌面右下角出现 GPT 桌宠（`gpt-config.json` 的 `display=desktop`），Claude/Gemini 不抢窗；
   托盘图标右键能勾选要显示哪几只。
3. 「设置 → 应用」里显示「dsh-pet 桌面版 0.4.9」、发布者 PC2005-cloud / dsh-ai-pets，大小约 417 MB。
4. 覆盖安装：先改一下 `main-config.jsonc`，重装后确认改动还在（`SetOverwrite off` 生效）。
5. 卸载（交互）：`taskkill` 掉进程也能卸干净，`$INSTDIR`、两个 `dsh-pet.lnk`、注册表项都没了；
   宠物数据弹窗出现 —— 选「否」后 `%USERPROFILE%\.dsh\dsh-pet` 还在，选「是」后整个目录没了，
   只剩 `.dsh` 也被清掉（没有其它 DSH 数据时）。
6. 卸载（静默）：`uninstall.exe /S` 退出码 0，程序目录和快捷方式清干净，
   **宠物数据保留**（不弹窗、不删）。
7. `dsh-pet-Setup.exe /S` 静默装一遍，退出码 0，文件齐全。
8. 高 DPI（125% / 150% 缩放）下宠物大小和位置对不对；559 MiB 的 solid LZMA 包解压期内存峰值。

## 已知风险

- **一次都没在 Windows 上运行过**：包能编出来、内部结构和清单对得上，但双击后宠物出不出、
  托盘勾选灵不灵、右键菜单对不对、覆盖安装、DPI、卸载残留，**全部未验证**，不能说「能用」。
- **体积大**：559 MiB（solid LZMA）。装上约占 811 MB 磁盘，安装期解压吃内存，实测数据没有。
- **未做签名**：SmartScreen 会拦，用户要手动「仍要运行」。
- **`taskkill` 静默失败**：进程被别的会话占着（多用户/服务启动）时，覆盖 exe 仍可能失败并报错；
  脚本不重试、不绕过。
- **用户数据合并语义**：`SetOverwrite off` 是「文件级」跳过；如果以后 payload 里某个 webm 更新了，
  老用户机器上不会更新它（只补缺失）。要能升级素材得换版本化目录。
- **静默卸载不删宠物数据**：`/S` 卸载后 `%USERPROFILE%\.dsh\dsh-pet`（约 394 MB）还在。
  这是安全侧选择（没人点确认就不删数据），但批量部署/清理脚本要自己补一句删目录。
- **卸载会删共享目录**：交互卸载选「是」会 `RMDir /r %USERPROFILE%\.dsh\dsh-pet`。
  同一台机器上还装着 DSH 插件版（共用同一个目录）时，选「是」会一起删掉 —— 弹窗文案里已经
  写了这句提醒，但只是提醒，脚本没做探测。
- **`RMDir /r $INSTDIR`**：用户如果把安装目录选到一个已有内容的文件夹（比如桌面），卸载会连带删掉那里的东西。
  默认目录没问题，但目录页没有拦这种情况。
- **`build/` 和 `dist/` 都在 .gitignore 里**：`git status` 看不见 `build/windows/*` 这几个文件，
  `git add .` 也不会带上它们。本文件是靠 `git add -f build/windows/` 才进仓库的；
  **exe 本身没有入库**（559 MiB 不进版本库，用 Release 分发）。
