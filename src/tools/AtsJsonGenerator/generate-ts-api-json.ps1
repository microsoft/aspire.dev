#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Generates TypeScript API reference JSON files by running `aspire sdk dump --json`
    for each Aspire hosting integration that has [AspireExport] attributes.

.DESCRIPTION
    Supports two input modes:
    1. -AspireRepoPath: Discovers .csproj files in a local dotnet/aspire clone
    2. -NuGetPackageVersion: Uses Name@Version syntax to resolve packages via NuGet

    For each eligible package, this script:
    1. Runs `aspire sdk dump --json` to generate raw ATS capabilities JSON
    2. Runs the AtsJsonGenerator tool to transform it into docs-site JSON
    3. Outputs to src/frontend/src/data/ts-modules/

.PARAMETER AspireRepoPath
    Path to a local dotnet/aspire repository clone. Discovers projects with
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

if (-not $AspireRepoPath -and (-not $NuGetPackageVersion -or $NuGetPackageVersion.Count -eq 0)) {
    Write-Error "Provide either -AspireRepoPath or -NuGetPackageVersion"
    return
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

    # Core Aspire.Hosting (no integration argument)
    $coreDir = Join-Path $SrcDir "Aspire.Hosting"
    if (Test-Path $coreDir) {
        $Packages += @{
            Name = "Aspire.Hosting"
            DumpArgs = @()  # No extra args for core
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

        # Pass as the integration argument using Name@Version syntax
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

    # Step 1: Run aspire sdk dump --json
    Write-Host "  Dumping ATS capabilities..."
    try {
        $dumpArgs = @("sdk", "dump", "--json", "--non-interactive", "--nologo", "-o", $dumpFile)
        $dumpArgs += $pkg.DumpArgs

        $workDir = if ($AspireRepoPath) { $AspireRepoPath } else { $PWD.Path }
        $proc = Invoke-AspireCli -Arguments $dumpArgs -WorkingDirectory $workDir `
            -StderrFile (Join-Path $TempDir "$name.stderr.txt")

        if ($proc.ExitCode -ne 0) {
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
            "--source-repo", "https://github.com/dotnet/aspire"
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

    # Step 1: Run aspire sdk dump --json
    Write-Host "  Dumping ATS capabilities..."
    try {
        $dumpArgs = @("sdk", "dump", "--json", "--non-interactive", "--nologo", "-o", $dumpFile)
        $dumpArgs += $pkg.DumpArgs

        $workDir = if ($AspireRepoPath) { $AspireRepoPath } else { $PWD.Path }
        $proc = Invoke-AspireCli -Arguments $dumpArgs -WorkingDirectory $workDir `
            -StderrFile (Join-Path $TempDir "$name.stderr.txt")

        if ($proc.ExitCode -ne 0) {
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
            "--source-repo", "https://github.com/dotnet/aspire"
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
