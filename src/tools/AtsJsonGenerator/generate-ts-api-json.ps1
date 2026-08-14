#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generates TypeScript API reference JSON files by running `aspire sdk dump --format json`
    for each Aspire or Community Toolkit hosting integration that has ATS capabilities.

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

.ENVIRONMENT_VARIABLE ASPIRE_CLI_PATH
    Path to the installed Aspire CLI executable. Used when -AspireCliProject is
    not set; defaults to resolving `aspire` from PATH.

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
$AspireCliPath = if ([string]::IsNullOrWhiteSpace($env:ASPIRE_CLI_PATH)) { "aspire" } else { $env:ASPIRE_CLI_PATH }

$FinalOutputDir = if ($OutputDir) {
    [System.IO.Path]::GetFullPath($OutputDir)
}
else {
    Join-Path $RepoRoot "src\frontend\src\data\ts-modules"
}
$OutputDir = Join-Path ([System.IO.Path]::GetDirectoryName($FinalOutputDir)) (
    ".$([System.IO.Path]::GetFileName($FinalOutputDir))-staging-$([Guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

$TempDir = Join-Path $OutputDir ".tmp-dumps"
New-Item -ItemType Directory -Path $TempDir -Force | Out-Null

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

function Get-JsonArrayPropertyCount {
    param(
        [psobject]$Object,
        [string]$PropertyName
    )

    $property = $Object.PSObject.Properties[$PropertyName]
    if ($null -eq $property -or $null -eq $property.Value) {
        return 0
    }

    return @($property.Value).Count
}

function Get-TsModuleApiItemCount {
    param([psobject]$ModuleJson)

    $itemCount = 0
    foreach ($propertyName in @("functions", "handleTypes", "dtoTypes", "enumTypes")) {
        $itemCount += Get-JsonArrayPropertyCount -Object $ModuleJson -PropertyName $propertyName
    }

    return $itemCount
}

function Remove-EmptyTsModuleFile {
    param(
        [string]$PackageName,
        [string]$OutputFile
    )

    if (-not (Test-Path $OutputFile)) {
        throw "Cannot inspect missing TypeScript module file at $OutputFile"
    }

    $json = Get-Content $OutputFile -Raw | ConvertFrom-Json
    if ((Get-TsModuleApiItemCount -ModuleJson $json) -gt 0) {
        return $false
    }

    Remove-Item $OutputFile -Force
    Write-Host "  Omitted empty TypeScript module for $PackageName" -ForegroundColor DarkYellow
    return $true
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
function Test-IsTypeScriptSdkPackage {
    [CmdletBinding()]
    param([string]$PackageName)

    if ([string]::IsNullOrWhiteSpace($PackageName)) {
        return $false
    }

    return (
        $PackageName.Equals("Aspire.Hosting", [System.StringComparison]::OrdinalIgnoreCase) -or
        $PackageName.StartsWith("Aspire.Hosting.", [System.StringComparison]::OrdinalIgnoreCase) -or
        $PackageName.StartsWith("CommunityToolkit.Aspire.Hosting.", [System.StringComparison]::OrdinalIgnoreCase)
    )
}

function Get-CSharpHostingPackageMetadata {
    $packageJsonDir = if (-not [string]::IsNullOrWhiteSpace($env:ASPIRE_API_PKGS_DIR)) {
        [System.IO.Path]::GetFullPath($env:ASPIRE_API_PKGS_DIR)
    }
    else {
        Join-Path $RepoRoot "src\frontend\src\data\pkgs"
    }
    if (-not (Test-Path $packageJsonDir)) {
        return @()
    }

    return @(
        Get-ChildItem -Path $packageJsonDir -Filter '*.json' -File |
            ForEach-Object {
                $json = Get-Content $_.FullName -Raw | ConvertFrom-Json
                if ((Test-IsTypeScriptSdkPackage -PackageName $json.package.name) -and
                    -not [string]::IsNullOrWhiteSpace($json.package.version)) {
                    $sourceRepository = $json.package.PSObject.Properties["sourceRepository"]
                    $sourceCommit = $json.package.PSObject.Properties["sourceCommit"]
                    [PSCustomObject]@{
                        Name             = [string]$json.package.name
                        Version          = [string]$json.package.version
                        SourceRepository = if ($sourceRepository) { [string]$sourceRepository.Value } else { $null }
                        SourceCommit     = if ($sourceCommit) { [string]$sourceCommit.Value } else { $null }
                        Path             = $_.FullName
                    }
                }
            }
    )
}

function Get-PackageSourceRepository {
    [CmdletBinding()]
    param([string]$PackageName)

    if (
        $PackageName.Equals("Aspire.Hosting", [System.StringComparison]::OrdinalIgnoreCase) -or
        $PackageName.StartsWith("Aspire.Hosting.", [System.StringComparison]::OrdinalIgnoreCase)
    ) {
        return "https://github.com/microsoft/aspire"
    }

    if ($PackageName.StartsWith("CommunityToolkit.Aspire.Hosting.", [System.StringComparison]::OrdinalIgnoreCase)) {
        return "https://github.com/CommunityToolkit/Aspire"
    }

    return $null
}

$generatedPackageMetadata = @(Get-CSharpHostingPackageMetadata)
$packageMetadataBySpec = @{}
foreach ($metadata in $generatedPackageMetadata) {
    $spec = "$($metadata.Name)@$($metadata.Version)"
    if ($packageMetadataBySpec.ContainsKey($spec)) {
        throw "Duplicate generated C# package metadata for '$spec': '$($packageMetadataBySpec[$spec].Path)' and '$($metadata.Path)'."
    }
    $packageMetadataBySpec[$spec] = $metadata
}

$hasExplicitNuGetPackageVersion = $NuGetPackageVersion -and $NuGetPackageVersion.Count -gt 0
if (-not $AspireRepoPath -and -not $hasExplicitNuGetPackageVersion) {
    Write-Host "No -AspireRepoPath or -NuGetPackageVersion provided. Auto-detecting from generated C# package JSON..." -ForegroundColor Cyan

    $hostingPackages = @($generatedPackageMetadata)

    if ($hostingPackages.Count -eq 0) {
        Write-Error "No TypeScript SDK package JSON files found in src/frontend/src/data/pkgs"
        return
    }

    $duplicatePackages = @($hostingPackages | Group-Object Name | Where-Object Count -gt 1)
    if ($duplicatePackages.Count -gt 0) {
        $details = $duplicatePackages | ForEach-Object {
            "$($_.Name): $((@($_.Group) | ForEach-Object { "$($_.Version) [$($_.Path)]" }) -join ', ')"
        }
        throw "Multiple generated C# package versions prevent deterministic TypeScript API generation:`n  $($details -join "`n  ")"
    }

    # Build Name@Version entries directly from the generated C# package data.
    $NuGetPackageVersion = @($hostingPackages | ForEach-Object { "$($_.Name)@$($_.Version)" })

    if ($NuGetPackageVersion.Count -eq 0) {
        Write-Error "No versioned TypeScript SDK package JSON files found in $packageJsonDir"
        return
    }

    Write-Host "  Found $($NuGetPackageVersion.Count) TypeScript SDK packages to process" -ForegroundColor DarkGray
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
        # Use the installed aspire CLI
        $proc = Start-Process -FilePath $AspireCliPath -ArgumentList $Arguments -WorkingDirectory $WorkingDirectory `
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
            SourceRepository = Get-PackageSourceRepository -PackageName "Aspire.Hosting"
            SourceCommit = $null
        }
        }
    }

    # Only hosting packages expose ATS capabilities for the TypeScript SDK.
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
                SourceRepository = Get-PackageSourceRepository -PackageName $dir.Name
                SourceCommit = $null
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
        $packageMetadata = $packageMetadataBySpec["$pkgName@$pkgVersion"]
        if ($null -eq $packageMetadata) {
            throw "No exact generated C# package metadata was found for '$pkgName@$pkgVersion'. Run generate-package-json.ps1 first."
        }

        if (-not (Test-IsTypeScriptSdkPackage -PackageName $pkgName)) {
            Write-Warning "Skipping $pkgName — only Aspire.Hosting* and CommunityToolkit.Aspire.Hosting* packages have ATS capabilities"
            continue
        }

        $Packages += @{
            Name = $pkgName
            Version = $pkgVersion
            DumpArgs = @("$pkgName@$pkgVersion")
            SourceRepository = $packageMetadata.SourceRepository
            SourceCommit = $packageMetadata.SourceCommit
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
} else {
    Write-Host "Using Aspire CLI: $AspireCliPath" -ForegroundColor DarkGray
}

# ── Build the tool ─────────────────────────────────────────────────────────────

Write-Host ""
Write-Host "Building AtsJsonGenerator..." -ForegroundColor Cyan
& dotnet build $ToolProject --nologo -v q 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Failed to build AtsJsonGenerator" -ForegroundColor Red
    Remove-Item -Path $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

# ── Generate ATS dumps ─────────────────────────────────────────────────────────

# Process core Aspire.Hosting first so we can use it as a base for dedup
$corePackages = @($Packages | Where-Object { $_.Name -eq "Aspire.Hosting" })
$integrationPackages = @($Packages | Where-Object { $_.Name -ne "Aspire.Hosting" })

$success = 0
$failed = 0
$skipped = 0
$failedPackageNames = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase)
$skippedPackageNames = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase)
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
            [void]$failedPackageNames.Add($name)
            continue
        }

        if (-not (Test-Path $dumpFile)) {
            Write-Warning "  Dump file not created"
            $failed++
            [void]$failedPackageNames.Add($name)
            continue
        }

        if ($proc.ExitCode -ne 0) {
            Write-Host "  aspire sdk dump exited with $($proc.ExitCode) but output was generated — continuing" -ForegroundColor DarkYellow
        }
    }
    catch {
        Write-Warning "  Error running aspire sdk dump: $_"
        $failed++
        [void]$failedPackageNames.Add($name)
        continue
    }

    # Step 2: Transform (no --base for core)
    Write-Host "  Transforming to docs JSON..."
    try {
        $transformArgs = @(
            "run", "--project", $ToolProject, "--no-build", "--",
            "--input", $dumpFile,
            "--output", $outputFile,
            "--package-name", $name
        )
        $sourceRepository = $pkg.SourceRepository
        if ($sourceRepository) {
            $transformArgs += @("--source-repo", $sourceRepository)
        }
        if (-not [string]::IsNullOrWhiteSpace($pkg.SourceCommit)) {
            $transformArgs += @("--source-commit", $pkg.SourceCommit)
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
            $coreOutputFile = $outputFile
            if ($version) {
                Remove-StaleTsModuleFiles -PackageName $name -CurrentOutputFile $outputFile -OutputDirectory $OutputDir
            }
        } else {
            Write-Warning "  Transform failed"
            $failed++
            [void]$failedPackageNames.Add($name)
        }
    }
    catch {
        Write-Warning "  Error transforming: $_"
        $failed++
        [void]$failedPackageNames.Add($name)
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
            [void]$failedPackageNames.Add($name)
            continue
        }

        if (-not (Test-Path $dumpFile)) {
            Write-Warning "  Dump file not created"
            $failed++
            [void]$failedPackageNames.Add($name)
            continue
        }

        if ($proc.ExitCode -ne 0) {
            Write-Host "  aspire sdk dump exited with $($proc.ExitCode) but output was generated — continuing" -ForegroundColor DarkYellow
        }
    }
    catch {
        Write-Warning "  Error running aspire sdk dump: $_"
        $failed++
        [void]$failedPackageNames.Add($name)
        continue
    }

    # Step 2: Transform with AtsJsonGenerator (with --base dedup)
    Write-Host "  Transforming to docs JSON..."
    try {
        $transformArgs = @(
            "run", "--project", $ToolProject, "--no-build", "--",
            "--input", $dumpFile,
            "--output", $outputFile,
            "--package-name", $name
        )
        $sourceRepository = $pkg.SourceRepository
        if ($sourceRepository) {
            $transformArgs += @("--source-repo", $sourceRepository)
        }
        if (-not [string]::IsNullOrWhiteSpace($pkg.SourceCommit)) {
            $transformArgs += @("--source-commit", $pkg.SourceCommit)
        }

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
            if ($version) {
                Remove-StaleTsModuleFiles -PackageName $name -CurrentOutputFile $outputFile -OutputDirectory $OutputDir
            }
            if (Remove-EmptyTsModuleFile -PackageName $name -OutputFile $outputFile) {
                $skipped++
                [void]$skippedPackageNames.Add($name)
            } else {
                $success++
            }
        } else {
            Write-Warning "  Transform failed"
            $failed++
            [void]$failedPackageNames.Add($name)
        }
    }
    catch {
        Write-Warning "  Error transforming: $_"
        $failed++
        [void]$failedPackageNames.Add($name)
    }
}

# ── Reconcile and cleanup ───────────────────────────────────────────────────────

Write-Host ""
Write-Host "════════════════════════════════════════════════════" -ForegroundColor White
Write-Host "Complete: $success succeeded, $failed failed, $skipped skipped" -ForegroundColor $(if ($failed -gt 0) { "Yellow" } else { "Green" })
if ($failedPackageNames.Count -gt 0) {
    Write-Host "Failed packages: $(($failedPackageNames | Sort-Object) -join ', ')" -ForegroundColor Red
}
if ($skippedPackageNames.Count -gt 0) {
    Write-Host "Skipped packages: $(($skippedPackageNames | Sort-Object) -join ', ')" -ForegroundColor Yellow
}

# Clean up temp files
if (Test-Path $TempDir) {
    Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
}

if ($aspireCliWorkingDirectory -and (Test-Path $aspireCliWorkingDirectory)) {
    Remove-Item $aspireCliWorkingDirectory -Recurse -Force -ErrorAction SilentlyContinue
}

if ($failed -gt 0) {
    Remove-Item -Path $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

New-Item -ItemType Directory -Path $FinalOutputDir -Force | Out-Null
$stagedFiles = @(Get-ChildItem -Path $OutputDir -Filter "*.json" -File)
$stagedNames = [System.Collections.Generic.HashSet[string]]::new(
    [StringComparer]::OrdinalIgnoreCase)
foreach ($file in $stagedFiles) {
    [void]$stagedNames.Add($file.Name)
}

$isFullReconciliation = -not $AspireRepoPath -and -not $PackageFilter -and -not $hasExplicitNuGetPackageVersion
if ($isFullReconciliation) {
    foreach ($existingFile in Get-ChildItem -Path $FinalOutputDir -Filter "*.json" -File) {
        if (-not $stagedNames.Contains($existingFile.Name)) {
            Remove-Item -Path $existingFile.FullName -Force
            Write-Host "Removed stale module: $($existingFile.Name)" -ForegroundColor DarkYellow
        }
    }
}
else {
    foreach ($pkg in $Packages) {
        $packageFilePattern = "^{0}(?:\.\d.*)?\.json$" -f [regex]::Escape($pkg.Name)
        $stagedForPackage = @($stagedFiles | Where-Object {
            $_.Name -match $packageFilePattern
        })
        foreach ($existingFile in Get-ChildItem -Path $FinalOutputDir -Filter "*.json" -File | Where-Object {
            $_.Name -match $packageFilePattern
        }) {
            if ($existingFile.Name -notin $stagedForPackage.Name) {
                Remove-Item -Path $existingFile.FullName -Force
                Write-Host "Removed stale module: $($existingFile.Name)" -ForegroundColor DarkYellow
            }
        }
    }
}

foreach ($file in $stagedFiles) {
    Copy-Item -Path $file.FullName -Destination (Join-Path $FinalOutputDir $file.Name) -Force
}
Remove-Item -Path $OutputDir -Recurse -Force
