#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Restores NuGet packages and generates Package.Version.json
    files for each using the PackageJsonGenerator tool.

.DESCRIPTION
    For each package in the list, this script:
    1. Queries the NuGet V3 API for the latest stable version (or latest preview if no stable exists).
    2. Restores each package into an isolated project.
    3. Reads NuGet's exact direct and transitive assets from project.assets.json.
    4. Runs the PackageJsonGenerator tool in batch mode, passing all packages at once
       for parallel processing.

.PARAMETER Packages
    An array of NuGet package IDs to process. Defaults to a built-in list of
    Aspire integration packages.

.PARAMETER OutputDir
    The directory to write the generated JSON files to.
    Defaults to <repo-root>/src/frontend/src/data/packages.

.PARAMETER Framework
    Target framework moniker used for each isolated NuGet restore.
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
$RepoRoot = (Resolve-Path ([System.IO.Path]::Combine($ScriptDir, "..", "..", ".."))).Path
$ToolProject = Join-Path $ScriptDir "PackageJsonGenerator.csproj"

$FinalOutputDir = if ($OutputDir) {
    [System.IO.Path]::GetFullPath($OutputDir)
}
else {
    [System.IO.Path]::Combine($RepoRoot, "src", "frontend", "src", "data", "pkgs")
}
$OutputDir = Join-Path ([System.IO.Path]::GetDirectoryName($FinalOutputDir)) (
    ".$([System.IO.Path]::GetFileName($FinalOutputDir))-staging-$([Guid]::NewGuid().ToString('N'))")
New-Item -ItemType Directory -Path $OutputDir -Force | Out-Null

function Remove-StalePackageJsonFiles {
    [CmdletBinding()]
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

# ── Default package list ───────────────────────────────────────────────────────

$integrationsFile = [System.IO.Path]::Combine($RepoRoot, "src", "frontend", "src", "data", "aspire-integrations.json")
$integrations = if (Test-Path $integrationsFile) {
    @(Get-Content $integrationsFile -Raw | ConvertFrom-Json)
}
else {
    @()
}
$catalogVersions = @{}
foreach ($integration in $integrations) {
    if (-not [string]::IsNullOrWhiteSpace($integration.title) -and
        -not [string]::IsNullOrWhiteSpace($integration.version)) {
        $catalogVersions[$integration.title] = $integration.version
    }
}

$isFullReconciliation = -not $Packages -or $Packages.Count -eq 0
if ($isFullReconciliation) {
    if ($integrations.Count -gt 0) {
        $Packages = @($integrations | ForEach-Object { $_.title } | Sort-Object -Unique)
        Write-Host "Loaded $($Packages.Count) packages from aspire-integrations.json"
    }
    else {
        Write-Error "No packages specified and aspire-integrations.json not found at $integrationsFile"
        exit 1
    }
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

function ConvertTo-NativeAssetPath {
    [CmdletBinding()]
    param([string]$Path)

    return $Path.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
}

function Get-AssetPaths {
    [CmdletBinding()]
    param(
        [object]$TargetLibrary,
        [string]$AssetKind,
        [string]$PackagePath
    )

    $assetProperty = $TargetLibrary.PSObject.Properties[$AssetKind]
    if (-not $assetProperty) {
        return @()
    }

    return @($assetProperty.Value.PSObject.Properties |
        Where-Object { $_.Name -ne "_._" -and $_.Name.EndsWith(".dll", [System.StringComparison]::OrdinalIgnoreCase) } |
        ForEach-Object {
            $path = Join-Path $PackagePath (ConvertTo-NativeAssetPath -Path $_.Name)
            if (Test-Path $path) {
                [System.IO.Path]::GetFullPath($path)
            }
        })
}

function Resolve-RestoredPackagePath {
    [CmdletBinding()]
    param(
        [string[]]$PackageFolders,
        [string]$LibraryPath
    )

    $nativeLibraryPath = ConvertTo-NativeAssetPath -Path $LibraryPath
    foreach ($packageFolder in $PackageFolders) {
        $candidate = Join-Path $packageFolder $nativeLibraryPath
        if (Test-Path $candidate) {
            return [System.IO.Path]::GetFullPath($candidate)
        }
    }

    return $null
}

function Resolve-NuGetPackageRestoreGraph {
    [CmdletBinding()]
    param(
        [string]$PackageId,
        [string]$Version,
        [string[]]$RestoreSources
    )

    # A separate restore project is intentional: it prevents NuGet from unifying
    # dependency versions across otherwise unrelated packages.
    $workRoot = Join-Path $ScriptDir ".package-json-generator-work"
    $restoreDir = Join-Path $workRoot "restore-$([System.Guid]::NewGuid().ToString('N'))"
    New-Item -ItemType Directory -Path $restoreDir -Force | Out-Null

    try {
        $escapedPackageId = [System.Security.SecurityElement]::Escape($PackageId)
        $escapedVersion = [System.Security.SecurityElement]::Escape($Version)
        $escapedFramework = [System.Security.SecurityElement]::Escape($Framework)
        $csproj = @"
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <TargetFramework>$escapedFramework</TargetFramework>
    <OutputType>Library</OutputType>
  </PropertyGroup>
  <ItemGroup>
    <PackageReference Include="$escapedPackageId" Version="[$escapedVersion]" />
  </ItemGroup>
</Project>
"@
        $csprojPath = Join-Path $restoreDir "Restore.csproj"
        $nugetConfigPath = Join-Path $restoreDir "NuGet.config"
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
            throw "dotnet restore failed for $PackageId $Version`n$restoreResult"
        }

        $assetsPath = [System.IO.Path]::Combine($restoreDir, "obj", "project.assets.json")
        if (-not (Test-Path $assetsPath)) {
            throw "NuGet restore did not produce project.assets.json for $PackageId $Version."
        }

        $assets = Get-Content $assetsPath -Raw | ConvertFrom-Json
        $targetProperty = $assets.targets.PSObject.Properties |
            Where-Object {
                $_.Name.Equals($Framework, [System.StringComparison]::OrdinalIgnoreCase) -or
                $_.Name.StartsWith("$Framework/", [System.StringComparison]::OrdinalIgnoreCase)
            } |
            Select-Object -First 1
        if (-not $targetProperty) {
            $availableTargets = @($assets.targets.PSObject.Properties.Name) -join ", "
            throw "NuGet restore graph for $PackageId $Version does not contain target '$Framework'. Available targets: $availableTargets."
        }

        $rootLibraryProperty = $targetProperty.Value.PSObject.Properties |
            Where-Object {
                $separatorIndex = $_.Name.LastIndexOf('/')
                $separatorIndex -gt 0 -and
                    $_.Name.Substring(0, $separatorIndex).Equals($PackageId, [System.StringComparison]::OrdinalIgnoreCase)
            } |
            Select-Object -First 1
        if (-not $rootLibraryProperty) {
            throw "NuGet restore graph target '$($targetProperty.Name)' does not contain $PackageId $Version."
        }
        $rootVersion = $rootLibraryProperty.Name.Substring($rootLibraryProperty.Name.LastIndexOf('/') + 1)
        if (-not $rootVersion.Equals($Version, [System.StringComparison]::OrdinalIgnoreCase)) {
            throw "NuGet restored $PackageId $rootVersion instead of the requested exact version $Version."
        }

        $packageFolders = @($assets.packageFolders.PSObject.Properties.Name)
        if ($packageFolders.Count -eq 0) {
            throw "NuGet restore graph for $PackageId $Version does not specify a package folder."
        }

        $compileReferences = @()
        $runtimeReferences = @()
        $selectedReferences = @()
        $rootCompileAssets = @()
        $rootRuntimeAssets = @()
        $rootPackagePath = $null

        foreach ($targetLibraryProperty in $targetProperty.Value.PSObject.Properties) {
            $libraryMetadataProperty = $assets.libraries.PSObject.Properties |
                Where-Object { $_.Name.Equals($targetLibraryProperty.Name, [System.StringComparison]::OrdinalIgnoreCase) } |
                Select-Object -First 1
            if (-not $libraryMetadataProperty -or $libraryMetadataProperty.Value.type -ne "package") {
                continue
            }

            $libraryPath = Resolve-RestoredPackagePath `
                -PackageFolders $packageFolders `
                -LibraryPath $libraryMetadataProperty.Value.path
            if (-not $libraryPath) {
                throw "Package assets for '$($targetLibraryProperty.Name)' were not found in NuGet's package folders."
            }
            $compileAssets = @(Get-AssetPaths -TargetLibrary $targetLibraryProperty.Value -AssetKind "compile" -PackagePath $libraryPath)
            $runtimeAssets = @(Get-AssetPaths -TargetLibrary $targetLibraryProperty.Value -AssetKind "runtime" -PackagePath $libraryPath)

            $compileReferences += $compileAssets
            $runtimeReferences += $runtimeAssets

            if ($targetLibraryProperty.Name.Equals($rootLibraryProperty.Name, [System.StringComparison]::OrdinalIgnoreCase)) {
                $rootPackagePath = $libraryPath
                $rootCompileAssets = $compileAssets
                $rootRuntimeAssets = $runtimeAssets
                continue
            }

            # Compile assets are NuGet's exact choice for metadata consumption.
            # Runtime assets are used only for packages that expose no compile asset.
            $selectedAssets = if ($compileAssets.Count -gt 0) { $compileAssets } else { $runtimeAssets }
            $selectedReferences += $selectedAssets
        }

        if (-not $rootPackagePath) {
            throw "Could not locate the restored package path for $PackageId $Version."
        }

        $rootAssets = @(if ($rootRuntimeAssets.Count -gt 0) { $rootRuntimeAssets } else { $rootCompileAssets })
        if ($rootAssets.Count -eq 0) {
            return [PSCustomObject]@{
                PackagePath       = $rootPackagePath
                InputAssembly     = $null
                References        = @()
                CompileReferences = @($compileReferences | Select-Object -Unique)
                RuntimeReferences = @($runtimeReferences | Select-Object -Unique)
                TargetFramework   = $Framework
            }
        }

        $inputAssembly = $rootAssets |
            Where-Object { [System.IO.Path]::GetFileName($_).Equals("$PackageId.dll", [System.StringComparison]::OrdinalIgnoreCase) } |
            Select-Object -First 1
        if (-not $inputAssembly) {
            $inputAssembly = $rootAssets | Select-Object -First 1
        }

        # Preserve sibling assemblies from the selected root package asset group.
        $selectedReferences += $rootAssets | Where-Object {
            -not $_.Equals($inputAssembly, [System.StringComparison]::OrdinalIgnoreCase)
        }

        # The restore target is authoritative. The selected asset may come from
        # an older compatible lib/ref folder, but NuGet resolved it for this TFM.
        $selectedTfm = ($targetProperty.Name -split '/', 2)[0]

        return [PSCustomObject]@{
            PackagePath       = $rootPackagePath
            InputAssembly     = $inputAssembly
            References        = @($selectedReferences | Select-Object -Unique)
            CompileReferences = @($compileReferences | Select-Object -Unique)
            RuntimeReferences = @($runtimeReferences | Select-Object -Unique)
            TargetFramework   = $selectedTfm
        }
    }
    finally {
        Remove-Item $restoreDir -Recurse -Force -ErrorAction SilentlyContinue
    }
}

# ── Collect runtime reference assemblies ──────────────────────────────────────

function Get-RuntimeReferenceAssemblies {
    [CmdletBinding()]
    param([string]$Tfm)

    # Metadata loading needs both the base runtime and ASP.NET Core reference
    # packs. Some hosting packages expose ASP.NET Core types without declaring
    # a transitive FrameworkReference in their NuGet metadata.
    $dotnetRoot = $env:DOTNET_ROOT
    if ([string]::IsNullOrWhiteSpace($dotnetRoot) -or -not (Test-Path $dotnetRoot)) {
        $sdkListing = @(& dotnet --list-sdks 2>$null)
        $sdkRootLine = $sdkListing | Select-Object -Last 1
        if ($sdkRootLine -match '\[(.+)\]\s*$') {
            $dotnetRoot = Split-Path $Matches[1] -Parent
        }
        else {
            $dotnetRoot = Split-Path (Get-Command dotnet).Source
        }
    }
    $tfmVersion = $Tfm -replace '^net', ''

    $referenceAssemblies = @()
    foreach ($packName in @("Microsoft.NETCore.App.Ref", "Microsoft.AspNetCore.App.Ref")) {
        $refPackBase = [System.IO.Path]::Combine($dotnetRoot, "packs", $packName)
        if (-not (Test-Path $refPackBase)) {
            if ($packName -eq "Microsoft.NETCore.App.Ref") {
                Write-Warning "Could not find required reference pack at $refPackBase"
            }
            continue
        }

        $versionDirs = @(Get-ChildItem -Directory $refPackBase |
            Where-Object { $_.Name.StartsWith($tfmVersion) } |
            Sort-Object { [version]($_.Name -replace '-.*$', '') } -Descending)
        if ($versionDirs.Count -eq 0) {
            Write-Warning "No $Tfm reference assembly version found in $refPackBase"
            continue
        }

        $refDir = [System.IO.Path]::Combine($versionDirs[0].FullName, "ref", $Tfm)
        if (-not (Test-Path $refDir)) {
            Write-Warning "No $Tfm ref folder found under $($versionDirs[0].FullName)"
            continue
        }

        $referenceAssemblies += Get-ChildItem -Path $refDir -Filter "*.dll" |
            Select-Object -ExpandProperty FullName
    }

    return @($referenceAssemblies | Select-Object -Unique)
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
    Write-Host "Failed to build PackageJsonGenerator:`n$buildResult" -ForegroundColor Red
    Remove-Item -Path $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}
Write-Host "Build succeeded." -ForegroundColor Green

# ── Process packages ──────────────────────────────────────────────────────────

$successCount = 0
$failCount = 0
$skipCount = 0
$runtimeRefsByTfm = @{}
$failedPackageNames = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase)
$skippedPackageNames = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase)

# Phase 1: Resolve versions and prepare package info
# Use parallel NuGet resolution when processing many packages
Write-Host "`nResolving package versions..." -ForegroundColor Cyan

$packageInfos = @()
$packageSourceMetadata = @{}
$packagesToResolve = @()

foreach ($packageId in $Packages) {
    if ($catalogVersions.ContainsKey($packageId)) {
        $packageInfos += [PSCustomObject]@{
            PackageId = $packageId
            Version   = $catalogVersions[$packageId]
        }
    }
    else {
        $packagesToResolve += $packageId
    }

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

if ($packagesToResolve.Count -gt 3 -and -not $Sequential) {
    # Parallel NuGet version resolution
    $resolvedVersions = $packagesToResolve | ForEach-Object -Parallel {
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
            Write-Warning "Could not resolve version for $($resolved.PackageId) from $($resolved.Source)."
            $failCount++
            [void]$failedPackageNames.Add($resolved.PackageId)
            continue
        }
        $packageInfos += $resolved
    }
} else {
    # Sequential resolution (small batch or forced)
    foreach ($packageId in $packagesToResolve) {
        $sourceInfo = $packageSourceMetadata[$packageId]
        $version = Get-LatestNuGetVersion -PackageId $packageId -PackageBaseAddress $sourceInfo.PackageBaseAddress
        if (-not $version) {
            Write-Warning "Could not resolve version for $packageId from $($sourceInfo.DisplaySource)."
            $failCount++
            [void]$failedPackageNames.Add($packageId)
            continue
        }
        $packageInfos += [PSCustomObject]@{ PackageId = $packageId; Version = $version }
    }
}

Write-Host "Resolved $($packageInfos.Count) package versions ($failCount failed)."

# Phase 2: Restore exact package graphs and prepare manifest entries
Write-Host "Preparing packages..." -ForegroundColor Cyan

$manifestEntries = @()

foreach ($info in $packageInfos) {
    $packageId = $info.PackageId
    $version = $info.Version
    $sourceInfo = $packageSourceMetadata[$packageId]

    try {
        Write-Host "  Restoring: $packageId $version from $($sourceInfo.DisplaySource)" -ForegroundColor Yellow
        $restoreGraph = Resolve-NuGetPackageRestoreGraph `
            -PackageId $packageId `
            -Version $version `
            -RestoreSources $sourceInfo.RestoreSources
    }
    catch {
        Write-Warning "Failed to restore $packageId $version`: $_"
        $failCount++
        [void]$failedPackageNames.Add($packageId)
        continue
    }

    if (-not $restoreGraph.InputAssembly) {
        Write-Warning "No compile/runtime assemblies selected by NuGet for $packageId $version — skipping."
        $skipCount++
        [void]$skippedPackageNames.Add($packageId)
        continue
    }

    # NuGet's assets file supplies exact direct and transitive package assets.
    $references = @($restoreGraph.References)
    $references += Get-CachedRuntimeReferenceAssemblies -Tfm $restoreGraph.TargetFramework -Cache $runtimeRefsByTfm
    $references = @($references | Select-Object -Unique)

    # Build output path
    $outputFile = Join-Path $OutputDir "$packageId.$version.json"

    Write-Host "  Prepared: $packageId $version ($($restoreGraph.TargetFramework))"

    $manifestEntries += [PSCustomObject]@{
        input          = $restoreGraph.InputAssembly
        references     = $references
        output         = $outputFile
        packageVersion = $version
        packageName    = $packageId
        sourceRepo     = $null
        sourceCommit   = $null
        targetFramework = $restoreGraph.TargetFramework
    }
}

Write-Host "Prepared $($manifestEntries.Count) packages for generation."

if ($manifestEntries.Count -eq 0) {
    Write-Host "`nNo packages to process." -ForegroundColor Yellow
    if ($failCount -gt 0) {
        Remove-Item -Path $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
        Remove-Item (Join-Path $ScriptDir ".package-json-generator-work") -Recurse -Force -ErrorAction SilentlyContinue
        exit 1
    }
}

# Phase 3: Generate JSON files
if (-not $Sequential -and $manifestEntries.Count -gt 0) {
    # ── Batch mode: write manifest and run tool once ──────────────────────────
    $manifestDirectory = Join-Path $ScriptDir ".package-json-generator-work"
    New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
    $manifestFile = Join-Path $manifestDirectory "manifest-$([System.Guid]::NewGuid().ToString('N')).json"

    $manifest = @{ packages = $manifestEntries }
    $manifest | ConvertTo-Json -Depth 4 | Set-Content $manifestFile -Encoding UTF8

    Write-Host "`nRunning batch generation ($($manifestEntries.Count) packages)..." -ForegroundColor Cyan

    $parallelismArg = if ($Parallelism -gt 0) { $Parallelism } else { [Environment]::ProcessorCount }
    Write-Host "  Parallelism: $parallelismArg"

    $batchOutput = @(& dotnet run --project $ToolProject --configuration Release --no-build -- `
        batch --manifest $manifestFile --parallelism $parallelismArg 2>&1)
    $batchExitCode = $LASTEXITCODE
    $succeededPackages = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $failedPackages = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)
    $skippedPackages = [System.Collections.Generic.HashSet[string]]::new([System.StringComparer]::OrdinalIgnoreCase)

    $batchOutput | ForEach-Object {
        if ($_ -match "^Generated:") {
            Write-Host "  $_" -ForegroundColor Green
        }
        elseif ($_ -match "^SUCCEEDED \[(.+)\]:") {
            [void]$succeededPackages.Add($Matches[1])
            Write-Host "  $_" -ForegroundColor Green
        }
        elseif ($_ -match "^SKIPPED \[(.+)\]:") {
            [void]$skippedPackages.Add($Matches[1])
            Write-Host "  $_" -ForegroundColor Yellow
        }
        elseif ($_ -match "^FAILED") {
            if ($_ -match "^FAILED \[(.+)\]:") {
                [void]$failedPackages.Add($Matches[1])
            }
            Write-Host "  $_" -ForegroundColor Red
        }
        elseif ($_ -match "^Batch complete") {
            Write-Host "  $_" -ForegroundColor Cyan
        }
        else {
            Write-Host "  $_"
        }
    }

    if ($batchExitCode -ne 0) {
        Write-Warning "Batch tool exited with code $batchExitCode; no reported result will be published."
    }

    foreach ($entry in $manifestEntries) {
        $reportedStatusCount =
            [int]($succeededPackages.Contains($entry.packageName)) +
            [int]($skippedPackages.Contains($entry.packageName)) +
            [int]($failedPackages.Contains($entry.packageName))

        if ($batchExitCode -ne 0) {
            $failCount++
            [void]$failedPackageNames.Add($entry.packageName)
        }
        elseif ($reportedStatusCount -ne 1) {
            Write-Warning "Batch tool reported $reportedStatusCount terminal statuses for $($entry.packageName); expected exactly one."
            $failCount++
            [void]$failedPackageNames.Add($entry.packageName)
        }
        elseif ($succeededPackages.Contains($entry.packageName)) {
            if (Test-Path -LiteralPath $entry.output -PathType Leaf) {
                $successCount++
                Remove-StalePackageJsonFiles -PackageName $entry.packageName -CurrentOutputFile $entry.output -OutputDirectory $OutputDir
            }
            else {
                Write-Warning "Batch tool reported success for $($entry.packageName) without creating $($entry.output)."
                $failCount++
                [void]$failedPackageNames.Add($entry.packageName)
            }
        }
        elseif ($skippedPackages.Contains($entry.packageName)) {
            $skipCount++
            [void]$skippedPackageNames.Add($entry.packageName)
        }
        else {
            $failCount++
            [void]$failedPackageNames.Add($entry.packageName)
        }
    }

    # Clean up manifest
    Remove-Item $manifestFile -Force -ErrorAction SilentlyContinue
}
else {
    # ── Sequential mode: run tool per package ─────────────────────────────────
    Write-Host "`nRunning sequential generation..." -ForegroundColor Cyan

    foreach ($entry in $manifestEntries) {
        Write-Host "  Generating: $(Split-Path $entry.output -Leaf)"
        # Use the manifest transport even for one package. Passing hundreds of
        # reference paths directly can exceed Windows' command-line limit.
        $manifestDirectory = Join-Path $ScriptDir ".package-json-generator-work"
        New-Item -ItemType Directory -Path $manifestDirectory -Force | Out-Null
        $manifestFile = Join-Path $manifestDirectory "manifest-$([System.Guid]::NewGuid().ToString('N')).json"
        @{ packages = @($entry) } | ConvertTo-Json -Depth 4 | Set-Content $manifestFile -Encoding UTF8
        try {
            $generationOutput = @(& dotnet run --project $ToolProject --configuration Release --no-build -- `
                batch --manifest $manifestFile --parallelism 1 2>&1)
            $generationExitCode = $LASTEXITCODE
        }
        finally {
            Remove-Item $manifestFile -Force -ErrorAction SilentlyContinue
        }
        $generationOutput | ForEach-Object {
            if ($_ -match "^(Generated:|SUCCEEDED )") {
                Write-Host "  $_" -ForegroundColor Green
            }
            elseif ($_ -match "^SKIPPED ") {
                Write-Host "  $_" -ForegroundColor Yellow
            }
            elseif ($_ -match "^FAILED ") {
                Write-Host "  $_" -ForegroundColor Red
            }
            else {
                Write-Host "  $_"
            }
        }

        $succeeded = $generationOutput | Where-Object {
            $_ -match ("^SUCCEEDED \[{0}\]:" -f [regex]::Escape($entry.packageName))
        }
        $skipped = $generationOutput | Where-Object {
            $_ -match ("^SKIPPED \[{0}\]:" -f [regex]::Escape($entry.packageName))
        }
        if ($generationExitCode -eq 0 -and $skipped) {
            $skipCount++
            [void]$skippedPackageNames.Add($entry.packageName)
        }
        elseif ($generationExitCode -eq 0 -and $succeeded -and (Test-Path $entry.output)) {
            $successCount++
            Remove-StalePackageJsonFiles -PackageName $entry.packageName -CurrentOutputFile $entry.output -OutputDirectory $OutputDir
        }
        else {
            Write-Warning "Tool exited with code $generationExitCode for $($entry.packageName)"
            $failCount++
            [void]$failedPackageNames.Add($entry.packageName)
        }
    }
}

# ── Summary ───────────────────────────────────────────────────────────────────

Write-Host "`n════════════════════════════════════════" -ForegroundColor DarkGray
Write-Host "Done! Success: $successCount | Failed: $failCount | Skipped: $skipCount" -ForegroundColor Cyan
if ($failedPackageNames.Count -gt 0) {
    Write-Host "Failed packages: $(($failedPackageNames | Sort-Object) -join ', ')" -ForegroundColor Red
}
if ($skippedPackageNames.Count -gt 0) {
    Write-Host "Skipped packages: $(($skippedPackageNames | Sort-Object) -join ', ')" -ForegroundColor Yellow
}
Write-Host "Output: $FinalOutputDir"

Remove-Item (Join-Path $ScriptDir ".package-json-generator-work") -Recurse -Force -ErrorAction SilentlyContinue

if ($failCount -gt 0) {
    Remove-Item -Path $OutputDir -Recurse -Force -ErrorAction SilentlyContinue
    exit 1
}

New-Item -ItemType Directory -Path $FinalOutputDir -Force | Out-Null
$stagedFiles = @(Get-ChildItem -Path $OutputDir -Filter "*.json" -File)
$stagedNames = [System.Collections.Generic.HashSet[string]]::new(
    [System.StringComparer]::OrdinalIgnoreCase)
foreach ($file in $stagedFiles) {
    [void]$stagedNames.Add($file.Name)
}

if ($isFullReconciliation) {
    foreach ($existingFile in Get-ChildItem -Path $FinalOutputDir -Filter "*.json" -File) {
        if (-not $stagedNames.Contains($existingFile.Name)) {
            Remove-Item -Path $existingFile.FullName -Force
            Write-Host "Removed stale package data: $($existingFile.Name)" -ForegroundColor DarkYellow
        }
    }
}
else {
    foreach ($packageId in $Packages) {
        $namePattern = "^{0}\.\d.*\.json$" -f [regex]::Escape($packageId)
        foreach ($existingFile in Get-ChildItem -Path $FinalOutputDir -Filter "*.json" -File) {
            if ($existingFile.Name -match $namePattern -and -not $stagedNames.Contains($existingFile.Name)) {
                Remove-Item -Path $existingFile.FullName -Force
                Write-Host "Removed stale package data: $($existingFile.Name)" -ForegroundColor DarkYellow
            }
        }
    }
}

foreach ($file in $stagedFiles) {
    Copy-Item -Path $file.FullName -Destination (Join-Path $FinalOutputDir $file.Name) -Force
}
Remove-Item -Path $OutputDir -Recurse -Force
