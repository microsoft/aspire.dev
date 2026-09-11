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

function ConvertFrom-AspireJson {
    param([Parameter(Mandatory)][string]$Output)

    $jsonStart = $Output.IndexOf('{')
    if ($jsonStart -lt 0) {
        throw "Aspire did not return JSON:`n$Output"
    }

    return $Output.Substring($jsonStart) | ConvertFrom-Json
}

function Invoke-Aspire {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $startInfo = [Diagnostics.ProcessStartInfo]::new()
    $startInfo.FileName = $AspireCliPath
    $startInfo.WorkingDirectory = (Get-Location).Path
    $startInfo.UseShellExecute = $false
    $startInfo.CreateNoWindow = $true
    $startInfo.RedirectStandardOutput = $true
    $startInfo.RedirectStandardError = $true
    $startInfo.ArgumentList.Add('--nologo')
    foreach ($argument in $Arguments) {
        $startInfo.ArgumentList.Add($argument)
    }

    $process = [Diagnostics.Process]::new()
    $process.StartInfo = $startInfo
    $null = $process.Start()
    $stdout = $process.StandardOutput.ReadToEndAsync()
    $stderr = $process.StandardError.ReadToEndAsync()
    $process.WaitForExit()
    $result = [PSCustomObject]@{
        ExitCode = $process.ExitCode
        Output = $stdout.GetAwaiter().GetResult()
        Error = $stderr.GetAwaiter().GetResult()
    }
    $process.Dispose()
    return $result
}

function Invoke-AspireJson {
    param([Parameter(Mandatory)][string[]]$Arguments)

    $result = Invoke-Aspire -Arguments $Arguments
    if ($result.ExitCode -ne 0) {
        throw "Aspire failed with exit code $($result.ExitCode)`n$($result.Output)`n$($result.Error)"
    }

    return ConvertFrom-AspireJson -Output $result.Output
}

Push-Location $ScenarioDirectory
try {
    Write-Host "`$ aspire start --isolated --format Json --non-interactive"
    $started = Invoke-AspireJson -Arguments @(
        'start',
        '--isolated',
        '--format',
        'Json',
        '--non-interactive')

    $dashboard = [Uri]$started.dashboardUrl
    Write-Host "AppHost: $(Split-Path $started.appHostPath -Leaf)"
    Write-Host "Process: $($started.appHostPid)"
    Write-Host "Dashboard: $($dashboard.GetLeftPart([UriPartial]::Authority))/"
    Write-Host ''

    $description = $null
    $resource = $null
    for ($attempt = 1; $attempt -le 30; $attempt++) {
        Start-Sleep -Seconds 1
        try {
            $description = Invoke-AspireJson -Arguments @(
                'describe',
                '--format',
                'Json',
                '--non-interactive')
            $resource = @($description.resources) |
                Where-Object { $_.displayName -eq 'web' } |
                Select-Object -First 1
            if ($resource -and $resource.state -eq 'Running' -and $resource.urls.Count -gt 0) {
                break
            }
        }
        catch {
            if ($attempt -eq 30) {
                throw
            }
        }
    }

    if (-not $resource) {
        throw 'The web resource was not reported by aspire describe.'
    }

    Write-Host "`$ aspire describe --format Table"
    & $AspireCliPath --nologo describe --format Table --non-interactive
    if ($LASTEXITCODE -ne 0) {
        throw "aspire describe failed with exit code $LASTEXITCODE"
    }
    Write-Host ''

    $url = @($resource.urls)[0].url
    Write-Host "`$ curl $url"
    $response = Invoke-WebRequest -Uri $url -UseBasicParsing
    Write-Host "HTTP/$($response.StatusCode)"
    Write-Host $response.Content.Trim()
}
finally {
    Write-Host ''
    Write-Host "`$ aspire stop --force --non-interactive"
    $stopResult = Invoke-Aspire -Arguments @('stop', '--force', '--non-interactive')
    if ($stopResult.ExitCode -ne 0) {
        throw "aspire stop failed with exit code $($stopResult.ExitCode)`n$($stopResult.Output)`n$($stopResult.Error)"
    }
    Write-Host "$(Split-Path $started.appHostPath -Leaf) stopped and cleaned up."
    Pop-Location
}
