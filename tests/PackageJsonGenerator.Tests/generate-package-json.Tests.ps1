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
