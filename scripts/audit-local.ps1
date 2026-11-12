# P0 operator script. Use only inside the approved statistics workspace.
# Clones public repositories into .local; never mutates either GitHub source.
$ErrorActionPreference = 'Stop'
$Root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$SnapshotRoot = Join-Path $Root '.local\source-snapshots'
$Production = Join-Path $SnapshotRoot 'reltroner-studio'
$Remodeling = Join-Path $SnapshotRoot 'reltroner-studio-remodeling'
Set-Location -LiteralPath $Root

foreach ($Command in @('git','node','npm')) {
    if (-not (Get-Command $Command -ErrorAction SilentlyContinue)) {
        throw "Missing executable: $Command"
    }
}
$Head = (& git rev-parse --show-toplevel 2>$null)
if ($LASTEXITCODE -ne 0 -or -not $Head) { throw 'Statistics root must be a Git checkout.' }
if ([IO.Path]::GetFullPath($Head.Trim()).TrimEnd('\') -ne [IO.Path]::GetFullPath($Root).TrimEnd('\')) {
    throw 'STOP: unexpected Git root.'
}
New-Item -ItemType Directory -Force -Path $SnapshotRoot | Out-Null

function Update-ReadOnlySnapshot([string]$Dir,[string]$Url) {
    if (-not (Test-Path -LiteralPath $Dir)) {
        & git clone --depth=1 --branch main -- $Url $Dir
        if ($LASTEXITCODE -ne 0) { throw "Clone failed: $Url" }
        return
    }
    $Origin = (& git -C $Dir remote get-url origin)
    if ($LASTEXITCODE -ne 0 -or $Origin.Trim().TrimEnd('/') -ne $Url.TrimEnd('/')) {
        throw "STOP: unexpected origin in $Dir"
    }
    $Dirty = (& git -C $Dir status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $Dirty) { throw "STOP: source snapshot has local changes: $Dir" }
    & git -C $Dir pull --ff-only origin main
    if ($LASTEXITCODE -ne 0) { throw "STOP: non-fast-forward snapshot update: $Dir" }
}
Update-ReadOnlySnapshot $Production 'https://github.com/Reltroner/reltroner-studio.git'
Update-ReadOnlySnapshot $Remodeling 'https://github.com/Reltroner/reltroner-studio-remodeling.git'

$ProdSha = (& git -C $Production rev-parse HEAD).Trim()
$DraftSha = (& git -C $Remodeling rev-parse HEAD).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Unable to determine snapshot SHAs' }
Write-Host "Production main: $ProdSha"
Write-Host "Remodeling main: $DraftSha"
Write-Host 'Deployment verified: NO (main is NOT a deployed SHA)'

& node scripts/analyze.mjs --production-dir $Production --remodeling-dir $Remodeling --production-sha $ProdSha --remodeling-sha $DraftSha
if ($LASTEXITCODE -ne 0) { throw 'Analysis failed' }
& npm test
if ($LASTEXITCODE -ne 0) { throw 'Tests failed' }
& npm run build
if ($LASTEXITCODE -ne 0) { throw 'Static build failed' }

Write-Host 'P0 analysis generated: artifacts\audit.json'
Write-Host 'Static dashboard generated: dist\index.html'
Write-Host 'No deployment or source repository mutation performed.'
