; ============================================================================
; dsh-pet 桌面版 · NSIS 3 安装脚本
;
;   构建：makensis build/windows/installer.nsi        （在一台装了 NSIS 3 的机器上）
;   覆盖：makensis /DPAYLOAD=D:\some\payload build/windows/installer.nsi
;
; 本脚本没有在本机编译过：编它的机器上必须装 NSIS 3.x（见 README-build.md）。
;
; 目录约定（与 build/PAYLOAD-LAYOUT.md 一致，payload 由后端产出）：
;   build/payload/                  74 个文件  → %LOCALAPPDATA%\dsh-pet\
;     dsh-pet.exe                   必须在根
;     locales\ (55)  resources\app.asar (1)  根下 18 个文件
;   build/payload/userdata/.dsh/   362 个文件 → %USERPROFILE%\.dsh\
;     dsh-pet\main-config.jsonc、dsh-pet\pet\*-config.json、pet*-animation\*.webm
;
; 为什么 userdata 不装进安装目录：独立版按 dshHomeDir() 读
;   $DSH_HOME || %USERPROFILE%\.dsh，宠物只从 %USERPROFILE%\.dsh\dsh-pet\pet 找。
;   把 userdata 塞进 $INSTDIR 的后果是一只宠物都不显示（见 PAYLOAD-LAYOUT.md）。
; ============================================================================

Unicode true

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ---------------------------------------------------------------- 可覆盖常量
!define PRODUCT_NAME      "dsh-pet 桌面版"
!define PRODUCT_VERSION   "0.4.9"
!define PRODUCT_PUBLISHER "PC2005-cloud / dsh-ai-pets"
!define PRODUCT_URL       "https://github.com/PC2005-cloud/dsh-pet"
!define APP_EXE           "dsh-pet.exe"

; 快捷方式名单独一个常量：PRODUCT_NAME 要留给「设置 → 应用」显示「dsh-pet 桌面版」，
; 但 README-Windows.md 跟用户说的是 dsh-pet 快捷方式，两者不能共用一个值。
!define SHORTCUT_NAME     "dsh-pet"

!define UNINST_KEY        "Software\Microsoft\Windows\CurrentVersion\Uninstall\dsh-pet"

; payload 根目录。相对本 .nsi 所在目录（build/windows/ → build/payload）
!ifndef PAYLOAD
  !define PAYLOAD "..\payload"
!endif

; 产物路径（相对 build/windows/ → 仓库根 dist/）
!ifndef OUT_FILE
  !define OUT_FILE "..\..\dist\dsh-pet-Setup.exe"
!endif

; 许可页显示的文件（与本 .nsi 同目录）
!ifndef NOTICE_FILE
  !define NOTICE_FILE "NOTICE-summary.txt"
!endif

; 装进 $INSTDIR 的字节数，单位 KB（注册表 EstimatedSize 要求 KB）。
;   实测 2026-11-18：find build/payload -type f -not -path '*/userdata/*' -exec stat -f%z {} +
;   → 437,329,277 字节 = 427,080 KB
;   全量（含 userdata，装到 %USERPROFILE%）849,884,306 字节 = 829,966 KB，仅作参考。
!define ESTIMATED_SIZE_KB 427080

; -------------------------------------------------------------------- 基本信息
Name "${PRODUCT_NAME}"
BrandingText "${PRODUCT_NAME} ${PRODUCT_VERSION}"
OutFile "${OUT_FILE}"

; 每用户安装：不需要管理员权限，UAC 不弹
RequestExecutionLevel user

; 默认装到 %LOCALAPPDATA%\dsh-pet；上次装过就沿用上次的目录
InstallDir "$LOCALAPPDATA\dsh-pet"
InstallDirRegKey HKCU "${UNINST_KEY}" "InstallLocation"

; 811 MB payload：solid LZMA 打得小但要吃内存（建议构建机 ≥8 GB 空闲）。
; 构建机内存吃紧就换成下面那行 zlib。
SetCompressor /SOLID lzma
; SetCompressor /SOLID zlib

; 版本资源（资源管理器 → 属性 → 详细信息 里能看到）
VIProductVersion "0.4.9.0"
VIAddVersionKey "ProductName"     "${PRODUCT_NAME}"
VIAddVersionKey "ProductVersion"  "${PRODUCT_VERSION}"
VIAddVersionKey "FileVersion"     "${PRODUCT_VERSION}"
VIAddVersionKey "CompanyName"     "${PRODUCT_PUBLISHER}"
VIAddVersionKey "FileDescription" "${PRODUCT_NAME} 安装程序"
VIAddVersionKey "LegalCopyright"  "代码 MIT；宠物素材 CC BY-NC-SA 4.0，见 NOTICE.md"

; ------------------------------------------------------------------ 界面文案
!define MUI_ABORTWARNING

!define MUI_WELCOMEPAGE_TITLE "安装 ${PRODUCT_NAME} ${PRODUCT_VERSION}"
!define MUI_WELCOMEPAGE_TEXT "这个向导会把 ${PRODUCT_NAME} 装到你的电脑上。$\r$\n$\r$\n\
装好后桌面右下角会出现一只桌宠（默认 GPT）。$\r$\n\
程序装到你的用户目录，不需要管理员权限，也不会改动系统设置。$\r$\n$\r$\n\
点「下一步」继续。"

!define MUI_LICENSEPAGE_TEXT_TOP "安装前请读完这一页。素材不是本项目原创，条款照抄上游。"
!define MUI_LICENSEPAGE_TEXT_BOTTOM "点「我接受」表示你接受以上条款。"
!define MUI_LICENSEPAGE_BUTTON "我接受(&I)"

!define MUI_DIRECTORYPAGE_TEXT_TOP "选一个安装目录。默认 $\"$LOCALAPPDATA\dsh-pet$\"（当前用户，不需要管理员权限）。$\r$\n$\r$\n\
用户数据不装在这里：宠物配置与动画会放到 %USERPROFILE%\.dsh\dsh-pet，已有的不覆盖。"

!define MUI_FINISHPAGE_TITLE "${PRODUCT_NAME} 装好了"
!define MUI_FINISHPAGE_TEXT "程序在：$INSTDIR$\r$\n\
宠物数据在：$PROFILE\.dsh\dsh-pet$\r$\n$\r$\n\
第一次启动后，桌宠出现在桌面右下角；托盘图标上右键可以勾选要显示的宠物。"
!define MUI_FINISHPAGE_RUN "$INSTDIR\${APP_EXE}"
!define MUI_FINISHPAGE_RUN_TEXT "立即运行 ${PRODUCT_NAME}"
!define MUI_FINISHPAGE_NOREBOOTSUPPORT

; ---------------------------------------------------------------- 页面顺序
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_LICENSE "${NOTICE_FILE}"
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES

!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; ==================================================================== 初始化
Function .onInit
  ; 快捷方式、注册表都落在当前用户
  SetShellVarContext current

  ; 已有旧安装：交互模式问一次，/S 静默安装直接覆盖
  IfSilent skip_old_check
  ${If} ${FileExists} "$INSTDIR\${APP_EXE}"
    MessageBox MB_YESNO|MB_ICONQUESTION \
"$INSTDIR 里已经有一份 ${PRODUCT_NAME}。$\r$\n$\r$\n\
继续安装会覆盖程序文件；%USERPROFILE%\.dsh\dsh-pet 里你自己的配置和宠物不会被覆盖。$\r$\n$\r$\n\
要继续吗？" \
IDYES skip_old_check
    Abort
  ${EndIf}
skip_old_check:
FunctionEnd

; ==================================================================== 安装段
Section "安装 ${PRODUCT_NAME}" SecApp
  SectionIn RO
  SetShellVarContext current

  ; 1) 先结束正在跑的实例：exe 被占用时覆盖会失败。失败不中断。
  nsExec::Exec 'taskkill /f /im ${APP_EXE}'
  Pop $0

  ; 2) 程序本体 → $INSTDIR（payload 根下 18 个文件 + locales\ + resources\）
  SetOutPath "$INSTDIR"
  File "${PAYLOAD}\${APP_EXE}"
  File "${PAYLOAD}\*.dll"
  File "${PAYLOAD}\*.pak"
  File "${PAYLOAD}\*.bin"
  File "${PAYLOAD}\*.dat"
  File "${PAYLOAD}\*.json"
  File "${PAYLOAD}\*.html"
  File "${PAYLOAD}\*.txt"

  SetOutPath "$INSTDIR\locales"
  File /r "${PAYLOAD}\locales\*.*"

  SetOutPath "$INSTDIR\resources"
  File /r "${PAYLOAD}\resources\*.*"

  ; 3) 用户数据 → %USERPROFILE%\.dsh（payload\userdata\.dsh 的内容）
  ;    SetOverwrite off：目标已存在就跳过。
  ;      · main-config.jsonc / *-config.json：用户改过的（可能有他自己的 API 设置）不会被抹掉
  ;      · *-animation\*.webm：只补缺失的帧
  SetOverwrite off
  SetOutPath "$PROFILE\.dsh"
  File /r "${PAYLOAD}\userdata\.dsh\*.*"
  SetOverwrite on

  ; 4) 卸载程序
  WriteUninstaller "$INSTDIR\uninstall.exe"

  ; 5) 快捷方式（两个：开始菜单 + 桌面），名字是 dsh-pet.lnk
  CreateShortCut "$SMPROGRAMS\${SHORTCUT_NAME}.lnk" "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0
  CreateShortCut "$DESKTOP\${SHORTCUT_NAME}.lnk"    "$INSTDIR\${APP_EXE}" "" "$INSTDIR\${APP_EXE}" 0

  ; 6) 卸载登记（HKCU，当前用户；"设置 → 应用" 里显示为 PRODUCT_NAME）
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayName"          "${PRODUCT_NAME}"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayVersion"       "${PRODUCT_VERSION}"
  WriteRegStr   HKCU "${UNINST_KEY}" "Publisher"            "${PRODUCT_PUBLISHER}"
  WriteRegStr   HKCU "${UNINST_KEY}" "DisplayIcon"          "$INSTDIR\${APP_EXE}"
  WriteRegStr   HKCU "${UNINST_KEY}" "InstallLocation"      "$INSTDIR"
  WriteRegStr   HKCU "${UNINST_KEY}" "URLInfoAbout"         "${PRODUCT_URL}"
  WriteRegDWORD HKCU "${UNINST_KEY}" "EstimatedSize"        ${ESTIMATED_SIZE_KB}
  WriteRegStr   HKCU "${UNINST_KEY}" "UninstallString"      '"$INSTDIR\uninstall.exe"'
  WriteRegStr   HKCU "${UNINST_KEY}" "QuietUninstallString" '"$INSTDIR\uninstall.exe" /S'
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoModify"             1
  WriteRegDWORD HKCU "${UNINST_KEY}" "NoRepair"             1
SectionEnd

; ==================================================================== 卸载
Function un.onInit
  SetShellVarContext current
FunctionEnd

Section "Uninstall"
  SetShellVarContext current

  ; 1) 先关掉进程，否则 exe / dll 删不掉。失败不中断。
  nsExec::Exec 'taskkill /f /im ${APP_EXE}'
  Pop $0

  ; 2) 两个快捷方式
  Delete "$SMPROGRAMS\${SHORTCUT_NAME}.lnk"
  Delete "$DESKTOP\${SHORTCUT_NAME}.lnk"

  ; 3) 卸载登记项
  DeleteRegKey HKCU "${UNINST_KEY}"

  ; 4) 安装目录（先删卸载器自身，再整树删）
  Delete "$INSTDIR\uninstall.exe"
  RMDir /r "$INSTDIR"

  ; 5) 宠物数据：%USERPROFILE%\.dsh\dsh-pet（约 394 MB）
  ;    交互模式问一次；/S 静默卸载一律保留（没人在屏幕前点确认，不许删 394 MB）。
  ;    所以 IfSilent 必须在 MessageBox 之前。
  ;    DSH 插件版桌宠共用 %USERPROFILE%\.dsh\dsh-pet，机器上还装着插件版时必须选「否」。
  IfSilent keep_userdata
  MessageBox MB_YESNO|MB_ICONQUESTION \
"是否一并删除宠物数据？$\r$\n$\r$\n\
$PROFILE\.dsh\dsh-pet（约 394 MB：三只宠物的配置与动画）$\r$\n$\r$\n\
如果这台机器上还装着 DSH 插件版桌宠，它用的是同一个目录，请选「否」。" \
IDNO keep_userdata
    RMDir /r "$PROFILE\.dsh\dsh-pet"
    ; 不带 /r：目录空了才删得掉。别的 DSH 数据还在时这里会静默失败，这是故意的。
    RMDir "$PROFILE\.dsh"
keep_userdata:
SectionEnd
