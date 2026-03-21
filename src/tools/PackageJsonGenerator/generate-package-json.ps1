#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Downloads NuGet packages (if not already cached) and generates Package.Version.json
    files for each using the PackageJsonGenerator tool.

.DESCRIPTION
    For each package in the list, this script:
    1. Queries the NuGet V3 API for the latest stable version (or latest preview if no stable exists).
    2. Checks the local NuGet cache for the package.
    3. Downloads the package via `dotnet restore` if not cached.
    4. Locates the best-matching TFM lib folder inside the package.
    5. Runs the PackageJsonGenerator tool in batch mode, passing all packages at once
       for parallel processing.

.PARAMETER Packages
    An array of NuGet package IDs to process. Defaults to a built-in list of
    Aspire integration packages.

.PARAMETER OutputDir
    The directory to write the generated JSON files to.
    Defaults to <repo-root>/src/frontend/src/data/packages.

.PARAMETER Framework
    Fallback target framework moniker used when restoring packages or when a
    lib folder/framework cannot be inferred automatically.
    Defaults to "net10.0".

.PARAMETER Parallelism
    Maximum degree of parallelism for the batch tool. Defaults to processor count.

.PARAMETER Sequential
    Force sequential processing (one package at a time, legacy mode).

.EXAMPLE
    ./generate-package-json.ps1
    ./generate-package-json.ps1 -Packages @("Aspire.Hosting.Redis", "Aspire.Hosting.PostgreSQL")
    ./generate-package-json.ps1 -Framework "net9.0"
    ./generate-package-json.ps1 -Parallelism 4
#>

[CmdletBinding()]
param(
    [string[]]$Packages,

    [string]$OutputDir,

    [string]$Framework = "net10.0",

    [int]$Parallelism = 0,

    [switch]$Sequential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$NuGetOrgServiceIndex = "https://api.nuget.org/v3/index.json"
$AspireRepoCandidates = @(
    $env:ASPIRE_GITHUB_REPO_URL,
    "https://github.com/microsoft/aspire"
) | Where-Object { -not [string]::IsNullOrWhiteSpace($_) }
$script:NuGetSourceMetadataCache = @{}

# ── Resolve paths ──────────────────────────────────────────────────────────────

$ScriptDir = $PSScriptRoot
$RepoRoot = (Resolve-Path (Join-Path $ScriptDir "..\..\..")).Path
$ToolProject = Join-Path $ScriptDir "PackageJsonGenerator.csproj"

if (-not $OutputDir) {
    $OutputDir = Join-Path $RepoRoot "src\frontend\src\data\pkgs"
}

if (-not (Test-Path $OutputDir)) {
    New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null
}

# ── Default package list ───────────────────────────────────────────────────────

if (-not $Packages -or $Packages.Count -eq 0) {
    # Read from aspire-integrations.json
    $integrationsFile = Join-Path $RepoRoot "src\frontend\src\data\aspire-integrations.json"
    if (Test-Path $integrationsFile) {
        $integrations = Get-Content $integrationsFile -Raw | ConvertFrom-Json
        $Packages = @($integrations | ForEach-Object { $_.title } | Sort-Object -Unique)
        Write-Host "Loaded $($Packages.Count) packages from aspire-integrations.json"
    }
    else {
        Write-Error "No packages specified and aspire-integrations.json not found at $integrationsFile"
        return
    }
}

# ── NuGet cache location ──────────────────────────────────────────────────────

$NuGetCache = if ($env:NUGET_PACKAGES) {
    $env:NUGET_PACKAGES
}
elseif ($IsWindows -or $env:OS -eq "Windows_NT") {
    Join-Path $env:USERPROFILE ".nuget\packages"
}
else {
    Join-Path $HOME ".nuget/packages"
}

# ── NuGet API helpers ─────────────────────────────────────────────────────────

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

function Test-IsOfficialAspirePackage {
    [CmdletBinding()]
    param([string]$PackageId)

    return $PackageId.StartsWith("Aspire.", [System.StringComparison]::OrdinalIgnoreCase)
}

function Get-ReleaseFeedNameFromCommit {
    [CmdletBinding()]
    param([string]$Commit)

    if ([string]::IsNullOrWhiteSpace($Commit)) {
        return $null
    }

    $normalizedCommit = $Commit.Trim()
    $length = [Math]::Min(8, $normalizedCommit.Length)
    return "darc-pub-dotnet-aspire-$($normalizedCommit.Substring(0, $length))"
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
        BranchName      = $BranchName
        IsRelease       = $true
        ServiceIndex    = ConvertTo-ReleaseFeedServiceIndex -Value $feedName
        FeedName        = $feedName
        Resolution      = "branch head"
        DisplayName     = $feedName
        SourceCommit    = $branchCommit.Commit
        SourceRepository = $branchCommit.Repository
    }
}

function Get-NuGetSourceMetadata {
    [CmdletBinding()]
    param([string]$ServiceIndex)

    if ($script:NuGetSourceMetadataCache.ContainsKey($ServiceIndex)) {
        return $script:NuGetSourceMetadataCache[$ServiceIndex]
    }

    $index = Invoke-RestMethod -Uri $ServiceIndex
    $packageBase = @($index.resources | Where-Object { $_.'@type' -like 'PackageBaseAddress*' } | Select-Object -First 1)
    if (-not $packageBase) {
        throw "PackageBaseAddress not found in service index '$ServiceIndex'."
    }

    $packageBaseAddress = $packageBase.'@id'
    if (-not $packageBaseAddress.EndsWith('/')) {
        $packageBaseAddress += '/'
    }

    $metadata = [PSCustomObject]@{
        ServiceIndex       = $ServiceIndex
        PackageBaseAddress = $packageBaseAddress
    }

    $script:NuGetSourceMetadataCache[$ServiceIndex] = $metadata
    return $metadata
}

function Get-LatestNuGetVersion {
    [CmdletBinding()]
    param(
        [string]$PackageId,
        [string]$PackageBaseAddress
    )

    # Use the flat versions endpoint — simple and reliable across all packages
    $versionsUrl = "$PackageBaseAddress$($PackageId.ToLowerInvariant())/index.json"

    try {
        $response = Invoke-RestMethod -Uri $versionsUrl
    }
    catch {
        Write-Warning "Failed to query NuGet for '$PackageId': $_"
        return $null
    }

    $allVersions = @($response.versions)

    if ($allVersions.Count -eq 0) {
        return $null
    }

    # Separate stable and preview
    $stable = @($allVersions | Where-Object { $_ -notmatch '-' })
    $preview = @($allVersions | Where-Object { $_ -match '-' })

    if ($stable.Count -gt 0) {
        # Return latest stable — versions are already sorted by the API,
        # but parse to be safe
        try {
            return ($stable | ForEach-Object { [System.Management.Automation.SemanticVersion]::new($_) } |
                Sort-Object -Descending | Select-Object -First 1).ToString()
        }
        catch {
            # Fallback if SemanticVersion parsing fails
            return $stable[-1]
        }
    }
    elseif ($preview.Count -gt 0) {
        # Return latest preview — last entry is newest
        return $preview[-1]
    }

    return $null
}

function Get-CachedPackagePath {
    [CmdletBinding()]
    param(
        [string]$PackageId,
        [string]$Version
    )

    $packageDir = Join-Path $NuGetCache "$($PackageId.ToLowerInvariant())\$Version"
    if (Test-Path $packageDir) {
        return $packageDir
    }
    return $null
}

function Install-NuGetPackage {
    [CmdletBinding()]
    param(
        [string]$PackageId,
        [string]$Version,
        [string[]]$RestoreSources
    )

    # Create a temp project to restore the package into the global cache
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "pkgjson-$([System.Guid]::NewGuid().ToString('N').Substring(0,8))"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null

    try {
        $csproj = @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>$Framework</TargetFramework>
    <OutputType>Library</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="$PackageId" Version="$Version" />
  </ItemGroup>
</Project>
"@
        $csprojPath = Join-Path $tempDir "Temp.csproj"
        $nugetConfigPath = Join-Path $tempDir "NuGet.config"
        $csproj | Set-Content $csprojPath -Encoding UTF8

        $sourceEntries = @($RestoreSources | Where-Object { -not [string]::IsNullOrWhiteSpace($_) } | Select-Object -Unique)
        if ($sourceEntries.Count -eq 0) {
            throw "No restore sources were provided for $PackageId."
        }

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
        $configLines | Set-Content $nugetConfigPath -Encoding UTF8

        $restoreResult = & dotnet restore $csprojPath --configfile $nugetConfigPath --verbosity quiet 2>&1
        if ($LASTEXITCODE -ne 0) {
            Write-Warning "dotnet restore failed for $PackageId $Version`n$restoreResult"
            return $false
        }
        return $true
    }
    finally {
        Remove-Item $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ── TFM selection ─────────────────────────────────────────────────────────────

function Get-BestLibFolder {
    [CmdletBinding()]
    param(
        [string]$PackagePath
    )

    $libDir = Join-Path $PackagePath "lib"
    if (-not (Test-Path $libDir)) {
        return $null
    }

    $tfmFolders = @(Get-ChildItem -Directory $libDir | Select-Object -ExpandProperty Name)

    if ($tfmFolders.Count -eq 0) {
        return $null
    }

    $bestTfm = $tfmFolders |
        Sort-Object -Property @(
            @{ Expression = {
                $normalized = $_.TrimStart('.').ToLowerInvariant()
                if ($normalized -match '^net(\d+)(?:\.(\d+))?$') { return 0 }
                if ($normalized -match '^netcoreapp(\d+)(?:\.(\d+))?$') { return 1 }
                if ($normalized -match '^netstandard(\d+)(?:\.(\d+))?$') { return 2 }
                return 9
            }; Ascending = $true },
            @{ Expression = {
                $normalized = $_.TrimStart('.').ToLowerInvariant()
                if ($normalized -match '^(?:net|netcoreapp|netstandard)(\d+)(?:\.(\d+))?$') { return [int]$Matches[1] }
                return -1
            }; Descending = $true },
            @{ Expression = {
                $normalized = $_.TrimStart('.').ToLowerInvariant()
                if ($normalized -match '^(?:net|netcoreapp|netstandard)(\d+)(?:\.(\d+))?$' -and $Matches[2]) { return [int]$Matches[2] }
                return -1
            }; Descending = $true },
            @{ Expression = { $_.ToLowerInvariant() }; Descending = $true }
        ) |
        Select-Object -First 1

    return Join-Path $libDir $bestTfm
}

function Get-PreferredTfm {
    [CmdletBinding()]
    param(
        [string]$Tfm,
        [string]$FallbackTfm
    )

    if ([string]::IsNullOrWhiteSpace($Tfm)) {
        return $FallbackTfm
    }

    $normalized = $Tfm.TrimStart('.').ToLowerInvariant()
    if ($normalized -match '^(net\d+(?:\.\d+)?|netcoreapp\d+(?:\.\d+)?|netstandard\d+(?:\.\d+)?)$') {
        return $normalized
    }

    return $FallbackTfm

    return $null
}

# ── Collect runtime reference assemblies ──────────────────────────────────────

function Get-RuntimeReferenceAssemblies {
    [CmdletBinding()]
    param([string]$Tfm)

    # Find the .NET reference assemblies (packs) for the given TFM
    $dotnetRoot = Split-Path (Get-Command dotnet).Source
    $tfmVersion = $Tfm -replace '^net', ''

    $refPackBase = Join-Path $dotnetRoot "packs\Microsoft.NETCore.App.Ref"
    if (-not (Test-Path $refPackBase)) {
        Write-Warning "Could not find reference pack at $refPackBase"
        return @()
    }

    # Find the best matching version directory
    $versionDirs = @(Get-ChildItem -Directory $refPackBase |
        Where-Object { $_.Name.StartsWith($tfmVersion) } |
        Sort-Object Name -Descending)

    if ($versionDirs.Count -eq 0) {
        # Fallback: any version directory
        $versionDirs = @(Get-ChildItem -Directory $refPackBase | Sort-Object Name -Descending)
    }

    if ($versionDirs.Count -eq 0) {
        Write-Warning "No reference assembly versions found in $refPackBase"
        return @()
    }

    $refDir = Join-Path $versionDirs[0].FullName "ref\$Tfm"
    if (-not (Test-Path $refDir)) {
        # Try without exact TFM match
        $refSubDirs = @(Get-ChildItem -Directory (Join-Path $versionDirs[0].FullName "ref") |
            Sort-Object Name -Descending)
        if ($refSubDirs.Count -gt 0) {
            $refDir = $refSubDirs[0].FullName
        }
        else {
            Write-Warning "No ref folder found under $($versionDirs[0].FullName)"
            return @()
        }
    }

    return @(Get-ChildItem -Path $refDir -Filter "*.dll" | Select-Object -ExpandProperty FullName)
}

# ── Collect dependency DLLs from NuGet cache ─────────────────────────────────

function Get-PackageDependencyDlls {
    [CmdletBinding()]
    param(
        [string]$PackagePath,
        [string]$PreferredTfm
    )

    # Look for .nuspec to find dependencies
    $nuspecFiles = @(Get-ChildItem -Path $PackagePath -Filter "*.nuspec" -ErrorAction SilentlyContinue)
    if ($nuspecFiles.Count -eq 0) {
        return @()
    }

    $dlls = @()
    [xml]$nuspec = Get-Content $nuspecFiles[0].FullName -Raw
    $ns = @{ "nu" = $nuspec.DocumentElement.NamespaceURI }

    $depGroups = $nuspec | Select-Xml -XPath "//nu:dependencies/nu:group" -Namespace $ns
    if (-not $depGroups) {
        return @()
    }

    # Find the best matching dependency group
    $bestGroup = $null
    foreach ($group in $depGroups) {
        $groupTfm = $group.Node.GetAttribute("targetFramework")
        if ($groupTfm -eq $PreferredTfm -or $groupTfm -eq ".$PreferredTfm" -or $groupTfm -match $PreferredTfm.Replace(".", "\.")) {
            $bestGroup = $group.Node
            break
        }
    }

    # Fallback to any net8+ group
    if (-not $bestGroup) {
        foreach ($group in $depGroups) {
            $groupTfm = $group.Node.GetAttribute("targetFramework")
            if ($groupTfm -match "net[89]|net1[0-9]") {
                $bestGroup = $group.Node
                break
            }
        }
    }

    if (-not $bestGroup) {
        return @()
    }

    $dependencies = $bestGroup | Select-Xml -XPath "nu:dependency" -Namespace $ns
    foreach ($dep in $dependencies) {
        $depId = $dep.Node.GetAttribute("id")
        $depVersion = $dep.Node.GetAttribute("version")

        # Resolve version range to a concrete version from cache
        $depCacheDir = Join-Path $NuGetCache $depId.ToLowerInvariant()
        if (Test-Path $depCacheDir) {
            $versions = @(Get-ChildItem -Directory $depCacheDir | Select-Object -ExpandProperty Name | Sort-Object -Descending)
            if ($versions.Count -gt 0) {
                $selectedVersion = $versions[0]
                $depPkgPath = Join-Path $depCacheDir $selectedVersion
                $depLibFolder = Get-BestLibFolder -PackagePath $depPkgPath
                if ($depLibFolder) {
                    $depDlls = Get-ChildItem -Path $depLibFolder -Filter "*.dll" -ErrorAction SilentlyContinue
                    $dlls += $depDlls | Select-Object -ExpandProperty FullName
                }
            }
        }
    }

    return $dlls
}

function Get-CachedRuntimeReferenceAssemblies {
    [CmdletBinding()]
    param(
        [string]$Tfm,
        [hashtable]$Cache
    )

    if (-not $Cache.ContainsKey($Tfm)) {
        Write-Host "Locating runtime reference assemblies for $Tfm..." -ForegroundColor Cyan
        $Cache[$Tfm] = @(Get-RuntimeReferenceAssemblies -Tfm $Tfm)
        Write-Host "Found $($Cache[$Tfm].Count) runtime reference assemblies for $Tfm."
    }

    return @($Cache[$Tfm])
}

# ── Build the tool first ──────────────────────────────────────────────────────

$branchName = Get-CurrentBranchName
$officialFeed = Resolve-OfficialAspireFeed -BranchName $branchName
$nugetOrgSource = Get-NuGetSourceMetadata -ServiceIndex $NuGetOrgServiceIndex
$officialAspireSource = if ($officialFeed.IsRelease) {
    Get-NuGetSourceMetadata -ServiceIndex $officialFeed.ServiceIndex
}
else {
    $nugetOrgSource
}

if ($officialFeed.IsRelease) {
    Write-Host "Release branch detected ($($officialFeed.BranchName)). Official Aspire packages will resolve from $($officialFeed.DisplayName)." -ForegroundColor Cyan
}

Write-Host "Building PackageJsonGenerator..." -ForegroundColor Cyan
$buildResult = & dotnet build $ToolProject --configuration Release --verbosity quiet 2>&1
if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to build PackageJsonGenerator:`n$buildResult"
    return
}
Write-Host "Build succeeded." -ForegroundColor Green

# ── Process packages ──────────────────────────────────────────────────────────

$successCount = 0
$failCount = 0
$skipCount = 0
$runtimeRefsByTfm = @{}

# Phase 1: Resolve versions and prepare package info
# Use parallel NuGet resolution when processing many packages
Write-Host "`nResolving package versions..." -ForegroundColor Cyan

$packageInfos = @()
$packageSourceMetadata = @{}

foreach ($packageId in $Packages) {
    if ($officialFeed.IsRelease -and (Test-IsOfficialAspirePackage -PackageId $packageId)) {
        $packageSourceMetadata[$packageId] = [PSCustomObject]@{
            PackageBaseAddress = $officialAspireSource.PackageBaseAddress
            RestoreSources     = @($officialFeed.ServiceIndex, $NuGetOrgServiceIndex)
            DisplaySource      = $officialFeed.DisplayName
        }
        continue
    }

    $packageSourceMetadata[$packageId] = [PSCustomObject]@{
        PackageBaseAddress = $nugetOrgSource.PackageBaseAddress
        RestoreSources     = @($NuGetOrgServiceIndex)
        DisplaySource      = "nuget.org"
    }
}

if ($Packages.Count -gt 3 -and -not $Sequential) {
    # Parallel NuGet version resolution
    $resolvedVersions = $Packages | ForEach-Object -Parallel {
        $sourceMap = $using:packageSourceMetadata
        $packageId = $_
        $sourceInfo = $sourceMap[$packageId]
        $versionsUrl = "$($sourceInfo.PackageBaseAddress)$($packageId.ToLowerInvariant())/index.json"
        try {
            $response = Invoke-RestMethod -Uri $versionsUrl
            $allVersions = @($response.versions)
            $stable = @($allVersions | Where-Object { $_ -notmatch '-' })
            $preview = @($allVersions | Where-Object { $_ -match '-' })

            $version = $null
            if ($stable.Count -gt 0) {
                try {
                    $version = ($stable | ForEach-Object { [System.Management.Automation.SemanticVersion]::new($_) } |
                        Sort-Object -Descending | Select-Object -First 1).ToString()
                } catch {
                    $version = $stable[-1]
                }
            } elseif ($preview.Count -gt 0) {
                $version = $preview[-1]
            }

            [PSCustomObject]@{ PackageId = $packageId; Version = $version; Source = $sourceInfo.DisplaySource }
        } catch {
            [PSCustomObject]@{ PackageId = $packageId; Version = $null; Source = $sourceInfo.DisplaySource }
        }
    } -ThrottleLimit 16

    foreach ($resolved in $resolvedVersions) {
        if (-not $resolved.Version) {
            Write-Warning "Could not resolve version for $($resolved.PackageId) from $($resolved.Source) — skipping."
            $skipCount++
            continue
        }
        $packageInfos += $resolved
    }
} else {
    # Sequential resolution (small batch or forced)
    foreach ($packageId in $Packages) {
        $sourceInfo = $packageSourceMetadata[$packageId]
        $version = Get-LatestNuGetVersion -PackageId $packageId -PackageBaseAddress $sourceInfo.PackageBaseAddress
        if (-not $version) {
            Write-Warning "Could not resolve version for $packageId from $($sourceInfo.DisplaySource) — skipping."
            $skipCount++
            continue
        }
        $packageInfos += [PSCustomObject]@{ PackageId = $packageId; Version = $version }
    }
}

Write-Host "Resolved $($packageInfos.Count) package versions ($skipCount skipped)."

# Phase 2: Ensure packages are cached and prepare manifest entries
Write-Host "Preparing packages..." -ForegroundColor Cyan

$manifestEntries = @()

foreach ($info in $packageInfos) {
    $packageId = $info.PackageId
    $version = $info.Version
    $sourceInfo = $packageSourceMetadata[$packageId]

    # Check cache / download
    $cachedPath = Get-CachedPackagePath -PackageId $packageId -Version $version
    if (-not $cachedPath) {
        Write-Host "  Downloading: $packageId $version from $($sourceInfo.DisplaySource)" -ForegroundColor Yellow
        $installed = Install-NuGetPackage -PackageId $packageId -Version $version -RestoreSources $sourceInfo.RestoreSources
        if (-not $installed) {
            Write-Warning "Failed to download $packageId $version — skipping."
            $failCount++
            continue
        }
        $cachedPath = Get-CachedPackagePath -PackageId $packageId -Version $version
        if (-not $cachedPath) {
            Write-Warning "Package not found in cache after download — skipping."
            $failCount++
            continue
        }
    }

    # Find the lib folder with DLLs
    $libFolder = Get-BestLibFolder -PackagePath $cachedPath
    if (-not $libFolder) {
        Write-Warning "No lib folder found for $packageId $version — skipping."
        $skipCount++
        continue
    }

    $selectedTfm = Split-Path $libFolder -Leaf
    $preferredTfm = Get-PreferredTfm -Tfm $selectedTfm -FallbackTfm $Framework

    # Find the main assembly
    $mainDll = Join-Path $libFolder "$packageId.dll"
    if (-not (Test-Path $mainDll)) {
        $firstDll = Get-ChildItem -Path $libFolder -Filter "*.dll" | Select-Object -First 1
        if ($firstDll) {
            $mainDll = $firstDll.FullName
        }
        else {
            Write-Warning "No DLLs found in $libFolder — skipping."
            $skipCount++
            continue
        }
    }

    # Collect references: runtime refs + package dependency DLLs + sibling DLLs
    $references = @()
    $references += Get-CachedRuntimeReferenceAssemblies -Tfm $preferredTfm -Cache $runtimeRefsByTfm

    $siblingDlls = @(Get-ChildItem -Path $libFolder -Filter "*.dll" |
        Where-Object { $_.FullName -ne $mainDll } |
        Select-Object -ExpandProperty FullName)
    $references += $siblingDlls

    $depDlls = @(Get-PackageDependencyDlls -PackagePath $cachedPath -PreferredTfm $preferredTfm)
    $references += $depDlls

    # Deduplicate
    $references = @($references | Select-Object -Unique)

    # Build output path
    $outputFile = Join-Path $OutputDir "$packageId.$version.json"

    Write-Host "  Prepared: $packageId $version ($(Split-Path $libFolder -Leaf))"

    $manifestEntries += [PSCustomObject]@{
        input          = $mainDll
        references     = $references
        output         = $outputFile
        packageVersion = $version
        packageName    = $packageId
        sourceRepo     = $null
        sourceCommit   = $null
        targetFramework = $selectedTfm
    }
}

Write-Host "Prepared $($manifestEntries.Count) packages for generation."

if ($manifestEntries.Count -eq 0) {
    Write-Host "`nNo packages to process." -ForegroundColor Yellow
    return
}

# Phase 3: Generate JSON files
if (-not $Sequential -and $manifestEntries.Count -gt 1) {
    # ── Batch mode: write manifest and run tool once ──────────────────────────
    $manifestFile = Join-Path ([System.IO.Path]::GetTempPath()) "pkgjson-manifest-$([System.Guid]::NewGuid().ToString('N').Substring(0,8)).json"

    $manifest = @{ packages = $manifestEntries }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content $manifestFile -Encoding UTF8

    Write-Host "`nRunning batch generation ($($manifestEntries.Count) packages)..." -ForegroundColor Cyan

    $parallelismArg = if ($Parallelism -gt 0) { $Parallelism } else { [Environment]::ProcessorCount }
    Write-Host "  Parallelism: $parallelismArg"

    & dotnet run --project $ToolProject --configuration Release --no-build -- `
        batch --manifest $manifestFile --parallelism $parallelismArg 2>&1 | ForEach-Object {
        if ($_ -match "^Generated:") {
            Write-Host "  $_" -ForegroundColor Green
        }
        elseif ($_ -match "^FAILED") {
            Write-Host "  $_" -ForegroundColor Red
        }
        elseif ($_ -match "^Batch complete") {
            Write-Host "  $_" -ForegroundColor Cyan
        }
        else {
            Write-Host "  $_"
        }
    }

    if ($LASTEXITCODE -eq 0) {
        $successCount = $manifestEntries.Count
    }
    else {
        # Parse output for success/fail counts if available
        $failCount += $manifestEntries.Count
    }

    # Clean up manifest
    Remove-Item $manifestFile -Force -ErrorAction SilentlyContinue
}
else {
    # ── Sequential mode: run tool per package ─────────────────────────────────
    Write-Host "`nRunning sequential generation..." -ForegroundColor Cyan

    foreach ($entry in $manifestEntries) {
        Write-Host "  Generating: $(Split-Path $entry.output -Leaf)"
        $refArgs = @($entry.references | ForEach-Object { "--reference"; $_ })

        & dotnet run --project $ToolProject --configuration Release --no-build -- `
            --input $entry.input `
            @refArgs `
            --output $entry.output `
            --package-version $entry.packageVersion `
            --package-name $entry.packageName `
            --target-framework $entry.targetFramework 2>&1 | ForEach-Object {
            if ($_ -match "^Generated:") {
                Write-Host "  $_" -ForegroundColor Green
            }
            else {
                Write-Host "  $_"
            }
        }

        if ($LASTEXITCODE -eq 0 -and (Test-Path $entry.output)) {
            $successCount++
        }
        else {
            Write-Warning "Tool exited with code $LASTEXITCODE for $($entry.packageName)"
            $failCount++
        }
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "`n════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "Done! Success: $successCount | Failed: $failCount | Skipped: $skipCount" -ForegroundColor Cyan
Write-Host "Output: $OutputDir"
