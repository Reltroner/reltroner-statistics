#requires -Version 5.1
<#
Regression test for the Windows PowerShell 5.1 native-stderr bug:
Git fetch reports progress on stderr even when exit code is zero.
The synchronization wrapper must NOT redirect stderr with 2>&1 under
$ErrorActionPreference = 'Stop'.
Run only in a GitHub Actions Windows checkout (or an isolated test checkout).
#>
$ErrorActionPreference = 'Stop'
$Root = (git rev-parse --show-toplevel)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($Root)) {
    throw 'Regression test needs a valid Git checkout.'
}
Set-Location -LiteralPath $Root

$Path = Join-Path $Root 'scripts\sync-main-ff-only.ps1'
$Tokens = $null
$ParseErrors = $null
$Ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $Path, [ref]$Tokens, [ref]$ParseErrors
)
if ($ParseErrors.Count -gt 0) {
    throw "Sync script contains PowerShell syntax errors: $($ParseErrors.Count)"
}

$FunctionAst = $Ast.Find({
    param($Node)
    ($Node -is [System.Management.Automation.Language.FunctionDefinitionAst]) -and
    ($Node.Name -eq 'Invoke-GitChecked')
}, $true)
if ($null -eq $FunctionAst) { throw 'Invoke-GitChecked function was not found.' }
if ($FunctionAst.Extent.Text -match '2>&1') {
    throw 'Git wrapper must not merge stderr into stdout under Windows PowerShell 5.1.'
}

# Load only the helper function, not the full sync script with its hardcoded local path.
. ([scriptblock]::Create($FunctionAst.Extent.Text))

# A successful fetch may print normal progress to Git stderr; it must not throw.
Invoke-GitChecked -Arguments @('fetch', '--progress', '--no-tags', 'origin', 'main') | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'Git fetch unexpectedly failed.' }

# A genuine non-zero Git exit code must still throw.
$FailedAsExpected = $false
try {
    Invoke-GitChecked -Arguments @('rev-parse', '--verify', 'refs/heads/reltroner-statistics-impossible-missing-branch-9d3a8f2e') | Out-Null
} catch {
    if ($_.Exception.Message -notmatch 'failed with exit code') { throw }
    $FailedAsExpected = $true
}
if (-not $FailedAsExpected) {
    throw 'Git wrapper failed to reject a genuine non-zero Git exit code.'
}
Write-Host 'POWERSHELL51_NATIVE_STDERR_REGRESSION: PASS' -ForegroundColor Green
