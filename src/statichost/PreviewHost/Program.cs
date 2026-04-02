using System.Net.Http.Headers;
using System.Security.Claims;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Threading.RateLimiting;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Authentication.OAuth;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Diagnostics.HealthChecks;
using Microsoft.AspNetCore.RateLimiting;
using Microsoft.Extensions.Options;
using PreviewHost.Previews;

var webJsonOptions = new JsonSerializerOptions(JsonSerializerDefaults.Web);
webJsonOptions.Converters.Add(new JsonStringEnumConverter());

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddProblemDetails();
builder.Services.AddHealthChecks();
builder.Services.AddMemoryCache();
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
        static options => options.HasGitHubOAuthConfiguration,
        $"Both '{PreviewHostOptions.SectionName}:GitHubOAuthClientId' and '{PreviewHostOptions.SectionName}:GitHubOAuthClientSecret' must be configured.")
    .Validate(
        static options => options.HasValidExtractionMode,
        $"The '{PreviewHostOptions.SectionName}:ExtractionMode' setting must be either 'managed' or 'command-line'.")
    .Validate(
        static options => options.HasValidConfiguredBaseUrls,
        $"The '{PreviewHostOptions.SectionName}:ControlBaseUrl' and '{PreviewHostOptions.SectionName}:ContentBaseUrl' settings must be absolute http(s) URLs when provided.")
    .Validate(
        static options => options.HasValidSafetyLimits,
        $"The '{PreviewHostOptions.SectionName}' safety limits must all be positive values.")
    .Validate(
        static options => CommandLineExtractionSupport.IsConfigurationSupported(options),
        CommandLineExtractionSupport.GetConfigurationValidationMessage())
    .ValidateOnStart();

var authCookieDomain = builder.Configuration[$"{PreviewHostOptions.SectionName}:AuthCookieDomain"];

builder.Services
    .AddAuthentication(options =>
    {
        options.DefaultScheme = PreviewAuthenticationDefaults.CookieScheme;
        options.DefaultChallengeScheme = PreviewAuthenticationDefaults.GitHubScheme;
        options.DefaultSignInScheme = PreviewAuthenticationDefaults.CookieScheme;
    })
    .AddCookie(PreviewAuthenticationDefaults.CookieScheme, options =>
    {
        options.Cookie.Name = "previewhost-auth";
        options.Cookie.HttpOnly = true;
        options.Cookie.SameSite = SameSiteMode.Lax;
        options.Cookie.SecurePolicy = CookieSecurePolicy.Always;
        if (!string.IsNullOrWhiteSpace(authCookieDomain))
        {
            options.Cookie.Domain = authCookieDomain;
        }

        options.AccessDeniedPath = "/auth/access-denied";
        options.Events = new CookieAuthenticationEvents
        {
            OnRedirectToLogin = context => HandleCookieRedirectAsync(context, StatusCodes.Status401Unauthorized),
            OnRedirectToAccessDenied = context => HandleCookieRedirectAsync(context, StatusCodes.Status403Forbidden)
        };
    })
    .AddOAuth(PreviewAuthenticationDefaults.GitHubScheme, options =>
    {
        options.ClientId = builder.Configuration[$"{PreviewHostOptions.SectionName}:GitHubOAuthClientId"] ?? string.Empty;
        options.ClientSecret = builder.Configuration[$"{PreviewHostOptions.SectionName}:GitHubOAuthClientSecret"] ?? string.Empty;
        options.CallbackPath = "/signin-github";
        options.AuthorizationEndpoint = "https://github.com/login/oauth/authorize";
        options.TokenEndpoint = "https://github.com/login/oauth/access_token";
        options.UserInformationEndpoint = "https://api.github.com/user";
        options.SaveTokens = false;
        options.Scope.Add("read:user");
        options.CorrelationCookie.SameSite = SameSiteMode.Lax;
        options.CorrelationCookie.SecurePolicy = CookieSecurePolicy.Always;
        if (!string.IsNullOrWhiteSpace(authCookieDomain))
        {
            options.CorrelationCookie.Domain = authCookieDomain;
        }

        options.ClaimActions.MapJsonKey(ClaimTypes.NameIdentifier, "id");
        options.ClaimActions.MapJsonKey(ClaimTypes.Name, "login");
        options.ClaimActions.MapJsonKey(PreviewAuthenticationDefaults.UserLoginClaimType, "login");
        options.ClaimActions.MapJsonKey(PreviewAuthenticationDefaults.UserDisplayNameClaimType, "name");
        options.ClaimActions.MapJsonKey(PreviewAuthenticationDefaults.UserAvatarUrlClaimType, "avatar_url");
        options.ClaimActions.MapJsonKey(PreviewAuthenticationDefaults.UserProfileUrlClaimType, "html_url");

        options.Events = new OAuthEvents
        {
            OnCreatingTicket = async context =>
            {
                using var request = new HttpRequestMessage(HttpMethod.Get, context.Options.UserInformationEndpoint);
                request.Headers.Accept.Add(new MediaTypeWithQualityHeaderValue("application/json"));
                request.Headers.Authorization = new AuthenticationHeaderValue("Bearer", context.AccessToken);
                request.Headers.UserAgent.ParseAdd("aspire-dev-preview-host");

                using var response = await context.Backchannel.SendAsync(request, context.HttpContext.RequestAborted);
                response.EnsureSuccessStatusCode();

                await using var userInfoStream = await response.Content.ReadAsStreamAsync(context.HttpContext.RequestAborted);
                using var userDocument = await JsonDocument.ParseAsync(userInfoStream, cancellationToken: context.HttpContext.RequestAborted);
                context.RunClaimActions(userDocument.RootElement);
            }
        };
    });

builder.Services.AddAuthorization(options =>
{
    options.AddPolicy(
        PreviewAuthenticationDefaults.WriterPolicy,
        policy => policy
            .RequireAuthenticatedUser()
            .AddRequirements(new PreviewWriterRequirement()));
});

builder.Services.AddAntiforgery(options =>
{
    options.HeaderName = PreviewAuthenticationDefaults.CsrfHeaderName;
    options.FormFieldName = "__RequestVerificationToken";
});

builder.Services.AddRateLimiter(options =>
{
    options.RejectionStatusCode = StatusCodes.Status429TooManyRequests;
    options.AddPolicy(
        "preview-read",
        context => RateLimitPartition.GetFixedWindowLimiter(
            GetRateLimitPartitionKey(context, "read"),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 120,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.AddPolicy(
        "preview-write",
        context => RateLimitPartition.GetFixedWindowLimiter(
            GetRateLimitPartitionKey(context, "write"),
            _ => new FixedWindowRateLimiterOptions
            {
                PermitLimit = 30,
                Window = TimeSpan.FromMinutes(1),
                QueueLimit = 0,
                AutoReplenishment = true
            }));
    options.AddPolicy(
        "preview-events",
        context => RateLimitPartition.GetConcurrencyLimiter(
            GetRateLimitPartitionKey(context, "events"),
            _ => new ConcurrencyLimiterOptions
            {
                PermitLimit = 2,
                QueueLimit = 0
            }));
});

builder.Services.AddSingleton<GitHubArtifactClient>();
builder.Services.AddSingleton<PreviewStateStore>();
builder.Services.AddSingleton<PreviewCoordinator>();
builder.Services.AddSingleton<PreviewRequestDispatcher>();
builder.Services.AddSingleton<PreviewUserAccessService>();
builder.Services.AddSingleton<IAuthorizationHandler, PreviewWriterAuthorizationHandler>();

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
app.Logger.LogInformation(
    "PreviewHost content origin separation enabled: {HasSeparatedContentOrigin}",
    previewHostOptions.HasSeparatedContentOrigin);

if (previewHostOptions.HasSeparatedContentOrigin && !previewHostOptions.CanAuthenticateContentRequests)
{
    app.Logger.LogWarning(
        "PreviewHost is configured with a separate content origin, but '{SectionName}:AuthCookieDomain' is empty. Control routes stay writer-gated, but preview content remains public on the content origin until a shared cookie domain is configured.",
        PreviewHostOptions.SectionName);
}

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

app.UseAuthentication();
app.UseAuthorization();
app.UseRateLimiter();

app.Use(async (context, next) =>
{
    if (previewHostOptions.IsContentRequest(context.Request)
        && context.Request.Path.StartsWithSegments("/auth", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.Redirect(
            $"{previewHostOptions.BuildControlUrl(context.Request, context.Request.Path.Value ?? "/")}{context.Request.QueryString}",
            permanent: false);
        return;
    }

    if (previewHostOptions.IsContentRequest(context.Request)
        && context.Request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase))
    {
        context.Response.StatusCode = StatusCodes.Status404NotFound;
        return;
    }

    await next();
});

app.Use(async (context, next) =>
{
    if (ShouldIssueCsrfToken(context, previewHostOptions))
    {
        var antiforgery = context.RequestServices.GetRequiredService<IAntiforgery>();
        var tokens = antiforgery.GetAndStoreTokens(context);
        if (!string.IsNullOrWhiteSpace(tokens.RequestToken))
        {
            context.Response.Cookies.Append(
                PreviewAuthenticationDefaults.CsrfRequestTokenCookieName,
                tokens.RequestToken,
                CreateCsrfCookieOptions(previewHostOptions));
        }
    }

    await next();
});

app.Use(async (context, next) =>
{
    if ((HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method))
        && PreviewRoute.TryParseLegacy(context.Request.Path, out var legacyPullRequestNumber, out var legacyRelativePath))
    {
        var targetPath = PreviewRoute.BuildPath(legacyPullRequestNumber, legacyRelativePath);
        context.Response.Redirect(
            $"{previewHostOptions.BuildControlUrl(context.Request, targetPath)}{context.Request.QueryString}",
            permanent: false);
        return;
    }

    if ((HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method))
        && PreviewRoute.IsCollectionPath(context.Request.Path))
    {
        if (!previewHostOptions.IsContentRequest(context.Request)
            && !await EnsurePreviewWriterAccessAsync(context))
        {
            return;
        }

        var indexDispatcher = context.RequestServices.GetRequiredService<PreviewRequestDispatcher>();
        await indexDispatcher.DispatchIndexAsync(context, context.RequestAborted);
        return;
    }

    if (!TryResolvePreviewRequest(context, out var pullRequestNumber, out var relativePath))
    {
        await next();
        return;
    }

    var requiresWriterAccess = !previewHostOptions.IsContentRequest(context.Request)
        || previewHostOptions.CanAuthenticateContentRequests;
    if (requiresWriterAccess && !await EnsurePreviewWriterAccessAsync(context))
    {
        return;
    }

    var dispatcher = context.RequestServices.GetRequiredService<PreviewRequestDispatcher>();
    await dispatcher.DispatchAsync(context, pullRequestNumber, relativePath, context.RequestAborted);
});

app.MapGet("/", (HttpContext context) =>
    Results.Redirect(previewHostOptions.BuildControlUrl(context.Request, PreviewRoute.CollectionPath)));

app.MapGet(
    "/auth/login",
    (HttpContext context, string? returnUrl) =>
        Results.Challenge(
            new AuthenticationProperties
            {
                RedirectUri = NormalizeReturnUrl(returnUrl)
            },
            [PreviewAuthenticationDefaults.GitHubScheme]));

app.MapGet(
    "/auth/logout",
    async (HttpContext context, string? returnUrl) =>
    {
        await context.SignOutAsync(PreviewAuthenticationDefaults.CookieScheme);
        return Results.LocalRedirect(NormalizeReturnUrl(returnUrl));
    });

app.MapGet(
    "/auth/access-denied",
    () => Results.Content(
        BuildAccessDeniedPage(previewHostOptions),
        contentType: "text/html; charset=utf-8"));

app.MapHealthChecks("/healthz", new HealthCheckOptions
{
    AllowCachingResponses = false
});

var previewApi = app.MapGroup("/api/previews")
    .RequireAuthorization(PreviewAuthenticationDefaults.WriterPolicy);

previewApi.MapGet(
        "/session",
        (HttpContext context) =>
        {
            var login = context.User.FindFirstValue(PreviewAuthenticationDefaults.UserLoginClaimType)
                ?? context.User.FindFirstValue(ClaimTypes.Name)
                ?? string.Empty;
            var displayName = context.User.FindFirstValue(PreviewAuthenticationDefaults.UserDisplayNameClaimType);
            var avatarUrl = context.User.FindFirstValue(PreviewAuthenticationDefaults.UserAvatarUrlClaimType);
            var profileUrl = context.User.FindFirstValue(PreviewAuthenticationDefaults.UserProfileUrlClaimType);

            return Results.Json(new
            {
                viewer = new
                {
                    login,
                    displayName = string.IsNullOrWhiteSpace(displayName) ? login : displayName,
                    avatarUrl,
                    profileUrl
                },
                repositoryOwner = previewHostOptions.RepositoryOwner,
                repositoryName = previewHostOptions.RepositoryName,
                controlBaseUrl = previewHostOptions.GetControlBaseUrl(context.Request),
                contentBaseUrl = previewHostOptions.GetContentBaseUrl(context.Request),
                hasSeparatedContentOrigin = previewHostOptions.HasSeparatedContentOrigin,
                canAuthenticateContentRequests = previewHostOptions.CanAuthenticateContentRequests,
                signOutPath = $"/auth/logout?returnUrl={Uri.EscapeDataString(PreviewRoute.CollectionPath)}"
            });
        })
    .RequireRateLimiting("preview-read");

previewApi.MapGet(
        "/recent",
        async (CancellationToken cancellationToken) =>
        {
            var snapshots = await previewStateStore.ListRecentSnapshotsAsync(
                previewHostOptions.MaxActivePreviews,
                cancellationToken);
            return Results.Json(new
            {
                updatedAtUtc = DateTimeOffset.UtcNow,
                maxActivePreviews = previewHostOptions.MaxActivePreviews,
                snapshots
            });
        })
    .RequireRateLimiting("preview-read");

previewApi.MapGet(
        "/catalog",
        async (GitHubArtifactClient gitHubArtifactClient, CancellationToken cancellationToken) =>
        {
            var openPullRequests = await gitHubArtifactClient.ListOpenPullRequestsAsync(cancellationToken);
            var prunedCount = await previewStateStore.RemoveMissingAsync(
                openPullRequests.Select(static pullRequest => pullRequest.PullRequestNumber).ToArray(),
                cancellationToken);

            if (prunedCount > 0)
            {
                app.Logger.LogInformation("Removed {PrunedCount} closed pull request previews from the local preview state.", prunedCount);
            }

            var trackedSnapshots = await previewStateStore.ListSnapshotsAsync(cancellationToken);
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
                maxActivePreviews = previewHostOptions.MaxActivePreviews,
                activePreviewCount,
                entries
            });
        })
    .RequireRateLimiting("preview-read");

previewApi.MapGet(
        "/{pullRequestNumber:int}",
        async (int pullRequestNumber, CancellationToken cancellationToken) =>
        {
            var snapshot = await previewStateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
            return snapshot is null
                ? Results.NotFound()
                : Results.Json(snapshot);
        })
    .RequireRateLimiting("preview-read");

previewApi.MapGet(
        "/{pullRequestNumber:int}/bootstrap",
        async (HttpContext context, int pullRequestNumber, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
        {
            var result = await coordinator.BootstrapAsync(pullRequestNumber, cancellationToken);
            return result.Snapshot is null
                ? Results.NotFound(CreateUnavailablePreviewPayload(
                    pullRequestNumber,
                    previewHostOptions,
                    result.FailureMessage ?? "This preview hasn't been enabled yet."))
                : Results.Json(result.Snapshot);
        })
    .RequireRateLimiting("preview-read");

previewApi.MapGet(
        "/{pullRequestNumber:int}/events",
        async (HttpContext context, int pullRequestNumber, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
        {
            context.Response.ContentType = "text/event-stream";
            context.Response.Headers.CacheControl = "no-cache, no-store, must-revalidate";

            long lastVersion = -1;

            while (!cancellationToken.IsCancellationRequested)
            {
                var snapshot = await previewStateStore.GetSnapshotAsync(pullRequestNumber, cancellationToken);
                if (snapshot is null)
                {
                    var missingSnapshot = JsonSerializer.Serialize(
                        CreateUnavailablePreviewPayload(
                            pullRequestNumber,
                            previewHostOptions,
                            "This preview hasn't been enabled yet."),
                        webJsonOptions);

                    await context.Response.WriteAsync($"data: {missingSnapshot}\n\n", cancellationToken);
                    break;
                }

                if (snapshot.State is PreviewLoadState.Registered or PreviewLoadState.Loading)
                {
                    coordinator.EnsureLoading(pullRequestNumber);
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
        })
    .RequireRateLimiting("preview-events");

previewApi.MapPost(
        "/{pullRequestNumber:int}/prepare",
        async (HttpContext context, int pullRequestNumber, IAntiforgery antiforgery, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
        {
            await antiforgery.ValidateRequestAsync(context);
            var result = await coordinator.PrepareAsync(pullRequestNumber, cancellationToken);
            return result.Snapshot is null
                ? Results.NotFound(CreateUnavailablePreviewPayload(
                    pullRequestNumber,
                    previewHostOptions,
                    result.FailureMessage ?? "The preview host could not find a successful frontend build for this pull request yet."))
                : Results.Json(result.Snapshot);
        })
    .RequireRateLimiting("preview-write");

previewApi.MapPost(
        "/{pullRequestNumber:int}/cancel",
        async (HttpContext context, int pullRequestNumber, IAntiforgery antiforgery, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
        {
            await antiforgery.ValidateRequestAsync(context);
            var snapshot = await coordinator.CancelAsync(pullRequestNumber, cancellationToken);
            return snapshot is null
                ? Results.NotFound()
                : Results.Json(snapshot);
        })
    .RequireRateLimiting("preview-write");

previewApi.MapPost(
        "/{pullRequestNumber:int}/retry",
        async (HttpContext context, int pullRequestNumber, IAntiforgery antiforgery, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
        {
            await antiforgery.ValidateRequestAsync(context);
            var result = await coordinator.RetryAsync(pullRequestNumber, cancellationToken);
            return result.Snapshot is null
                ? Results.NotFound(CreateUnavailablePreviewPayload(
                    pullRequestNumber,
                    previewHostOptions,
                    result.FailureMessage ?? "The preview host could not find a successful frontend build for this pull request yet."))
                : Results.Json(result.Snapshot);
        })
    .RequireRateLimiting("preview-write");

previewApi.MapPost(
        "/{pullRequestNumber:int}/reset",
        async (HttpContext context, int pullRequestNumber, IAntiforgery antiforgery, PreviewCoordinator coordinator, CancellationToken cancellationToken) =>
        {
            await antiforgery.ValidateRequestAsync(context);
            var removed = await coordinator.ResetAsync(pullRequestNumber, cancellationToken);
            return removed
                ? Results.NoContent()
                : Results.NotFound();
        })
    .RequireRateLimiting("preview-write");

await app.RunAsync();

static Task HandleCookieRedirectAsync(RedirectContext<CookieAuthenticationOptions> context, int statusCode)
{
    if (IsApiRequest(context.Request))
    {
        context.Response.StatusCode = statusCode;
        return Task.CompletedTask;
    }

    context.Response.Redirect(context.RedirectUri);
    return Task.CompletedTask;
}

static bool IsApiRequest(HttpRequest request) =>
    request.Path.StartsWithSegments("/api", StringComparison.OrdinalIgnoreCase)
    || request.Headers.Accept.Any(static value => !string.IsNullOrEmpty(value) && value.Contains("application/json", StringComparison.OrdinalIgnoreCase));

static string NormalizeReturnUrl(string? returnUrl)
{
    if (string.IsNullOrWhiteSpace(returnUrl))
    {
        return PreviewRoute.CollectionPath;
    }

    return Uri.TryCreate(returnUrl, UriKind.Relative, out var relativeUri)
        ? relativeUri.ToString()
        : PreviewRoute.CollectionPath;
}

static bool ShouldIssueCsrfToken(HttpContext context, PreviewHostOptions options) =>
    (HttpMethods.IsGet(context.Request.Method) || HttpMethods.IsHead(context.Request.Method))
    && context.User.Identity?.IsAuthenticated == true
    && options.IsControlRequest(context.Request);

static CookieOptions CreateCsrfCookieOptions(PreviewHostOptions options)
{
    var cookieOptions = new CookieOptions
    {
        HttpOnly = false,
        IsEssential = true,
        SameSite = SameSiteMode.Strict,
        Secure = true,
        Path = "/"
    };

    if (!string.IsNullOrWhiteSpace(options.AuthCookieDomain))
    {
        cookieOptions.Domain = options.AuthCookieDomain;
    }

    return cookieOptions;
}

static async Task<bool> EnsurePreviewWriterAccessAsync(HttpContext context)
{
    var authorizationService = context.RequestServices.GetRequiredService<IAuthorizationService>();
    var authorizationResult = await authorizationService.AuthorizeAsync(
        context.User,
        resource: null,
        PreviewAuthenticationDefaults.WriterPolicy);

    if (authorizationResult.Succeeded)
    {
        return true;
    }

    if (context.User.Identity?.IsAuthenticated == true)
    {
        await context.ForbidAsync(PreviewAuthenticationDefaults.CookieScheme);
        return false;
    }

    await context.ChallengeAsync(
        PreviewAuthenticationDefaults.GitHubScheme,
        new AuthenticationProperties
        {
            RedirectUri = $"{context.Request.PathBase}{context.Request.Path}{context.Request.QueryString}"
        });

    return false;
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
        || context.Request.Path.StartsWithSegments("/auth", StringComparison.OrdinalIgnoreCase)
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

static string GetRateLimitPartitionKey(HttpContext context, string bucket)
{
    var login = context.User.FindFirstValue(PreviewAuthenticationDefaults.UserLoginClaimType)
        ?? context.User.FindFirstValue(ClaimTypes.Name)
        ?? context.Connection.RemoteIpAddress?.ToString()
        ?? "anonymous";

    return $"{bucket}:{login}";
}

static string BuildAccessDeniedPage(PreviewHostOptions options)
{
    var repositoryName = $"{options.RepositoryOwner}/{options.RepositoryName}";
    return $$"""
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1">
      <title>Preview access required</title>
      <style>
        :root {
          color-scheme: dark;
          --bg: #1f1e33;
          --panel: rgba(24, 24, 37, 0.94);
          --panel-border: rgba(160, 164, 171, 0.22);
          --text: #ffffff;
          --muted: #c6c8cc;
          --accent: #7455dd;
          --accent-strong: #512bd4;
        }

        * { box-sizing: border-box; }

        body {
          margin: 0;
          min-height: 100vh;
          display: grid;
          place-items: center;
          padding: 2rem 1rem;
          background:
            radial-gradient(circle at top, rgba(116, 85, 221, 0.14), transparent 24%),
            linear-gradient(180deg, #181825 0%, var(--bg) 18%, var(--bg) 100%);
          color: var(--text);
          font-family: "Poppins", "Segoe UI", system-ui, sans-serif;
        }

        main {
          width: min(34rem, 100%);
          padding: 1.75rem;
          border-radius: 1rem;
          border: 1px solid var(--panel-border);
          background: var(--panel);
          box-shadow: 0 1.5rem 3rem rgba(10, 11, 20, 0.46);
        }

        p {
          margin: 0.9rem 0 0;
          color: var(--muted);
          line-height: 1.6;
        }

        a {
          color: #fff;
          text-decoration: none;
          display: inline-flex;
          align-items: center;
          justify-content: center;
          min-height: 2.75rem;
          margin-top: 1.25rem;
          padding: 0.7rem 1rem;
          border-radius: 0.75rem;
          border: 1px solid rgba(198, 194, 242, 0.35);
          background: linear-gradient(180deg, var(--accent), var(--accent-strong));
          font-weight: 600;
        }
      </style>
    </head>
    <body>
      <main>
        <h1>Preview access required</h1>
        <p>Sign in with GitHub using an account that has write access to <strong>{{repositoryName}}</strong> to browse, prepare, or reset previews.</p>
        <p>Preview content is intentionally limited to trusted repository writers so the preview host no longer relies on unauthenticated control endpoints or automatic PR registration.</p>
        <a href="/auth/login?returnUrl={{Uri.EscapeDataString(PreviewRoute.CollectionPath)}}">Sign in with GitHub</a>
      </main>
    </body>
    </html>
    """;
}
