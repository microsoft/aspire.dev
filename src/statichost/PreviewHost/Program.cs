using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.Extensions.Options;
using PreviewHost.Previews;

var webJsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
webJsonOptions.Converters.Add(new JsonStringEnumConverter());
var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.ConfigureHttpJsonOptions(static options =>
{
    options.SerializerOptions.Converters.Add(new JsonStringEnumConverter());
});
builder.Services
    .AddOptions<PreviewHostOptions>()
    .Bind(builder.Configuration.GetSection(PreviewHostOptions.SectionName))
    .Validate(
        static options => options.HasGitHubToken || options.HasGitHubAppConfiguration,
        $"Either '{PreviewHostOptions.SectionName}:GitHubToken' or both '{PreviewHostOptions.SectionName}:GitHubAppId' and '{PreviewHostOptions.SectionName}:GitHubAppPrivateKey' must be configured.")
    .Validate(
        static options => options.HasValidExtractionMode,
        $"The '{PreviewHostOptions.SectionName}:ExtractionMode' setting must be either 'managed' or 'command-line'.")
    .Validate(
        static options => CommandLineExtractionSupport.IsConfigurationSupported(options),
        CommandLineExtractionSupport.GetConfigurationValidationMessage())
    .ValidateOnStart();
builder.Services.AddSingleton<GitHubArtifactClient>();
builder.Services.AddSingleton<PreviewStateStore>();
builder.Services.AddSingleton<PreviewCoordinator>();
builder.Services.AddSingleton<PreviewRequestDispatcher>();

var app = builder.Build();
var previewHostOptions = app.Services.GetRequiredService<IOptions<PreviewHostOptions>>().Value;

var previewStateStore = app.Services.GetRequiredService<PreviewStateStore>();
await previewStateStore.InitializeAsync(CancellationToken.None);
app.Logger.LogInformation(
    "PreviewHost GitHub authentication mode: {GitHubAuthenticationMode}",
    previewHostOptions.GetGitHubAuthenticationMode());
app.Logger.LogInformation(
    "PreviewHost artifact extraction mode: {ExtractionMode}",
    previewHostOptions.GetExtractionModeDescription());
app.Logger.LogInformation(
    "PreviewHost storage roots: state {StateRoot}, content {ContentRoot}",
    previewStateStore.StateRoot,
    previewStateStore.ContentRoot);
if (previewHostOptions.UseCommandLineExtraction
    && CommandLineExtractionSupport.TryResolveConfiguredTool(previewHostOptions, out var extractionToolPath))
{
    app.Logger.LogInformation(
        "PreviewHost command-line extractor resolved to: {ExtractionToolPath}",
        extractionToolPath);
}

if (!app.Environment.IsDevelopment())
{
    app.UseHsts();
}

app.UseHttpsRedirection();
app.UseExceptionHandler();
app.UseStaticFiles(new StaticFileOptions
{
    OnPrepareResponse = static context =>
    {
        if (context.Context.Request.Path.StartsWithSegments("/_preview", StringComparison.OrdinalIgnoreCase))
        {
            context.Context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        }
    }
});

app.Use(async (context, next) =>
{
    if ((HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method))
        && PreviewRoute.TryParseLegacy(context.Request.Path, out var legacyPullRequestNumber, out var legacyRelativePath))
    {
        context.Response.Redirect($"{PreviewRoute.BuildPath(legacyPullRequestNumber, legacyRelativePath)}{context.Request.QueryString}", permanent: false);
        return;
    }

    if ((HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method))
        && PreviewRoute.IsCollectionPath(context.Request.Path))
    {
        var indexDispatcher = context.RequestServices.GetRequiredService<PreviewRequestDispatcher>();
        await indexDispatcher.DispatchIndexAsync(context, context.RequestAborted);
        return;
    }

    if (!TryResolvePreviewRequest(context, out var pullRequestNumber, out var relativePath))
    {
        await next();
        return;
    }

    var dispatcher = context.RequestServices.GetRequiredService<PreviewRequestDispatcher>();
    await dispatcher.DispatchAsync(context, pullRequestNumber, relativePath, context.RequestAborted);
});

app.MapGet("/", () => Results.Redirect(PreviewRoute.CollectionPath));

app.MapHealthChecks("/healthz", new HealthCheckOptions
{
    AllowCachingResponses = false
});

app.MapGet(
    "/api/previews/recent",
    async (PreviewStateStore stateStore, IOptions<PreviewHostOptions> options, CancellationToken cancellationToken) =>
    {
        var snapshots = await stateStore.ListRecentSnapshotsAsync(options.Value.MaxActivePreviews, cancellationToken);
        return Results.Json(new
        {
            updatedAtUtc = DateTimeOffset.UtcNow,
            maxActivePreviews = options.Value.MaxActivePreviews,
            snapshots
        });
    });

app.MapGet(
    "/api/previews/catalog",
    async (GitHubArtifactClient gitHubArtifactClient, PreviewStateStore stateStore, IOptions<PreviewHostOptions> options, CancellationToken cancellationToken) =>
    {
        var openPullRequests = await gitHubArtifactClient.ListOpenPullRequestsAsync(cancellationToken);
        var trackedSnapshots = await stateStore.ListSnapshotsAsync(cancellationToken);
        var activePreviewCount = trackedSnapshots.Values.Count(static snapshot => snapshot.State is PreviewLoadState.Loading or PreviewLoadState.Ready);

        var entries = openPullRequests
            .Select(pullRequest => new
            {
                pullRequestNumber = pullRequest.PullRequestNumber,
                title = pullRequest.Title,
                pullRequestUrl = pullRequest.HtmlUrl,
                previewPath = PreviewRoute.BuildPath(pullRequest.PullRequestNumber),
                authorLogin = pullRequest.AuthorLogin,
                isDraft = pullRequest.IsDraft,
                headSha = pullRequest.HeadSha,
                hasSuccessfulPreviewBuild = pullRequest.HasSuccessfulPreviewBuild,
                createdAtUtc = pullRequest.CreatedAtUtc,
                updatedAtUtc = pullRequest.UpdatedAtUtc,
                preview = trackedSnapshots.TryGetValue(pullRequest.PullRequestNumber, out var snapshot) ? snapshot : null
            })
            .ToArray();

        return Results.Json(new
        {
            updatedAtUtc = DateTimeOffset.UtcNow,
            openPullRequestCount = entries.Length,
            previewablePullRequestCount = entries.Count(static entry => entry.hasSuccessfulPreviewBuild),
            maxActivePreviews = options.Value.MaxActivePreviews,
            activePreviewCount,
            entries
        });
    });

app.MapGet(
    "/api/previews/{pullRequestNumber:int}",
    async (int pullRequestNumber, PreviewStateStore stateStore, CancellationToken cancellationToken) =>
    {
        var snapshot = await stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
        return snapshot is null
            ? Results.NotFound()
            : Results.Json(snapshot);
    });

app.MapGet(
    "/api/previews/{pullRequestNumber:int}/bootstrap",
    async (int pullRequestNumber, PreviewCoordinator coordinator, IOptions<PreviewHostOptions> options, CancellationToken cancellationToken) =>
    {
        var result = await coordinator.BootstrapAsync(pullRequestNumber, cancellationToken);
        return result.Snapshot is null
            ? Results.Json(CreateUnavailablePreviewPayload(
                pullRequestNumber,
                options.Value,
                result.FailureMessage ?? "The preview host could not find a successful frontend build for this pull request yet."))
            : Results.Json(result.Snapshot);
    });

app.MapGet(
    "/api/previews/{pullRequestNumber:int}/events",
    async (HttpContext context, int pullRequestNumber, PreviewStateStore stateStore, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
    {
        context.Response.ContentType = "text/event-stream";
        context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";
        coordinator.EnsureLoading(pullRequestNumber);

        long lastVersion = -1;

        while (!cancellationToken.IsCancellationRequested)
        {
            var snapshot = await stateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
            if (snapshot is null)
            {
                var missingSnapshot = JsonSerializer.Serialize(
                    new PreviewStatusSnapshot
                    {
                        RepositoryOwner = string.Empty,
                        RepositoryName = string.Empty,
                        PullRequestNumber = pullRequestNumber,
                        State = PreviewLoadState.Failed,
                        Stage = "Missing",
                        Message = "No preview registration is available for this pull request.",
                        Percent = 0,
                        StagePercent = 0,
                        Version = lastVersion + 1,
                        Error = "No preview registration is available for this pull request.",
                        UpdatedAtUtc = DateTimeOffset.UtcNow,
                        PreviewPath = PreviewRoute.BuildPath(pullRequestNumber)
                    },
                    webJsonOptions);

                await context.Response.WriteAsync($"data: {missingSnapshot}\n\n", cancellationToken);
                break;
            }

            if (snapshot.Version != lastVersion)
            {
                var payload = JsonSerializer.Serialize(snapshot, webJsonOptions);
                await context.Response.WriteAsync($"data: {payload}\n\n", cancellationToken);
                await context.Response.Body.FlushAsync(cancellationToken);
                lastVersion = snapshot.Version;

                if (snapshot.IsReady || snapshot.State is PreviewLoadState.Failed or PreviewLoadState.Cancelled)
                {
                    break;
                }
            }

            await Task.Delay(TimeSpan.FromSeconds(1), cancellationToken);
        }
    });

app.MapPost(
    "/api/previews/{pullRequestNumber:int}/cancel",
    async (int pullRequestNumber, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
    {
        var snapshot = await coordinator.CancelAsync(pullRequestNumber, cancellationToken);
        return snapshot is null
            ? Results.NotFound()
            : Results.Json(snapshot);
    });

app.MapPost(
    "/api/previews/{pullRequestNumber:int}/retry",
    async (int pullRequestNumber, PreviewCoordinator coordinator, IOptions<PreviewHostOptions> options, CancellationToken cancellationToken) =>
    {
        var result = await coordinator.RetryAsync(pullRequestNumber, cancellationToken);
        return result.Snapshot is null
            ? Results.Json(CreateUnavailablePreviewPayload(
                pullRequestNumber,
                options.Value,
                result.FailureMessage ?? "The preview host could not find a successful frontend build for this pull request yet."))
            : Results.Json(result.Snapshot);
    });

app.MapPost(
    "/api/previews/{pullRequestNumber:int}/reset",
    async (int pullRequestNumber, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
    {
        var removed = await coordinator.ResetAsync(pullRequestNumber, cancellationToken);
        return removed
            ? Results.NoContent()
            : Results.NotFound();
    });

app.MapPost(
    "/api/previews/registrations",
    async (HttpContext context, PreviewRegistrationRequest request, PreviewStateStore stateStore, IOptions<PreviewHostOptions> options, CancellationToken cancellationToken) =>
    {
        if (!HasValidBearerToken(context.Request, options.Value.RegistrationToken))
        {
            return Results.Unauthorized();
        }

        if (!TryValidate(request, out var validationErrors))
        {
            return Results.ValidationProblem(validationErrors);
        }

        var result = await stateStore.RegisterAsync(request, cancellationToken);
        return Results.Json(new
        {
            accepted = result.Accepted,
            previewPath = PreviewRoute.BuildPath(request.PullRequestNumber),
            snapshot = result.Snapshot
        });
    });

app.MapDelete(
    "/api/previews/{pullRequestNumber:int}",
    async (HttpContext context, int pullRequestNumber, PreviewStateStore stateStore, IOptions<PreviewHostOptions> options, CancellationToken cancellationToken) =>
    {
        if (!HasValidBearerToken(context.Request, options.Value.RegistrationToken))
        {
            return Results.Unauthorized();
        }

        await stateStore.RemoveAsync(pullRequestNumber, cancellationToken);
        return Results.NoContent();
    });

await app.RunAsync();

static bool TryValidate(PreviewRegistrationRequest request, out Dictionary<string, string[]> validationErrors)
{
    var validationResults = new List<ValidationResult>();
    var validationContext = new ValidationContext(request);

    if (Validator.TryValidateObject(request, validationContext, validationResults, validateAllProperties: true))
    {
        validationErrors = [];
        return true;
    }

    validationErrors = validationResults
        .SelectMany(
            result => result.MemberNames.DefaultIfEmpty(string.Empty),
            static (result, memberName) => new { MemberName = memberName, result.ErrorMessage })
        .GroupBy(static item => item.MemberName, StringComparer.Ordinal)
        .ToDictionary(
            static group => group.Key,
            static group => group.Select(static item => item.ErrorMessage ?? "Validation failed.").ToArray(),
            StringComparer.Ordinal);

    return false;
}

static bool HasValidBearerToken(HttpRequest request, string expectedToken)
{
    if (string.IsNullOrWhiteSpace(expectedToken))
    {
        return false;
    }

    var authorizationHeader = request.Headers.Authorization.ToString();
    if (!authorizationHeader.StartsWith("Bearer ", StringComparison.OrdinalIgnoreCase))
    {
        return false;
    }

    var providedToken = authorizationHeader["Bearer ".Length..].Trim();
    var expectedBytes = Encoding.UTF8.GetBytes(expectedToken);
    var providedBytes = Encoding.UTF8.GetBytes(providedToken);

    return expectedBytes.Length == providedBytes.Length
        && CryptographicOperations.FixedTimeEquals(expectedBytes, providedBytes);
}

static object CreateUnavailablePreviewPayload(int pullRequestNumber, PreviewHostOptions options, string failureMessage) =>
    new
    {
        pullRequestNumber,
        state = "Missing",
        stage = "Missing",
        failureMessage,
        previewPath = PreviewRoute.BuildPath(pullRequestNumber),
        updatedAtUtc = DateTimeOffset.UtcNow,
        repositoryOwner = options.RepositoryOwner,
        repositoryName = options.RepositoryName
    };

static bool TryResolvePreviewRequest(HttpContext context, out int pullRequestNumber, out string relativePath)
{
    if (PreviewRoute.TryParse(context.Request.Path, out pullRequestNumber, out relativePath))
    {
        return true;
    }

    if (!HttpMethods.IsGet(context.Request.Method) && !HttpMethods.IsHead(context.Request.Method))
    {
        pullRequestNumber = default;
        relativePath = string.Empty;
        return false;
    }

    if (context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)
        || context.Request.Path.StartsWithSegments("/healthz", StringComparison.OrdinalIgnoreCase))
    {
        pullRequestNumber = default;
        relativePath = string.Empty;
        return false;
    }

    if (!TryGetPullRequestNumberFromReferer(context.Request, out pullRequestNumber))
    {
        relativePath = string.Empty;
        return false;
    }

    relativePath = GetRelativePreviewPath(context.Request.Path);
    return true;
}

static bool TryGetPullRequestNumberFromReferer(HttpRequest request, out int pullRequestNumber)
{
    pullRequestNumber = default;

    var refererHeader = request.Headers.Referer.ToString();
    if (string.IsNullOrWhiteSpace(refererHeader)
        || !Uri.TryCreate(refererHeader, UriKind.Absolute, out var refererUri))
    {
        return false;
    }

    var requestHost = request.Host.Host;
    if (!string.Equals(refererUri.Host, requestHost, StringComparison.OrdinalIgnoreCase))
    {
        return false;
    }

    if (request.Host.Port is { } requestPort && !refererUri.IsDefaultPort && refererUri.Port != requestPort)
    {
        return false;
    }

    return PreviewRoute.TryParse(refererUri.AbsolutePath, out pullRequestNumber, out _)
        || PreviewRoute.TryParseLegacy(refererUri.AbsolutePath, out pullRequestNumber, out _);
}

static string GetRelativePreviewPath(PathString requestPath)
{
    var pathValue = requestPath.Value;
    if (string.IsNullOrEmpty(pathValue) || pathValue == "/")
    {
        return string.Empty;
    }

    var relativePath = pathValue.TrimStart('/');
    if (pathValue.EndsWith('/') && !relativePath.EndsWith('/'))
    {
        relativePath = $"{relativePath}/";
    }

    return relativePath;
}
