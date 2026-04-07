using System.ComponentModel.DataAnnotations;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Http;

namespace PreviewHost.Previews;

internal sealed class PreviewHostOptions
{
    public const string SectionName = "PreviewHost";

    public string? DataRoot { get; set; }

    public string? ContentRoot { get; set; }

    public string RepositoryOwner { get; set; } = "microsoft";

    public string RepositoryName { get; set; } = "aspire.dev";

    public int MaxActivePreviews { get; set; } = 10;

    public string GitHubToken { get; set; } = string.Empty;

    public int GitHubAppId { get; set; }

    public long GitHubAppInstallationId { get; set; }

    public string GitHubAppPrivateKey { get; set; } = string.Empty;

    public string GitHubApiBaseUrl { get; set; } = "https://api.github.com/";

    public string GitHubOAuthClientId { get; set; } = string.Empty;

    public string GitHubOAuthClientSecret { get; set; } = string.Empty;

    public string ControlBaseUrl { get; set; } = string.Empty;

    public string ContentBaseUrl { get; set; } = string.Empty;

    public string AuthCookieDomain { get; set; } = string.Empty;

    public string ExtractionMode { get; set; } = "managed";

    public int MaxConcurrentLoads { get; set; } = 2;

    public long MaxArtifactSizeBytes { get; set; } = 1L * 1024 * 1024 * 1024;

    public int MaxExtractedFileCount { get; set; } = 100_000;

    public long MaxExtractedUncompressedBytes { get; set; } = 4L * 1024 * 1024 * 1024;

    [JsonIgnore]
    public bool HasGitHubToken => !string.IsNullOrWhiteSpace(GitHubToken);

    [JsonIgnore]
    public bool HasGitHubAppConfiguration =>
        GitHubAppId > 0
        && !string.IsNullOrWhiteSpace(GitHubAppPrivateKey);

    [JsonIgnore]
    public bool HasGitHubOAuthConfiguration =>
        !string.IsNullOrWhiteSpace(GitHubOAuthClientId)
        && !string.IsNullOrWhiteSpace(GitHubOAuthClientSecret);

    [JsonIgnore]
    public bool HasValidExtractionMode =>
        string.Equals(ExtractionMode, "managed", StringComparison.OrdinalIgnoreCase)
        || string.Equals(ExtractionMode, "command-line", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public bool HasValidConfiguredBaseUrls =>
        TryParseAbsoluteBaseUri(ControlBaseUrl, out _)
        && TryParseAbsoluteBaseUri(ContentBaseUrl, out _);

    [JsonIgnore]
    public bool HasValidSafetyLimits =>
        MaxConcurrentLoads > 0
        && MaxArtifactSizeBytes > 0
        && MaxExtractedFileCount > 0
        && MaxExtractedUncompressedBytes > 0;

    [JsonIgnore]
    public bool UseCommandLineExtraction =>
        string.Equals(ExtractionMode, "command-line", StringComparison.OrdinalIgnoreCase);

    [JsonIgnore]
    public bool HasSeparatedContentOrigin =>
        TryGetControlBaseUri(out var controlBaseUri)
        && controlBaseUri is not null
        && TryGetContentBaseUri(out var contentBaseUri)
        && contentBaseUri is not null
        && !UrisShareOrigin(controlBaseUri, contentBaseUri);

    [JsonIgnore]
    public bool CanAuthenticateContentRequests =>
        !HasSeparatedContentOrigin
        || !string.IsNullOrWhiteSpace(AuthCookieDomain);

    [JsonIgnore]
    public string ExtractionToolDescription =>
        UseCommandLineExtraction
            ? OperatingSystem.IsWindows()
                ? "tar.exe"
                : "unzip"
            : "ZipArchive.ExtractToDirectoryAsync";

    [JsonIgnore]
    public string? CommandLineExtractionCommandName =>
        UseCommandLineExtraction
            ? OperatingSystem.IsWindows()
                ? "tar.exe"
                : "unzip"
            : null;

    public string GetGitHubAuthenticationMode() =>
        HasGitHubToken
            ? "personal-access-token"
            : HasGitHubAppConfiguration
                ? "github-app"
                : "unconfigured";

    public string GetExtractionModeDescription() =>
        UseCommandLineExtraction
            ? $"command-line ({ExtractionToolDescription})"
            : $"managed ({ExtractionToolDescription})";

    public bool TryGetControlBaseUri(out Uri? baseUri) => TryParseAbsoluteBaseUri(ControlBaseUrl, out baseUri);

    public bool TryGetContentBaseUri(out Uri? baseUri) => TryParseAbsoluteBaseUri(ContentBaseUrl, out baseUri);

    public bool IsContentRequest(HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        return HasSeparatedContentOrigin
            && TryGetContentBaseUri(out var contentBaseUri)
            && contentBaseUri is not null
            && HostMatches(contentBaseUri, request);
    }

    public bool IsControlRequest(HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        if (TryGetControlBaseUri(out var controlBaseUri) && controlBaseUri is not null)
        {
            return HostMatches(controlBaseUri, request);
        }

        return !IsContentRequest(request);
    }

    public string BuildControlUrl(HttpRequest request, string relativeUrl)
    {
        ArgumentNullException.ThrowIfNull(request);
        return BuildAbsoluteUrl(
            TryGetControlBaseUri(out var controlBaseUri) ? controlBaseUri : null,
            request,
            relativeUrl);
    }

    public string BuildContentUrl(HttpRequest request, string relativeUrl)
    {
        ArgumentNullException.ThrowIfNull(request);

        Uri? baseUri = null;
        if (TryGetContentBaseUri(out var contentBaseUri))
        {
            baseUri = contentBaseUri;
        }
        else if (TryGetControlBaseUri(out var controlBaseUri))
        {
            baseUri = controlBaseUri;
        }

        return BuildAbsoluteUrl(baseUri, request, relativeUrl);
    }

    public string GetControlBaseUrl(HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);
        return GetBaseUrlString(TryGetControlBaseUri(out var controlBaseUri) ? controlBaseUri : null, request);
    }

    public string GetContentBaseUrl(HttpRequest request)
    {
        ArgumentNullException.ThrowIfNull(request);

        Uri? baseUri = null;
        if (TryGetContentBaseUri(out var contentBaseUri))
        {
            baseUri = contentBaseUri;
        }
        else if (TryGetControlBaseUri(out var controlBaseUri))
        {
            baseUri = controlBaseUri;
        }

        return GetBaseUrlString(baseUri, request);
    }

    private static bool TryParseAbsoluteBaseUri(string? value, out Uri? baseUri)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            baseUri = null;
            return true;
        }

        if (!Uri.TryCreate(value, UriKind.Absolute, out var parsed)
            || !(string.Equals(parsed.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase)
                || string.Equals(parsed.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase)))
        {
            baseUri = null;
            return false;
        }

        var builder = new UriBuilder(parsed)
        {
            Query = string.Empty,
            Fragment = string.Empty
        };

        if (string.IsNullOrWhiteSpace(builder.Path))
        {
            builder.Path = "/";
        }
        else if (!builder.Path.EndsWith("/", StringComparison.Ordinal))
        {
            builder.Path = $"{builder.Path}/";
        }

        baseUri = builder.Uri;
        return true;
    }

    private static bool UrisShareOrigin(Uri left, Uri right) =>
        string.Equals(left.Scheme, right.Scheme, StringComparison.OrdinalIgnoreCase)
        && string.Equals(left.Host, right.Host, StringComparison.OrdinalIgnoreCase)
        && left.Port == right.Port;

    private static bool HostMatches(Uri baseUri, HttpRequest request) =>
        string.Equals(baseUri.Host, request.Host.Host, StringComparison.OrdinalIgnoreCase)
        && GetPort(baseUri) == GetPort(request);

    private static int GetPort(Uri baseUri) => baseUri.IsDefaultPort
        ? string.Equals(baseUri.Scheme, Uri.UriSchemeHttps, StringComparison.OrdinalIgnoreCase) ? 443 : 80
        : baseUri.Port;

    private static int GetPort(HttpRequest request)
    {
        if (request.Host.Port is { } port)
        {
            return port;
        }

        return string.Equals(request.Scheme, Uri.UriSchemeHttp, StringComparison.OrdinalIgnoreCase) ? 80 : 443;
    }

    private static string BuildAbsoluteUrl(Uri? baseUri, HttpRequest request, string relativeUrl)
    {
        if (string.IsNullOrWhiteSpace(relativeUrl))
        {
            relativeUrl = "/";
        }
        else if (!relativeUrl.StartsWith("/", StringComparison.Ordinal))
        {
            relativeUrl = $"/{relativeUrl}";
        }

        if (baseUri is null)
        {
            return relativeUrl;
        }

        return new Uri(baseUri, relativeUrl).ToString();
    }

    private static string GetBaseUrlString(Uri? baseUri, HttpRequest request)
    {
        if (baseUri is not null)
        {
            return baseUri.ToString();
        }

        return $"{request.Scheme}://{request.Host}/";
    }
}

internal sealed class PreviewRegistrationRequest
{
    [Required]
    public string RepositoryOwner { get; set; } = string.Empty;

    [Required]
    public string RepositoryName { get; set; } = string.Empty;

    [Range(1, int.MaxValue)]
    public int PullRequestNumber { get; set; }

    [Required]
    public string HeadSha { get; set; } = string.Empty;

    [Range(1, long.MaxValue)]
    public long RunId { get; set; }

    [Range(1, int.MaxValue)]
    public int RunAttempt { get; set; }

    [Required]
    public string ArtifactName { get; set; } = string.Empty;

    public DateTimeOffset CompletedAtUtc { get; set; }
}

internal enum PreviewLoadState
{
    Registered,
    Loading,
    Ready,
    Failed,
    Evicted,
    Cancelled
}

internal sealed class PreviewProgress
{
    public long Version { get; set; }

    public string Stage { get; set; } = "Registered";

    public string Message { get; set; } = "A preview has been registered and will be prepared on demand.";

    public int Percent { get; set; }

    public int StagePercent { get; set; }

    public long? BytesDownloaded { get; set; }

    public long? BytesTotal { get; set; }

    public int? ItemsCompleted { get; set; }

    public int? ItemsTotal { get; set; }

    public string? ItemsLabel { get; set; }

    public DateTimeOffset UpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;
}

internal sealed class PreviewRecord
{
    public string RepositoryOwner { get; set; } = string.Empty;

    public string RepositoryName { get; set; } = string.Empty;

    public int PullRequestNumber { get; set; }

    public string HeadSha { get; set; } = string.Empty;

    public long RunId { get; set; }

    public int RunAttempt { get; set; }

    public string ArtifactName { get; set; } = string.Empty;

    public DateTimeOffset CompletedAtUtc { get; set; }

    public PreviewLoadState State { get; set; } = PreviewLoadState.Registered;

    public DateTimeOffset RegisteredAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset LastUpdatedAtUtc { get; set; } = DateTimeOffset.UtcNow;

    public DateTimeOffset? LastAccessedAtUtc { get; set; }

    public DateTimeOffset? ReadyAtUtc { get; set; }

    public string? ActiveDirectoryPath { get; set; }

    public string? LastError { get; set; }

    public PreviewProgress Progress { get; set; } = new();

    [JsonIgnore]
    public string PreviewPath => PreviewRoute.BuildPath(PullRequestNumber);

    public PreviewStatusSnapshot ToSnapshot() =>
        new()
        {
            RepositoryOwner = RepositoryOwner,
            RepositoryName = RepositoryName,
            PullRequestNumber = PullRequestNumber,
            HeadSha = HeadSha,
            State = State,
            Stage = Progress.Stage,
            Message = Progress.Message,
            Percent = Progress.Percent,
            StagePercent = Progress.StagePercent,
            Version = Progress.Version,
            BytesDownloaded = Progress.BytesDownloaded,
            BytesTotal = Progress.BytesTotal,
            ItemsCompleted = Progress.ItemsCompleted,
            ItemsTotal = Progress.ItemsTotal,
            ItemsLabel = Progress.ItemsLabel,
            Error = LastError,
            UpdatedAtUtc = Progress.UpdatedAtUtc,
            PreviewPath = PreviewPath,
            ActiveDirectoryPath = ActiveDirectoryPath
        };
}

internal sealed class PreviewStatusSnapshot
{
    public string RepositoryOwner { get; init; } = string.Empty;

    public string RepositoryName { get; init; } = string.Empty;

    public int PullRequestNumber { get; init; }

    public string HeadSha { get; init; } = string.Empty;

    public PreviewLoadState State { get; init; }

    public string Stage { get; init; } = string.Empty;

    public string Message { get; init; } = string.Empty;

    public int Percent { get; init; }

    public int StagePercent { get; init; }

    public long Version { get; init; }

    public long? BytesDownloaded { get; init; }

    public long? BytesTotal { get; init; }

    public int? ItemsCompleted { get; init; }

    public int? ItemsTotal { get; init; }

    public string? ItemsLabel { get; init; }

    public string? Error { get; init; }

    public DateTimeOffset UpdatedAtUtc { get; init; }

    public string PreviewPath { get; init; } = string.Empty;

    public string? ActiveDirectoryPath { get; init; }

    public bool IsReady => State == PreviewLoadState.Ready;
}

internal sealed record PreviewRegistrationResult(bool Accepted, PreviewStatusSnapshot Snapshot);

internal sealed record PreviewWorkItem(
    string RepositoryOwner,
    string RepositoryName,
    int PullRequestNumber,
    string HeadSha,
    long RunId,
    int RunAttempt,
    string ArtifactName,
    DateTimeOffset CompletedAtUtc);

internal sealed record ReadyPreviewCandidate(
    int PullRequestNumber,
    string ActiveDirectoryPath,
    DateTimeOffset SortKey);

internal sealed record PreviewDownloadProgress(long BytesDownloaded, long? BytesTotal);

internal sealed record GitHubArtifactDescriptor(
    string RepositoryOwner,
    string RepositoryName,
    long ArtifactId,
    string ArtifactName,
    DateTimeOffset ExpiresAtUtc,
    long? SizeInBytes = null);

internal sealed record PreviewDiscoveryResult(PreviewStatusSnapshot? Snapshot, string? FailureMessage = null);

internal sealed record GitHubPullRequestSummary(
    int PullRequestNumber,
    string Title,
    string HtmlUrl,
    string HeadSha,
    string? AuthorLogin,
    bool IsDraft,
    DateTimeOffset CreatedAtUtc,
    DateTimeOffset UpdatedAtUtc,
    bool HasSuccessfulPreviewBuild);
