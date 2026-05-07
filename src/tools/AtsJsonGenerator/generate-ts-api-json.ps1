#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generates TypeScript API reference JSON files by running `aspire sdk dump --format json`
    for each Aspire hosting integration that has [AspireExport] attributes.

.DESCRIPTION
    Supports two input modes:
    1. -AspireRepoPath: Discovers .csproj files in a local microsoft/aspire clone
    2. -NuGetPackageVersion: Uses Name@Version syntax to resolve packages via NuGet

    For each eligible package, this script:
    1. Runs `aspire sdk dump --format json` to generate raw ATS capabilities JSON
    2. Runs the AtsJsonGenerator tool to transform it into docs-site JSON
    3. Outputs to src/frontend/src/data/ts-modules/

.PARAMETER AspireRepoPath
    Path to a local microsoft/aspire repository clone. Discovers projects with
    [AspireExport] attributes automatically.

.PARAMETER NuGetPackageVersion
    One or more package references in Name@Version format (e.g.
    "Aspire.Hosting.Redis@13.1.2"). Passed to `aspire sdk dump` as the
    integration argument.

.PARAMETER OutputDir
    The directory to write the generated JSON files to.
    Defaults to <repo-root>/src/frontend/src/data/ts-modules.

.PARAMETER PackageFilter
    Optional wildcard filter to process only specific packages (e.g. "*Redis*").

.PARAMETER AspireCliProject
    Path to a local Aspire.Cli.csproj to use instead of the globally installed
    `aspire` CLI. Useful for testing local CLI changes. When set, the script
    invokes `dotnet run --no-launch-profile --project <path> --` instead of `aspire`.

.EXAMPLE
    # From a local Aspire repo clone (uses global CLI)
    ./generate-ts-api-json.ps1 -AspireRepoPath D:\GitHub\aspire

    # Using Name@Version syntax with a local CLI build
    ./generate-ts-api-json.ps1 -NuGetPackageVersion "Aspire.Hosting@13.1.2","Aspire.Hosting.Redis@13.1.2" `
        -AspireCliProject D:\GitHub\aspire\src\Aspire.Cli\Aspire.Cli.csproj

    # Filter to specific packages
    ./generate-ts-api-json.ps1 -AspireRepoPath D:\GitHub\aspire -PackageFilter "*Redis*"
#>

[CmdletBinding()]
param(
    [string]$AspireRepoPath,

    [string[]]$NuGetPackageVersion,

    [string]$OutputDir,

    [string]$PackageFilter,

    [string]$AspireCliProject
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$NuGetOrgServiceIndex = "https://api.nuget.org/v3/index.json"
$AspireRepoCandidates = @(
    $env:ASPIRE_GITHUB_REPO_URL,
    "https://github.com/microsoft/aspire"
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..")).Path
$ToolProject = Join-Path $ScriptDir "AtsJsonGenerator.csproj"

if (-not $OutputDir) {
    $OutputDir = Join-Path $RepoRoot "src\frontend\src\data\ts-modules"
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

$TempDir = Join-Path $OutputDir ".tmp-dumps"
if (-not (Test-Path $TempDir)) {
    New-Item -ItemType Directory -Path $TempDir -Force | Out-Null
}

function Remove-StaleTsModuleFiles {
    param(
        [string]$PackageName,
        [string]$CurrentOutputFile,
        [string]$OutputDirectory
    )

    if ([string]::IsNullOrWhiteSpace($PackageName) -or [string]::IsNullOrWhiteSpace($CurrentOutputFile)) {
        return
    }

    $namePattern = "^{0}\.\d.*\.json$" -f [regex]::Escape($PackageName)
    $currentPath = [System.IO.Path]::GetFullPath($CurrentOutputFile)

    Get-ChildItem -Path $OutputDirectory -File -Filter '*.json' | Where-Object {
        $_.Name -match $namePattern -and [System.IO.Path]::GetFullPath($_.FullName) -ne $currentPath
    } | Remove-Item -Force -ErrorAction SilentlyContinue
}

function Normalize-BranchName {
    [CmdletBinding()]
    param([string]$BranchName)

    if ([string]::IsNullOrWhiteSpace($BranchName)) {
        return ""
    }

    return $BranchName -replace '^refs/heads/', ''
}

function Get-CurrentBranchName {
    [CmdletBinding()]
    param()

    $candidates = @(
        $env:BUILD_SOURCEBRANCH,
        $env:GITHUB_HEAD_REF,
        $env:GITHUB_REF_NAME
    )

    foreach ($candidate in $candidates) {
        $normalized = Normalize-BranchName $candidate
        if (-not [string]::IsNullOrWhiteSpace($normalized)) {
            return $normalized
        }
    }

    try {
        $branch = (& git rev-parse --abbrev-ref HEAD 2>$null)
        if ($LASTEXITCODE -eq 0) {
            return (Normalize-BranchName (($branch | Out-String).Trim()))
        }
    }
    catch {
    }

    return ""
}

function Test-IsReleaseBranch {
    [CmdletBinding()]
    param([string]$BranchName)

    return $BranchName.StartsWith("release/", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-ReleaseFeedNameFromCommit {
    [CmdletBinding()]
    param([string]$Commit)

    if ([string]::IsNullOrWhiteSpace($Commit)) {
        return $null
    }

    $normalizedCommit = $Commit.Trim()
    $length = [Math]::Min(8, $normalizedCommit.Length)
    return "darc-pub-microsoft-aspire-$($normalizedCommit.Substring(0, $length))"
}

function ConvertTo-ReleaseFeedServiceIndex {
    [CmdletBinding()]
    param([string]$Value)

    if ([string]::IsNullOrWhiteSpace($Value)) {
        return $null
    }

    $trimmed = $Value.Trim()
    if ($trimmed -match '^https?://' -and $trimmed -match '/nuget/v3/index\.json/?$') {
        return $trimmed.TrimEnd('/')
    }

    $feedName = $null
    if ($trimmed -match '/_artifacts/feed/([^/?#]+)') {
        $feedName = $Matches[1]
    }
    elseif ($trimmed -match '/_packaging/([^/?#]+)') {
        $feedName = $Matches[1]
    }
    elseif ($trimmed -match '^[A-Za-z0-9][A-Za-z0-9._-]*$') {
        $feedName = $trimmed
    }

    if ($feedName) {
        return "https://pkgs.dev.azure.com/dnceng/public/_packaging/$feedName/nuget/v3/index.json"
    }

    return $null
}

function Resolve-ReleaseBranchCommit {
    [CmdletBinding()]
    param([string]$BranchName)

    foreach ($repositoryUrl in $AspireRepoCandidates) {
        try {
            $output = (& git ls-remote $repositoryUrl "refs/heads/$BranchName" 2>$null)
            if ($LASTEXITCODE -ne 0) {
                continue
            }

            $text = ($output | Out-String).Trim()
            if ($text -match '^([0-9a-f]{40})\s+') {
                return [PSCustomObject]@{
                    Repository = $repositoryUrl
                    Commit     = $Matches[1]
                }
            }
        }
        catch {
        }
    }

    return $null
}

function Resolve-OfficialAspireFeed {
    [CmdletBinding()]
    param([string]$BranchName)

    if (-not (Test-IsReleaseBranch -BranchName $BranchName)) {
        return [PSCustomObject]@{
            BranchName   = $BranchName
            IsRelease    = $false
            ServiceIndex = $NuGetOrgServiceIndex
            FeedName     = $null
            Resolution   = "default"
            DisplayName  = "nuget.org"
        }
    }

    $explicitFeedUrl = ConvertTo-ReleaseFeedServiceIndex -Value $env:ASPIRE_RELEASE_FEED_URL
    if ($explicitFeedUrl) {
        return [PSCustomObject]@{
            BranchName   = $BranchName
            IsRelease    = $true
            ServiceIndex = $explicitFeedUrl
            FeedName     = $null
            Resolution   = "ASPIRE_RELEASE_FEED_URL"
            DisplayName  = $explicitFeedUrl
        }
    }

    $explicitFeedName = $env:ASPIRE_RELEASE_FEED_NAME
    if (-not [string]::IsNullOrWhiteSpace($explicitFeedName)) {
        $serviceIndex = ConvertTo-ReleaseFeedServiceIndex -Value $explicitFeedName
        return [PSCustomObject]@{
            BranchName   = $BranchName
            IsRelease    = $true
            ServiceIndex = $serviceIndex
            FeedName     = $explicitFeedName.Trim()
            Resolution   = "ASPIRE_RELEASE_FEED_NAME"
            DisplayName  = $explicitFeedName.Trim()
        }
    }

    $explicitCommit = $env:ASPIRE_RELEASE_COMMIT
    if ([string]::IsNullOrWhiteSpace($explicitCommit)) {
        $explicitCommit = $env:ASPIRE_RELEASE_COMMIT_SHA
    }
    if ([string]::IsNullOrWhiteSpace($explicitCommit)) {
        $explicitCommit = $env:ASPIRE_RELEASE_SOURCE_COMMIT
    }
    if (-not [string]::IsNullOrWhiteSpace($explicitCommit)) {
        $feedName = Get-ReleaseFeedNameFromCommit -Commit $explicitCommit
        return [PSCustomObject]@{
            BranchName   = $BranchName
            IsRelease    = $true
            ServiceIndex = ConvertTo-ReleaseFeedServiceIndex -Value $feedName
            FeedName     = $feedName
            Resolution   = "ASPIRE_RELEASE_COMMIT"
            DisplayName  = $feedName
            SourceCommit = $explicitCommit.Trim()
        }
    }

    $branchCommit = Resolve-ReleaseBranchCommit -BranchName $BranchName
    if (-not $branchCommit) {
        throw "Unable to resolve the official Aspire release feed for branch '$BranchName'. Set ASPIRE_RELEASE_FEED_URL, ASPIRE_RELEASE_FEED_NAME, or ASPIRE_RELEASE_COMMIT while microsoft/aspire is the active source repo."
    }

    $feedName = Get-ReleaseFeedNameFromCommit -Commit $branchCommit.Commit
    return [PSCustomObject]@{
        BranchName       = $BranchName
        IsRelease        = $true
        ServiceIndex     = ConvertTo-ReleaseFeedServiceIndex -Value $feedName
        FeedName         = $feedName
        Resolution       = "branch head"
        DisplayName      = $feedName
        SourceCommit     = $branchCommit.Commit
        SourceRepository = $branchCommit.Repository
    }
}

function New-TemporaryNuGetConfigDirectory {
    [CmdletBinding()]
    param([string[]]$RestoreSources)

    $sourceEntries = @($RestoreSources | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
    if ($sourceEntries.Count -eq 0) {
        return $null
    }

    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "atsjson-nuget-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    $configLines = @(
        '<?xml version="1.0" encoding="utf-8"?>',
        '<configuration>',
        '  <packageSources>',
        '    <clear />'
    )

    for ($sourceIndex = 0; $sourceIndex -lt $sourceEntries.Count; $sourceIndex++) {
        $source = [System.Security.SecurityElement]::Escape($sourceEntries[$sourceIndex])
        $configLines += "    <add key=`"source$sourceIndex`" value=`"$source`" />"
    }

    $configLines += '  </packageSources>'
    $configLines += '</configuration>'
    $configLines | Set-Content (Join-Path $tempDir 'NuGet.Config') -Encoding UTF8

    return $tempDir
}

# ── Route 0: Auto-detect from generated C# package JSON ───────────────────────
if (-not $AspireRepoPath -and (-not $NuGetPackageVersion -or $NuGetPackageVersion.Count -eq 0)) {
    Write-Host "No -AspireRepoPath or -NuGetPackageVersion provided. Auto-detecting from generated C# package JSON..." -ForegroundColor Cyan

    $packageJsonDir = Join-Path $RepoRoot "src\frontend\src\data\pkgs"
    if (-not (Test-Path $packageJsonDir)) {
        Write-Error "C# package JSON directory not found at $packageJsonDir"
        return
    }

    $packageFiles = @(Get-ChildItem -Path $packageJsonDir -Filter '*.json' -File)
    if ($packageFiles.Count -eq 0) {
        Write-Error "No generated C# package JSON files found in $packageJsonDir"
        return
    }

    $hostingPackages = @(
        $packageFiles |
            ForEach-Object {
                $json = Get-Content $_.FullName -Raw | ConvertFrom-Json
                [PSCustomObject]@{
                    Name         = $json.package.name
                    Version      = $json.package.version
                    LastWriteUtc = $_.LastWriteTimeUtc
                }
            } |
            Where-Object {
                ($_.Name -eq "Aspire.Hosting" -or $_.Name -like "Aspire.Hosting.*") -and
                -not [string]::IsNullOrWhiteSpace($_.Version)
            } |
            Group-Object Name |
            ForEach-Object {
                $_.Group | Sort-Object LastWriteUtc -Descending | Select-Object -First 1
            }
    )

    if ($hostingPackages.Count -eq 0) {
        Write-Error "No Aspire.Hosting package JSON files found in $packageJsonDir"
        return
    }

    # Build Name@Version entries directly from the generated C# package data.
    $NuGetPackageVersion = @($hostingPackages | ForEach-Object { "$($_.Name)@$($_.Version)" })

    if ($NuGetPackageVersion.Count -eq 0) {
        Write-Error "No versioned Aspire.Hosting package JSON files found in $packageJsonDir"
        return
    }

    Write-Host "  Found $($NuGetPackageVersion.Count) Aspire.Hosting packages to process" -ForegroundColor DarkGray
}

# ── Helper: invoke the aspire CLI ──────────────────────────────────────────────

function Invoke-AspireCli {
    param(
        [string[]]$Arguments,
        [string]$WorkingDirectory,
        [string]$StderrFile
    )

    if ($AspireCliProject) {
        # Run via dotnet run against a local Aspire.Cli.csproj (assumes pre-built)
        $allArgs = @("run", "--no-launch-profile", "--no-build", "--project", $AspireCliProject, "--") + $Arguments
        $proc = Start-Process -FilePath "dotnet" -ArgumentList $allArgs -WorkingDirectory $WorkingDirectory `
            -Wait -NoNewWindow -PassThru -RedirectStandardError $StderrFile
    } else {
        # Use the globally installed aspire CLI
        $proc = Start-Process -FilePath "aspire" -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
            -Wait -NoNewWindow -PassThru -RedirectStandardError $StderrFile
    }

    # Filter out update notices from stderr
    if (Test-Path $StderrFile) {
        $stderrContent = Get-Content $StderrFile -Raw -ErrorAction SilentlyContinue
        if ($stderrContent -and $stderrContent -match "A new version of the Aspire CLI is available") {
            # Strip the update notice lines and rewrite
            $filtered = ($stderrContent -split "`r?`n" | Where-Object {
                $_ -notmatch "A new version of the Aspire CLI is available" -and
                $_ -notmatch "To update, run:" -and
                $_ -notmatch "For more information, see:"
            }) -join "`n"
            Set-Content -Path $StderrFile -Value $filtered.Trim() -ErrorAction SilentlyContinue
        }
    }

    return $proc
}

# ── Collect packages to process ────────────────────────────────────────────────

# Each entry: @{ Name = "Aspire.Hosting.Redis"; Version = "13.1.2"; DumpArgs = @("arg") }
$Packages = @()

# ── Route 1: Discover from local Aspire repo clone ────────────────────────────
if ($AspireRepoPath) {
    $SrcDir = Join-Path $AspireRepoPath "src"
    if (-not (Test-Path $SrcDir)) {
        Write-Error "Aspire repo src/ directory not found at $SrcDir"
        return
    }

    # Core Aspire.Hosting must be passed explicitly; the default dump is empty.
    $coreDir = Join-Path $SrcDir "Aspire.Hosting"
    if (Test-Path $coreDir) {
        $coreCsproj = Join-Path $coreDir "Aspire.Hosting.csproj"
        if (-not (Test-Path $coreCsproj)) {
            Write-Warning "Skipping Aspire.Hosting — project file not found at $coreCsproj"
        }
        else {
        $Packages += @{
            Name = "Aspire.Hosting"
            DumpArgs = @($coreCsproj)
        }
        }
    }

    # Only Aspire.Hosting.* packages expose ATS capabilities for the TypeScript SDK.
    # Client/component packages (e.g. Aspire.Azure.Data.Tables) are not applicable.
    $hostingDirs = Get-ChildItem -Path $SrcDir -Directory -Filter "Aspire.Hosting.*" | Where-Object {
        $_.Name -notmatch "(Analyzers|CodeGeneration|RemoteHost|Tests)"
    }

    foreach ($dir in $hostingDirs) {
        $csproj = Join-Path $dir.FullName "$($dir.Name).csproj"
        if (-not (Test-Path $csproj)) { continue }

        $csFiles = Get-ChildItem -Path $dir.FullName -Filter "*.cs" -Recurse | Where-Object {
            $_.FullName -notmatch "\\(obj|bin)\\"
        }

        $hasExport = $false
        foreach ($f in $csFiles) {
            if (Select-String -Path $f.FullName -Pattern "\[AspireExport\(" -Quiet) {
                $hasExport = $true
                break
            }
        }

        if ($hasExport) {
            $Packages += @{
                Name = $dir.Name
                DumpArgs = @($csproj)
            }
        }
    }
}

# ── Route 2: Name@Version NuGet package references ────────────────────────────
# Only Aspire.Hosting.* packages expose ATS capabilities for the TypeScript SDK.
# Client/component packages (e.g. Aspire.Azure.Data.Tables) are not applicable.
if ($NuGetPackageVersion -and $NuGetPackageVersion.Count -gt 0) {
    foreach ($spec in $NuGetPackageVersion) {
        if ($spec -notmatch '^(.+)@(.+)$') {
            Write-Warning "Invalid format '$spec' — expected Name@Version (e.g. Aspire.Hosting.Redis@13.1.2)"
            continue
        }
        $pkgName = $Matches[1]
        $pkgVersion = $Matches[2]

        if ($pkgName -ne "Aspire.Hosting" -and -not $pkgName.StartsWith("Aspire.Hosting.")) {
            Write-Warning "Skipping $pkgName — only Aspire.Hosting.* packages have ATS capabilities"
            continue
        }

        $Packages += @{
            Name = $pkgName
            Version = $pkgVersion
            DumpArgs = @("$pkgName@$pkgVersion")
        }
    }
}

if ($PackageFilter) {
    $Packages = $Packages | Where-Object { $_.Name -like $PackageFilter }
}

$branchName = Get-CurrentBranchName
$officialFeed = Resolve-OfficialAspireFeed -BranchName $branchName
$aspireCliWorkingDirectory = $null

if (-not $AspireRepoPath) {
    $restoreSources = if ($officialFeed.IsRelease) {
        @($officialFeed.ServiceIndex, $NuGetOrgServiceIndex)
    }
    else {
        @($NuGetOrgServiceIndex)
    }

    $aspireCliWorkingDirectory = New-TemporaryNuGetConfigDirectory -RestoreSources $restoreSources

    if ($officialFeed.IsRelease) {
        Write-Host "Release branch detected ($($officialFeed.BranchName)). TypeScript module generation will resolve official Aspire packages from $($officialFeed.DisplayName)." -ForegroundColor Cyan
    }
}

Write-Host "Found $($Packages.Count) packages to process"
if ($AspireCliProject) {
    Write-Host "Using local CLI: $AspireCliProject" -ForegroundColor DarkGray
}

# ── Build the tool ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Building AtsJsonGenerator..." -ForegroundColor Cyan
& dotnet build $ToolProject --nologo -v q 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build AtsJsonGenerator"
    return
}

# ── Generate ATS dumps ─────────────────────────────────────────────────────────

# Process core Aspire.Hosting first so we can use it as a base for dedup
$corePackages = @($Packages | Where-Object { $_.Name -eq "Aspire.Hosting" })
$integrationPackages = @($Packages | Where-Object { $_.Name -ne "Aspire.Hosting" })

$success = 0
$failed = 0
$skipped = 0
$coreOutputFile = $null

# Process core first
foreach ($pkg in $corePackages) {
    $name = $pkg.Name
    $version = $pkg.Version
    $fileBaseName = if ($version) { "$name.$version" } else { $name }
    $dumpFile = Join-Path $TempDir "$name.json"
    $outputFile = Join-Path $OutputDir "$fileBaseName.json"

    Write-Host ""
    Write-Host "[$name] (core — processed first)" -ForegroundColor Cyan

    # Step 1: Run aspire sdk dump --format json
    Write-Host "  Dumping ATS capabilities..."
    try {
        $dumpArgs = @("sdk", "dump", "--format", "json", "--non-interactive", "--nologo", "-o", $dumpFile)
        $dumpArgs += $pkg.DumpArgs

        $workDir = if ($AspireRepoPath) { $AspireRepoPath } elseif ($aspireCliWorkingDirectory) { $aspireCliWorkingDirectory } else { $PWD.Path }
        $proc = Invoke-AspireCli -Arguments $dumpArgs -WorkingDirectory $workDir `
            -StderrFile (Join-Path $TempDir "$name.stderr.txt")

        if ($proc.ExitCode -ne 0 -and -not (Test-Path $dumpFile)) {
            $stderr = Get-Content (Join-Path $TempDir "$name.stderr.txt") -Raw -ErrorAction SilentlyContinue
            Write-Warning "  aspire sdk dump failed (exit $($proc.ExitCode))"
            if ($stderr) { Write-Warning "  $stderr" }
            $failed++
            continue
        }

        if (-not (Test-Path $dumpFile)) {
            Write-Warning "  Dump file not created"
            $failed++
            continue
        }

        if ($proc.ExitCode -ne 0) {
            Write-Host "  aspire sdk dump exited with $($proc.ExitCode) but output was generated — continuing" -ForegroundColor DarkYellow
        }
    }
    catch {
        Write-Warning "  Error running aspire sdk dump: $_"
        $failed++
        continue
    }

    # Step 2: Transform (no --base for core)
    Write-Host "  Transforming to docs JSON..."
    try {
        $transformArgs = @(
            "run", "--project", $ToolProject, "--no-build", "--",
            "--input", $dumpFile,
            "--output", $outputFile,
            "--package-name", $name,
            "--source-repo", "https://github.com/microsoft/aspire"
        )

        & dotnet @transformArgs 2>&1 | ForEach-Object {
            if ($_ -match "Generated:") {
                Write-Host "  $_" -ForegroundColor Green
            } elseif ($_ -match "FAILED|Error") {
                Write-Host "  $_" -ForegroundColor Red
            }
        }

        if ($LASTEXITCODE -eq 0) {
            $success++
            $coreOutputFile = $outputFile
            if ($version) {
                Remove-StaleTsModuleFiles -PackageName $name -CurrentOutputFile $outputFile -OutputDirectory $OutputDir
            }
        } else {
            Write-Warning "  Transform failed"
            $failed++
        }
    }
    catch {
        Write-Warning "  Error transforming: $_"
        $failed++
    }
}

# Verify core was generated (needed as base for dedup)
if (-not $coreOutputFile -or -not (Test-Path $coreOutputFile)) {
    Write-Warning "Core Aspire.Hosting.json not generated — skipping dedup for integrations"
    $coreOutputFile = $null
}

# Process integration packages with --base for dedup
foreach ($pkg in $integrationPackages | Sort-Object { $_.Name }) {
    $name = $pkg.Name
    $version = $pkg.Version
    $fileBaseName = if ($version) { "$name.$version" } else { $name }
    $dumpFile = Join-Path $TempDir "$name.json"
    $outputFile = Join-Path $OutputDir "$fileBaseName.json"

    Write-Host ""
    Write-Host "[$name]" -ForegroundColor Cyan

    # Step 1: Run aspire sdk dump --format json
    Write-Host "  Dumping ATS capabilities..."
    try {
        $dumpArgs = @("sdk", "dump", "--format", "json", "--non-interactive", "--nologo", "-o", $dumpFile)
        $dumpArgs += $pkg.DumpArgs

        $workDir = if ($AspireRepoPath) { $AspireRepoPath } elseif ($aspireCliWorkingDirectory) { $aspireCliWorkingDirectory } else { $PWD.Path }
        $proc = Invoke-AspireCli -Arguments $dumpArgs -WorkingDirectory $workDir `
            -StderrFile (Join-Path $TempDir "$name.stderr.txt")

        if ($proc.ExitCode -ne 0 -and -not (Test-Path $dumpFile)) {
            $stderr = Get-Content (Join-Path $TempDir "$name.stderr.txt") -Raw -ErrorAction SilentlyContinue
            Write-Warning "  aspire sdk dump failed (exit $($proc.ExitCode))"
            if ($stderr) { Write-Warning "  $stderr" }
            $failed++
            continue
        }

        if (-not (Test-Path $dumpFile)) {
            Write-Warning "  Dump file not created"
            $failed++
            continue
        }

        if ($proc.ExitCode -ne 0) {
            Write-Host "  aspire sdk dump exited with $($proc.ExitCode) but output was generated — continuing" -ForegroundColor DarkYellow
        }
    }
    catch {
        Write-Warning "  Error running aspire sdk dump: $_"
        $failed++
        continue
    }

    # Step 2: Transform with AtsJsonGenerator (with --base dedup)
    Write-Host "  Transforming to docs JSON..."
    try {
        $transformArgs = @(
            "run", "--project", $ToolProject, "--no-build", "--",
            "--input", $dumpFile,
            "--output", $outputFile,
            "--package-name", $name,
            "--source-repo", "https://github.com/microsoft/aspire"
        )

        # Dedup against core if available
        if ($coreOutputFile) {
            $transformArgs += @("--base", $coreOutputFile)
        }

        & dotnet @transformArgs 2>&1 | ForEach-Object {
            if ($_ -match "Generated:") {
                Write-Host "  $_" -ForegroundColor Green
            } elseif ($_ -match "FAILED|Error") {
                Write-Host "  $_" -ForegroundColor Red
            }
        }

        if ($LASTEXITCODE -eq 0) {
            $success++
            if ($version) {
                Remove-StaleTsModuleFiles -PackageName $name -CurrentOutputFile $outputFile -OutputDirectory $OutputDir
            }
        } else {
            Write-Warning "  Transform failed"
            $failed++
        }
    }
    catch {
        Write-Warning "  Error transforming: $_"
        $failed++
    }
}

# ── Cleanup ────────────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "Complete: $success succeeded, $failed failed, $skipped skipped" -ForegroundColor $(if ($failed -gt 0) { "Yellow" } else { "Green" })

# Clean up temp files
if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}

if ($aspireCliWorkingDirectory -and (Test-Path $aspireCliWorkingDirectory)) {
    Remove-Item $aspireCliWorkingDirectory -Recurse -Force -ErrorAction SilentlyContinue
}
