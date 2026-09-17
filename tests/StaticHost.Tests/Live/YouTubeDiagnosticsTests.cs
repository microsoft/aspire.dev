using System.Net.Sockets;
using System.Runtime.CompilerServices;
using Microsoft.Extensions.Logging;

namespace StaticHost.Tests.Live;

public sealed class YouTubeDiagnosticsTests
{
    [Theory]
    [InlineData("""{"error":{"errors":[{"reason":"quotaExceeded","domain":"youtube.quota"}],"message":"key=api-key secret verify-token"}}""", "quotaExceeded", "youtube.quota", false)]
    [InlineData("""{"error":{"errors":[{"reason":"api-key","domain":"verify-token"}]}}""", null, null, false)]
    [InlineData("""{"error":{"errors":[{"reason":"https://example.com/?key=api-key","domain":123}]}}""", null, null, false)]
    [InlineData("""{"error":[]}""", null, null, false)]
    [InlineData("""{"error":""", null, null, false)]
    [InlineData("<html>Temporarily unavailable api-key secret verify-token</html>", null, null, false)]
    [InlineData("Transient error; please try again later api-key secret verify-token", null, null, false)]
    [InlineData("oversized", null, null, true)]
    public async Task HttpFailure_ReportsOnlyBoundedSafeDiagnostics(
        string body, string? reason, string? domain, bool truncated)
    {
        if (truncated) body = new string('x', 5000) + "api-key secret verify-token";
        using var response = new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        {
            Content = new StringContent(body),
            ReasonPhrase = "api-key secret verify-token",
        };
        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            YouTubeDiagnostics.EnsureSuccessAsync(response, CancellationToken.None, "api-key", "secret", "verify-token"));
        var logger = new YouTubeRecordingLogger<YouTubeClient>();

        YouTubeDiagnostics.LogFailure(logger, exception, "WebSubSubscribe", YouTubeDiagnostics.SubscribeEndpoint);

        Assert.Equal(HttpStatusCode.ServiceUnavailable, exception.StatusCode);
        var entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Null(entry.Exception);
        Assert.False(entry.Fields.ContainsKey("SafeStackTrace"));
        Assert.Equal(503, entry.Fields["StatusCode"]);
        Assert.Equal("Service Unavailable", entry.Fields["StatusReason"]);
        Assert.Equal(reason, entry.Fields["ProviderReason"]);
        Assert.Equal(domain, entry.Fields["ProviderDomain"]);
        Assert.Equal(truncated, entry.Fields["BodyTruncated"]);
        Assert.DoesNotContain("api-key", entry.Message);
        Assert.DoesNotContain("verify-token", entry.Message);
        Assert.DoesNotContain("secret", entry.Message);
        Assert.DoesNotContain("<html>", entry.Message);
        Assert.True(entry.Message.Length < 1000);
        if (body.StartsWith("<html>", StringComparison.Ordinal))
            Assert.Equal("Provider reports temporary unavailability", entry.Fields["ProviderDetail"]);
        if (body.StartsWith("Transient error", StringComparison.Ordinal))
            Assert.Equal("Provider reports a transient error", entry.Fields["ProviderDetail"]);
    }

    [Theory]
    [InlineData(null, null, null)]
    [InlineData("120", 120d, null)]
    [InlineData("Wed, 16 Sep 2026 21:00:00 GMT", null, "2026-09-16T21:00:00Z")]
    [InlineData("api-key secret verify-token", null, null)]
    [InlineData("-120", null, null)]
    [InlineData("oversized", null, null)]
    public async Task HttpFailure_ReportsTypedRetryAfterWithoutRawHeaders(
        string? header, double? seconds, string? date)
    {
        using var response = new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        {
            Content = new StringContent("Transient error; please try again later"),
        };
        if (header == "oversized") header = new string('9', 5000) + "api-key secret verify-token";
        if (header is not null) response.Headers.TryAddWithoutValidation("Retry-After", header);
        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            YouTubeDiagnostics.EnsureSuccessAsync(response, CancellationToken.None, "api-key", "secret", "verify-token"));
        var logger = new YouTubeRecordingLogger<YouTubeClient>();

        YouTubeDiagnostics.LogFailure(logger, exception, "WebSubSubscribe", YouTubeDiagnostics.SubscribeEndpoint);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(seconds, entry.Fields["RetryAfterSeconds"]);
        Assert.Equal(date is null ? (DateTimeOffset?)null : DateTimeOffset.Parse(date), entry.Fields["RetryAfterDate"]);
        Assert.Equal("Provider reports a transient error", entry.Fields["ProviderDetail"]);
        Assert.DoesNotContain("api-key", entry.Message);
        Assert.DoesNotContain("secret", entry.Message);
        Assert.DoesNotContain("verify-token", entry.Message);
        Assert.True(entry.Message.Length < 1000);
    }

    [Fact]
    public void DenialClassification_DoesNotReadBeyondDiagnosticLimit()
    {
        var logger = new YouTubeRecordingLogger<YouTubeClient>();

        YouTubeDiagnostics.LogUntrustedDenial(
            logger, new string('x', 4096) + "Transient error", topicPresent: true, matchesConfiguredTopic: null);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(true, entry.Fields["BodyTruncated"]);
        Assert.Equal("Unrecognized provider response; body omitted", entry.Fields["ProviderDetail"]);
    }

    [Fact]
    public async Task UnreadableBody_DoesNotMaskHttpFailure()
    {
        using var response = new HttpResponseMessage(HttpStatusCode.BadGateway)
        {
            Content = new StreamContent(new UnreadableStream()),
        };
        response.Headers.RetryAfter = new System.Net.Http.Headers.RetryConditionHeaderValue(TimeSpan.FromSeconds(120));
        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            YouTubeDiagnostics.EnsureSuccessAsync(response, CancellationToken.None));
        var logger = new YouTubeRecordingLogger<YouTubeClient>();
        YouTubeDiagnostics.LogFailure(logger, exception, "OfflineDiscovery", YouTubeDiagnostics.SearchEndpoint);
        Assert.Equal(HttpStatusCode.BadGateway, exception.StatusCode);
        Assert.Equal("Response body could not be read; body omitted",
            Assert.Single(logger.Entries).Fields["ProviderDetail"]);
        Assert.Equal(120d, Assert.Single(logger.Entries).Fields["RetryAfterSeconds"]);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public void TransportFailure_ReportsCodesWithoutExceptionMessages(bool timeout)
    {
        Exception exception = timeout
            ? new TaskCanceledException("https://example.com/?key=secret")
            : new HttpRequestException(HttpRequestError.NameResolutionError, "key=secret",
                new SocketException((int)SocketError.HostNotFound));
        var logger = new YouTubeRecordingLogger<YouTubeClient>();

        YouTubeDiagnostics.LogFailure(logger, exception, "ChannelResolution", YouTubeDiagnostics.ChannelsEndpoint);

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(timeout, entry.Fields["IsTimeout"]);
        Assert.Null(entry.Exception);
        Assert.DoesNotContain("secret", entry.Message);
        if (!timeout)
        {
            Assert.Equal(HttpRequestError.NameResolutionError, entry.Fields["HttpRequestError"]);
            Assert.Equal(SocketError.HostNotFound, entry.Fields["SocketError"]);
        }
    }

    [Fact]
    public void UnexpectedFailure_ReportsRealStackFramesWithoutSecretMessages()
    {
        var exception = Assert.Throws<InvalidOperationException>(ThrowUnexpectedFailure);
        var logger = new YouTubeRecordingLogger<YouTubeClient>();

        YouTubeDiagnostics.LogFailure(logger, exception, "BackgroundTick", "local coordination/state");

        var entry = Assert.Single(logger.Entries);
        Assert.Equal(LogLevel.Error, entry.Level);
        Assert.Null(entry.Exception);
        var stack = Assert.IsType<string>(entry.Fields["SafeStackTrace"]);
        Assert.Contains(nameof(ThrowUnexpectedFailure), stack);
        Assert.DoesNotContain(".cs:", stack);
        Assert.DoesNotContain("api-key-secret", entry.Message);
        Assert.DoesNotContain("verify-token-secret", entry.Message);
        Assert.DoesNotContain("https://", entry.Message);
        Assert.DoesNotContain("Next subscription attempt", entry.Message);
        Assert.DoesNotContain("polling", entry.Message);
        Assert.Contains("worker will retry on its normal tick schedule", entry.Message);
    }

    [MethodImpl(MethodImplOptions.NoInlining)]
    private static void ThrowUnexpectedFailure() =>
        throw new InvalidOperationException("https://provider.example/?key=api-key-secret",
            new Exception("verify-token-secret"));

    [Fact]
    public async Task SubscriptionUnavailable_OfflineThenLive_DiscoveryHonorsQuotaAndReportsRecovery()
    {
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var searches = 0;
        var apiHandler = new RecordingHttpMessageHandler(_ =>
            LiveTestHelpers.JsonResponse(++searches == 1
                ? """{"items":[]}"""
                : """{"items":[{"id":{"videoId":"live-video"}}]}"""));
        var hubHandler = new RecordingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.ServiceUnavailable)
        {
            Content = new StringContent("<html>Temporarily unavailable</html>"),
        });
        var factory = new TestHttpClientFactory();
        factory.AddClient(YouTubeClient.HttpClientName, apiHandler);
        factory.AddClient(YouTubeClient.PubSubHttpClientName, hubHandler);
        var options = Options();
        var client = new YouTubeClient(factory, options, NullLogger<YouTubeClient>.Instance);
        var logger = new YouTubeRecordingLogger<YouTubeWebSubService>();
        using var broadcaster = LiveTestHelpers.CreateBroadcaster(timeProvider: time);
        using var service = new YouTubeWebSubService(client, broadcaster, options, logger, time,
            new YouTubeWebSubSubscriptionState(time), new SingleInstanceLiveStatusCoordination());

        await service.TickAsync(CancellationToken.None);
        Assert.False(broadcaster.Current.YouTube.Live);
        for (var tick = 1; tick < 15; tick++)
        {
            time.Advance(TimeSpan.FromMinutes(2));
            await service.TickAsync(CancellationToken.None);
            Assert.Equal(1, searches);
        }
        Assert.Equal(4, hubHandler.Requests.Count);
        time.Advance(TimeSpan.FromMinutes(2));
        await service.TickAsync(CancellationToken.None);

        Assert.Equal(2, searches);
        Assert.Equal(4, hubHandler.Requests.Count);
        Assert.True(broadcaster.Current.YouTube.Live);
        Assert.Equal("live-video", broadcaster.Current.YouTube.VideoId);
        var warnings = logger.Entries.Where(entry => entry.Level == LogLevel.Warning).ToArray();
        Assert.Equal(4, warnings.Length);
        Assert.All(warnings, entry =>
        {
            Assert.Equal("WebSubSubscribe", entry.Fields["Operation"]);
            Assert.Equal(503, entry.Fields["StatusCode"]);
            Assert.True(Assert.IsType<double>(entry.Fields["ElapsedMs"]) >= 0);
            Assert.NotNull(entry.Fields["RetryAt"]);
        });
        var checks = logger.Entries.Where(entry => entry.Level == LogLevel.Information &&
            Equals(entry.Fields["Operation"], "OfflineDiscovery")).ToArray();
        Assert.Equal(2, checks.Length);
        Assert.Equal(false, checks[0].Fields["LastDiscoveryLive"]);
        Assert.Equal(DateTimeOffset.UnixEpoch, checks[0].Fields["LastSuccessfulDiscoveryAt"]);
        Assert.Equal(true, checks[1].Fields["LastDiscoveryLive"]);
        Assert.Equal(time.GetUtcNow(), checks[1].Fields["LastSuccessfulDiscoveryAt"]);
    }

    [Fact]
    public async Task DiscoveryFailure_IsNotOffline_AndRetainsLastSuccessfulCheck()
    {
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var calls = 0;
        var handler = new RecordingHttpMessageHandler(_ => ++calls != 2
            ? LiveTestHelpers.JsonResponse("""{"items":[]}""")
            : new HttpResponseMessage(HttpStatusCode.Forbidden)
            {
                Content = new StringContent("""{"error":{"errors":[{"reason":"quotaExceeded","domain":"youtube.quota"}]}}"""),
            });
        var factory = new TestHttpClientFactory();
        factory.AddClient(YouTubeClient.HttpClientName, handler);
        var options = Options(webhookSecret: "");
        var client = new YouTubeClient(factory, options, NullLogger<YouTubeClient>.Instance);
        var logger = new YouTubeRecordingLogger<YouTubeWebSubService>();
        using var broadcaster = LiveTestHelpers.CreateBroadcaster(timeProvider: time);
        using var service = new YouTubeWebSubService(client, broadcaster, options, logger, time,
            new YouTubeWebSubSubscriptionState(time), new SingleInstanceLiveStatusCoordination());
        await service.TickAsync(CancellationToken.None);
        time.Advance(TimeSpan.FromMinutes(30));

        await Assert.ThrowsAsync<HttpRequestException>(() => service.TickAsync(CancellationToken.None));
        await service.TickAsync(CancellationToken.None);

        Assert.Equal(2, calls);
        var failure = Assert.Single(logger.Entries, entry => entry.Level == LogLevel.Warning);
        Assert.Equal("OfflineDiscovery", failure.Fields["Operation"]);
        Assert.Equal("quotaExceeded", failure.Fields["ProviderReason"]);
        Assert.Equal(DateTimeOffset.UnixEpoch, failure.Fields["LastSuccessfulDiscoveryAt"]);
        Assert.Equal(false, failure.Fields["LastDiscoveryLive"]);
        Assert.Single(logger.Entries, entry => entry.Level == LogLevel.Information);

        time.Advance(TimeSpan.FromMinutes(30));
        await service.TickAsync(CancellationToken.None);
        Assert.Equal(3, calls);
        var recovered = logger.Entries.Last();
        Assert.Equal(LogLevel.Information, recovered.Level);
        Assert.Equal(time.GetUtcNow(), recovered.Fields["LastSuccessfulDiscoveryAt"]);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task ChangedChannelSettings_ClearDiscoveryHistoryBeforeFailedResolution(bool changeConfiguredId)
    {
        var changed = false;
        var searches = 0;
        var handler = new RecordingHttpMessageHandler(request =>
        {
            if (changed) return new HttpResponseMessage(HttpStatusCode.ServiceUnavailable);
            if (request.RequestUri!.AbsolutePath.EndsWith("/channels", StringComparison.Ordinal))
                return LiveTestHelpers.JsonResponse("""{"items":[{"id":"old-channel"}]}""");
            searches++;
            return LiveTestHelpers.JsonResponse("""{"items":[]}""");
        });
        var factory = new TestHttpClientFactory();
        factory.AddClient(YouTubeClient.HttpClientName, handler);
        var options = Options(webhookSecret: "");
        options.CurrentValue.YouTube.ChannelId = changeConfiguredId ? "old-channel" : "";
        options.CurrentValue.YouTube.ChannelHandle = "@old-handle";
        var logger = new YouTubeRecordingLogger<YouTubeWebSubService>();
        using var broadcaster = LiveTestHelpers.CreateBroadcaster();
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        using var service = new YouTubeWebSubService(
            new YouTubeClient(factory, options, NullLogger<YouTubeClient>.Instance),
            broadcaster, options, logger, time, new YouTubeWebSubSubscriptionState(time),
            new SingleInstanceLiveStatusCoordination());
        await service.TickAsync(CancellationToken.None);
        var discovery = Assert.Single(logger.Entries, entry => Equals(entry.Fields["Operation"], "OfflineDiscovery"));
        Assert.Equal(DateTimeOffset.UnixEpoch, discovery.Fields["LastSuccessfulDiscoveryAt"]);
        Assert.Equal(false, discovery.Fields["LastDiscoveryLive"]);

        changed = true;
        if (changeConfiguredId)
            options.CurrentValue.YouTube.ChannelId = "";
        else
            options.CurrentValue.YouTube.ChannelHandle = "@new-handle";
        time.Advance(TimeSpan.FromMinutes(2));
        await Assert.ThrowsAsync<HttpRequestException>(() => service.TickAsync(CancellationToken.None));

        var failure = Assert.Single(logger.Entries, entry => entry.Level == LogLevel.Warning);
        Assert.Equal("ChannelResolution", failure.Fields["Operation"]);
        Assert.Null(failure.Fields["LastSuccessfulDiscoveryAt"]);
        Assert.Null(failure.Fields["LastDiscoveryLive"]);
        Assert.Equal(1, searches);
    }

    [Theory]
    [InlineData("ChannelResolution", YouTubeDiagnostics.ChannelsEndpoint)]
    [InlineData("KnownVideoStatus", YouTubeDiagnostics.VideosEndpoint)]
    [InlineData("NotificationChannelResolution", YouTubeDiagnostics.ChannelsEndpoint)]
    [InlineData("NotificationConfirmation", YouTubeDiagnostics.SearchEndpoint)]
    public async Task FailedChecks_IdentifyOperationAndEndpoint_WithoutChangingState(string operation, string endpoint)
    {
        var handler = new RecordingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.Forbidden)
        {
            Content = new StringContent("""{"error":{"errors":[{"reason":"accessNotConfigured","domain":"usageLimits"}]}}"""),
        });
        var factory = new TestHttpClientFactory();
        factory.AddClient(YouTubeClient.HttpClientName, handler);
        var options = Options(webhookSecret: "");
        if (operation.EndsWith("ChannelResolution", StringComparison.Ordinal))
            options.CurrentValue.YouTube.ChannelId = "";
        var client = new YouTubeClient(factory, options, NullLogger<YouTubeClient>.Instance);
        var logger = new YouTubeRecordingLogger<YouTubeWebSubService>();
        using var broadcaster = LiveTestHelpers.CreateBroadcaster();
        if (operation == "KnownVideoStatus")
            broadcaster.Update(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "video") });
        var before = broadcaster.Current;
        using var service = new YouTubeWebSubService(client, broadcaster, options, logger,
            new FakeTimeProvider(), new YouTubeWebSubSubscriptionState(), new SingleInstanceLiveStatusCoordination());

        var exception = await Assert.ThrowsAsync<HttpRequestException>(() =>
            operation.StartsWith("Notification", StringComparison.Ordinal)
                ? LiveStatusEndpointRouteBuilderExtensions.ConfirmYouTubeLiveStatusAsync(
                    options.CurrentValue.YouTube, client, broadcaster, logger, CancellationToken.None)
                : service.TickAsync(CancellationToken.None));
        YouTubeDiagnostics.LogFailure(logger, exception, "BackgroundTick", "local coordination/state", skipIfLogged: true);

        Assert.Equal(before, broadcaster.Current);
        Assert.Single(handler.Requests);
        var failure = Assert.Single(logger.Entries);
        Assert.Equal(operation, failure.Fields["Operation"]);
        Assert.Equal(endpoint, failure.Fields["Endpoint"]);
        Assert.Equal(403, failure.Fields["StatusCode"]);
        Assert.True(Assert.IsType<double>(failure.Fields["ElapsedMs"]) >= 0);
        Assert.Equal("accessNotConfigured", failure.Fields["ProviderReason"]);
        Assert.Null(failure.Exception);
        Assert.False(failure.Fields.ContainsKey("SafeStackTrace"));
        Assert.DoesNotContain("Next subscription attempt", failure.Message);
        Assert.DoesNotContain("polling", failure.Message);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public async Task SubscriptionAcceptance_DoesNotReportVerifiedLeaseEvenIfPersistenceFails(bool failPersistence)
    {
        var factory = new TestHttpClientFactory();
        factory.AddClient(YouTubeClient.HttpClientName,
            new RecordingHttpMessageHandler(_ => LiveTestHelpers.JsonResponse("""{"items":[]}""")));
        factory.AddClient(YouTubeClient.PubSubHttpClientName,
            new RecordingHttpMessageHandler(_ => new HttpResponseMessage(HttpStatusCode.Accepted)));
        var options = Options();
        var logger = new YouTubeRecordingLogger<YouTubeWebSubService>();
        var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
        var state = new YouTubeWebSubSubscriptionState(time)
        {
            MarkRequestSentException = failPersistence ? new IOException("State persistence failed") : null,
        };
        using var broadcaster = LiveTestHelpers.CreateBroadcaster();
        using var service = new YouTubeWebSubService(
            new YouTubeClient(factory, options, NullLogger<YouTubeClient>.Instance),
            broadcaster, options, logger, time, state, new SingleInstanceLiveStatusCoordination());

        if (failPersistence)
        {
            var failure = await Assert.ThrowsAsync<IOException>(() => service.TickAsync(CancellationToken.None));
            Assert.Same(state.MarkRequestSentException, failure);
        }
        else
        {
            await service.TickAsync(CancellationToken.None);
        }

        var accepted = Assert.Single(logger.Entries, entry => Equals(entry.Fields["Operation"], "WebSubSubscribe"));
        Assert.Equal(LogLevel.Information, accepted.Level);
        Assert.Equal(time.GetUtcNow(), accepted.Fields["AcceptedAt"]);
        Assert.True(Assert.IsType<double>(accepted.Fields["ElapsedMs"]) >= 0);
        Assert.Contains("HTTP acceptance does not establish a verified lease", accepted.Message);
        Assert.Equal(DateTimeOffset.MinValue, await state.GetRenewAtAsync());
    }

    private static TestOptionsMonitor<LiveStatusOptions> Options(string webhookSecret = "secret") =>
        new(new LiveStatusOptions
        {
            PublicBaseUrl = "https://example.com",
            YouTube = new YouTubeOptions { ApiKey = "api-key", ChannelId = "channel", WebhookSecret = webhookSecret },
        });

    private sealed class UnreadableStream : MemoryStream
    {
        public override ValueTask<int> ReadAsync(Memory<byte> buffer, CancellationToken cancellationToken = default) =>
            ValueTask.FromException<int>(new IOException("key=secret"));
    }
}

internal sealed class YouTubeRecordingLogger<T> : ILogger<T>
{
    internal sealed record Entry(LogLevel Level, Exception? Exception, string Message, Dictionary<string, object?> Fields);
    public List<Entry> Entries { get; } = [];
    public IDisposable? BeginScope<TState>(TState state) where TState : notnull => null;
    public bool IsEnabled(LogLevel logLevel) => true;
    public void Log<TState>(LogLevel logLevel, EventId eventId, TState state,
        Exception? exception, Func<TState, Exception?, string> formatter) =>
        Entries.Add(new(logLevel, exception, formatter(state, exception),
            ((IEnumerable<KeyValuePair<string, object?>>)state!).ToDictionary(pair => pair.Key, pair => pair.Value)));
}
