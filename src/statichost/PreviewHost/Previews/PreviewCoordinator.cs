using System.Collections.Concurrent;
using System.Diagnostics;
using System.IO.Compression;
using System.Net;
using Microsoft.Extensions.Options;

namespace PreviewHost.Previews;

internal sealed class PreviewCoordinator(
    PreviewStateStore stateStore,
    GitHubArtifactClient artifactClient,
    IOptions<PreviewHostOptions> options,
    ILogger<PreviewCoordinator> logger)
{
    private static readonly TimeSpan ProgressUpdateInterval = TimeSpan.FromSeconds(1);
    private static readonly TimeSpan ExtractionProgressReconciliationInterval = TimeSpan.FromSeconds(15);
    private const long DownloadProgressByteStride = 32L * 1024 * 1024;
    private const int ExtractionProgressUnitStride = 100;
    private const int PreparingWeight = 6;
    private const int DownloadingWeight = 52;
    private const int ExtractingWeight = 38;
    private const int ValidatingWeight = 2;
    private const int ActivatingWeight = 2;
    private const int PreparingStart = 0;
    private const int DownloadingStart = PreparingStart + PreparingWeight;
    private const int ExtractingStart = DownloadingStart + DownloadingWeight;
    private const int ValidatingStart = ExtractingStart + ExtractingWeight;
    private const int ActivatingStart = ValidatingStart + ValidatingWeight;
    private readonly ConcurrentDictionary<int, Task<PreviewDiscoveryResult>> _activeDiscovery = [];
    private readonly ConcurrentDictionary<int, CancellationTokenSource> _activeLoadCancellations = [];
    private readonly ConcurrentDictionary<int, Task> _activeLoads = [];
    private readonly PreviewStateStore _stateStore = stateStore;
    private readonly GitHubArtifactClient _artifactClient = artifactClient;
    private readonly ILogger<PreviewCoordinator> _logger = logger;
    private readonly PreviewHostOptions _options = options.Value;

    public void EnsureLoading(int pullRequestNumber)
    {
        _activeLoads.GetOrAdd(
            pullRequestNumber,
            static (prNumber, state) =>
            {
                var cancellationSource = new CancellationTokenSource();
                state._activeLoadCancellations[prNumber] = cancellationSource;
                return Task.Run(() => state.LoadAsync(prNumber, cancellationSource.Token), CancellationToken.None);
            },
            this);
    }

    public async Task<PreviewDiscoveryResult> BootstrapAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        var snapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
        if (snapshot is null)
        {
            var discovery = await EnsureRegisteredAsync(pullRequestNumber, cancellationToken);
            snapshot = discovery.Snapshot;
            if (snapshot is null)
            {
                return discovery;
            }
        }

        if (snapshot.State is PreviewLoadState.Cancelled or PreviewLoadState.Failed or PreviewLoadState.Evicted)
        {
            snapshot = await _stateStore.RequeueAsync(
                pullRequestNumber,
                "Retrying preview preparation.",
                cancellationToken) ?? snapshot;
        }

        if (!snapshot.IsReady)
        {
            EnsureLoading(pullRequestNumber);
            snapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken) ?? snapshot;
        }

        return new PreviewDiscoveryResult(snapshot);
    }

    public async Task<PreviewDiscoveryResult> RetryAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        var snapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
        if (snapshot is null)
        {
            return await BootstrapAsync(pullRequestNumber, cancellationToken);
        }

        if (!snapshot.IsReady)
        {
            snapshot = await _stateStore.RequeueAsync(
                pullRequestNumber,
                "Retrying preview preparation.",
                cancellationToken) ?? snapshot;
        }

        EnsureLoading(pullRequestNumber);
        snapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken) ?? snapshot;
        return new PreviewDiscoveryResult(snapshot);
    }

    public async Task<PreviewStatusSnapshot?> CancelAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        var snapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
        if (snapshot is null)
        {
            return null;
        }

        if (_activeLoadCancellations.TryGetValue(pullRequestNumber, out var cancellationSource))
        {
            cancellationSource.Cancel();
        }

        if (!snapshot.IsReady)
        {
            await _stateStore.MarkCancelledAsync(pullRequestNumber, "Preview preparation was cancelled.", CancellationToken.None);
            return await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
        }

        return snapshot;
    }

    public async Task<bool> ResetAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        var snapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
        if (snapshot is null)
        {
            return false;
        }

        if (_activeLoadCancellations.TryGetValue(pullRequestNumber, out var cancellationSource))
        {
            cancellationSource.Cancel();
        }

        if (_activeLoads.TryGetValue(pullRequestNumber, out var activeLoad))
        {
            try
            {
                await activeLoad.WaitAsync(cancellationToken);
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception exception)
            {
                _logger.LogDebug(exception, "Preview load task ended while resetting PR #{PullRequestNumber}", pullRequestNumber);
            }
        }

        await _stateStore.RemoveAsync(pullRequestNumber, cancellationToken);
        _logger.LogInformation("Reset preview for PR #{PullRequestNumber}", pullRequestNumber);
        return true;
    }

    public async Task<PreviewDiscoveryResult> EnsureRegisteredAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        var existingSnapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
        if (existingSnapshot is not null)
        {
            return new PreviewDiscoveryResult(existingSnapshot);
        }

        var discoveryTask = _activeDiscovery.GetOrAdd(
            pullRequestNumber,
            static (prNumber, state) => Task.Run(() => state.DiscoverAsync(prNumber), CancellationToken.None),
            this);

        return await discoveryTask.WaitAsync(cancellationToken);
    }

    private async Task<PreviewDiscoveryResult> DiscoverAsync(int pullRequestNumber)
    {
        try
        {
            var existingSnapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, CancellationToken.None);
            if (existingSnapshot is not null)
            {
                return new PreviewDiscoveryResult(existingSnapshot);
            }

            var registrationRequest = await _artifactClient.TryResolveLatestPreviewRegistrationAsync(pullRequestNumber, CancellationToken.None);
            if (registrationRequest is null)
            {
                return new PreviewDiscoveryResult(
                    Snapshot: null,
                    FailureMessage: "The preview host could not find a successful frontend artifact for this pull request yet.");
            }

            var registrationResult = await _stateStore.RegisterAsync(registrationRequest, CancellationToken.None);
            return new PreviewDiscoveryResult(registrationResult.Snapshot);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to discover preview metadata for PR #{PullRequestNumber}", pullRequestNumber);
            return new PreviewDiscoveryResult(
                Snapshot: null,
                FailureMessage: "The preview host could not look up the latest successful build for this pull request.");
        }
        finally
        {
            _activeDiscovery.TryRemove(pullRequestNumber, out _);
        }
    }

    private async Task LoadAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        string? temporaryZipPath = null;
        string? stagingDirectoryPath = null;
        var downloadProgress = new ProgressThrottle();

        try
        {
            var workItem = await _stateStore.GetWorkItemAsync(pullRequestNumber, cancellationToken);
            if (workItem is null)
            {
                return;
            }

            var currentSnapshot = await _stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
            if (currentSnapshot?.State == PreviewLoadState.Ready)
            {
                return;
            }

            await _stateStore.MarkLoadingAsync(
                pullRequestNumber,
                stage: "Preparing",
                message: "Preparing the preview workspace.",
                percent: CalculateWeightedPercent(PreparingStart, PreparingWeight, 15),
                stagePercent: 15,
                cancellationToken: cancellationToken);

            await EnsureCapacityAsync(pullRequestNumber, cancellationToken);

            temporaryZipPath = _stateStore.GetTemporaryZipPath(workItem);
            stagingDirectoryPath = _stateStore.GetStagingDirectoryPath(workItem);

            if (File.Exists(temporaryZipPath))
            {
                File.Delete(temporaryZipPath);
            }

            if (Directory.Exists(stagingDirectoryPath))
            {
                Directory.Delete(stagingDirectoryPath, recursive: true);
            }

            Directory.CreateDirectory(Path.GetDirectoryName(temporaryZipPath)!);
            Directory.CreateDirectory(stagingDirectoryPath);

            var artifact = await _artifactClient.GetArtifactDescriptorAsync(workItem, cancellationToken);
            await _stateStore.UpdateProgressAsync(
                pullRequestNumber,
                stage: "Downloading",
                message: $"Downloading {artifact.ArtifactName} from GitHub Actions.",
                percent: CalculateWeightedPercent(DownloadingStart, DownloadingWeight, 0),
                stagePercent: 0,
                bytesDownloaded: 0,
                bytesTotal: null,
                itemsCompleted: null,
                itemsTotal: null,
                itemsLabel: null,
                cancellationToken: cancellationToken);

            await _artifactClient.DownloadArtifactAsync(
                artifact,
                temporaryZipPath,
                async (progress, progressCancellationToken) =>
                {
                    var stagePercent = CalculateDownloadStagePercent(progress);
                    var percent = CalculateWeightedPercent(DownloadingStart, DownloadingWeight, stagePercent);
                    var isComplete = progress.BytesTotal is > 0 && progress.BytesDownloaded >= progress.BytesTotal.Value;
                    if (!downloadProgress.ShouldPublish(
                            stage: "Downloading",
                            percent: percent,
                            bytesDownloaded: progress.BytesDownloaded,
                            isTerminal: isComplete))
                    {
                        return;
                    }

                    await _stateStore.UpdateProgressAsync(
                        pullRequestNumber,
                        stage: "Downloading",
                        message: "Downloading the latest preview artifact.",
                        percent: percent,
                        stagePercent: stagePercent,
                        bytesDownloaded: progress.BytesDownloaded,
                        bytesTotal: progress.BytesTotal,
                        itemsCompleted: null,
                        itemsTotal: null,
                        itemsLabel: null,
                        progressCancellationToken);
                },
                cancellationToken);

            if (!await _stateStore.MatchesBuildAsync(pullRequestNumber, workItem, cancellationToken))
            {
                return;
            }

            var extractedFileCount = await ExtractArchiveAsync(workItem, temporaryZipPath, stagingDirectoryPath, cancellationToken);

            var activationSourceDirectory = ResolveActivationSourceDirectory(stagingDirectoryPath);
            var entryIndexPath = Path.Combine(activationSourceDirectory, "index.html");
            if (!File.Exists(entryIndexPath))
            {
                throw new InvalidOperationException("The downloaded preview artifact did not contain an index.html entry.");
            }

            if (!await _stateStore.MatchesBuildAsync(pullRequestNumber, workItem, cancellationToken))
            {
                return;
            }

            await _stateStore.UpdateProgressAsync(
                pullRequestNumber,
                stage: "Activating",
                message: "Activating the preview and switching traffic to the new build.",
                percent: CalculateWeightedPercent(ActivatingStart, ActivatingWeight, 50),
                stagePercent: 100,
                bytesDownloaded: null,
                bytesTotal: null,
                itemsCompleted: extractedFileCount,
                itemsTotal: extractedFileCount,
                itemsLabel: "files",
                cancellationToken);

            var activeDirectoryPath = _stateStore.GetActiveDirectoryPath(pullRequestNumber);
            if (Directory.Exists(activeDirectoryPath))
            {
                Directory.Delete(activeDirectoryPath, recursive: true);
            }

            Directory.CreateDirectory(Path.GetDirectoryName(activeDirectoryPath)!);
            Directory.Move(activationSourceDirectory, activeDirectoryPath);
            stagingDirectoryPath = null;

            await _stateStore.MarkReadyAsync(pullRequestNumber, activeDirectoryPath, cancellationToken);
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
            _logger.LogInformation("Cancelled preview preparation for PR #{PullRequestNumber}", pullRequestNumber);
            await _stateStore.MarkCancelledAsync(pullRequestNumber, "Preview preparation was cancelled.", CancellationToken.None);
        }
        catch (Exception exception)
        {
            _logger.LogError(exception, "Failed to prepare preview for PR #{PullRequestNumber}", pullRequestNumber);
            await _stateStore.MarkFailedAsync(pullRequestNumber, BuildFriendlyErrorMessage(exception), CancellationToken.None);
        }
        finally
        {
            if (_activeLoadCancellations.TryRemove(pullRequestNumber, out var cancellationSource))
            {
                cancellationSource.Dispose();
            }

            _activeLoads.TryRemove(pullRequestNumber, out _);

            DeleteFileIfPresent(temporaryZipPath);
            DeleteDirectoryIfPresent(stagingDirectoryPath);
        }
    }

    private async Task EnsureCapacityAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        if (_options.MaxActivePreviews <= 0)
        {
            return;
        }

        var readyCandidates = await _stateStore.ListReadyCandidatesAsync(pullRequestNumber, cancellationToken);
        var excessCount = readyCandidates.Count - (_options.MaxActivePreviews - 1);

        if (excessCount <= 0)
        {
            return;
        }

        foreach (var candidate in readyCandidates.Take(excessCount))
        {
            await _stateStore.EvictAsync(
                candidate.PullRequestNumber,
                reason: "Evicted to make room for a more recently requested preview.",
                cancellationToken: cancellationToken);
        }
    }

    private async Task<int> ExtractArchiveAsync(
        PreviewWorkItem workItem,
        string zipPath,
        string destinationDirectory,
        CancellationToken cancellationToken)
    {
        var extractionToolDescription = _options.ExtractionToolDescription;
        var extractionStopwatch = Stopwatch.StartNew();
        var extractionMessage = $"Extracting preview files with {extractionToolDescription}.";
        var totalFileCount = CountArchiveFileEntries(zipPath);
        var bufferSettings = PreviewBufferSettings.Resolve();
        using var extractionProgressState = new ExtractionProgressState(totalFileCount);

        await _stateStore.UpdateProgressAsync(
            workItem.PullRequestNumber,
            stage: "Extracting",
            message: extractionMessage,
            percent: CalculateWeightedPercent(ExtractingStart, ExtractingWeight, 0),
            stagePercent: 0,
            bytesDownloaded: null,
            bytesTotal: null,
            itemsCompleted: 0,
            itemsTotal: totalFileCount,
            itemsLabel: "files",
            cancellationToken);

        Directory.CreateDirectory(destinationDirectory);

        using var extractionWatcher = CreateExtractionFileWatcher(destinationDirectory, extractionProgressState);
        using var extractionReportingCancellation = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
        var extractionReportingTask = ReportExtractionProgressAsync(
            workItem,
            extractionMessage,
            destinationDirectory,
            extractionProgressState,
            extractionReportingCancellation.Token);

        try
        {
            if (_options.UseCommandLineExtraction)
            {
                await ExtractArchiveWithCommandLineAsync(zipPath, destinationDirectory, cancellationToken);
            }
            else
            {
                _logger.LogInformation(
                    "Extracting preview artifact with adaptive managed buffer: {ManagedZipReadBufferMiB} MiB (~{AvailableMemoryMiB} MiB headroom)",
                    bufferSettings.ManagedZipReadBufferMiB,
                    bufferSettings.AvailableMemoryMiB);

                using var zipStream = new FileStream(
                    zipPath,
                    FileMode.Open,
                    FileAccess.Read,
                    FileShare.Read,
                    bufferSize: bufferSettings.ManagedZipReadBufferSize,
                    options: FileOptions.Asynchronous | FileOptions.SequentialScan);
                using var archive = new ZipArchive(zipStream, ZipArchiveMode.Read, leaveOpen: false);
                await archive.ExtractToDirectoryAsync(destinationDirectory, overwriteFiles: true, cancellationToken);
            }
        }
        finally
        {
            extractionProgressState.ReconcileWithFilesystem(destinationDirectory, force: true);
            extractionReportingCancellation.Cancel();
            await AwaitBackgroundWorkAsync(extractionReportingTask);
        }

        extractionStopwatch.Stop();
        _logger.LogInformation(
            "Extracted preview artifact for PR #{PullRequestNumber} using {ExtractionTool} in {ElapsedMilliseconds} ms",
            workItem.PullRequestNumber,
            extractionToolDescription,
            extractionStopwatch.ElapsedMilliseconds);

        await _stateStore.UpdateProgressAsync(
            workItem.PullRequestNumber,
            stage: "Extracting",
            message: "Preview artifact extracted.",
            percent: CalculateWeightedPercent(ExtractingStart, ExtractingWeight, 100),
            stagePercent: 100,
            bytesDownloaded: null,
            bytesTotal: null,
            itemsCompleted: totalFileCount,
            itemsTotal: totalFileCount,
            itemsLabel: "files",
            cancellationToken);

        await _stateStore.UpdateProgressAsync(
            workItem.PullRequestNumber,
            stage: "Validating",
            message: "Validating the extracted preview output.",
            percent: CalculateWeightedPercent(ValidatingStart, ValidatingWeight, 100),
            stagePercent: 100,
            bytesDownloaded: null,
            bytesTotal: null,
            itemsCompleted: totalFileCount,
            itemsTotal: totalFileCount,
            itemsLabel: "files",
            cancellationToken);

        return totalFileCount;
    }

    private async Task ExtractArchiveWithCommandLineAsync(
        string zipPath,
        string destinationDirectory,
        CancellationToken cancellationToken)
    {
        var toolDescription = _options.ExtractionToolDescription;
        _logger.LogInformation("Extracting preview artifact via {ExtractionTool}", toolDescription);

        if (OperatingSystem.IsWindows())
        {
            await RunExtractionProcessAsync(
                "tar.exe",
                toolDescription,
                cancellationToken,
                "-xf",
                zipPath,
                "-C",
                destinationDirectory);
            return;
        }

        await RunExtractionProcessAsync(
            "unzip",
            toolDescription,
            cancellationToken,
            "-o",
            "-qq",
            zipPath,
            "-d",
            destinationDirectory);
    }

    private async Task RunExtractionProcessAsync(
        string fileName,
        string toolDescription,
        CancellationToken cancellationToken,
        params string[] arguments)
    {
        using var process = new Process
        {
            StartInfo = new ProcessStartInfo
            {
                FileName = fileName,
                UseShellExecute = false,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                CreateNoWindow = true
            }
        };

        foreach (var argument in arguments)
        {
            process.StartInfo.ArgumentList.Add(argument);
        }

        try
        {
            if (!process.Start())
            {
                throw new InvalidOperationException($"The preview host could not start {toolDescription} for command-line extraction.");
            }
        }
        catch (Exception exception) when (exception is FileNotFoundException or System.ComponentModel.Win32Exception)
        {
            throw new InvalidOperationException(
                $"The preview host is configured for command-line extraction, but {toolDescription} is not available on this machine.",
                exception);
        }

        var commandDisplay = BuildCommandDisplayString(fileName, arguments);
        var outputTail = new ProcessOutputTail(maxLines: 32);
        _logger.LogInformation("Starting extraction command for {ExtractionTool}: {Command}", toolDescription, commandDisplay);

        var standardOutputTask = PumpProcessStreamAsync(
            process.StandardOutput,
            toolDescription,
            "stdout",
            LogLevel.Information,
            outputTail,
            emitLiveLogs: false);
        var standardErrorTask = PumpProcessStreamAsync(
            process.StandardError,
            toolDescription,
            "stderr",
            LogLevel.Warning,
            outputTail,
            emitLiveLogs: true);
        using var cancellationRegistration = cancellationToken.Register(static state => TryKillProcess((Process)state!), process);

        try
        {
            await process.WaitForExitAsync(cancellationToken);
        }
        catch (OperationCanceledException)
        {
            TryKillProcess(process);
            await process.WaitForExitAsync(CancellationToken.None);
            throw;
        }

        await Task.WhenAll(standardOutputTask, standardErrorTask);

        if (process.ExitCode != 0)
        {
            throw new InvalidOperationException(
                $"The preview host could not extract the artifact using {toolDescription}. Exit code {process.ExitCode}. {BuildProcessFailureOutput(outputTail.BuildSummary())}");
        }

        _logger.LogInformation("Extraction command completed successfully via {ExtractionTool}", toolDescription);
    }

    private async Task PumpProcessStreamAsync(
        StreamReader reader,
        string toolDescription,
        string streamName,
        LogLevel logLevel,
        ProcessOutputTail outputTail,
        bool emitLiveLogs)
    {
        while (await reader.ReadLineAsync() is { } line)
        {
            if (string.IsNullOrWhiteSpace(line))
            {
                continue;
            }

            outputTail.Add(streamName, line);
            if (emitLiveLogs)
            {
                _logger.Log(logLevel, "{ExtractionTool} {StreamName}: {Line}", toolDescription, streamName, line);
            }
        }
    }

    private static string BuildProcessFailureOutput(string detail)
    {
        var normalizedDetail = string.IsNullOrWhiteSpace(detail)
            ? "The extraction tool did not emit any additional output."
            : detail.Trim();

        const int maxLength = 600;
        return normalizedDetail.Length <= maxLength
            ? normalizedDetail
            : $"{normalizedDetail[..maxLength]}...";
    }

    private async Task ReportExtractionProgressAsync(
        PreviewWorkItem workItem,
        string extractionMessage,
        string destinationDirectory,
        ExtractionProgressState extractionProgressState,
        CancellationToken cancellationToken)
    {
        using var timer = new PeriodicTimer(ProgressUpdateInterval);
        var progressThrottle = new ProgressThrottle();

        try
        {
            while (await timer.WaitForNextTickAsync(cancellationToken))
            {
                extractionProgressState.ReconcileWithFilesystem(destinationDirectory, force: false);
                var completedFiles = extractionProgressState.GetCompletedFiles();
                var stagePercent = CalculateExtractionStagePercent(completedFiles, extractionProgressState.TotalFiles);
                var percent = CalculateWeightedPercent(ExtractingStart, ExtractingWeight, stagePercent);
                var isComplete = completedFiles >= extractionProgressState.TotalFiles;

                if (!progressThrottle.ShouldPublish(
                        stage: "Extracting",
                        percent: percent,
                        isTerminal: isComplete,
                        unitsCompleted: completedFiles,
                        unitStride: ExtractionProgressUnitStride))
                {
                    continue;
                }

                await _stateStore.UpdateProgressAsync(
                    workItem.PullRequestNumber,
                    stage: "Extracting",
                    message: extractionMessage,
                    percent: percent,
                    stagePercent: stagePercent,
                    bytesDownloaded: null,
                    bytesTotal: null,
                    itemsCompleted: completedFiles,
                    itemsTotal: extractionProgressState.TotalFiles,
                    itemsLabel: "files",
                    cancellationToken);
            }
        }
        catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
        {
        }
    }

    private static int CountArchiveFileEntries(string zipPath)
    {
        using var archive = ZipFile.OpenRead(zipPath);
        return archive.Entries.Count(static entry => !string.IsNullOrEmpty(entry.Name));
    }

    private static FileSystemWatcher CreateExtractionFileWatcher(string destinationDirectory, ExtractionProgressState extractionProgressState)
    {
        var watcher = new FileSystemWatcher(destinationDirectory)
        {
            IncludeSubdirectories = true,
            NotifyFilter = NotifyFilters.FileName,
            InternalBufferSize = 64 * 1024
        };

        watcher.Created += (_, eventArgs) => extractionProgressState.TryTrackFile(eventArgs.FullPath);
        watcher.Renamed += (_, eventArgs) => extractionProgressState.TryTrackFile(eventArgs.FullPath);
        watcher.Error += (_, _) => extractionProgressState.MarkNeedsReconciliation();
        watcher.EnableRaisingEvents = true;
        return watcher;
    }

    private static string BuildCommandDisplayString(string fileName, IEnumerable<string> arguments) =>
        string.Join(
            ' ',
            new[] { QuoteCommandSegment(fileName) }.Concat(arguments.Select(QuoteCommandSegment)));

    private static string QuoteCommandSegment(string value) =>
        string.IsNullOrWhiteSpace(value) || value.IndexOfAny([' ', '\t', '"']) >= 0
            ? $"\"{value.Replace("\"", "\\\"", StringComparison.Ordinal)}\""
            : value;

    private static int CalculateExtractionStagePercent(int completedFiles, int totalFiles)
    {
        if (totalFiles <= 0)
        {
            return 0;
        }

        var rawPercent = (double)completedFiles / totalFiles;
        return Math.Clamp((int)Math.Round(rawPercent * 100d), 0, 100);
    }

    private static int CalculateDownloadStagePercent(PreviewDownloadProgress progress)
    {
        if (progress.BytesTotal is > 0)
        {
            var rawPercent = (double)progress.BytesDownloaded / progress.BytesTotal.Value;
            return Math.Clamp((int)Math.Round(rawPercent * 100d), 0, 100);
        }

        return 0;
    }

    private static int CalculateWeightedPercent(int stageStart, int stageWeight, int stagePercent)
    {
        var clampedStagePercent = Math.Clamp(stagePercent, 0, 100);
        var weightedProgress = (int)Math.Round(stageWeight * (clampedStagePercent / 100d));
        return Math.Clamp(stageStart + weightedProgress, 0, 99);
    }

    private static string BuildFriendlyErrorMessage(Exception exception)
    {
        if (exception is InvalidOperationException invalidOperationException)
        {
            if (invalidOperationException.Message.Contains("GitHubToken", StringComparison.Ordinal)
                || invalidOperationException.Message.Contains("GitHubAppId", StringComparison.Ordinal)
                || invalidOperationException.Message.Contains("GitHubAppPrivateKey", StringComparison.Ordinal))
            {
                return "The preview host is missing its GitHub artifact-read credential.";
            }

            if (invalidOperationException.Message.Contains("RepositoryOwner", StringComparison.Ordinal)
                || invalidOperationException.Message.Contains("RepositoryName", StringComparison.Ordinal))
            {
                return "The preview host is missing its GitHub repository configuration.";
            }

            if (invalidOperationException.Message.Contains("artifact", StringComparison.OrdinalIgnoreCase))
            {
                return "The requested preview artifact could not be found or is no longer available.";
            }

            if (invalidOperationException.Message.Contains("tar.exe", StringComparison.OrdinalIgnoreCase)
                || invalidOperationException.Message.Contains("unzip", StringComparison.OrdinalIgnoreCase)
                || invalidOperationException.Message.Contains("command-line extraction", StringComparison.OrdinalIgnoreCase))
            {
                return "The preview host could not extract the artifact using its configured extraction tool.";
            }
        }

        if (exception is HttpRequestException httpRequestException && httpRequestException.StatusCode == HttpStatusCode.Unauthorized)
        {
            return "The preview host could not authenticate with GitHub to download this artifact.";
        }

        if (exception is HttpRequestException { StatusCode: HttpStatusCode.NotFound or HttpStatusCode.Gone })
        {
            return "The requested preview artifact could not be found or has already expired.";
        }

        return "The preview could not be prepared. Check the preview host logs for more details.";
    }

    private static string ResolveActivationSourceDirectory(string extractedRoot)
    {
        var topLevelIndexPath = Path.Combine(extractedRoot, "index.html");
        if (File.Exists(topLevelIndexPath))
        {
            return extractedRoot;
        }

        var nestedDirectory = Directory.EnumerateDirectories(extractedRoot)
            .Select(static directory => new
            {
                Directory = directory,
                IndexPath = Path.Combine(directory, "index.html")
            })
            .FirstOrDefault(static candidate => File.Exists(candidate.IndexPath));

        return nestedDirectory?.Directory ?? extractedRoot;
    }

    private static void DeleteFileIfPresent(string? path)
    {
        if (!string.IsNullOrWhiteSpace(path) && File.Exists(path))
        {
            File.Delete(path);
        }
    }

    private static void DeleteDirectoryIfPresent(string? path)
    {
        if (!string.IsNullOrWhiteSpace(path) && Directory.Exists(path))
        {
            Directory.Delete(path, recursive: true);
        }
    }

    private static void TryKillProcess(Process process)
    {
        try
        {
            if (!process.HasExited)
            {
                process.Kill(entireProcessTree: true);
            }
        }
        catch (InvalidOperationException)
        {
        }
    }

    private static async Task AwaitBackgroundWorkAsync(Task task)
    {
        try
        {
            await task;
        }
        catch (OperationCanceledException)
        {
        }
    }

    private sealed class ProcessOutputTail(int maxLines)
    {
        private readonly object _gate = new();
        private readonly Queue<string> _lines = new();
        private readonly int _maxLines = maxLines;

        public void Add(string streamName, string line)
        {
            lock (_gate)
            {
                _lines.Enqueue($"{streamName}: {line}");
                while (_lines.Count > _maxLines)
                {
                    _lines.Dequeue();
                }
            }
        }

        public string BuildSummary()
        {
            lock (_gate)
            {
                return string.Join(Environment.NewLine, _lines);
            }
        }
    }

    private sealed class ExtractionProgressState(int totalFiles) : IDisposable
    {
        private readonly object _gate = new();
        private readonly HashSet<string> _seenFiles = new(OperatingSystem.IsWindows() ? StringComparer.OrdinalIgnoreCase : StringComparer.Ordinal);
        private int _needsReconciliation;
        private DateTimeOffset _lastReconciledAtUtc = DateTimeOffset.MinValue;

        public int TotalFiles { get; } = totalFiles;

        public int GetCompletedFiles()
        {
            lock (_gate)
            {
                return _seenFiles.Count;
            }
        }

        public void TryTrackFile(string path)
        {
            if (string.IsNullOrWhiteSpace(path) || !File.Exists(path))
            {
                return;
            }

            lock (_gate)
            {
                _seenFiles.Add(path);
            }
        }

        public void MarkNeedsReconciliation() => Interlocked.Exchange(ref _needsReconciliation, 1);

        public void ReconcileWithFilesystem(string destinationDirectory, bool force)
        {
            var needsReconciliation = Interlocked.Exchange(ref _needsReconciliation, 0) != 0;
            var now = DateTimeOffset.UtcNow;

            if (!force
                && !needsReconciliation
                && now - _lastReconciledAtUtc < ExtractionProgressReconciliationInterval)
            {
                return;
            }

            if (!force && GetCompletedFiles() >= TotalFiles)
            {
                return;
            }

            var files = Directory.Exists(destinationDirectory)
                ? Directory.EnumerateFiles(destinationDirectory, "*", SearchOption.AllDirectories)
                : [];

            lock (_gate)
            {
                _seenFiles.Clear();
                foreach (var file in files)
                {
                    _seenFiles.Add(file);
                }
            }

            _lastReconciledAtUtc = now;
        }

        public void Dispose()
        {
        }
    }

    private sealed class ProgressThrottle
    {
        private string? _lastStage;
        private int _lastPercent = -1;
        private long _lastBytesDownloaded = -1;
        private int _lastUnitsCompleted;
        private DateTimeOffset _lastPublishedAtUtc = DateTimeOffset.MinValue;

        public bool ShouldPublish(
            string stage,
            int percent,
            bool isTerminal,
            long? bytesDownloaded = null,
            int unitsCompleted = 0,
            int unitStride = 0)
        {
            var now = DateTimeOffset.UtcNow;
            if (_lastPublishedAtUtc == DateTimeOffset.MinValue)
            {
                Publish(stage, percent, bytesDownloaded, unitsCompleted, now);
                return true;
            }

            if (!string.Equals(stage, _lastStage, StringComparison.Ordinal)
                || isTerminal
                || percent > _lastPercent
                || now - _lastPublishedAtUtc >= ProgressUpdateInterval
                || bytesDownloaded is >= 0 && bytesDownloaded.Value - _lastBytesDownloaded >= DownloadProgressByteStride
                || unitStride > 0 && unitsCompleted - _lastUnitsCompleted >= unitStride)
            {
                Publish(stage, percent, bytesDownloaded, unitsCompleted, now);
                return true;
            }

            return false;
        }

        private void Publish(string stage, int percent, long? bytesDownloaded, int unitsCompleted, DateTimeOffset publishedAtUtc)
        {
            _lastStage = stage;
            _lastPercent = percent;
            _lastBytesDownloaded = bytesDownloaded ?? _lastBytesDownloaded;
            _lastUnitsCompleted = unitsCompleted;
            _lastPublishedAtUtc = publishedAtUtc;
        }
    }
}
