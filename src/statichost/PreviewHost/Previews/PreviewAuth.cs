using System.Security.Claims;
using Microsoft.AspNetCore.Authorization;
using Microsoft.Extensions.Caching.Memory;

namespace PreviewHost.Previews;

internal static class PreviewAuthenticationDefaults
{
    public const string CookieScheme = "PreviewHostCookie";
    public const string GitHubScheme = "GitHub";
    public const string WriterPolicy = "PreviewWriter";
    public const string CsrfHeaderName = "X-Preview-Csrf";
    public const string CsrfRequestTokenCookieName = "previewhost-csrf";
    public const string UserLoginClaimType = "urn:github:login";
    public const string UserDisplayNameClaimType = "urn:github:name";
    public const string UserAvatarUrlClaimType = "urn:github:avatar_url";
    public const string UserProfileUrlClaimType = "urn:github:html_url";
}

internal sealed class PreviewWriterRequirement : IAuthorizationRequirement;

internal sealed class PreviewWriterAuthorizationHandler(PreviewUserAccessService accessService)
    : AuthorizationHandler<PreviewWriterRequirement>
{
    private readonly PreviewUserAccessService _accessService = accessService;

    protected override async Task HandleRequirementAsync(
        AuthorizationHandlerContext context,
        PreviewWriterRequirement requirement)
    {
        var login = context.User.FindFirstValue(PreviewAuthenticationDefaults.UserLoginClaimType)
            ?? context.User.FindFirstValue(ClaimTypes.Name);

        if (string.IsNullOrWhiteSpace(login))
        {
            return;
        }

        var access = await _accessService.GetAccessAsync(login, CancellationToken.None);
        if (access.HasWriteAccess)
        {
            context.Succeed(requirement);
        }
    }
}

internal sealed class PreviewUserAccessService(
    IMemoryCache cache,
    GitHubArtifactClient artifactClient,
    ILogger<PreviewUserAccessService> logger)
{
    private static readonly TimeSpan CacheDuration = TimeSpan.FromMinutes(5);
    private readonly IMemoryCache _cache = cache;
    private readonly GitHubArtifactClient _artifactClient = artifactClient;
    private readonly ILogger<PreviewUserAccessService> _logger = logger;

    public async Task<PreviewUserAccessResult> GetAccessAsync(string login, CancellationToken cancellationToken)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(login);

        var cacheKey = $"preview-user-access:{login}";
        if (_cache.TryGetValue(cacheKey, out PreviewUserAccessResult? cachedAccess) && cachedAccess is not null)
        {
            return cachedAccess;
        }

        var access = await _artifactClient.ReviewCollaboratorPermissionAsync(login, cancellationToken);
        _cache.Set(cacheKey, access, new MemoryCacheEntryOptions
        {
            AbsoluteExpirationRelativeToNow = CacheDuration
        });

        _logger.LogInformation(
            "Preview host access review for @{Login}: write access {HasWriteAccess} ({RoleName})",
            login,
            access.HasWriteAccess,
            access.RoleName ?? access.Permission ?? "unknown");

        return access;
    }
}

internal sealed record PreviewUserAccessResult(
    string Login,
    bool HasWriteAccess,
    string? RoleName,
    string? Permission);
