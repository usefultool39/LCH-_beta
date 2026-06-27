# finish-work.ps1
# 一键完成 lan-control-hub 的"工作 → 桌面备份 → GitHub 推送"流程。
# 用法（在 D:\项目\lan-control-hub 下）：
#   .\scripts\finish-work.ps1 -Message "fix: ..."
#   .\scripts\finish-work.ps1 -Message "..." -SkipPush       # 仅本地同步桌面
#   .\scripts\finish-work.ps1 -Message "..." -PushOnly       # 只推 GitHub，不动桌面
#
# 流程：
#   1. git add -A（在 D 盘项目根）
#   2. 如果有暂存内容 → git commit -m $Message
#   3. git push origin <current-branch>
#   4. 桌面备份目录 git pull --rebase origin <branch> 同步
#
# 设计原则：
#   - 不强推 (--force)，不跳钩子 (--no-verify)。
#   - 桌面备份保持和 D 盘同样的 git 仓库结构，方便回滚。
#   - 如果桌面有未提交改动，会提示并中止（避免覆盖）。

[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Message,

    [switch]$SkipPush,
    [switch]$PushOnly
)

$ErrorActionPreference = 'Stop'

$workDir    = 'D:\项目\lan-control-hub'
$desktopDir = Join-Path $env:USERPROFILE 'Desktop\lan-control-hub'

if (-not (Test-Path $workDir)) {
    throw "找不到工作目录: $workDir"
}

# --- 1. D 盘项目：add + commit ---
Set-Location $workDir
Write-Host "==> D 盘工作目录: $workDir" -ForegroundColor Cyan

$branch = (git rev-parse --abbrev-ref HEAD).Trim()
if ([string]::IsNullOrEmpty($branch)) {
    throw "无法识别当前分支"
}
Write-Host "    当前分支: $branch" -ForegroundColor Cyan

$statusBefore = git status --porcelain
if ($statusBefore) {
    Write-Host "==> git add -A" -ForegroundColor Cyan
    git add -A
    Write-Host "==> git commit -m '$Message'" -ForegroundColor Cyan
    git commit -m $Message
} else {
    Write-Host "==> 工作区干净，跳过 commit" -ForegroundColor Yellow
}

# --- 2. 推 GitHub ---
if (-not $SkipPush) {
    Write-Host "==> git push origin $branch" -ForegroundColor Cyan
    git push origin $branch
    if ($LASTEXITCODE -ne 0) {
        throw "git push 失败，请先解决冲突或检查网络"
    }
} else {
    Write-Host "==> 跳过 git push (SkipPush)" -ForegroundColor Yellow
}

# --- 3. 桌面备份同步 ---
if (-not $PushOnly) {
    if (-not (Test-Path $desktopDir)) {
        Write-Host "==> 桌面备份不存在: $desktopDir，跳过桌面同步" -ForegroundColor Yellow
    } else {
        Write-Host "==> 桌面备份: $desktopDir" -ForegroundColor Cyan
        Set-Location $desktopDir

        $desktopStatus = git status --porcelain
        if ($desktopStatus) {
            throw "桌面备份有未提交改动，请先处理:`n$desktopStatus`n中止以避免覆盖。"
        }

        Write-Host "==> git fetch origin" -ForegroundColor Cyan
        git fetch origin
        if ($LASTEXITCODE -ne 0) {
            throw "git fetch 失败"
        }

        Write-Host "==> git pull --rebase origin $branch" -ForegroundColor Cyan
        git pull --rebase origin $branch
        if ($LASTEXITCODE -ne 0) {
            throw "git pull --rebase 失败，请手动处理冲突后重试"
        }
    }
} else {
    Write-Host "==> 跳过桌面同步 (PushOnly)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "OK ✅  D 盘 commit + GitHub push + 桌面备份同步 全部完成" -ForegroundColor Green
Write-Host "     HEAD: $(git -C $workDir rev-parse --short HEAD)" -ForegroundColor Green