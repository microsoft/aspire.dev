using Microsoft.Net.Http.Headers;
using System.Security.Cryptography;
using System.Text;

namespace StaticHost.HybridApiDocs;

internal sealed class HybridApiDocsRenderer(HttpClient client, HybridApiDocsArtifact artifact, HybridApiDocsEndpointPool endpoints,
    HybridApiDocsFlights flights, ILogger<HybridApiDocsRenderer> logger)
{
    internal const long MaximumBodySize = 64 * 1024 * 1024;
    private static readonly HashSet<string> ExcludedHeaders = new(StringComparer.OrdinalIgnoreCase)
    {
        "Connection", "Keep-Alive", "Transfer-Encoding", "Content-Length", "TE", "Trailer",
        "Upgrade", "Proxy-Authenticate", "Proxy-Authorization", "X-Aspire-Build-Id",
    };

    public async Task RenderAsync(HttpContext context)
    {
        var selection = context.Features.Get<HybridApiDocsRequest>();
        if (selection is null)
        {
            context.Response.StatusCode = StatusCodes.Status404NotFound;
            context.Response.Headers.CacheControl = "no-store";
            await NotFoundPage.WriteAsync(context);
            return;
        }

        // Pages never vary by query string, so it is not forwarded and cannot multiply renders.
        var image = selection.Representation == "image";
        var upstream = image ? selection.RendererPath + context.Request.QueryString : selection.RendererPath;

        // A page is immutable for a build, so a matching validator is answered without the renderer.
        var etag = selection.Representation is "html" or "markdown" ? ETagFor(selection.RendererPath) : null;
        if (etag is not null && IsNotModified(context.Request, etag))
        {
            context.Response.StatusCode = StatusCodes.Status304NotModified;
            context.Response.Headers.ETag = etag;
            context.Response.Headers.CacheControl = "no-cache";
            context.Response.Headers["X-Aspire-Build-Id"] = artifact.Manifest.BuildId;
            return;
        }

        HybridApiDocsResponse result;
        try
        {
            var flight = flights.Requests.GetOrAdd(upstream, key => new(() => FetchSharedAsync(key)));
            result = await flight.Value.WaitAsync(context.RequestAborted);
        }
        catch (OperationCanceledException) when (context.RequestAborted.IsCancellationRequested)
        {
            context.Abort();
            return;
        }

        if (result.Unavailable)
        {
            await HybridApiDocsErrorPages.WriteUnavailableAsync(context, result.Status);
            return;
        }

        var response = context.Response;
        response.StatusCode = result.Status;
        foreach (var (key, values) in result.Headers) response.Headers[key] = values;
        var vary = response.Headers.Vary.ToString().Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries)
            .Where(value => !value.Equals("X-Aspire-Cache-Bypass", StringComparison.OrdinalIgnoreCase)).ToArray();
        if (vary.Length == 0) response.Headers.Remove("Vary");
        else response.Headers.Vary = string.Join(", ", vary);
        if (selection.Representation == "markdown-negotiated")
        {
            response.Headers.CacheControl = "private, no-store";
            response.Headers.Vary = "Accept";
        }
        else if (result.Cacheable && etag is not null)
        {
            response.Headers.CacheControl = "no-cache";
            response.Headers.ETag = etag;
        }
        else
        {
            response.Headers.CacheControl = IsPrivate(result) ? "private, no-store" : "no-store";
        }
        response.Headers["X-Aspire-Build-Id"] = artifact.Manifest.BuildId;
        response.ContentLength = result.Body.Length;
        if (!HttpMethods.IsHead(context.Request.Method))
            await response.Body.WriteAsync(result.Body, context.RequestAborted);
        logger.LogInformation("Forwarded hybrid API {Path} ({Bytes} bytes, Astro cache {CacheStatus}) from build {BuildId}",
            selection.RendererPath, result.Body.Length, result.CacheStatus ?? "bypass", artifact.Manifest.BuildId);
    }

    public async Task<bool> IsReadyAsync(CancellationToken cancellationToken)
    {
        foreach (var candidate in endpoints.Candidates(""))
        {
            using var timeout = CancellationTokenSource.CreateLinkedTokenSource(cancellationToken);
            timeout.CancelAfter(TimeSpan.FromSeconds(2));
            try
            {
                using var response = await client.GetAsync(
                    new Uri(candidate.Address, "/__hybrid-api-docs/health"), HttpCompletionOption.ResponseHeadersRead, timeout.Token);
                if (response.IsSuccessStatusCode && MatchesBuild(response)) return true;
            }
            catch (OperationCanceledException) when (cancellationToken.IsCancellationRequested)
            {
                throw;
            }
            catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException)
            {
                logger.LogWarning(error, "Hybrid API readiness probe failed for {Endpoint}", candidate.Address);
            }
        }
        return false;
    }

    private async Task<HybridApiDocsResponse> FetchSharedAsync(string upstream)
    {
        // Yield so the in-flight entry is always registered before it can be removed.
        await Task.Yield();
        try
        {
            return await FetchAsync(upstream);
        }
        finally
        {
            flights.Requests.TryRemove(upstream, out _);
        }
    }

    private async Task<HybridApiDocsResponse> FetchAsync(string upstream)
    {
        // The shared render outlives any single caller, so only this deadline cancels it.
        using var timeout = new CancellationTokenSource(TimeSpan.FromSeconds(30));
        var candidates = endpoints.Candidates(upstream).ToArray();
        var timedOut = false;
        for (var index = 0; index < candidates.Length; index++)
        {
            using var attempt = CancellationTokenSource.CreateLinkedTokenSource(timeout.Token);
            attempt.CancelAfter(TimeSpan.FromSeconds(10));
            using var request = new HttpRequestMessage(HttpMethod.Get, new Uri(candidates[index].Address, upstream));
            request.Headers.Host = artifact.Site.Authority;
            request.Headers.TryAddWithoutValidation("X-Forwarded-Host", artifact.Site.Authority);
            request.Headers.TryAddWithoutValidation("X-Forwarded-Proto", artifact.Site.Scheme);
            try
            {
                using var response = await client.SendAsync(request, HttpCompletionOption.ResponseHeadersRead, attempt.Token);
                if (!MatchesBuild(response))
                    throw new HttpRequestException("The renderer and StaticHost have different build identities.");
                if ((int)response.StatusCode >= 500 && index < candidates.Length - 1)
                {
                    logger.LogWarning("Renderer {Endpoint} returned {Status}; trying another replica",
                        candidates[index].Address, (int)response.StatusCode);
                    continue;
                }
                await response.Content.LoadIntoBufferAsync(MaximumBodySize, attempt.Token);
                var body = await response.Content.ReadAsByteArrayAsync(attempt.Token);
                if ((int)response.StatusCode < 500) endpoints.MarkHealthy(candidates[index].Index);

                var excluded = new HashSet<string>(ExcludedHeaders, StringComparer.OrdinalIgnoreCase);
                foreach (var value in response.Headers.Connection) excluded.Add(value);
                var headers = response.Headers.Concat(response.Content.Headers)
                    .Where(header => !excluded.Contains(header.Key))
                    .Select(header => KeyValuePair.Create(header.Key, header.Value.ToArray())).ToArray();
                var status = (int)response.StatusCode;
                var privateOrCookie = response.Headers.CacheControl?.Private == true || response.Headers.Contains("Set-Cookie");
                return new HybridApiDocsResponse(status, headers, body, false, status is >= 200 and < 300 && !privateOrCookie);
            }
            catch (Exception error) when (error is HttpRequestException or IOException or OperationCanceledException)
            {
                timedOut = error is OperationCanceledException;
                endpoints.MarkFailed(candidates[index].Index);
                logger.LogWarning(error, "Hybrid API renderer {Endpoint} failed for {Path}", candidates[index].Address, upstream);
                if (timeout.IsCancellationRequested) break;
            }
        }
        logger.LogError("All hybrid API renderers failed for {Path}", upstream);
        return HybridApiDocsResponse.Failure(timedOut ? StatusCodes.Status504GatewayTimeout : StatusCodes.Status502BadGateway);
    }

    private static bool IsPrivate(HybridApiDocsResponse result) => result.Headers.Any(header =>
        header.Key.Equals("Cache-Control", StringComparison.OrdinalIgnoreCase)
        && header.Value.Any(value => value.Contains("private", StringComparison.OrdinalIgnoreCase)));

    private string ETagFor(string rendererPath)
    {
        var hash = SHA256.HashData(Encoding.UTF8.GetBytes($"{artifact.Manifest.BuildId}\n{rendererPath}"));
        return $"W/\"{Convert.ToHexStringLower(hash.AsSpan(0, 12))}\"";
    }

    private static bool IsNotModified(HttpRequest request, string etag)
    {
        var current = EntityTagHeaderValue.Parse(etag);
        return request.GetTypedHeaders().IfNoneMatch
            .Any(candidate => candidate == EntityTagHeaderValue.Any || candidate.Compare(current, useStrongComparison: false));
    }

    private bool MatchesBuild(HttpResponseMessage response)
        => response.Headers.TryGetValues("X-Aspire-Build-Id", out var ids)
            && ids.SequenceEqual([artifact.Manifest.BuildId]);
}
