using System.Buffers;
using System.Net;
using System.Net.Http.Headers;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.Extensions.Options;

namespace PreviewHost.Previews;

internal sealed class GitHubArtifactClient
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private const string CiWorkflowPath = ".github/workflows/ci.yml";
    private const string DefaultPreviewArtifactName = "frontend-dist";

    private readonly HttpClient _httpClient;
    private readonly PreviewHostOptions _options;

    public GitHubArtifactClient(HttpClient httpClient, IOptions<PreviewHostOptions> options)
    {
        _httpClient = httpClient;
        _options = options.Value;
    }

    public async Task<PreviewRegistrationRequest?> TryResolveLatestPreviewRegistrationAsync(int pullRequestNumber, CancellationToken cancellationToken)
    {
        EnsureGitHubTokenConfigured();
        EnsureRepositoryConfigured();

        var pullRequest = await TryGetPullRequestAsync(
            _options.RepositoryOwner,
            _options.RepositoryName,
            pullRequestNumber,
            cancellationToken);

        if (pullRequest is null || string.IsNullOrWhiteSpace(pullRequest.Head.Sha))
        {
            return null;
        }

        var workflowRun = await GetLatestSuccessfulPreviewRunAsync(
            _options.RepositoryOwner,
            _options.RepositoryName,
            pullRequest.Head.Sha,
            cancellationToken);

        if (workflowRun is null)
        {
            return null;
        }

        var artifacts = await GetArtifactsAsync(
            _options.RepositoryOwner,
            _options.RepositoryName,
            workflowRun.Id,
            cancellationToken);

        var previewArtifact = ResolvePreviewArtifact(artifacts, pullRequestNumber);
        if (previewArtifact is null)
        {
            return null;
        }

        return new PreviewRegistrationRequest
        {
            RepositoryOwner = _options.RepositoryOwner,
            RepositoryName = _options.RepositoryName,
            PullRequestNumber = pullRequestNumber,
            HeadSha = pullRequest.Head.Sha,
            RunId = workflowRun.Id,
            RunAttempt = workflowRun.RunAttempt,
            ArtifactName = previewArtifact.Name,
            CompletedAtUtc = workflowRun.UpdatedAtUtc ?? workflowRun.CreatedAtUtc ?? DateTimeOffset.UtcNow
        };
    }

    public async Task<GitHubArtifactDescriptor> GetArtifactDescriptorAsync(PreviewWorkItem workItem, CancellationToken cancellationToken)
    {
        EnsureGitHubTokenConfigured();
        var payload = await GetArtifactsAsync(workItem.RepositoryOwner, workItem.RepositoryName, workItem.RunId, cancellationToken);

        var artifact = payload.Artifacts.FirstOrDefault(candidate =>
            !candidate.Expired
            && string.Equals(candidate.Name, workItem.ArtifactName, StringComparison.Ordinal));

        if (artifact is null)
        {
            throw new InvalidOperationException(
                $"Could not find a non-expired GitHub Actions artifact named '{workItem.ArtifactName}' on run {workItem.RunId}.");
        }

        return new GitHubArtifactDescriptor(
            workItem.RepositoryOwner,
            workItem.RepositoryName,
            artifact.Id,
            artifact.Name,
            artifact.ExpiresAt);
    }

    public async Task DownloadArtifactAsync(
        GitHubArtifactDescriptor artifact,
        string destinationZipPath,
        Func<PreviewDownloadProgress, CancellationToken, ValueTask> progressCallback,
        CancellationToken cancellationToken)
    {
        EnsureGitHubTokenConfigured();
        Directory.CreateDirectory(Path.GetDirectoryName(destinationZipPath)!);

        using var request = CreateRequest(
            HttpMethod.Get,
            $"repos/{artifact.RepositoryOwner}/{artifact.RepositoryName}/actions/artifacts/{artifact.ArtifactId}/zip");

        using var response = await _httpClient.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        response.EnsureSuccessStatusCode();

        var totalBytes = response.Content.Headers.ContentLength;

        await using var destinationStream = File.Create(destinationZipPath);
        await using var sourceStream = await response.Content.ReadAsStreamAsync(cancellationToken);

        var buffer = ArrayPool<byte>.Shared.Rent(81920);
        long downloadedBytes = 0;

        try
        {
            while (true)
            {
                var read = await sourceStream.ReadAsync(buffer.AsMemory(0, buffer.Length), cancellationToken);
                if (read == 0)
                {
                    break;
                }

                await destinationStream.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                downloadedBytes += read;
                await progressCallback(new PreviewDownloadProgress(downloadedBytes, totalBytes), cancellationToken);
            }
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    private async Task<GitHubArtifactsResponse> GetArtifactsAsync(
        string repositoryOwner,
        string repositoryName,
        long runId,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(
            HttpMethod.Get,
            $"repos/{repositoryOwner}/{repositoryName}/actions/runs/{runId}/artifacts?per_page=100");

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonSerializer.DeserializeAsync<GitHubArtifactsResponse>(responseStream, JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("GitHub returned an empty artifact response.");
    }

    private HttpRequestMessage CreateRequest(HttpMethod method, string relativePath)
    {
        var request = new HttpRequestMessage(method, new Uri(new Uri(_options.GitHubApiBaseUrl), relativePath));
        request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", _options.GitHubToken);
        request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/vnd.github+json"));
        request.Headers.UserAgent.Add(new ProductInfoHeaderValue("aspire-dev-preview-host", "1.0"));
        request.Headers.TryAddWithoutValidation("X-GitHub-Api-Version", "2022-11-28");
        return request;
    }

    private void EnsureGitHubTokenConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.GitHubToken))
        {
            throw new InvalidOperationException(
                $"The '{PreviewHostOptions.SectionName}:GitHubToken' setting must be configured before previews can be downloaded.");
        }
    }

    private void EnsureRepositoryConfigured()
    {
        if (string.IsNullOrWhiteSpace(_options.RepositoryOwner) || string.IsNullOrWhiteSpace(_options.RepositoryName))
        {
            throw new InvalidOperationException(
                $"The '{PreviewHostOptions.SectionName}:RepositoryOwner' and '{PreviewHostOptions.SectionName}:RepositoryName' settings must be configured before previews can be discovered.");
        }
    }

    private async Task<GitHubPullRequestItem?> TryGetPullRequestAsync(
        string repositoryOwner,
        string repositoryName,
        int pullRequestNumber,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(
            HttpMethod.Get,
            $"repos/{repositoryOwner}/{repositoryName}/pulls/{pullRequestNumber}");

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        if (response.StatusCode == HttpStatusCode.NotFound)
        {
            return null;
        }

        response.EnsureSuccessStatusCode();
        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        return await JsonSerializer.DeserializeAsync<GitHubPullRequestItem>(responseStream, JsonOptions, cancellationToken);
    }

    private async Task<GitHubWorkflowRunItem?> GetLatestSuccessfulPreviewRunAsync(
        string repositoryOwner,
        string repositoryName,
        string headSha,
        CancellationToken cancellationToken)
    {
        using var request = CreateRequest(
            HttpMethod.Get,
            $"repos/{repositoryOwner}/{repositoryName}/actions/runs?event=pull_request&status=completed&head_sha={Uri.EscapeDataString(headSha)}&per_page=100");

        using var response = await _httpClient.SendAsync(request, cancellationToken);
        response.EnsureSuccessStatusCode();

        await using var responseStream = await response.Content.ReadAsStreamAsync(cancellationToken);
        var payload = await JsonSerializer.DeserializeAsync<GitHubWorkflowRunsResponse>(responseStream, JsonOptions, cancellationToken)
            ?? throw new InvalidOperationException("GitHub returned an empty workflow run response.");

        return payload.WorkflowRuns
            .Where(static run => string.Equals(run.Conclusion, "success", StringComparison.OrdinalIgnoreCase))
            .Where(run =>
                string.Equals(run.Path, CiWorkflowPath, StringComparison.Ordinal)
                || string.Equals(run.Name, "CI", StringComparison.Ordinal))
            .OrderByDescending(static run => run.RunAttempt)
            .ThenByDescending(static run => run.UpdatedAtUtc ?? run.CreatedAtUtc ?? DateTimeOffset.MinValue)
            .ThenByDescending(static run => run.Id)
            .FirstOrDefault();
    }

    private static GitHubArtifactItem? ResolvePreviewArtifact(GitHubArtifactsResponse payload, int pullRequestNumber)
    {
        var preferredNames = new[]
        {
            $"frontend-dist-pr-{pullRequestNumber}",
            DefaultPreviewArtifactName
        };

        foreach (var artifactName in preferredNames)
        {
            var artifact = payload.Artifacts.FirstOrDefault(candidate =>
                !candidate.Expired
                && string.Equals(candidate.Name, artifactName, StringComparison.Ordinal));

            if (artifact is not null)
            {
                return artifact;
            }
        }

        return null;
    }

    private sealed class GitHubPullRequestItem
    {
        [JsonPropertyName("head")]
        public GitHubPullRequestHead Head { get; set; } = new();
    }

    private sealed class GitHubPullRequestHead
    {
        [JsonPropertyName("sha")]
        public string Sha { get; set; } = string.Empty;
    }

    private sealed class GitHubWorkflowRunsResponse
    {
        [JsonPropertyName("workflow_runs")]
        public List<GitHubWorkflowRunItem> WorkflowRuns { get; set; } = [];
    }

    private sealed class GitHubWorkflowRunItem
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("path")]
        public string Path { get; set; } = string.Empty;

        [JsonPropertyName("conclusion")]
        public string? Conclusion { get; set; }

        [JsonPropertyName("run_attempt")]
        public int RunAttempt { get; set; }

        [JsonPropertyName("updated_at")]
        public DateTimeOffset? UpdatedAtUtc { get; set; }

        [JsonPropertyName("created_at")]
        public DateTimeOffset? CreatedAtUtc { get; set; }
    }

    private sealed class GitHubArtifactsResponse
    {
        [JsonPropertyName("artifacts")]
        public List<GitHubArtifactItem> Artifacts { get; set; } = [];
    }

    private sealed class GitHubArtifactItem
    {
        [JsonPropertyName("id")]
        public long Id { get; set; }

        [JsonPropertyName("name")]
        public string Name { get; set; } = string.Empty;

        [JsonPropertyName("expired")]
        public bool Expired { get; set; }

        [JsonPropertyName("expires_at")]
        public DateTimeOffset ExpiresAt { get; set; }
    }
}
