# publish-release.ps1
# Helper script to push v0.18.0 / v0.19.0 GitHub Releases after a manual
# `gh auth login` (one-time). Run from the repo root.
#
#   .\scripts\publish-release.ps1 -Tag v0.19.0
#
# Defaults: Tag=v0.19.0. Pass -Tag v0.18.0 to publish v0.18.0 first.

[CmdletBinding()]
param(
    [string]$Tag = 'v0.19.0'
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path "$PSScriptRoot\..").Path
Set-Location $repoRoot

# Sanity: gh CLI + auth
if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
    throw "gh CLI not found. Install via 'winget install GitHub.cli' or download from https://cli.github.com"
}
& gh auth status 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "gh CLI is not authenticated. Run 'gh auth login' (HTTPS + browser flow) and retry."
}

# Verify the tag exists locally + on origin
& git rev-parse --verify $Tag 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Local tag $Tag not found. Run 'git fetch --tags' or create it first."
}
& git ls-remote --tags origin $Tag 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Remote tag $Tag not found. Push it with 'git push origin $Tag' first."
}

# Build the artifact list (only what exists on disk for this version)
$artifacts = @(
    "Lan-Control-Hub-$($Tag.TrimStart('v'))-win-x64-portable.exe"
    "Lan-Control-Hub-$($Tag.TrimStart('v'))-win-x64-setup.exe"
    "Lan-Control-Hub-$($Tag.TrimStart('v'))-mac-x64.zip"
    "Lan-Control-Hub-$($Tag.TrimStart('v'))-mac-arm64.zip"
    "SHA256SUMS.txt"
) | Where-Object { Test-Path (Join-Path 'release' $_) }

if (-not $artifacts) {
    throw "No artifacts found under release/ for $Tag"
}

$notesFile = "docs/release-notes-v0.18.0-v0.19.0.md"
if (-not (Test-Path $notesFile)) {
    throw "Release notes not found: $notesFile"
}

Write-Host "Publishing $Tag with $($artifacts.Count) artifacts" -ForegroundColor Cyan
foreach ($a in $artifacts) { Write-Host "  - $a" }

# Use gh release create (or edit if it already exists)
& gh release create $Tag @artifacts `
    --repo usefultool39/LCH-beta `
    --title "Lan Control Hub $($Tag.TrimStart('v'))" `
    --notes-file $notesFile `
    --target main
if ($LASTEXITCODE -ne 0) {
    Write-Host "gh release create failed; you can retry manually after fixing." -ForegroundColor Red
    exit $LASTEXITCODE
}

Write-Host ""
Write-Host "Release $Tag published." -ForegroundColor Green
& gh release view $Tag --repo usefultool39/LCH-beta --web