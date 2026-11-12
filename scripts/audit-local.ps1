# Reltroner Statistics local audit (Windows PowerShell 5.1+ / PowerShell 7+).
# Reads both Studio repositories exclusively through the GitHub API at pinned commit SHAs.
# Nothing is cloned; no source repository, deployment or infrastructure is modified.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $Root

foreach ($Command in @('git', 'node', 'npm')) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) { throw "Missing executable: $Command" }
}
$Head = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $Head) { throw 'Statistics root must be a Git checkout.' }
if ([IO.Path]::GetFullPath($Head.Trim()).TrimEnd('\') -ne [IO.Path]::GetFullPath($Root).TrimEnd('\')) {
    throw 'STOP: unexpected Git root.'
}
$Nested = Get-ChildItem -LiteralPath $Root -Recurse -Force -Directory -Filter '.git' -ErrorAction SilentlyContinue |
    Where-Object { $_.FullName -ne (Join-Path $Root '.git') -and $_.FullName -notlike '*\node_modules\*' }
if ($Nested) { throw "STOP: nested Git repositories are not permitted: $($Nested.FullName -join ', ')" }

# Token is held in this process only and restored afterwards; it is never written to disk.
$PreviousToken = $env:GITHUB_TOKEN
try {
    if (-not $env:GITHUB_TOKEN -and (Get-Command gh -ErrorAction SilentlyContinue)) {
        $Token = (& gh auth token 2>$null)
        if ($LASTEXITCODE -eq 0 -and $Token) { $env:GITHUB_TOKEN = $Token.Trim() }
    }
    if (-not $env:GITHUB_TOKEN) { Write-Warning 'GITHUB_TOKEN not set: unauthenticated GitHub API limits (60 requests/hour) apply.' }

    Write-Host '== P0R determinism gate (pinned baseline pair) =='
    & node scripts/verify-baseline.ts
    if ($LASTEXITCODE -ne 0) { throw 'Baseline verification failed' }

    Write-Host '== Read-only pipeline (latest main of both repositories, pinned at resolution) =='
    & node scripts/pipeline.ts
    if ($LASTEXITCODE -ne 0) { throw 'Pipeline failed' }
}
finally {
    $env:GITHUB_TOKEN = $PreviousToken
}

foreach ($Step in @(@('test'), @('run', 'test:py'), @('run', 'typecheck'), @('run', 'build'), @('run', 'test:e2e'))) {
    & npm @Step
    if ($LASTEXITCODE -ne 0) { throw "npm $($Step -join ' ') failed" }
}

Write-Host 'Artifacts: artifacts\  (last known good: artifacts.previous\)'
Write-Host 'Deployment verified: see artifacts\manifest.json (production main is NOT a deployed SHA).'
Write-Host 'No deployment or source repository mutation performed.'
