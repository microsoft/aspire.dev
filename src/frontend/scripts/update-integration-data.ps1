#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Deterministic orchestrator for the Integration Data Updater.

.DESCRIPTION
    Refreshes the aspire.dev integration data and, when integration package
    versions change, regenerates the C#/TypeScript API reference JSON and the
    twoslash bundle. Replaces the former `gh aw` agentic workflow with plain,
    reliable scripting that runs identically in CI and locally.

    Phases:
      1. `pnpm update:all` — integration metadata, GitHub stats, sample metadata.
      2. Version-change detection — compares the committed
         aspire-integrations.json against the freshly written one by package
         title -> version. Metadata-only changes (icons, descriptions, download
         counts) do NOT trigger regeneration.
      3. Conditional API-reference regeneration (only when a version changed):
           a. generate-package-json.ps1  -> src/data/pkgs/*.json (C# API)
           b. pnpm update:ts-api         -> src/data/ts-modules/*.json (TS API)
                                            + chains twoslash aspire.d.ts bundle
      4. Scope check — the working tree must only contain allowed data files.
      5. Emits a summary + PR title/body. In CI, writes step outputs to
         $GITHUB_OUTPUT and the PR body to a file; locally prints a summary.

    Exit codes:
      0  success (whether or not there were changes)
      1  a required phase failed (update:all, TS API regen, out-of-scope diff).
         The caller must NOT open a PR on a non-zero exit.

    Per-package failures inside generate-package-json.ps1 are tolerated (they
    are common for meta-packages without a public API surface); their counts are
    reported in the PR body but do not fail the run.

.PARAMETER SkipRegen
    Skip the API-reference regeneration phase even when versions changed. Useful
    for fast, data-only local runs.

.PARAMETER Framework
    Target framework passed through to generate-package-json.ps1. Defaults to
    the script's own default (net10.0).

.EXAMPLE
    pwsh src/frontend/scripts/update-integration-data.ps1
    pwsh src/frontend/scripts/update-integration-data.ps1 -SkipRegen
#>
[CmdletBinding()]
param(
    [switch]$SkipRegen,
    [string]$Framework
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

# PowerShell 7.4+ defaults this to $true, which turns any native command's
# non-zero exit into a terminating error under ErrorActionPreference='Stop'.
# This script deliberately inspects $LASTEXITCODE itself (e.g. the tolerated
# `git show HEAD:` fallback and the ts-api phase-2/3 distinction), so disable it.
$PSNativeCommandUseErrorActionPreference = $false

# ── Paths ───────────────────────────────────────────────────────────────────
$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..' '..' '..')).Path
$FrontendDir = Join-Path $RepoRoot 'src' 'frontend'
$DataDir = Join-Path $FrontendDir 'src' 'data'
$IntegrationsJson = Join-Path $DataDir 'aspire-integrations.json'
$PkgGenScript = Join-Path $RepoRoot 'src' 'tools' 'PackageJsonGenerator' 'generate-package-json.ps1'

# Working-tree paths that this automation is allowed to change. Anything outside
# this set appearing in `git status` is treated as a scope violation.
$AllowedPaths = @(
    'src/frontend/src/data/aspire-integrations.json',
    'src/frontend/src/data/github-stats.json',
    'src/frontend/src/data/samples.json',
    'src/frontend/src/assets/samples/',
    'src/frontend/src/data/pkgs/',
    'src/frontend/src/data/ts-modules/',
    'src/frontend/src/data/twoslash/aspire.d.ts'
)

$IsCI = [bool]$env:GITHUB_ACTIONS

function Write-Section([string]$Text) {
    Write-Host ""
    Write-Host "══ $Text ══" -ForegroundColor Cyan
}

function Invoke-Git {
    param([Parameter(Mandatory)][string[]]$Arguments)
    # Emit git output as plain strings, one per line, straight to the pipeline.
    # `2>&1` folds stderr in as ErrorRecord objects on failure; normalize those
    # to their message text so callers always receive strings — never
    # ErrorRecords, and never a single nested array that would break `-join` or
    # Where-Object on the receiving side. $LASTEXITCODE remains the git exit code.
    $raw = & git -C $RepoRoot @Arguments 2>&1
    foreach ($item in $raw) {
        if ($item -is [System.Management.Automation.ErrorRecord]) {
            $item.Exception.Message
        }
        else {
            [string]$item
        }
    }
}

function Set-Output {
    param([Parameter(Mandatory)][string]$Name, [string]$Value)
    if ($env:GITHUB_OUTPUT) {
        # Multi-line safe via heredoc delimiter.
        $delim = "ghadelim_$([Guid]::NewGuid().ToString('N'))"
        Add-Content -Path $env:GITHUB_OUTPUT -Value "$Name<<$delim`n$Value`n$delim"
    }
}

function Test-PathAllowed {
    param([Parameter(Mandatory)][string]$RelPath)
    $normalized = $RelPath -replace '\\', '/'
    foreach ($allowed in $AllowedPaths) {
        if ($allowed.EndsWith('/')) {
            if ($normalized.StartsWith($allowed)) { return $true }
        }
        elseif ($normalized -eq $allowed) { return $true }
    }
    return $false
}

# ── Phase 1: data update ────────────────────────────────────────────────────
Write-Section 'Phase 1 — pnpm update:all'
Push-Location $FrontendDir
try {
    # Capture combined output so icon-integrity warnings can be surfaced in the
    # PR body without re-running anything. Tee keeps the live log intact.
    $updateLog = & pnpm run update:all 2>&1 | Tee-Object -Variable teed | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Error "pnpm update:all failed (exit $LASTEXITCODE). Aborting; no PR will be opened."
        exit 1
    }
}
finally {
    Pop-Location
}

# Icon-integrity warning (script emits this line when an official Aspire package
# still resolved to the default NuGet icon). Not fatal — surfaced for reviewers.
$iconWarnings = ''
$iconLine = $updateLog -split "`n" |
    Where-Object { $_ -match 'Official Aspire packages resolved to the default NuGet icon:' } |
    Select-Object -First 1
if ($iconLine) {
    $iconWarnings = ($iconLine -replace '.*default NuGet icon:\s*', '').Trim()
    Write-Warning "Icon resolution warning captured for PR body: $iconWarnings"
}

# ── Detect any working-tree changes ─────────────────────────────────────────
# Gate on the FULL working tree, not just the in-scope data paths. If
# `pnpm run update:all` touched anything at all we must fall through to the
# Phase 4 scope check, so that an out-of-scope-only change fails loudly there
# instead of silently exiting 0 here.
$statusLines = @(Invoke-Git @('status', '--porcelain') |
    Where-Object { $_ -and $_.Trim().Length -gt 0 })
$anyChanges = $statusLines.Count -gt 0

if (-not $anyChanges) {
    Write-Section 'Result — no changes'
    Write-Host "Integration data is already up to date." -ForegroundColor Green
    Set-Output 'changed' 'false'
    Set-Output 'versions_changed' 'false'
    Set-Output 'regen_ran' 'false'
    exit 0
}

# ── Phase 2: version-change detection ───────────────────────────────────────
Write-Section 'Phase 2 — version-change detection'

function Get-VersionMap {
    param([Parameter(Mandatory)][string]$JsonText)
    $map = @{}
    if ([string]::IsNullOrWhiteSpace($JsonText)) { return $map }
    $entries = $JsonText | ConvertFrom-Json
    foreach ($entry in @($entries)) {
        if ($entry.PSObject.Properties.Name -contains 'title' -and
            $entry.PSObject.Properties.Name -contains 'version') {
            $title = [string]$entry.title
            if ($map.ContainsKey($title)) {
                throw "Duplicate integration title '$title' prevents reliable version-change detection."
            }
            $map[$title] = [string]$entry.version
        }
    }
    return $map
}

# Old = committed HEAD copy; New = freshly written working-tree copy.
$oldJson = (Invoke-Git @('show', 'HEAD:src/frontend/src/data/aspire-integrations.json')) -join "`n"
if ($LASTEXITCODE -ne 0) { $oldJson = '' }
$newJson = Get-Content -Path $IntegrationsJson -Raw

$oldVersions = Get-VersionMap -JsonText $oldJson
$newVersions = Get-VersionMap -JsonText $newJson

$versionChanges = [System.Collections.Generic.List[string]]::new()
foreach ($title in ($newVersions.Keys | Sort-Object)) {
    $newVer = $newVersions[$title]
    if ($oldVersions.ContainsKey($title)) {
        $oldVer = $oldVersions[$title]
        if ($oldVer -ne $newVer) {
            $versionChanges.Add("``$title`` ``$oldVer`` → ``$newVer``")
        }
    }
    else {
        $versionChanges.Add("``$title`` _(new)_ → ``$newVer``")
    }
}
foreach ($title in ($oldVersions.Keys | Sort-Object)) {
    if (-not $newVersions.ContainsKey($title)) {
        $versionChanges.Add("``$title`` ``$($oldVersions[$title])`` → _(removed)_")
    }
}

$versionsChanged = $versionChanges.Count -gt 0
if ($versionsChanged) {
    Write-Host "Detected $($versionChanges.Count) package version change(s)." -ForegroundColor Yellow
    $versionChanges | ForEach-Object { Write-Host "  - $_" }
}
else {
    Write-Host "No package version changes — API reference regeneration will be skipped." -ForegroundColor Green
}

# ── Phase 3: conditional API-reference regeneration ─────────────────────────
$regenRan = $false
$pkgSummary = ''
$tsApiSummary = ''
$twoslashSummary = ''

if ($versionsChanged -and -not $SkipRegen) {
    Write-Section 'Phase 3 — API reference regeneration'

    # 3a. C# API JSON. Per-package failures are tolerated (meta-packages).
    Write-Host "→ generate-package-json.ps1 (C# API → pkgs/)" -ForegroundColor Cyan
    $pkgArgs = @('-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', $PkgGenScript)
    if ($Framework) { $pkgArgs += @('-Framework', $Framework) }
    $pkgLog = & pwsh @pkgArgs 2>&1 | Tee-Object -Variable pkgTeed | Out-String
    if ($LASTEXITCODE -ne 0) {
        Write-Error "generate-package-json.ps1 failed hard (exit $LASTEXITCODE). Aborting; no PR will be opened."
        exit 1
    }
    $pkgDone = ($pkgLog -split "`n" | Where-Object { $_ -match 'Done!\s+Success:' } | Select-Object -First 1)
    $pkgSummary = if ($pkgDone) { ($pkgDone -replace '.*Done!\s+', '').Trim() } else { 'summary unavailable' }
    Write-Host "  C# API: $pkgSummary"

    # 3b. TS API JSON (+ chained twoslash bundle). Requires the Aspire CLI; the
    # script honours ASPIRE_CLI_PATH. A non-zero exit here IS fatal — we must not
    # ship a PR with C#-only pkgs updates.
    Write-Host "→ pnpm update:ts-api (TS API → ts-modules/ + twoslash aspire.d.ts)" -ForegroundColor Cyan
    Push-Location $FrontendDir
    try {
        $tsLog = & pnpm run update:ts-api 2>&1 | Tee-Object -Variable tsTeed | Out-String
        $tsExit = $LASTEXITCODE
    }
    finally {
        Pop-Location
    }
    if ($tsExit -ne 0) {
        # Distinguish phase-2 vs phase-3 failure using the script's log markers.
        if ($tsLog -match 'Twoslash type generation failed') {
            Write-Error "Twoslash bundle generation failed. Aborting; no PR will be opened."
        }
        else {
            Write-Error "TypeScript API generation failed. Aborting; no PR will be opened."
        }
        exit 1
    }

    $tsApiDone = ($tsLog -split "`n" |
        Where-Object { $_ -match 'Complete:\s+\d+\s+succeeded,\s+\d+\s+failed,\s+\d+\s+skipped' } |
        Select-Object -First 1)
    if (-not $tsApiDone -or
        $tsApiDone -notmatch 'Complete:\s+(?<Succeeded>\d+)\s+succeeded,\s+(?<Failed>\d+)\s+failed,\s+(?<Skipped>\d+)\s+skipped') {
        Write-Error "TypeScript API generation did not emit a valid completion summary. Aborting; no PR will be opened."
        exit 1
    }
    $tsApiSummary = "$($Matches.Succeeded) succeeded, $($Matches.Failed) failed, $($Matches.Skipped) skipped"
    if ([int]$Matches.Failed -gt 0) {
        Write-Error "TypeScript API generation reported $($Matches.Failed) package failure(s). Aborting; no PR will be opened."
        exit 1
    }

    $twoslashSummary = 'succeeded'
    $regenRan = $true
}
elseif ($versionsChanged -and $SkipRegen) {
    Write-Warning "Versions changed but -SkipRegen was set; regeneration skipped (local/dev use only)."
}

# ── Phase 4: scope check ────────────────────────────────────────────────────
Write-Section 'Phase 4 — scope check'
$allStatus = @(Invoke-Git @('status', '--porcelain') | Where-Object { $_ -and $_.Trim().Length -gt 0 })
$outOfScope = [System.Collections.Generic.List[string]]::new()
foreach ($line in $allStatus) {
    # Porcelain format: "XY <path>" (path starts at column 4). Handle renames "old -> new".
    $path = ($line.Substring(3)).Trim()
    if ($path -match ' -> ') { $path = ($path -split ' -> ')[-1].Trim() }
    $path = $path.Trim('"')
    if (-not (Test-PathAllowed -RelPath $path)) {
        $outOfScope.Add($path)
    }
}
if ($outOfScope.Count -gt 0) {
    Write-Error ("Working tree contains changes outside the allowed data paths:`n  " +
        ($outOfScope -join "`n  ") +
        "`nAborting; no PR will be opened.")
    exit 1
}
Write-Host "All changes are within the allowed data paths." -ForegroundColor Green

# ── File-count summary (for the PR body) ────────────────────────────────────
function Get-AreaCounts {
    param([Parameter(Mandatory)][string]$Prefix)
    $names = @(Invoke-Git @('diff', '--name-status', 'HEAD', '--', $Prefix) |
        Where-Object { $_ -and $_.Trim().Length -gt 0 })
    $added = 0; $modified = 0; $removed = 0
    foreach ($n in $names) {
        $code = ($n.Trim())[0]
        switch ($code) {
            'A' { $added++ }
            'M' { $modified++ }
            'D' { $removed++ }
            'R' { $modified++ }
            default { }
        }
    }
    return [PSCustomObject]@{ Added = $added; Modified = $modified; Removed = $removed }
}

$pkgsCounts = Get-AreaCounts -Prefix 'src/frontend/src/data/pkgs/'
$tsModulesCounts = Get-AreaCounts -Prefix 'src/frontend/src/data/ts-modules/'
$twoslashChanged = @(Invoke-Git @('diff', '--name-only', 'HEAD', '--', 'src/frontend/src/data/twoslash/aspire.d.ts') |
    Where-Object { $_ -and $_.Trim().Length -gt 0 }).Count -gt 0

# ── PR title + body ─────────────────────────────────────────────────────────
$dateShort = [DateTime]::UtcNow.ToString('M/d/yy', [System.Globalization.CultureInfo]::InvariantCulture)
$prTitle = "chore: Update integration data and GitHub stats ($dateShort)"

$sb = [System.Text.StringBuilder]::new()
[void]$sb.AppendLine("## Automated integration data update — $dateShort")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("Generated deterministically by ``src/frontend/scripts/update-integration-data.ps1`` (no agent inference).")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("### What's updated")
[void]$sb.AppendLine("- ``src/frontend/src/data/aspire-integrations.json`` — latest package information")
[void]$sb.AppendLine("- ``src/frontend/src/data/github-stats.json`` — repository statistics")
[void]$sb.AppendLine("- ``src/frontend/src/data/samples.json`` — sample metadata, when changed")
[void]$sb.AppendLine("- ``src/frontend/src/assets/samples/`` — sample thumbnails, when changed")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("### API reference regeneration")
[void]$sb.AppendLine("")
if ($regenRan) {
    [void]$sb.AppendLine("Versions changed for the following packages, so the C# and TypeScript API reference data and the twoslash bundle were regenerated:")
    [void]$sb.AppendLine("")
    $shown = 0
    foreach ($change in $versionChanges) {
        if ($shown -ge 10) { break }
        [void]$sb.AppendLine("- $change")
        $shown++
    }
    if ($versionChanges.Count -gt 10) {
        [void]$sb.AppendLine("- _(list truncated to first 10; full list visible in the diff)_")
    }
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("| Area | Added | Modified | Removed |")
    [void]$sb.AppendLine("|---|---|---|---|")
    [void]$sb.AppendLine("| ``src/frontend/src/data/pkgs/**`` | $($pkgsCounts.Added) | $($pkgsCounts.Modified) | $($pkgsCounts.Removed) |")
    [void]$sb.AppendLine("| ``src/frontend/src/data/ts-modules/**`` | $($tsModulesCounts.Added) | $($tsModulesCounts.Modified) | $($tsModulesCounts.Removed) |")
    [void]$sb.AppendLine("| ``src/frontend/src/data/twoslash/aspire.d.ts`` | — | $(if ($twoslashChanged) { 'yes' } else { 'no' }) | — |")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("Generator summary:")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("- C# API JSON (``generate-package-json.ps1`` → ``pkgs/``): $pkgSummary")
    [void]$sb.AppendLine("- TS API JSON (``update:ts-api`` → ``ts-modules/``): $tsApiSummary")
    [void]$sb.AppendLine("- Twoslash bundle (``twoslash/aspire.d.ts``): $twoslashSummary")
}
else {
    [void]$sb.AppendLine("_No integration package versions changed in this run — API reference regeneration was skipped._")
}
[void]$sb.AppendLine("")
if ($iconWarnings) {
    [void]$sb.AppendLine("### Icon resolution warnings")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("The following official Aspire packages resolved to the default NuGet icon (investigate the update script or upstream NuGet data — not a blocker):")
    [void]$sb.AppendLine("")
    [void]$sb.AppendLine("``$iconWarnings``")
    [void]$sb.AppendLine("")
}
[void]$sb.AppendLine("### Review checklist")
[void]$sb.AppendLine("")
[void]$sb.AppendLine("- [ ] Integration data looks reasonable (no suspicious anomalies)")
[void]$sb.AppendLine("- [ ] Package counts and versions updated appropriately")
[void]$sb.AppendLine("- [ ] Official Aspire package icons still use package-specific NuGet icon URLs")
if ($regenRan) {
    [void]$sb.AppendLine("- [ ] New/removed ``pkgs/`` and ``ts-modules/`` files match the version changes")
    [void]$sb.AppendLine("- [ ] ``src/frontend/src/data/twoslash/aspire.d.ts`` is included in the diff")
}
$prBody = $sb.ToString()

# ── Emit outputs ────────────────────────────────────────────────────────────
Write-Section 'Result — changes detected'
$prBodyFile = if ($env:RUNNER_TEMP) { Join-Path $env:RUNNER_TEMP 'integration-pr-body.md' }
              else { Join-Path ([System.IO.Path]::GetTempPath()) 'integration-pr-body.md' }
Set-Content -Path $prBodyFile -Value $prBody -Encoding utf8

Set-Output 'changed' 'true'
Set-Output 'versions_changed' ($versionsChanged.ToString().ToLowerInvariant())
Set-Output 'regen_ran' ($regenRan.ToString().ToLowerInvariant())
Set-Output 'pr_title' $prTitle
Set-Output 'pr_body_file' $prBodyFile
Set-Output 'icon_warnings' $iconWarnings

Write-Host "PR title : $prTitle"
Write-Host "PR body  : $prBodyFile"
if (-not $IsCI) {
    Write-Host ""
    Write-Host "----- PR body preview -----" -ForegroundColor DarkGray
    Write-Host $prBody
}
exit 0
