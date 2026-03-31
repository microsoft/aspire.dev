using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace PreviewHost.Previews;

internal sealed class PreviewStateStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private readonly Dictionary<int, PreviewRecord> _records = [];
    private readonly ILogger<PreviewStateStore> _logger;
    private readonly string _registryPath;

    public PreviewStateStore(IOptions<PreviewHostOptions> options, ILogger<PreviewStateStore> logger)
    {
        _logger = logger;

        var configuredRoot = options.Value.DataRoot;
        StateRoot = string.IsNullOrWhiteSpace(configuredRoot)
            ? ResolveDefaultStateRoot()
            : configuredRoot;
        var configuredContentRoot = options.Value.ContentRoot;
        ContentRoot = string.IsNullOrWhiteSpace(configuredContentRoot)
            ? ResolveDefaultContentRoot(StateRoot)
            : configuredContentRoot;

        _registryPath = Path.Combine(StateRoot, "registry.json");
    }

    public string StateRoot { get; }

    public string ContentRoot { get; }

    public async Task InitializeAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(StateRoot);
        Directory.CreateDirectory(ContentRoot);

        if (!File.Exists(_registryPath))
        {
            return;
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            await using var stream = File.OpenRead(_registryPath);
            var records = await JsonSerializer.DeserializeAsync<Dictionary<int, PreviewRecord>>(stream, JsonOptions, cancellationToken);
            _records.Clear();

            if (records is null)
            {
                return;
            }

            var requiresSave = false;
            foreach (var pair in records)
            {
                requiresSave |= NormalizeLoadedRecord(pair.Value);
                _records[pair.Key] = pair.Value;
            }

            if (requiresSave)
            {
                await SaveLockedAsync(cancellationToken);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<PreviewRegistrationResult> RegisterAsync(PreviewRegistrationRequest request, CancellationToken cancellationToken)
    {
        ArgumentNullException.ThrowIfNull(request);

        var completedAtUtc = request.CompletedAtUtc == default
            ? DateTimeOffset.UtcNow
            : request.CompletedAtUtc;

        string? directoryToDelete = null;
        PreviewStatusSnapshot snapshot;
        var accepted = false;

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_records.TryGetValue(request.PullRequestNumber, out var existing) && !IsNewer(existing, request, completedAtUtc))
            {
                return new PreviewRegistrationResult(false, existing.ToSnapshot());
            }

            if (existing?.ActiveDirectoryPath is { Length: > 0 } activeDirectoryPath)
            {
                directoryToDelete = activeDirectoryPath;
            }

            var record = existing ?? new PreviewRecord
            {
                PullRequestNumber = request.PullRequestNumber,
                RegisteredAtUtc = DateTimeOffset.UtcNow
            };

            record.RepositoryOwner = request.RepositoryOwner;
            record.RepositoryName = request.RepositoryName;
            record.HeadSha = request.HeadSha;
            record.RunId = request.RunId;
            record.RunAttempt = request.RunAttempt;
            record.ArtifactName = request.ArtifactName;
            record.CompletedAtUtc = completedAtUtc;
            record.State = PreviewLoadState.Registered;
            record.ActiveDirectoryPath = null;
            record.LastError = null;
            record.ReadyAtUtc = null;
            record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
            record.Progress = NextProgress(
                record,
                stage: "Registered",
                message: "A fresh preview build has been registered. Loading will start on the next request.",
                percent: 0,
                stagePercent: 0,
                bytesDownloaded: null,
                bytesTotal: null,
                itemsCompleted: null,
                itemsTotal: null,
                itemsLabel: null);

            _records[request.PullRequestNumber] = record;
            await SaveLockedAsync(cancellationToken);
            snapshot = record.ToSnapshot();
            accepted = true;
        }
        finally
        {
            _gate.Release();
        }

        if (!string.IsNullOrWhiteSpace(directoryToDelete))
        {
            DeleteDirectoryIfPresent(directoryToDelete);
        }

        return new PreviewRegistrationResult(accepted, snapshot);
    }

    public async Task<PreviewStatusSnapshot?> GetSnapshotAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return _records.TryGetValue(pullRequestNumber, out var record)
                ? record.ToSnapshot()
                : null;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyList<PreviewStatusSnapshot>> ListRecentSnapshotsAsync(int limit, CancellationToken cancellationToken)
    {
        if (limit <= 0)
        {
            return [];
        }

        await _gate.WaitAsync(cancellationToken);
        try
        {
            return [.. _records.Values
                .OrderByDescending(static record => record.LastAccessedAtUtc ?? record.ReadyAtUtc ?? record.LastUpdatedAtUtc)
                .ThenByDescending(static record => record.PullRequestNumber)
                .Take(limit)
                .Select(static record => record.ToSnapshot())];
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<IReadOnlyDictionary<int, PreviewStatusSnapshot>> ListSnapshotsAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return _records.Values
                .Select(static record => record.ToSnapshot())
                .ToDictionary(static snapshot => snapshot.PullRequestNumber);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<PreviewWorkItem?> GetWorkItemAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return _records.TryGetValue(pullRequestNumber, out var record)
                ? new PreviewWorkItem(
                    record.RepositoryOwner,
                    record.RepositoryName,
                    record.PullRequestNumber,
                    record.HeadSha,
                    record.RunId,
                    record.RunAttempt,
                    record.ArtifactName,
                    record.CompletedAtUtc)
                : null;
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task<bool> MatchesBuildAsync(int pullRequestNumber, PreviewWorkItem workItem, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!_records.TryGetValue(pullRequestNumber, out var record))
            {
                return false;
            }

            return record.RunId == workItem.RunId
                && record.RunAttempt == workItem.RunAttempt
                && string.Equals(record.HeadSha, workItem.HeadSha, StringComparison.Ordinal);
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task MarkLoadingAsync(int pullRequestNumber, string stage, string message, int percent, int stagePercent, CancellationToken cancellationToken)
    {
        await UpdateRecordAsync(
            pullRequestNumber,
            record =>
            {
                record.State = PreviewLoadState.Loading;
                record.LastError = null;
                record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
                record.Progress = NextProgress(record, stage, message, percent, stagePercent, null, null, null, null, null);
            },
            cancellationToken,
            persist: false);
    }

    public async Task UpdateProgressAsync(
        int pullRequestNumber,
        string stage,
        string message,
        int percent,
        int stagePercent,
        long? bytesDownloaded,
        long? bytesTotal,
        int? itemsCompleted,
        int? itemsTotal,
        string? itemsLabel,
        CancellationToken cancellationToken)
    {
        await UpdateRecordAsync(
            pullRequestNumber,
            record =>
            {
                record.State = PreviewLoadState.Loading;
                record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
                record.Progress = NextProgress(record, stage, message, percent, stagePercent, bytesDownloaded, bytesTotal, itemsCompleted, itemsTotal, itemsLabel);
            },
            cancellationToken,
            persist: false);
    }

    public async Task MarkReadyAsync(int pullRequestNumber, string activeDirectoryPath, CancellationToken cancellationToken)
    {
        await UpdateRecordAsync(
            pullRequestNumber,
            record =>
            {
                record.State = PreviewLoadState.Ready;
                record.ActiveDirectoryPath = activeDirectoryPath;
                record.LastError = null;
                record.ReadyAtUtc = DateTimeOffset.UtcNow;
                record.LastAccessedAtUtc = record.ReadyAtUtc;
                record.LastUpdatedAtUtc = record.ReadyAtUtc.Value;
                record.Progress = NextProgress(
                    record,
                    stage: "Ready",
                    message: "The preview is ready to serve.",
                    percent: 100,
                    stagePercent: 100,
                    bytesDownloaded: record.Progress.BytesDownloaded,
                    bytesTotal: record.Progress.BytesTotal,
                    itemsCompleted: record.Progress.ItemsCompleted,
                    itemsTotal: record.Progress.ItemsTotal,
                    itemsLabel: record.Progress.ItemsLabel);
            },
            cancellationToken);
    }

    public async Task MarkFailedAsync(int pullRequestNumber, string error, CancellationToken cancellationToken)
    {
        await UpdateRecordAsync(
            pullRequestNumber,
            record =>
            {
                record.State = PreviewLoadState.Failed;
                record.LastError = error;
                record.ActiveDirectoryPath = null;
                record.ReadyAtUtc = null;
                record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
                record.Progress = NextProgress(record, "Failed", error, record.Progress.Percent, record.Progress.StagePercent, record.Progress.BytesDownloaded, record.Progress.BytesTotal, record.Progress.ItemsCompleted, record.Progress.ItemsTotal, record.Progress.ItemsLabel);
            },
            cancellationToken);
    }

    public async Task MarkCancelledAsync(int pullRequestNumber, string message, CancellationToken cancellationToken)
    {
        await UpdateRecordAsync(
            pullRequestNumber,
            record =>
            {
                record.State = PreviewLoadState.Cancelled;
                record.LastError = null;
                record.ActiveDirectoryPath = null;
                record.ReadyAtUtc = null;
                record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
                record.Progress = NextProgress(
                    record,
                    stage: "Cancelled",
                    message: message,
                    percent: record.Progress.Percent,
                    stagePercent: record.Progress.StagePercent,
                    bytesDownloaded: record.Progress.BytesDownloaded,
                    bytesTotal: record.Progress.BytesTotal,
                    itemsCompleted: record.Progress.ItemsCompleted,
                    itemsTotal: record.Progress.ItemsTotal,
                    itemsLabel: record.Progress.ItemsLabel);
            },
            cancellationToken);
    }

    public async Task<PreviewStatusSnapshot?> RequeueAsync(int pullRequestNumber, string message, CancellationToken cancellationToken)
    {
        PreviewStatusSnapshot? snapshot = null;

        await UpdateRecordAsync(
            pullRequestNumber,
            record =>
            {
                record.State = PreviewLoadState.Registered;
                record.LastError = null;
                record.ActiveDirectoryPath = null;
                record.ReadyAtUtc = null;
                record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
                record.Progress = NextProgress(
                    record,
                    stage: "Registered",
                    message: message,
                    percent: 0,
                    stagePercent: 0,
                    bytesDownloaded: null,
                    bytesTotal: null,
                    itemsCompleted: null,
                    itemsTotal: null,
                    itemsLabel: null);
                snapshot = record.ToSnapshot();
            },
            cancellationToken);

        return snapshot;
    }

    public async Task TouchAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        await UpdateRecordAsync(
            pullRequestNumber,
            record =>
            {
                record.LastAccessedAtUtc = DateTimeOffset.UtcNow;
                record.LastUpdatedAtUtc = record.LastAccessedAtUtc.Value;
            },
            cancellationToken,
            persist: false);
    }

    public async Task<IReadOnlyList<ReadyPreviewCandidate>> ListReadyCandidatesAsync(int excludedPullRequestNumber, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            return [.. _records.Values
                .Where(static record => record.State == PreviewLoadState.Ready && !string.IsNullOrWhiteSpace(record.ActiveDirectoryPath))
                .Where(record => record.PullRequestNumber != excludedPullRequestNumber)
                .Select(record => new ReadyPreviewCandidate(
                    record.PullRequestNumber,
                    record.ActiveDirectoryPath!,
                    record.LastAccessedAtUtc ?? record.ReadyAtUtc ?? record.RegisteredAtUtc))
                .OrderBy(static candidate => candidate.SortKey)];
        }
        finally
        {
            _gate.Release();
        }
    }

    public async Task EvictAsync(int pullRequestNumber, string reason, CancellationToken cancellationToken)
    {
        string? directoryToDelete = null;

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!_records.TryGetValue(pullRequestNumber, out var record))
            {
                return;
            }

            directoryToDelete = record.ActiveDirectoryPath;
            record.State = PreviewLoadState.Evicted;
            record.ActiveDirectoryPath = null;
            record.ReadyAtUtc = null;
            record.LastError = null;
            record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
            record.Progress = NextProgress(record, "Evicted", reason, 0, 0, null, null, null, null, null);
            await SaveLockedAsync(cancellationToken);
        }
        finally
        {
            _gate.Release();
        }

        if (!string.IsNullOrWhiteSpace(directoryToDelete))
        {
            DeleteDirectoryIfPresent(directoryToDelete);
        }
    }

    public async Task RemoveAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        string? directoryToDelete = null;

        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (_records.Remove(pullRequestNumber, out var record))
            {
                directoryToDelete = record.ActiveDirectoryPath;
                await SaveLockedAsync(cancellationToken);
            }
        }
        finally
        {
            _gate.Release();
        }

        if (!string.IsNullOrWhiteSpace(directoryToDelete))
        {
            DeleteDirectoryIfPresent(directoryToDelete);
        }
    }

    public string GetActiveDirectoryPath(int pullRequestNumber) => Path.Combine(ContentRoot, "active", $"pr-{pullRequestNumber}");

    public string GetTemporaryZipPath(PreviewWorkItem workItem) =>
        Path.Combine(ContentRoot, "downloads", $"pr-{workItem.PullRequestNumber}-{workItem.RunId}-{workItem.RunAttempt}.zip");

    public string GetStagingDirectoryPath(PreviewWorkItem workItem) =>
        Path.Combine(ContentRoot, "staging", $"pr-{workItem.PullRequestNumber}-{workItem.RunId}-{workItem.RunAttempt}");

    private async Task UpdateRecordAsync(int pullRequestNumber, Action<PreviewRecord> update, CancellationToken cancellationToken, bool persist = true)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            if (!_records.TryGetValue(pullRequestNumber, out var record))
            {
                return;
            }

            update(record);
            if (persist)
            {
                await SaveLockedAsync(cancellationToken);
            }
        }
        finally
        {
            _gate.Release();
        }
    }

    private async Task SaveLockedAsync(CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(StateRoot);
        var json = JsonSerializer.Serialize(_records, JsonOptions);
        await File.WriteAllTextAsync(_registryPath, json, cancellationToken);
    }

    private bool NormalizeLoadedRecord(PreviewRecord record)
    {
        if (record.State == PreviewLoadState.Ready
            && !string.IsNullOrWhiteSpace(record.ActiveDirectoryPath)
            && !Directory.Exists(record.ActiveDirectoryPath))
        {
            record.State = PreviewLoadState.Registered;
            record.ActiveDirectoryPath = null;
            record.ReadyAtUtc = null;
            record.LastError = null;
            record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
            record.Progress = NextProgress(
                record,
                stage: "Registered",
                message: "The local preview cache was cleared and will reload on the next request.",
                percent: 0,
                stagePercent: 0,
                bytesDownloaded: null,
                bytesTotal: null,
                itemsCompleted: null,
                itemsTotal: null,
                itemsLabel: null);
            return true;
        }

        if (record.State == PreviewLoadState.Loading)
        {
            record.State = PreviewLoadState.Registered;
            record.ActiveDirectoryPath = null;
            record.ReadyAtUtc = null;
            record.LastError = null;
            record.LastUpdatedAtUtc = DateTimeOffset.UtcNow;
            record.Progress = NextProgress(
                record,
                stage: "Registered",
                message: "Preview preparation was interrupted and will restart on the next request.",
                percent: 0,
                stagePercent: 0,
                bytesDownloaded: null,
                bytesTotal: null,
                itemsCompleted: null,
                itemsTotal: null,
                itemsLabel: null);
            return true;
        }

        return false;
    }

    private static PreviewProgress NextProgress(
        PreviewRecord record,
        string stage,
        string message,
        int percent,
        int stagePercent,
        long? bytesDownloaded,
        long? bytesTotal,
        int? itemsCompleted,
        int? itemsTotal,
        string? itemsLabel) =>
        new()
        {
            Version = record.Progress.Version + 1,
            Stage = stage,
            Message = message,
            Percent = Math.Clamp(percent, 0, 100),
            StagePercent = Math.Clamp(stagePercent, 0, 100),
            BytesDownloaded = bytesDownloaded,
            BytesTotal = bytesTotal,
            ItemsCompleted = itemsCompleted,
            ItemsTotal = itemsTotal,
            ItemsLabel = itemsLabel,
            UpdatedAtUtc = DateTimeOffset.UtcNow
        };

    private static bool IsNewer(PreviewRecord existing, PreviewRegistrationRequest request, DateTimeOffset completedAtUtc)
    {
        if (completedAtUtc > existing.CompletedAtUtc)
        {
            return true;
        }

        if (completedAtUtc < existing.CompletedAtUtc)
        {
            return false;
        }

        if (request.RunId > existing.RunId)
        {
            return true;
        }

        if (request.RunId < existing.RunId)
        {
            return false;
        }

        return request.RunAttempt > existing.RunAttempt;
    }

    private static string ResolveDefaultStateRoot()
    {
        var home = Environment.GetEnvironmentVariable("HOME");
        if (!string.IsNullOrWhiteSpace(home))
        {
            return Path.Combine(home, "pr-preview-data");
        }

        return Path.Combine(AppContext.BaseDirectory, "pr-preview-data");
    }

    private static string ResolveDefaultContentRoot(string stateRoot)
    {
        if (string.Equals(Environment.GetEnvironmentVariable("DOTNET_RUNNING_IN_CONTAINER"), "true", StringComparison.OrdinalIgnoreCase))
        {
            return Path.Combine(Path.GetTempPath(), "pr-preview-data");
        }

        return stateRoot;
    }

    private void DeleteDirectoryIfPresent(string path)
    {
        try
        {
            if (Directory.Exists(path))
            {
                Directory.Delete(path, recursive: true);
            }
        }
        catch (IOException exception)
        {
            _logger.LogWarning(exception, "Failed to delete preview directory {Directory}", path);
        }
        catch (UnauthorizedAccessException exception)
        {
            _logger.LogWarning(exception, "Failed to delete preview directory {Directory}", path);
        }
    }
}
