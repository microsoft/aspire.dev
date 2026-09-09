#!/usr/bin/env pwsh
<#
.SYNOPSIS
    Compatibility shim for generate-apphost-api-json.ps1.
#>

[CmdletBinding()]
param(
    [string]$AspireRepoPath,
    [string[]]$NuGetPackageVersion,
    [string]$OutputDir,
    [string]$SupportOutput,
    [string]$PackageFilter,
    [string]$BaseModulePath,
    [switch]$SkipBuild,
    [string]$AspireCliProject,
    [string]$DumpCliVersion,
    [string]$DumpGeneratedAt
)

Write-Warning "generate-ts-api-json.ps1 is deprecated; use generate-apphost-api-json.ps1."
& (Join-Path $PSScriptRoot "generate-apphost-api-json.ps1") @PSBoundParameters
exit $LASTEXITCODE
