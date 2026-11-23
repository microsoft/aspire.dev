#!/usr/bin/env pwsh

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot ".." "..")).Path
$scriptPath = Join-Path $repoRoot "src/tools/PackageJsonGenerator/generate-package-json.ps1"
$catalogPath = Join-Path $repoRoot "src/frontend/src/data/aspire-integrations.json"

$tokens = $null
$parseErrors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile(
    $scriptPath,
    [ref]$tokens,
    [ref]$parseErrors)

if ($parseErrors.Count -gt 0) {
    throw "generate-package-json.ps1 has parse errors: $($parseErrors.Message -join '; ')"
}

$filterAst = $ast.Find({
    param($node)

    $node -is [System.Management.Automation.Language.CommandAst] -and
    $node.GetCommandName() -eq "Where-Object" -and
    $node.Extent.Text -match "apiReference"
}, $true)

if ($null -eq $filterAst) {
    throw "Could not find the apiReference catalog filter."
}

$predicateAst = $filterAst.CommandElements |
    Where-Object { $_ -is [System.Management.Automation.Language.ScriptBlockExpressionAst] } |
    Select-Object -First 1

if ($null -eq $predicateAst) {
    throw "Could not find the apiReference filter predicate."
}

$predicateText = $predicateAst.ScriptBlock.Extent.Text
$predicate = [scriptblock]::Create($predicateText.Substring(1, $predicateText.Length - 2))

$fixture = @'
[
  { "title": "Property.Omitted" },
  { "title": "Explicit.False", "apiReference": false },
  { "title": "Explicit.True", "apiReference": true }
]
'@ | ConvertFrom-Json

$fixtureResult = @($fixture | Where-Object $predicate)
$expectedFixtureTitles = @("Property.Omitted", "Explicit.True")
$actualFixtureTitles = @($fixtureResult.title)
if (Compare-Object $expectedFixtureTitles $actualFixtureTitles) {
    throw "Unexpected fixture result: $($actualFixtureTitles -join ', ')"
}

$catalog = @(Get-Content $catalogPath -Raw | ConvertFrom-Json)
$catalogResult = @($catalog | Where-Object $predicate)
$excluded = @($catalog | Where-Object {
    $_.PSObject.Properties.Name -contains "apiReference" -and
    $_.apiReference -eq $false
})

if ($catalogResult.Count -ne $catalog.Count - $excluded.Count) {
    throw "Catalog filter retained $($catalogResult.Count) of $($catalog.Count) entries; expected $($catalog.Count - $excluded.Count)."
}

if ($catalogResult.title -contains "Particular.Aspire.Hosting.ServicePlatform") {
    throw "Catalog filter retained Particular.Aspire.Hosting.ServicePlatform."
}

Write-Host "apiReference filter passed fixture and catalog checks ($($catalogResult.Count) included, $($excluded.Count) excluded)."

# Execute the real batch reconciliation without restoring packages or building.
$batchGuardAst = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.IfStatementAst] -and
    $node.Extent.Text.StartsWith('if (-not $batchSummary -or')
}, $true)
$batchReconciliationAst = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.ForEachStatementAst] -and
    $node.Extent.Text.Contains('$reportedStatusCount =')
}, $true)
$failureFunctionAst = $ast.Find({
    param($node)
    $node -is [System.Management.Automation.Language.FunctionDefinitionAst] -and
    $node.Name -eq 'Add-PackageFailure'
}, $true)
if ($null -eq $batchGuardAst -or $null -eq $batchReconciliationAst -or $null -eq $failureFunctionAst) {
    throw 'Could not locate batch reconciliation and failure reporting.'
}
. ([scriptblock]::Create($failureFunctionAst.Extent.Text))
$guard = [scriptblock]::Create($batchGuardAst.Extent.Text)
$reconcile = [scriptblock]::Create($batchReconciliationAst.Extent.Text)
$successCount = 0
$skipCount = 0
$failCount = 0
$failureReasons = @{}
$failedPackageNames = [System.Collections.Generic.HashSet[string]]::new()
$skippedPackageNames = [System.Collections.Generic.HashSet[string]]::new()
$succeededPackages = [System.Collections.Generic.HashSet[string]]::new()
$failedPackages = [System.Collections.Generic.HashSet[string]]::new()
$skippedPackages = [System.Collections.Generic.HashSet[string]]::new()
[void]$succeededPackages.Add('Example.Good')
[void]$failedPackages.Add('Example.Broken')
$batchFailureReasons = @{ 'Example.Broken' = 'cannot read assembly' }
$batchExitCode = 1
$batchSummary = 'Batch complete in 1.0s: 1 succeeded, 1 failed, 0 skipped'
$removedFor = [System.Collections.Generic.List[string]]::new()
function Remove-StalePackageJsonFiles {
    param($PackageName, $CurrentOutputFile, $OutputDirectory)
    $removedFor.Add($PackageName)
}
$OutputDir = [System.IO.Path]::GetTempPath()
$manifestEntries = @(
    @{ packageName = 'Example.Good'; output = $scriptPath },
    @{ packageName = 'Example.Broken'; output = 'unused' }
)
. $guard
. $reconcile
if ($successCount -ne 1 -or $failCount -ne 1 -or $removedFor.Count -ne 1 -or
    $removedFor[0] -ne 'Example.Good' -or
    $failureReasons['Example.Broken'] -notmatch 'cannot read assembly') {
    throw 'A completed partial batch must publish successes and report only actual failures.'
}
foreach ($scenario in @('crash', 'incomplete')) {
    $batchExitCode = if ($scenario -eq 'crash') { 2 } else { 1 }
    $batchSummary = if ($scenario -eq 'incomplete') { $null } else { 'complete' }
    $rejected = $false
    try { . $guard }
    catch { $rejected = $true }
    if (-not $rejected) { throw "$scenario batch was not rejected." }
}
Write-Host 'Batch reconciliation passed partial-success, crash, and incomplete-output checks.'
