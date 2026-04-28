#!/usr/bin/env pwsh
<#
.SYNOPSIS
  Tear down a sibling worktree once its PR has merged.

.DESCRIPTION
  GitHub doesn't fire a local hook on PR-merge, so the cleanest we can
  get to "automatic cleanup" is this user-invoked helper. Intended to be
  run from the main checkout (D:\GitHub\aspire.dev) once the upstream
  PR has been merged and the local branch is no longer needed.

.PARAMETER Name
  Short name of the worktree (the leaf folder name under
  D:\GitHub\aspire.dev-worktrees). Example: 'live-status'.

.EXAMPLE
  scripts\cleanup-worktree.ps1 live-status
#>
[CmdletBinding()]
param(
  [Parameter(Mandatory)] [string] $Name
)

$ErrorActionPreference = 'Stop'
$root = (git rev-parse --show-toplevel).Trim()
$worktreePath = Join-Path (Split-Path $root -Parent) "aspire.dev-worktrees\$Name"
$branch = "dapine/$Name"

if (-not (Test-Path $worktreePath))
{
  Write-Warning "Worktree path '$worktreePath' does not exist. Continuing with branch + prune only."
}
else
{
  Write-Host "Removing worktree at $worktreePath" -ForegroundColor Cyan
  git worktree remove $worktreePath
}

if (git show-ref --verify --quiet "refs/heads/$branch")
{
  Write-Host "Deleting local branch $branch" -ForegroundColor Cyan
  git branch -D $branch
}
else
{
  Write-Host "Local branch $branch already absent." -ForegroundColor DarkGray
}

Write-Host "Pruning upstream refs and worktree state" -ForegroundColor Cyan
git fetch --prune upstream
git worktree prune

Write-Host "Done." -ForegroundColor Green
