#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidateSet('go', 'java', 'rust')]
    [string]$Language,

    [Parameter(Mandatory)]
    [string]$ScenarioDirectory,

    [Parameter(Mandatory)]
    [string]$OutputPath,

    [string]$Distribution = 'Ubuntu',

    [string]$ToolsRoot = '$HOME/.cache/aspire-lang-tools'
)

$ErrorActionPreference = 'Stop'

function Invoke-WslScript {
    param([Parameter(Mandatory)][string]$Script)

    return @($Script | wsl.exe -d $Distribution -- bash -c "tr -d '\r' | bash")
}

$environmentScript = @'
set -euo pipefail
root="__TOOLS_ROOT__"
export PATH="$root/bin:$root/go/bin:$root/node/bin:$root/jdk/bin:$root/cargo/bin:$PATH"
export ASPIRE_HOME="$root/aspire-home"
export ASPIRE_CLI_TELEMETRY_OPTOUT=1
export ASPIRE_CLI_START_TIMEOUT=300
export DOTNET_DEV_CERTS_OPENSSL_CERTIFICATE_DIRECTORY="$root/dev-certs"
export DOTNET_DEV_CERTS_NSSDB_PATHS="$root/no-browser-dbs"
export SSL_CERT_DIR="$root/dev-certs:/usr/lib/ssl/certs"
export RUSTUP_HOME="$root/rustup"
export CARGO_HOME="$root/cargo"
export CC="$root/bin/cc"
export CARGO_TARGET_X86_64_UNKNOWN_LINUX_GNU_LINKER="$root/bin/cc"
export features__experimentalPolyglot____LANGUAGE__=true
cd "__SCENARIO_DIRECTORY__"
'@
$environmentScript = $environmentScript.
    Replace('__TOOLS_ROOT__', $ToolsRoot).
    Replace('__LANGUAGE__', $Language).
    Replace('__SCENARIO_DIRECTORY__', $ScenarioDirectory)

try {
    $startOutput = Invoke-WslScript -Script (
        $environmentScript +
        "`n`"$ToolsRoot/aspire/aspire`" --nologo start --isolated --format Json --non-interactive")
    if ($LASTEXITCODE -ne 0) {
        throw "WSL aspire start failed with exit code $LASTEXITCODE`n$($startOutput -join "`n")"
    }

    $text = $startOutput -join "`n"
    $jsonStart = $text.IndexOf('{')
    if ($jsonStart -lt 0) {
        throw "Aspire did not return start JSON:`n$text"
    }
    $started = $text.Substring($jsonStart) | ConvertFrom-Json

    $session = "apphost-$Language-dashboard"
    $playwrightConfig = Join-Path $PSScriptRoot 'playwright-dashboard.config.json'
    & playwright-cli "-s=$session" open $started.dashboardUrl --config $playwrightConfig
    & playwright-cli "-s=$session" resize 1440 900
    Start-Sleep -Seconds 2
    & playwright-cli "-s=$session" screenshot --filename $OutputPath --full-page
    & playwright-cli "-s=$session" close
}
finally {
    $null = Invoke-WslScript -Script (
        $environmentScript +
        "`n`"$ToolsRoot/aspire/aspire`" --nologo stop --force --non-interactive")
}
