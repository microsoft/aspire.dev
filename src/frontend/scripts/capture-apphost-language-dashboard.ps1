#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('typescript', 'csharp', 'python', 'go', 'java', 'rust')]
    [string]$Language,

    [Parameter(Mandatory)]
    [string]$ScenarioDirectory,

    [Parameter(Mandatory)]
    [string]$AspireCliPath,

    [Parameter(Mandatory)]
    [string]$AspireHome,

    [Parameter(Mandatory)]
    [string]$OutputPath,

    [string]$JavaHome
)

$ErrorActionPreference = 'Stop'
$env:ASPIRE_HOME = $AspireHome
$env:ASPIRE_CLI_TELEMETRY_OPTOUT = '1'
$env:ASPIRE_CLI_START_TIMEOUT = '300'

if ($Language -in @('python', 'go', 'java', 'rust')) {
    [Environment]::SetEnvironmentVariable(
        "features__experimentalPolyglot__$Language",
        'true',
        [EnvironmentVariableTarget]::Process)
}

if ($JavaHome) {
    $env:JAVA_HOME = $JavaHome
    $env:PATH = "$(Join-Path $JavaHome 'bin');$env:PATH"
}

Push-Location $ScenarioDirectory
try {
    $output = @(& $AspireCliPath --nologo start --isolated --format Json --non-interactive 2>&1)
    if ($LASTEXITCODE -ne 0) {
        throw "aspire start failed with exit code $LASTEXITCODE`n$($output -join "`n")"
    }

    $text = $output -join "`n"
    $jsonStart = $text.IndexOf('{')
    if ($jsonStart -lt 0) {
        throw "Aspire did not return start JSON:`n$text"
    }
    $started = $text.Substring($jsonStart) | ConvertFrom-Json

    for ($attempt = 1; $attempt -le 30; $attempt++) {
        Start-Sleep -Seconds 1
        $descriptionOutput = @(
            & $AspireCliPath --nologo describe --format Json --non-interactive 2>&1)
        if ($LASTEXITCODE -ne 0) {
            if ($attempt -eq 30) {
                throw "aspire describe failed:`n$($descriptionOutput -join "`n")"
            }
            continue
        }

        $descriptionText = $descriptionOutput -join "`n"
        $descriptionStart = $descriptionText.IndexOf('{')
        if ($descriptionStart -lt 0) {
            continue
        }

        $description = $descriptionText.Substring($descriptionStart) | ConvertFrom-Json
        $resource = @($description.resources) |
            Where-Object { $_.displayName -eq 'web' } |
            Select-Object -First 1
        if ($resource -and $resource.state -eq 'Running' -and $resource.healthStatus -eq 'Healthy') {
            break
        }
    }

    if (-not $resource) {
        throw 'The web resource did not become healthy.'
    }

    $session = "apphost-$Language-dashboard"
    $playwrightConfig = Join-Path $PSScriptRoot 'playwright-dashboard.config.json'
    & playwright-cli "-s=$session" open $started.dashboardUrl --config $playwrightConfig
    & playwright-cli "-s=$session" resize 1440 900
    Start-Sleep -Seconds 2
    & playwright-cli "-s=$session" screenshot --filename $OutputPath --full-page
    & playwright-cli "-s=$session" close
}
finally {
    & $AspireCliPath --nologo stop --force --non-interactive | Out-Null
    Pop-Location
}
