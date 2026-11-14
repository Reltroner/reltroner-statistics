#requires -Version 5.1
<#
.SYNOPSIS
  Non-destructive one-way fast-forward synchronization: local main <- origin/main.
.DESCRIPTION
  Never resets, cleans, stashes, rebases, force-pushes or overwrites local work.
  Refuses a dirty worktree, wrong repo/branch and diverged history.
  Website verification is optional, read-only, and only checks exact published Statistics commit.
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-main-ff-only.ps1
.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File .\scripts\sync-main-ff-only.ps1 -VerifyWebsite
#>
[CmdletBinding()]
param([switch]$VerifyWebsite)

$ErrorActionPreference = 'Stop'
$Root = 'C:\Projects\reltroner-statistics'
$OriginPattern = '^(?:https://github\.com/Reltroner/reltroner-statistics(?:\.git)?|git@github\.com:Reltroner/reltroner-statistics(?:\.git)?)$'
$Site = 'https://statistics.reltroner.com'

function Invoke-GitChecked {
    param([Parameter(Mandatory=$true)][string[]]$Arguments)
    $result = @( & git @Arguments 2>&1 )
    if ($LASTEXITCODE -ne 0) {
        throw ("git " + ($Arguments -join ' ') + " failed: " + ($result -join '\n'))
    }
    return $result
}

if (-not (Test-Path -LiteralPath $Root -PathType Container)) {
    throw "Workspace does not exist: $Root"
}
Set-Location -LiteralPath $Root
$resolved = (Resolve-Path -LiteralPath $Root).Path.TrimEnd('\')
$actual = [string]((Invoke-GitChecked @('rev-parse','--show-toplevel')) | Select-Object -First 1)
if ($actual.Replace('/','\').TrimEnd('\') -ine $resolved) {
    throw "Wrong Git repository: $actual"
}
$branch = [string]((Invoke-GitChecked @('branch','--show-current')) | Select-Object -First 1)
if ($branch -cne 'main') { throw "Expected main branch, found '$branch'" }
$origin = [string]((Invoke-GitChecked @('remote','get-url','origin')) | Select-Object -First 1)
if ($origin -cnotmatch $OriginPattern) { throw "Unexpected origin URL: $origin" }
$dirty = @(Invoke-GitChecked @('status','--porcelain=v1','--untracked-files=all'))
if ($dirty.Count -gt 0 -and ($dirty -join '').Trim().Length -gt 0) {
    throw "Local uncommitted/untracked work exists. No files were modified. Review and commit/back up your changes before attempting a fast-forward. git status --short"
}

Write-Host '=== FETCH REMOTE MAIN (NO RESET, NO REBASE) ===' -ForegroundColor Cyan
Invoke-GitChecked @('fetch','--no-tags','origin','main') | Out-Host
$localBefore = [string]((Invoke-GitChecked @('rev-parse','HEAD')) | Select-Object -First 1)
$remote = [string]((Invoke-GitChecked @('rev-parse','refs/remotes/origin/main')) | Select-Object -First 1)

if ($localBefore -cne $remote) {
    & git merge-base --is-ancestor HEAD refs/remotes/origin/main
    if ($LASTEXITCODE -ne 0) {
        throw "Local and remote main diverged or local is ahead. Refusing to reset, force-push, rebase or overwrite. Local=$localBefore Remote=$remote"
    }
    Write-Host '=== SAFE FAST-FORWARD ===' -ForegroundColor Cyan
    Invoke-GitChecked @('merge','--ff-only','refs/remotes/origin/main') | Out-Host
}

$head = [string]((Invoke-GitChecked @('rev-parse','HEAD')) | Select-Object -First 1)
$remoteAfter = [string]((Invoke-GitChecked @('rev-parse','refs/remotes/origin/main')) | Select-Object -First 1)
$dirtyAfter = @(Invoke-GitChecked @('status','--porcelain=v1','--untracked-files=all'))
if ($head -cne $remoteAfter -or ($dirtyAfter -join '').Trim().Length -gt 0) {
    throw "SYNC_FAILED: local HEAD, origin/main, or working tree do not match"
}
Write-Host "LOCAL_MAIN_1_TO_1_GITHUB: VERIFIED ($head)" -ForegroundColor Green

if ($VerifyWebsite) {
    try {
        $published = Invoke-RestMethod -Uri ($Site + '/build-info.json') -Method Get -TimeoutSec 20 -Headers @{ 'Cache-Control' = 'no-cache' }
        if ([string]$published.statistics_commit -cne $head) {
            throw "Published SHA $($published.statistics_commit) differs from local/GitHub SHA $head"
        }
        if (-not $published.semantic_digest -or -not $published.sources.production -or -not $published.sources.remodeling) {
            throw "Published build-info is missing semantic digest or pinned source identities"
        }
        Write-Host "STATISTICS_PUBLIC_SHA_PARITY: VERIFIED ($head)" -ForegroundColor Green
    } catch {
        throw "STATISTICS_PUBLIC_SHA_PARITY_UNVERIFIED: $($_.Exception.Message)"
    }
}
