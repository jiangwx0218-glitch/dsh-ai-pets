#!/bin/sh
# dsh-pet 桌面版 · 安装包构建脚本
#
# 用法：  sh build/windows/build.sh
#         PAYLOAD=/path/to/payload sh build/windows/build.sh    # 换 payload 来源
#
# 前提：这台机器上装了 NSIS 3.x 的 makensis。本脚本不装任何工具，
#       找不到 makensis 就报错退出（GitHub 上的 macos-14 runner 默认没有它）。
#
# 产物：  dist/dsh-pet-Setup.exe
set -eu

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_ROOT=$(CDPATH= cd -- "$SCRIPT_DIR/../.." && pwd)
PAYLOAD="${PAYLOAD:-$REPO_ROOT/build/payload}"
OUT="$REPO_ROOT/dist/dsh-pet-Setup.exe"

die() { printf 'ERROR: %s\n' "$*" >&2; exit 1; }

# ---------------------------------------------------------- 前置检查 1：payload
[ -d "$PAYLOAD" ]                          || die "payload 目录不存在：$PAYLOAD"
[ -f "$PAYLOAD/dsh-pet.exe" ]              || die "payload 缺 dsh-pet.exe：$PAYLOAD/dsh-pet.exe"
[ -d "$PAYLOAD/locales" ]                  || die "payload 缺 locales/"
[ -f "$PAYLOAD/resources/app.asar" ]       || die "payload 缺 resources/app.asar"
[ -d "$PAYLOAD/userdata/.dsh/dsh-pet/pet" ] || die "payload 缺 userdata/.dsh/dsh-pet/pet（宠物素材）"

app_files=$(find "$PAYLOAD" -type f -not -path '*/userdata/*' | wc -l | tr -d ' ')
ud_files=$(find "$PAYLOAD/userdata" -type f | wc -l | tr -d ' ')
total_files=$((app_files + ud_files))
printf 'payload: %s\n' "$PAYLOAD"
printf '  程序文件 %s（预期 74 = 根 18 + locales 55 + resources 1）\n' "$app_files"
printf '  用户数据 %s（预期 362）\n' "$ud_files"
printf '  合计     %s（预期 436）\n' "$total_files"
[ "$app_files" -eq 74 ] || printf 'WARN: 程序文件数不是 74，确认一下 payload 是不是换版本了\n'
[ "$ud_files" -eq 362 ] || printf 'WARN: 用户数据文件数不是 362，确认一下宠物素材是否齐全\n'

# ------------------------------------------------------- 前置检查 2：makensis
command -v makensis >/dev/null 2>&1 \
  || die "找不到 makensis。本脚本不负责安装工具：请在一台装了 NSIS 3.x 的机器上跑（见 build/windows/README-build.md）"
printf 'makensis: %s\n' "$(command -v makensis)"
makensis -VERSION 2>/dev/null | sed 's/^/  version /' || true

# ---------------------------------------------------------------- 构建
[ -d "$REPO_ROOT/dist" ] || mkdir -p "$REPO_ROOT/dist"
printf '编译中（811 MB payload，solid LZMA，几分钟起步，别中断）...\n'
makensis -V2 \
  -DPAYLOAD="$PAYLOAD" \
  -DNOTICE_FILE="$SCRIPT_DIR/NOTICE-summary.txt" \
  "$SCRIPT_DIR/installer.nsi"

[ -f "$OUT" ] || die "makensis 结束了但没有产物：$OUT"

if command -v shasum >/dev/null 2>&1; then
  HASH=$(shasum -a 256 "$OUT" | awk '{print $1}')
else
  HASH=$(sha256sum "$OUT" | awk '{print $1}')
fi
printf '产物：%s\n' "$OUT"
printf '  大小  %s 字节\n' "$(wc -c < "$OUT" | tr -d ' ')"
printf '  sha256 %s\n' "$HASH"
printf '这个 exe 没有代码签名：用户双击时 Windows SmartScreen 会先拦一下。\n'
