param(
    [Parameter(Mandatory)][string]$PublishDirectory,
    [Parameter(Mandatory)][string]$FrontendDirectory,
    [Parameter(Mandatory)][string]$DiagnosticsDirectory,
    [Parameter(Mandatory)][string]$SummaryPath
)

$ErrorActionPreference = 'Stop'
$webRoot = Join-Path $PublishDirectory 'wwwroot'
$frontendRoot = (Resolve-Path -LiteralPath $FrontendDirectory).Path
$frontendFiles = @(Get-ChildItem -LiteralPath $FrontendDirectory -Recurse -File)
if ($frontendFiles.Count -eq 0) {
    throw 'The frontend output is empty.'
}
foreach ($file in $frontendFiles) {
    $relative = [IO.Path]::GetRelativePath($frontendRoot, $file.FullName)
    if (-not (Test-Path -LiteralPath (Join-Path $webRoot $relative) -PathType Leaf)) {
        throw "Frontend output is missing from the published host: $relative"
    }
}

$assets = @(Get-ChildItem -LiteralPath $webRoot -Recurse -File)
$compressed = @($assets | Where-Object Extension -eq '.br')
if ($compressed.Count -eq 0) {
    throw 'No Brotli assets were published.'
}
$samples = @(
    Get-Item -LiteralPath (Join-Path $webRoot 'index.html')
    $assets | Where-Object { $_.Extension -eq '.md' } | Select-Object -First 1
    $assets | Where-Object { $_.Extension -eq '.html' -and $_.FullName -match '[\\/]reference[\\/]api[\\/]' } | Select-Object -First 1
    Get-ChildItem -LiteralPath (Join-Path $webRoot '_astro') -File -Filter '*.css' | Select-Object -First 1
)
if ($samples.Count -ne 4) {
    throw 'Expected published home, Markdown, API HTML, and hashed CSS samples.'
}
foreach ($sample in $samples) {
    $original = [IO.File]::ReadAllBytes($sample.FullName)
    $inputStream = [IO.File]::OpenRead("$($sample.FullName).br")
    $decoder = [IO.Compression.BrotliStream]::new($inputStream, [IO.Compression.CompressionMode]::Decompress)
    $restored = [IO.MemoryStream]::new()
    try {
        $decoder.CopyTo($restored)
        if ([Convert]::ToBase64String($original) -cne [Convert]::ToBase64String($restored.ToArray())) {
            throw "Brotli content differs from the original: $($sample.FullName)"
        }
    } finally {
        $restored.Dispose()
        $decoder.Dispose()
        $inputStream.Dispose()
    }
}

$archives = @(Get-ChildItem -LiteralPath (Join-Path $DiagnosticsDirectory 'images') -File)
if ($archives.Count -ne 1 -or $archives[0].Length -eq 0) {
    throw 'Expected one nonempty container archive.'
}
$timings = @(Get-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'publish.log') |
    Where-Object { $_.Contains('[publish-timing]') })
foreach ($phase in @('compression start', 'compression complete', 'static asset metadata and manifest complete')) {
    if (-not ($timings | Where-Object { $_.Contains($phase) })) {
        throw "Publish timing is missing: $phase"
    }
}
if (-not ($timings | Where-Object { $_.Contains('brotliLevel=Optimal') })) {
    throw 'Full-site publishing did not use Optimal Brotli.'
}
$metrics = [ordered]@{
    frontendFiles = $frontendFiles.Count
    publishedFiles = $assets.Count
    brotliFiles = $compressed.Count
    brotliBytes = ($compressed | Measure-Object Length -Sum).Sum
    containerArchiveBytes = $archives[0].Length
    roundTripSamples = $samples.Count
    timings = $timings
}
$metrics | ConvertTo-Json -Depth 3 |
    Set-Content -LiteralPath (Join-Path $DiagnosticsDirectory 'output.json')
@(
    '## StaticHost publish measurements'
    ''
    "- Verified $($metrics.frontendFiles) frontend files in the published host."
    "- $($metrics.brotliFiles) Brotli files; $($metrics.brotliBytes) compressed bytes."
    "- Container archive: $($metrics.containerArchiveBytes) bytes."
    '- Verified exact Brotli round trips for home, Markdown, API HTML, and hashed CSS.'
    ''
    '```text'
    $timings
    '```'
    ''
    'Full timings, resource usage, and MSBuild binary log: `statichost-publish-performance` artifact.'
) | Add-Content -LiteralPath $SummaryPath
