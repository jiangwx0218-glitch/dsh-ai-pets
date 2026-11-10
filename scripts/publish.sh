#!/usr/bin/env bash
# 发布一条龙：打包素材 → 建 GitHub Release → 上传三个 tar.gz → 提示 npm 发布。
#
#   ./scripts/publish.sh v0.1.0
#
# 前提：装好 gh（已 gh auth login）与 node；素材已经在 ~/.dsh/dsh-pet/pet/ 里。
set -euo pipefail

VERSION="${1:-}"
if [[ -z "$VERSION" ]]; then
  echo "用法：./scripts/publish.sh v0.1.0" >&2
  exit 1
fi

REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

OWNER_REPO="$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null || true)"
if [[ -z "$OWNER_REPO" ]]; then
  echo "还没关联 GitHub 仓库。先 gh repo create dsh-ai-pets --public --source=. --push" >&2
  exit 1
fi
echo "仓库：$OWNER_REPO"

BASE_URL="https://github.com/${OWNER_REPO}/releases/latest/download"
echo "baseUrl：$BASE_URL"

echo "== 1/4 打包素材 =="
node scripts/build-release.mjs --out dist --base-url "$BASE_URL"

echo "== 2/4 自检 =="
node scripts/check-packs.mjs

echo "== 3/4 建 Release 并上传 =="
gh release create "$VERSION" dist/*.tar.gz \
  --title "dsh-ai-pets $VERSION" \
  --notes "三只 AI 桌宠素材（GPT / Claude / Gemini）。素材条款见 NOTICE.md：**禁止商用**，二创须署名上游。"

echo "== 4/4 提示 =="
cat <<EOF

Release 建好了。剩下两步：

  1) 提交代码（dist/ 已在 .gitignore 里，素材只走 Release）
     git add -A && git commit -m "release $VERSION" && git tag $VERSION && git push --follow-tags

  2) 不发 npm（暂未发布，安装统一走 GitHub git 源）
     用户安装：dsh plugin --profile <profile> add github:<owner>/<repo>

验证安装：
  dsh plugin --profile <profile> add github:jiangwx0218-glitch/dsh-ai-pets
EOF
