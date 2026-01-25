# Change to the repository directory
Set-Location "E:\GitHub\aspire.dev"

# 1. Stage all changes
Write-Host "===== Step 1: git add -A ====="
git add -A
if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully staged all changes"
} else {
    Write-Host "Error staging changes (exit code: $LASTEXITCODE)"
}

# 2. Check status
Write-Host "`n===== Step 2: git status ====="
git status

# 3. Commit with the provided message
Write-Host "`n===== Step 3: git commit ====="
$commitMessage = @"
Documentation coverage audit: CLI commands, diagnostics, and config updates

## New CLI command documentation
- aspire-stop.mdx: Stop a running Aspire AppHost
- aspire-ps.mdx: List running Aspire AppHost processes

## New diagnostic pages (experimental APIs)
- ASPIREINTERACTION001: Interaction service experimental API
- ASPIREDOTNETTOOL: .NET tool resource experimental API
- ASPIREPOSTGRES001: PostgreSQL MCP experimental API
- ASPIREEXTENSION001: Extension debugging experimental API
- ASPIRECONTAINERSHELLEXECUTION001: Container shell execution experimental API

## Configuration updates
- Added missing polyglotSupportEnabled feature flag to config-settings-table.md
- Fixed stale feature flags in example settings.json

## Navigation updates
- Updated sidebar with aspire ps and aspire stop commands
- Updated aspire.mdx commands table with new commands

Note: aspire doctor command is covered by PR #270
"@

git commit -m $commitMessage
if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully committed changes"
} else {
    Write-Host "Error during commit (exit code: $LASTEXITCODE)"
}

# 4. Push changes
Write-Host "`n===== Step 4: git push ====="
git push
if ($LASTEXITCODE -eq 0) {
    Write-Host "Successfully pushed changes"
} else {
    Write-Host "Error during push (exit code: $LASTEXITCODE)"
}
