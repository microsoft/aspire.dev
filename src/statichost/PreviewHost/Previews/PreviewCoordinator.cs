using System.Collections.Concurrent;
using System.Globalization;
using System.IO.Compression;
using System.Net;
using Microsoft.Extensions.Options;

namespace PreviewHost.Previews;

internal sealed class PreviewCoordinator
{
    private static readonly TimeSpan ProgressUpdateInterval = TimeSpan.FromSeconds(1);
    private const long DownloadProgressByteStride = 8L * 1024 * 1024;
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
    private readonly PreviewStateStore _stateStore;
    private readonly GitHubArtifactClient _artifactClient;
    private readonly ILogger<PreviewCoordinator> _logger;
    private readonly PreviewHostOptions _options;

    public PreviewCoordinator(
        PreviewStateStore stateStore,
        GitHubArtifactClient artifactClient,
        IOptions<PreviewHostOptions> options,
        ILogger<PreviewCoordinator> logger)
    {
        _stateStore = stateStore;
        _artifactClient = artifactClient;
        _logger = logger;
        _options = options.Value;
    }

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
                        progressCancellationToken);
                },
                cancellationToken);

            if (!await _stateStore.MatchesBuildAsync(pullRequestNumber, workItem, cancellationToken))
            {
                return;
            }

            await ExtractArchiveAsync(workItem, temporaryZipPath, stagingDirectoryPath, cancellationToken);

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

    private async Task ExtractArchiveAsync(
        PreviewWorkItem workItem,
        string zipPath,
        string destinationDirectory,
        CancellationToken cancellationToken)
    {
        await _stateStore.UpdateProgressAsync(
            workItem.PullRequestNumber,
            stage: "Extracting",
            message: "Extracting the preview artifact.",
            percent: CalculateWeightedPercent(ExtractingStart, ExtractingWeight, 0),
            stagePercent: 0,
            bytesDownloaded: null,
            bytesTotal: null,
            cancellationToken);

        using var archive = ZipFile.OpenRead(zipPath);
        var extractionPlan = BuildExtractionPlan(archive, destinationDirectory);
        var totalEntries = Math.Max(extractionPlan.FileEntries.Count, 1);
        var extractionProgress = new ProgressThrottle();
        var extractionStride = Math.Max(200, totalEntries / 60);

        foreach (var directoryPath in extractionPlan.DirectoryPaths)
        {
            cancellationToken.ThrowIfCancellationRequested();
            Directory.CreateDirectory(directoryPath);
        }

        for (var index = 0; index < extractionPlan.FileEntries.Count; index++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            await ExtractEntryAsync(extractionPlan.FileEntries[index], cancellationToken);

            var stagePercent = (int)Math.Round(((index + 1d) / totalEntries) * 100d);
            var percent = CalculateWeightedPercent(ExtractingStart, ExtractingWeight, stagePercent);
            if (!extractionProgress.ShouldPublish(
                    stage: "Extracting",
                    percent: percent,
                    unitsCompleted: index + 1,
                    unitStride: extractionStride,
                    isTerminal: index == extractionPlan.FileEntries.Count - 1))
            {
                continue;
            }

            await _stateStore.UpdateProgressAsync(
                workItem.PullRequestNumber,
                stage: "Extracting",
                message: $"Extracting preview files ({(index + 1).ToString("N0", CultureInfo.InvariantCulture)}/{totalEntries.ToString("N0", CultureInfo.InvariantCulture)}).",
                percent: percent,
                stagePercent: Math.Clamp(stagePercent, 0, 100),
                bytesDownloaded: null,
                bytesTotal: null,
                cancellationToken);
        }

        await _stateStore.UpdateProgressAsync(
            workItem.PullRequestNumber,
            stage: "Validating",
            message: "Validating the extracted preview output.",
            percent: CalculateWeightedPercent(ValidatingStart, ValidatingWeight, 100),
            stagePercent: 100,
            bytesDownloaded: null,
            bytesTotal: null,
            cancellationToken);
    }

    private static ExtractionPlan BuildExtractionPlan(ZipArchive archive, string destinationDirectory)
    {
        var fullRootPath = Path.GetFullPath(destinationDirectory + Path.DirectorySeparatorChar);
        var directoryPaths = new HashSet<string>(StringComparer.Ordinal);
        var fileEntries = new List<PlannedExtractionEntry>();

        foreach (var entry in archive.Entries.Where(static candidate => !string.IsNullOrEmpty(candidate.FullName)))
        {
            var normalizedEntryPath = entry.FullName.Replace('/', Path.DirectorySeparatorChar);
            var fullDestinationPath = Path.GetFullPath(Path.Combine(destinationDirectory, normalizedEntryPath));

            if (!fullDestinationPath.StartsWith(fullRootPath, StringComparison.Ordinal))
            {
                throw new InvalidOperationException($"The artifact contained an invalid path: {entry.FullName}");
            }

            if (string.IsNullOrEmpty(entry.Name))
            {
                directoryPaths.Add(fullDestinationPath);
                continue;
            }

            var directoryPath = Path.GetDirectoryName(fullDestinationPath)
                ?? throw new InvalidOperationException($"Could not resolve a directory path for artifact entry '{entry.FullName}'.");

            directoryPaths.Add(directoryPath);
            fileEntries.Add(new PlannedExtractionEntry(entry, fullDestinationPath));
        }

        return new ExtractionPlan(
            DirectoryPaths: directoryPaths.OrderBy(static path => path.Length).ToArray(),
            FileEntries: fileEntries);
    }

    private static async Task ExtractEntryAsync(PlannedExtractionEntry plannedEntry, CancellationToken cancellationToken)
    {
        await using var sourceStream = plannedEntry.Entry.Open();
        await using var destinationStream = new FileStream(
            plannedEntry.DestinationPath,
            FileMode.Create,
            FileAccess.Write,
            FileShare.None,
            bufferSize: 1024 * 1024,
            FileOptions.Asynchronous);

        await sourceStream.CopyToAsync(destinationStream, 1024 * 1024, cancellationToken);
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
            if (invalidOperationException.Message.Contains("GitHubToken", StringComparison.Ordinal))
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

internal sealed record ExtractionPlan(IReadOnlyList<string> DirectoryPaths, IReadOnlyList<PlannedExtractionEntry> FileEntries);

internal sealed record PlannedExtractionEntry(ZipArchiveEntry Entry, string DestinationPath);
