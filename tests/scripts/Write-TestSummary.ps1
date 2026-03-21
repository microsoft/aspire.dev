param(
    [Parameter(Mandatory = $true)]
    [string[]]$TestResultsFolder,

    [Parameter(Mandatory = $false)]
    [string]$SummaryOutputPath = $env:GITHUB_STEP_SUMMARY,

    [Parameter(Mandatory = $false)]
    [string]$ArtifactUrl,

    [Parameter(Mandatory = $false)]
    [string]$SummaryTitle = "Test Summary"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-IntValue {
    param($Value)

    if ($null -eq $Value -or [string]::IsNullOrWhiteSpace([string]$Value)) {
        return 0
    }

    return [int]$Value
}

function Get-ErrorText {
    param($FailedTest)

    if ($null -eq $FailedTest.Output) {
        return "No error details found in TRX output."
    }

    if ($null -ne $FailedTest.Output.ErrorInfo) {
        if ($null -ne $FailedTest.Output.ErrorInfo.Message -and -not [string]::IsNullOrWhiteSpace([string]$FailedTest.Output.ErrorInfo.Message)) {
            return [string]$FailedTest.Output.ErrorInfo.Message
        }

        if ($null -ne $FailedTest.Output.ErrorInfo.InnerText -and -not [string]::IsNullOrWhiteSpace([string]$FailedTest.Output.ErrorInfo.InnerText)) {
            return [string]$FailedTest.Output.ErrorInfo.InnerText
        }
    }

    return "No error details found in TRX output."
}

if (-not $TestResultsFolder -or $TestResultsFolder.Count -eq 0) {
    Write-Host "No test results directory was provided."
    exit 0
}

$existingTestResultsFolders = @($TestResultsFolder | Where-Object { Test-Path $_ })
if (-not $existingTestResultsFolders -or $existingTestResultsFolders.Count -eq 0) {
    Write-Host ("No test results directories found. Looked in: {0}" -f ($TestResultsFolder -join ', '))
    exit 0
}

$trxFiles = @($existingTestResultsFolders | ForEach-Object {
    Get-ChildItem -Path $_ -Filter *.trx -Recurse -ErrorAction SilentlyContinue
} | Sort-Object FullName -Unique)
if (-not $trxFiles -or $trxFiles.Count -eq 0) {
    Write-Host ("No .trx files found under: {0}" -f ($existingTestResultsFolders -join ', '))
    exit 0
}

$summary = New-Object System.Text.StringBuilder
[void]$summary.AppendLine("# $SummaryTitle")
[void]$summary.AppendLine()

if (-not [string]::IsNullOrWhiteSpace($ArtifactUrl)) {
    [void]$summary.AppendLine("[Download test artifact]($ArtifactUrl)")
    [void]$summary.AppendLine()
}

[void]$summary.AppendLine("## Test Runs")
[void]$summary.AppendLine()
[void]$summary.AppendLine("| Test Run | Passed | Failed | Skipped | Total |")
[void]$summary.AppendLine("|----------|--------|--------|---------|-------|")

$totalPassed = 0
$totalFailed = 0
$totalSkipped = 0
$totalTests = 0

foreach ($trxFile in $trxFiles) {
    try {
        [xml]$trx = Get-Content -Path $trxFile.FullName -Raw
        $counters = $trx.TestRun.ResultSummary.Counters
        if ($null -eq $counters) {
            continue
        }

        $passed = Get-IntValue $counters.passed
        $failed = Get-IntValue $counters.failed
        $skipped = Get-IntValue $counters.notExecuted
        $total = Get-IntValue $counters.total

        $totalPassed += $passed
        $totalFailed += $failed
        $totalSkipped += $skipped
        $totalTests += $total

        $testRunName = if ([string]::IsNullOrWhiteSpace($ArtifactUrl)) {
            $trxFile.BaseName
        }
        else {
            "[$($trxFile.BaseName)]($ArtifactUrl)"
        }

        [void]$summary.AppendLine("| $testRunName | $passed | $failed | $skipped | $total |")

        if ($failed -gt 0 -and $null -ne $trx.TestRun.Results.UnitTestResult) {
            [void]$summary.AppendLine()
            [void]$summary.AppendLine(('### Failed tests in {0}' -f $trxFile.BaseName))

            foreach ($failedTest in @($trx.TestRun.Results.UnitTestResult) | Where-Object { $_.outcome -eq 'Failed' }) {
                [void]$summary.AppendLine()
                [void]$summary.AppendLine(('<details><summary>{0}</summary>' -f $failedTest.testName))
                [void]$summary.AppendLine()
                [void]$summary.AppendLine('```text')
                [void]$summary.AppendLine((Get-ErrorText -FailedTest $failedTest))

                if ($null -ne $failedTest.Output -and $null -ne $failedTest.Output.StdOut -and -not [string]::IsNullOrWhiteSpace([string]$failedTest.Output.StdOut)) {
                    [void]$summary.AppendLine()
                    [void]$summary.AppendLine('StdOut:')
                    [void]$summary.AppendLine([string]$failedTest.Output.StdOut)
                }

                [void]$summary.AppendLine('```')
                [void]$summary.AppendLine()
                [void]$summary.AppendLine('</details>')
            }
        }
    }
    catch {
        Write-Warning ('Failed to parse {0}: {1}' -f $trxFile.FullName, $_)
    }
}

$overall = @(
    "## Overall",
    "",
    "| Passed | Failed | Skipped | Total |",
    "|--------|--------|---------|-------|",
    "| $totalPassed | $totalFailed | $totalSkipped | $totalTests |",
    ""
) -join [Environment]::NewLine

[void]$summary.Insert(0, "$overall$([Environment]::NewLine)")

if (-not [string]::IsNullOrWhiteSpace($SummaryOutputPath)) {
    $summary.ToString() | Out-File -FilePath $SummaryOutputPath -Encoding utf8 -Append
}

Write-Host $summary.ToString()
