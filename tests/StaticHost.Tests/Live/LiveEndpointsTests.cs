using System.Net.Http.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;

namespace StaticHost.Tests.Live;

public sealed class LiveEndpointsTests
{
    [Fact]
    public async Task Snapshot_ReturnsCanonicalJsonAndDisablesCaching()
    {
        await using var server = await LiveHttpServer.StartAsync();
        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            YouTube = new YouTubeStatus(true, "video-123"),
        });

        using var response = await server.Client.GetAsync("/api/live");
        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoStore(response);
        Assert.Equal("application/json", response.Content.Headers.ContentType?.MediaType);
        var snapshot = await response.Content.ReadFromJsonAsync<LiveStatus>();
        Assert.NotNull(snapshot);
        Assert.True(snapshot.IsLive);
        Assert.Equal("video-123", snapshot.YouTube.VideoId);
    }

    [Fact]
    public async Task Stream_ReturnsSseHeadersAndStopsWhenHttpClientDisconnects()
    {
        await using var server = await LiveHttpServer.StartAsync();
        using var disconnect = new CancellationTokenSource(TimeSpan.FromSeconds(10));
        using var request = new HttpRequestMessage(HttpMethod.Get, "/api/live/stream");
        using var response = await server.Client.SendAsync(
            request, HttpCompletionOption.ResponseHeadersRead, disconnect.Token);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoStore(response);
        Assert.Equal("text/event-stream", response.Content.Headers.ContentType?.MediaType);
        Assert.Equal("no", Assert.Single(response.Headers.GetValues("X-Accel-Buffering")));
        using var reader = new StreamReader(await response.Content.ReadAsStreamAsync(disconnect.Token));
        Assert.Equal("event: state", await reader.ReadLineAsync(disconnect.Token));
        Assert.StartsWith("data: ", await reader.ReadLineAsync(disconnect.Token));
        Assert.Equal("", await reader.ReadLineAsync(disconnect.Token));

        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            Twitch = new TwitchStatus(true, "aspiredotdev", null),
        });
        Assert.Equal("event: state", await reader.ReadLineAsync(disconnect.Token));
        Assert.Contains("\"isLive\":true", await reader.ReadLineAsync(disconnect.Token));

        reader.Dispose();
        response.Dispose();
        await disconnect.CancelAsync();
        await server.StreamEnded.Task.WaitAsync(TimeSpan.FromSeconds(10));
    }

    [Theory]
    [InlineData("Production", true, true, HttpStatusCode.NotFound)]
    [InlineData("Development", false, true, HttpStatusCode.NotFound)]
    [InlineData("Development", true, false, HttpStatusCode.Unauthorized)]
    public async Task DevSet_EnforcesEnvironmentFlagAndSecret(
        string environment, bool enabled, bool correctSecret, HttpStatusCode expected)
    {
        await using var server = await LiveHttpServer.StartAsync(environment, enabled);
        using var request = DevRequest(correctSecret);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(expected, response.StatusCode);
        AssertNoStore(response);
        Assert.False((await server.Broadcaster.GetCurrentAsync()).IsLive);
    }

    [Fact]
    public async Task DevSet_BindsBothProvidersAndReturnsUpdatedSnapshot()
    {
        await using var server = await LiveHttpServer.StartAsync(Environments.Development);
        using var request = DevRequest(correctSecret: true);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoStore(response);
        var snapshot = await response.Content.ReadFromJsonAsync<LiveStatus>();
        Assert.NotNull(snapshot);
        Assert.True(snapshot.Twitch.Live);
        Assert.True(snapshot.YouTube.Live);
        Assert.Equal("video-123", snapshot.YouTube.VideoId);
    }

    [Fact]
    public async Task TwitchVerification_EchoesChallengeOnEverySignedRetry()
    {
        await using var server = await LiveHttpServer.StartAsync();
        for (var i = 0; i < 2; i++)
        {
            using var request = TwitchRequest(
                server, "webhook_callback_verification", """{"challenge":"verify-me"}""");
            using var response = await server.Client.SendAsync(request);
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            AssertNoStore(response);
            Assert.Equal("text/plain", response.Content.Headers.ContentType?.MediaType);
            Assert.Equal("verify-me", await response.Content.ReadAsStringAsync());
        }
    }

    [Theory]
    [InlineData("missing", HttpStatusCode.BadRequest)]
    [InlineData("signature", HttpStatusCode.Unauthorized)]
    [InlineData("stale", HttpStatusCode.Unauthorized)]
    public async Task TwitchWebhook_RejectsInvalidRequests(string invalid, HttpStatusCode expected)
    {
        await using var server = await LiveHttpServer.StartAsync();
        using var request = TwitchRequest(server, "notification",
            """{"subscription":{"type":"stream.online"},"event":{"broadcaster_user_login":"aspiredotdev"}}""",
            stale: invalid == "stale");
        if (invalid == "missing")
        {
            request.Headers.Remove("Twitch-Eventsub-Message-Id");
        }
        else if (invalid == "signature")
        {
            request.Headers.Remove("Twitch-Eventsub-Message-Signature");
            request.Headers.Add("Twitch-Eventsub-Message-Signature", "sha256=invalid");
        }

        using var response = await server.Client.SendAsync(request);
        Assert.Equal(expected, response.StatusCode);
        AssertNoStore(response);
        Assert.False((await server.Broadcaster.GetCurrentAsync()).IsLive);
    }

    [Fact]
    public async Task TwitchNotification_UpdatesStateAndSuppressesCompletedMessageReplay()
    {
        await using var server = await LiveHttpServer.StartAsync();
        const string body = """
            {"subscription":{"type":"stream.online"},"event":{"broadcaster_user_login":"aspiredotdev"}}
            """;
        using (var request = TwitchRequest(server, "notification", body))
        using (var response = await server.Client.SendAsync(request))
        {
            Assert.Equal(HttpStatusCode.OK, response.StatusCode);
            Assert.True((await server.Broadcaster.GetCurrentAsync()).Twitch.Live);
        }

        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            Twitch = new TwitchStatus(false, "aspiredotdev", null),
        });
        using var replay = TwitchRequest(server, "notification", body);
        using var replayResponse = await server.Client.SendAsync(replay);
        Assert.Equal(HttpStatusCode.OK, replayResponse.StatusCode);
        AssertNoStore(replayResponse);
        Assert.False((await server.Broadcaster.GetCurrentAsync()).Twitch.Live);
        Assert.Contains(server.Logs.Entries, entry =>
            entry.Fields.TryGetValue("MessageId", out var id) && Equals(id, "test-message-1"));
    }

    [Fact]
    public async Task TwitchWebhook_SignedUnparseableTimestamp_IsRejectedWithSanitizedHeader()
    {
        await using var server = await LiveHttpServer.StartAsync();
        using var request = TwitchRequest(server, "notification", "{}",
            timestamp: LiveTestHelpers.LogInjectionPayload);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        AssertNoStore(response);
        Assert.False((await server.Broadcaster.GetCurrentAsync()).IsLive);
        var entry = Assert.Single(server.Logs.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Equal("payload-sentinel__forged-line___", entry.Fields["Timestamp"]);
        Assert.Equal("Twitch webhook timestamp payload-sentinel__forged-line___ (sanitized) is stale or unparseable; rejecting.",
            entry.Message);
        Assert.Null(entry.Exception);
        Assert.Equal(2, entry.Fields.Count);
    }

    [Theory]
    [InlineData(-11)]
    [InlineData(5)]
    public async Task TwitchWebhook_RejectedTimestamp_RetainsDiagnosticValue(int minutesFromNow)
    {
        await using var server = await LiveHttpServer.StartAsync();
        var timestamp = server.Time.GetUtcNow().AddMinutes(minutesFromNow).ToString("O");
        using var request = TwitchRequest(server, "notification", "{}", timestamp: timestamp);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.Unauthorized, response.StatusCode);
        AssertNoStore(response);
        var entry = Assert.Single(server.Logs.Entries);
        Assert.Equal(timestamp, entry.Fields["Timestamp"]);
        Assert.Contains(timestamp, entry.Message);
        LiveTestHelpers.AssertSafeLogs(server.Logs);
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task TwitchWebhook_SignedDuplicateId_IsLoggedSafely(bool completed)
    {
        await using var server = await LiveHttpServer.StartAsync();
        const string messageId = LiveTestHelpers.LogInjectionPayload;
        var acquisition = await server.Coordination.AcquireTwitchMessageAsync(messageId);
        Assert.Equal(TwitchMessageAcquisitionStatus.Acquired, acquisition.Status);
        await using (var lease = Assert.IsAssignableFrom<ITwitchMessageLease>(acquisition.Lease))
        {
            if (completed) await lease.CompleteAsync();
            using var request = TwitchRequest(server, "notification", "{}", messageId: messageId);
            using var response = await server.Client.SendAsync(request);

            Assert.Equal(completed ? HttpStatusCode.OK : HttpStatusCode.ServiceUnavailable, response.StatusCode);
            AssertNoStore(response);
            Assert.False((await server.Broadcaster.GetCurrentAsync()).IsLive);
            var entry = Assert.Single(server.Logs.Entries);
            Assert.Equal(LogLevel.Debug, entry.Level);
            Assert.Contains(completed ? "replay ignored" : "already being processed", entry.Message);
            Assert.Equal("payload-sentinel__forged-line___", entry.Fields["MessageId"]);
            Assert.Equal(completed
                ? "Twitch webhook replay ignored for message payload-sentinel__forged-line___."
                : "Twitch webhook message payload-sentinel__forged-line___ is already being processed; asking Twitch to retry.",
                entry.Message);
            Assert.Null(entry.Exception);
            Assert.Equal(2, entry.Fields.Count);
        }

        server.Logs.Entries.Clear();
        using var retry = TwitchRequest(server, "notification",
            """{"subscription":{"type":"stream.online"},"event":{"broadcaster_user_login":"aspiredotdev"}}""",
            messageId: messageId);
        using var retryResponse = await server.Client.SendAsync(retry);
        Assert.Equal(HttpStatusCode.OK, retryResponse.StatusCode);
        Assert.Equal(!completed, (await server.Broadcaster.GetCurrentAsync()).Twitch.Live);
        if (completed)
        {
            var entry = Assert.Single(server.Logs.Entries);
            Assert.Equal("payload-sentinel__forged-line___", entry.Fields["MessageId"]);
            Assert.Equal("Twitch webhook replay ignored for message payload-sentinel__forged-line___.", entry.Message);
            Assert.Null(entry.Exception);
            Assert.Equal(2, entry.Fields.Count);
        }
        else
        {
            LiveTestHelpers.AssertSafeLogs(server.Logs);
        }
    }

    [Theory]
    [InlineData(true)]
    [InlineData(false)]
    public async Task TwitchWebhook_SignedRevocationAndUnknownType_LogSafely(bool revocation)
    {
        await using var server = await LiveHttpServer.StartAsync();
        var before = await server.Broadcaster.GetStateAsync();
        using var request = TwitchRequest(
            server, revocation ? "revocation" : LiveTestHelpers.LogInjectionPayload,
            LiveTestHelpers.LogInjectionPayload);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(revocation ? HttpStatusCode.NoContent : HttpStatusCode.OK, response.StatusCode);
        AssertNoStore(response);
        Assert.Equal(before, await server.Broadcaster.GetStateAsync());
        var entry = Assert.Single(server.Logs.Entries);
        Assert.Equal(revocation ? LogLevel.Warning : LogLevel.Debug, entry.Level);
        Assert.Contains(revocation ? "subscription revoked" : "unknown message type", entry.Message);
        if (revocation)
        {
            LiveTestHelpers.AssertSafeLogs(server.Logs);
        }
        else
        {
            Assert.Equal("payload-sentinel__forged-line___", entry.Fields["MessageType"]);
            Assert.Equal("Twitch webhook of unknown message type payload-sentinel__forged-line___ (sanitized).",
                entry.Message);
            Assert.Null(entry.Exception);
            Assert.Equal(2, entry.Fields.Count);
        }
    }

    [Fact]
    public async Task YouTubeVerification_RetriesEchoNewChallengeWithoutExtendingRenewal()
    {
        await using var server = await LiveHttpServer.StartAsync();
        var pending = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await server.Subscriptions.TryBeginSubscriptionAsync("channel-123", server.Time.GetUtcNow()));
        using var first = await server.Client.GetAsync(VerificationUrl(pending, "first"));
        Assert.Equal(HttpStatusCode.OK, first.StatusCode);
        AssertNoStore(first);
        Assert.Equal("first", await first.Content.ReadAsStringAsync());
        var renewAt = await server.Subscriptions.GetRenewAtAsync();

        server.Time.Advance(TimeSpan.FromMinutes(1));
        using var retry = await server.Client.GetAsync(VerificationUrl(pending, "retry"));
        Assert.Equal(HttpStatusCode.OK, retry.StatusCode);
        AssertNoStore(retry);
        Assert.Equal("retry", await retry.Content.ReadAsStringAsync());
        Assert.Equal(renewAt, await server.Subscriptions.GetRenewAtAsync());
        LiveTestHelpers.AssertSafeLogs(server.Logs, pending.Topic, pending.VerifyToken);
    }

    [Theory]
    [InlineData("challenge", HttpStatusCode.BadRequest)]
    [InlineData("lease", HttpStatusCode.BadRequest)]
    [InlineData("token", HttpStatusCode.NotFound)]
    [InlineData("mode", HttpStatusCode.NotFound)]
    public async Task YouTubeVerification_RejectsMalformedOrUnsolicitedConfirmation(
        string invalid, HttpStatusCode expected)
    {
        await using var server = await LiveHttpServer.StartAsync();
        var pending = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await server.Subscriptions.TryBeginSubscriptionAsync("channel-123", server.Time.GetUtcNow()));
        var url = VerificationUrl(
            invalid == "token" ? pending with { VerifyToken = "wrong-token" } : pending,
            invalid == "challenge" ? "" : "challenge",
            invalid == "lease" ? "invalid" : "432000",
            invalid == "mode" ? "unsubscribe" : "subscribe");
        using var response = await server.Client.GetAsync(url);

        Assert.Equal(expected, response.StatusCode);
        AssertNoStore(response);
        Assert.Equal(DateTimeOffset.MinValue, await server.Subscriptions.GetRenewAtAsync());
    }

    [Theory]
    [InlineData("mode", true)]
    [InlineData("unsubscribe", true)]
    [InlineData("missing-topic", true)]
    [InlineData("topic", true)]
    [InlineData("topic", false)]
    [InlineData("token", true)]
    public async Task YouTubeVerification_RejectionLogsOnlyClassificationsAndSafeFields(
        string invalid, bool configured)
    {
        const string invalidVerifyToken = "verification-secret-sentinel\r\nforged-line\u0085\u2028\u2029";
        await using var server = await LiveHttpServer.StartAsync(youtubeConfigured: configured);
        var pending = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await server.Subscriptions.TryBeginSubscriptionAsync("channel-123", server.Time.GetUtcNow()));
        var mode = invalid switch
        {
            "mode" => LiveTestHelpers.LogInjectionPayload,
            "unsubscribe" => "unsubscribe",
            _ => "subscribe",
        };
        var submitted = pending with
        {
            Topic = invalid switch
            {
                "missing-topic" => "",
                "token" => pending.Topic,
                _ => LiveTestHelpers.LogInjectionPayload,
            },
            VerifyToken = invalid == "token" ? invalidVerifyToken : pending.VerifyToken,
        };
        var before = server.Subscriptions.Current;
        using var response = await server.Client.GetAsync(
            VerificationUrl(submitted, LiveTestHelpers.LogInjectionPayload, mode: mode));

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
        AssertNoStore(response);
        Assert.Equal(before, server.Subscriptions.Current);
        Assert.False((await server.Broadcaster.GetCurrentAsync()).IsLive);
        var entry = Assert.Single(server.Logs.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Equal("WebSubVerification", entry.Fields["Operation"]);
        Assert.Equal(invalid is "mode" or "unsubscribe" or "missing-topic" ? "Malformed" : "Unexpected",
            entry.Fields["RejectionReason"]);
        Assert.Equal(invalid == "mode" ? "Unknown" : invalid == "unsubscribe" ? "Unsubscribe" : "Subscribe",
            entry.Fields["ModeClassification"]);
        Assert.Equal(invalid != "missing-topic", entry.Fields["TopicPresent"]);
        Assert.Equal(configured ? (bool?)(invalid == "token") : null, entry.Fields["MatchesConfiguredTopic"]);
        LiveTestHelpers.AssertSafeLogs(server.Logs, pending.Topic, pending.VerifyToken, "verification-secret-sentinel");

        using var confirmation = await server.Client.GetAsync(
            VerificationUrl(pending, LiveTestHelpers.LogInjectionPayload));
        Assert.Equal(HttpStatusCode.OK, confirmation.StatusCode);
        Assert.Equal("text/plain", confirmation.Content.Headers.ContentType?.MediaType);
        Assert.Equal(LiveTestHelpers.LogInjectionPayload, await confirmation.Content.ReadAsStringAsync());
        Assert.True(await server.Subscriptions.GetRenewAtAsync() > server.Time.GetUtcNow());
        LiveTestHelpers.AssertSafeLogs(server.Logs, pending.Topic, pending.VerifyToken, "verification-secret-sentinel");
    }

    [Theory]
    [InlineData("valid")]
    [InlineData("invalid")]
    [InlineData("missing")]
    [InlineData("tampered")]
    public async Task YouTubeWebhook_AcknowledgesButOnlyQueuesValidSignatures(string signature)
    {
        await using var server = await LiveHttpServer.StartAsync();
        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            YouTube = new YouTubeStatus(true, "existing-video"),
        });
        var before = await server.Broadcaster.GetStateAsync();
        using var request = YouTubeRequest(signature);
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoStore(response);
        Assert.Equal(before, await server.Broadcaster.GetStateAsync());
        Assert.Equal(signature == "valid" ? 1 : 0, server.Coordination.YouTubeConfirmationRequests);
        if (signature != "valid")
        {
            var warning = Assert.Single(server.Logs.Entries);
            Assert.Equal(LogLevel.Warning, warning.Level);
            Assert.Contains("acknowledging and discarding", warning.Message);
        }
    }

    [Theory]
    [InlineData("valid", false, HttpStatusCode.Unauthorized, false)]
    [InlineData("valid", true, HttpStatusCode.OK, true)]
    [InlineData("missing", true, HttpStatusCode.OK, false)]
    [InlineData("tampered", true, HttpStatusCode.OK, false)]
    public async Task YouTubeWebhook_DevOverrideStillRequiresSignatureAndCommandSecret(
        string signature, bool correctSecret, HttpStatusCode expected, bool live)
    {
        await using var server = await LiveHttpServer.StartAsync(Environments.Development, youtubeConfigured: false);
        using var request = YouTubeRequest(signature);
        request.Headers.Add("X-Aspire-Live-Dev-Command-Key",
            correctSecret ? "Key: local-test-command" : "Key: wrong-key");
        using var response = await server.Client.SendAsync(request);

        Assert.Equal(expected, response.StatusCode);
        Assert.Equal(live, (await server.Broadcaster.GetCurrentAsync()).YouTube.Live);
        Assert.Equal(0, server.Coordination.YouTubeConfirmationRequests);
    }

    [Theory]
    [InlineData("pending")]
    [InlineData("confirmed")]
    [InlineData("backoff")]
    public async Task YouTubeDenial_WithoutChallengeOrLease_DoesNotMutateState(string subscriptionState)
    {
        await using var server = await LiveHttpServer.StartAsync();
        var pending = Assert.IsType<YouTubeWebSubSubscriptionRequest>(
            await server.Subscriptions.TryBeginSubscriptionAsync("channel-123", server.Time.GetUtcNow()));
        if (subscriptionState == "confirmed")
        {
            using var confirmation = await server.Client.GetAsync(VerificationUrl(pending, "challenge"));
            Assert.Equal(HttpStatusCode.OK, confirmation.StatusCode);
        }
        else if (subscriptionState == "backoff")
        {
            await server.Subscriptions.MarkRequestFailedAsync(pending);
        }
        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate { YouTube = new YouTubeStatus(true, "existing-video") });
        var beforeLive = await server.Broadcaster.GetStateAsync();
        var beforeSubscription = server.Subscriptions.Current;
        server.Logs.Entries.Clear();

        using var response = await server.Client.GetAsync(
            $"/api/live/youtube/webhook?hub.mode=denied&hub.topic={Uri.EscapeDataString(pending.Topic)}" +
            "&hub.reason=Transient%20error%3B%20please%20try%20again%20later");

        Assert.Equal(HttpStatusCode.OK, response.StatusCode);
        AssertNoStore(response);
        Assert.Equal(beforeSubscription, server.Subscriptions.Current);
        Assert.Equal(beforeLive, await server.Broadcaster.GetStateAsync());
        Assert.Equal(0, server.Coordination.YouTubeConfirmationRequests);
        var entry = Assert.Single(server.Logs.Entries);
        Assert.Equal(LogLevel.Warning, entry.Level);
        Assert.Equal("WebSubDenialReport", entry.Fields["Operation"]);
        Assert.Equal(true, entry.Fields["MatchesConfiguredTopic"]);
        Assert.Equal("Provider reports a transient error", entry.Fields["ProviderDetail"]);
        Assert.Contains("untrusted, unauthenticated", entry.Message);
        Assert.DoesNotContain(pending.Topic, entry.Message);
        if (subscriptionState == "pending")
        {
            using var confirmation = await server.Client.GetAsync(VerificationUrl(pending, "still-pending"));
            Assert.Equal(HttpStatusCode.OK, confirmation.StatusCode);
        }
    }

    [Theory]
    [InlineData(null, true, false)]
    [InlineData("unknown", true, false)]
    [InlineData("oversized", true, false)]
    [InlineData("unknown", false, false)]
    [InlineData("unknown", true, true)]
    public async Task YouTubeDenial_UntrustedInputIsBoundedAndNotLogged(
        string? reason, bool topicPresent, bool configured)
    {
        await using var server = await LiveHttpServer.StartAsync(youtubeConfigured: configured);
        const string sensitive = "https://attacker.invalid/?secret=test-webhook-secret&token=private-token\r\nforged-log";
        reason = reason is null ? null : reason == "oversized" ? new string('x', 5000) + sensitive : sensitive;
        var url = "/api/live/youtube/webhook?hub.mode=denied";
        if (topicPresent) url += "&hub.topic=" + Uri.EscapeDataString(sensitive);
        if (reason is not null) url += "&hub.reason=" + Uri.EscapeDataString(reason);
        url += "&hub.verify_token=private-token&hub.challenge=private-challenge";
        var before = server.Subscriptions.Current;

        using var response = await server.Client.GetAsync(url);

        Assert.Equal(topicPresent ? HttpStatusCode.OK : HttpStatusCode.BadRequest, response.StatusCode);
        Assert.Equal(before, server.Subscriptions.Current);
        Assert.False((await server.Broadcaster.GetCurrentAsync()).IsLive);
        Assert.Equal(0, server.Coordination.YouTubeConfirmationRequests);
        var entry = Assert.Single(server.Logs.Entries);
        Assert.Equal(topicPresent, entry.Fields["TopicPresent"]);
        Assert.Equal(configured ? (bool?)false : null, entry.Fields["MatchesConfiguredTopic"]);
        Assert.Equal(reason is not null, entry.Fields["ReasonPresent"]);
        Assert.Equal(reason?.Length ?? 0, entry.Fields["ReasonLength"]);
        Assert.Equal(reason?.Length > 4096, entry.Fields["BodyTruncated"]);
        Assert.Equal("Unrecognized provider response; body omitted", entry.Fields["ProviderDetail"]);
        Assert.DoesNotContain("attacker", entry.Message);
        Assert.DoesNotContain("private-", entry.Message);
        Assert.DoesNotContain(LiveHttpServer.WebhookSecret, entry.Message);
        Assert.DoesNotContain("forged-log", entry.Message);
        Assert.True(entry.Message.Length < 700);
    }

    private static HttpRequestMessage YouTubeRequest(string signature)
    {
        const string body = "<feed xmlns:yt=\"http://www.youtube.com/xml/schemas/2015\"><entry><yt:videoId>video-123</yt:videoId></entry></feed>";
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/live/youtube/webhook")
        {
            Content = new StringContent(signature == "tampered" ? body + " " : body, Encoding.UTF8, "application/atom+xml"),
        };
        if (signature != "missing")
        {
            request.Headers.Add("X-Hub-Signature", signature == "invalid" ? "sha1=invalid" :
                "sha1=" + Convert.ToHexStringLower(HMACSHA1.HashData(
                    Encoding.UTF8.GetBytes(LiveHttpServer.WebhookSecret), Encoding.UTF8.GetBytes(body))));
        }
        return request;
    }

    private static void AssertNoStore(HttpResponseMessage response) =>
        Assert.True(response.Headers.CacheControl?.NoStore);

    private static HttpRequestMessage DevRequest(bool correctSecret)
    {
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/live/_dev/set")
        {
            Content = new StringContent(
                """{"twitch":{"live":true,"channel":"aspiredotdev","title":"Live"},"youtube":{"live":true,"videoId":"video-123"}}""",
                Encoding.UTF8, "application/json"),
        };
        request.Headers.Add("X-Aspire-Live-Dev-Command-Key",
            correctSecret ? "Key: local-test-command" : "Key: wrong-key");
        return request;
    }

    private static HttpRequestMessage TwitchRequest(
        LiveHttpServer server, string messageType, string body, bool stale = false,
        string messageId = "test-message-1", string? timestamp = null)
    {
        timestamp ??= server.Time.GetUtcNow().AddMinutes(stale ? -11 : 0).ToString("O");
        var request = new HttpRequestMessage(HttpMethod.Post, "/api/live/twitch/webhook")
        {
            Content = new StringContent(body, Encoding.UTF8, "application/json"),
        };
        request.Headers.TryAddWithoutValidation("Twitch-Eventsub-Message-Id", messageId);
        request.Headers.TryAddWithoutValidation("Twitch-Eventsub-Message-Timestamp", timestamp);
        request.Headers.TryAddWithoutValidation("Twitch-Eventsub-Message-Type", messageType);
        request.Headers.Add("Twitch-Eventsub-Message-Signature",
            "sha256=" + Convert.ToHexStringLower(HMACSHA256.HashData(
                Encoding.UTF8.GetBytes(LiveHttpServer.WebhookSecret),
                Encoding.UTF8.GetBytes(messageId + timestamp + body))));
        return request;
    }

    private static string VerificationUrl(
        YouTubeWebSubSubscriptionRequest pending, string challenge,
        string lease = "432000", string mode = "subscribe") =>
        $"/api/live/youtube/webhook?hub.mode={Uri.EscapeDataString(mode)}&hub.topic={Uri.EscapeDataString(pending.Topic)}" +
        $"&hub.verify_token={Uri.EscapeDataString(pending.VerifyToken)}&hub.lease_seconds={lease}&hub.challenge={Uri.EscapeDataString(challenge)}";

    private sealed class LiveHttpServer(
        WebApplication app, HttpClient client, FakeTimeProvider time,
        TaskCompletionSource streamEnded, YouTubeRecordingLogger<LiveEndpointsTests> logs) : IAsyncDisposable
    {
        public const string WebhookSecret = "test-webhook-secret";
        public HttpClient Client { get; } = client;
        public FakeTimeProvider Time { get; } = time;
        public TaskCompletionSource StreamEnded { get; } = streamEnded;
        public LiveStatusBroadcaster Broadcaster => app.Services.GetRequiredService<LiveStatusBroadcaster>();
        public YouTubeRecordingLogger<LiveEndpointsTests> Logs { get; } = logs;
        public SingleInstanceLiveStatusCoordination Coordination =>
            (SingleInstanceLiveStatusCoordination)app.Services.GetRequiredService<ILiveStatusCoordination>();
        public YouTubeWebSubSubscriptionState Subscriptions =>
            (YouTubeWebSubSubscriptionState)app.Services.GetRequiredService<IYouTubeWebSubSubscriptionState>();

        public static async Task<LiveHttpServer> StartAsync(
            string environment = "Production", bool enableDev = true, bool youtubeConfigured = true)
        {
            var builder = WebApplication.CreateBuilder(new WebApplicationOptions
            {
                EnvironmentName = environment,
            });
            builder.WebHost.UseTestServer();
            var logs = new YouTubeRecordingLogger<LiveEndpointsTests>();
            builder.Logging.AddFilter<WebhookLoggerProvider>(level => level >= LogLevel.Debug);
            builder.Logging.AddProvider(new WebhookLoggerProvider(logs));
            var time = new FakeTimeProvider(DateTimeOffset.UnixEpoch);
            var options = new LiveStatusOptions
            {
                EnableDevEndpoint = enableDev,
                DevCommandSecret = "local-test-command",
                CoalesceWindowMs = 0,
                Twitch = new TwitchOptions { WebhookSecret = WebhookSecret },
                YouTube = new YouTubeOptions
                {
                    WebhookSecret = WebhookSecret,
                    ApiKey = youtubeConfigured ? "unused-test-key" : "",
                    ChannelId = youtubeConfigured ? "channel-123" : "",
                },
            };
            builder.Services.AddSingleton<TimeProvider>(time);
            builder.Services.AddSingleton<IOptions<LiveStatusOptions>>(Options.Create(options));
            builder.Services.AddSingleton<IOptionsMonitor<LiveStatusOptions>>(new TestOptionsMonitor<LiveStatusOptions>(options));
            builder.Services.AddSingleton<ILiveStatusStore>(new InMemoryLiveStatusStore(time));
            builder.Services.AddSingleton<ILiveStatusCoordination, SingleInstanceLiveStatusCoordination>();
            builder.Services.AddSingleton<IYouTubeWebSubSubscriptionState, YouTubeWebSubSubscriptionState>();
            builder.Services.AddSingleton<IYouTubeClient, NoNetworkYouTubeClient>();
            builder.Services.AddSingleton<LiveStatusBroadcaster>();
            builder.Services.AddSingleton<YouTubeLiveConfirmationQueue>();
            var app = builder.Build();
            var streamEnded = new TaskCompletionSource(TaskCreationOptions.RunContinuationsAsynchronously);
            app.Use(async (context, next) =>
            {
                try
                {
                    await next(context);
                }
                finally
                {
                    if (context.Request.Path == "/api/live/stream")
                    {
                        streamEnded.TrySetResult();
                    }
                }
            });
            app.MapLiveStatus();
            await app.StartAsync();
            return new LiveHttpServer(app, app.GetTestClient(), time, streamEnded, logs);
        }

        private sealed class WebhookLoggerProvider(ILogger logger) : ILoggerProvider
        {
            public ILogger CreateLogger(string categoryName) =>
                categoryName.StartsWith("StaticHost.Live.YouTube.", StringComparison.Ordinal) ||
                categoryName == "StaticHost.Live.Twitch.Webhook"
                    ? logger : NullLogger.Instance;
            public void Dispose() { }
        }

        public async ValueTask DisposeAsync()
        {
            Client.Dispose();
            await app.StopAsync();
            await app.DisposeAsync();
        }
    }

    private sealed class NoNetworkYouTubeClient : IYouTubeClient
    {
        public Task<string?> ResolveChannelIdAsync(string handle, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("HTTP endpoint tests must not call YouTube.");

        public Task<YouTubeLiveResult> GetCurrentLiveAsync(string channelId, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("HTTP endpoint tests must not call YouTube.");

        public Task<YouTubeLiveResult> GetVideoLiveStatusAsync(string videoId, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("HTTP endpoint tests must not call YouTube.");

        public Task SubscribeAsync(string channelId, string callbackUrl, string secret,
            string verifyToken, TimeSpan lease, CancellationToken cancellationToken) =>
            throw new InvalidOperationException("HTTP endpoint tests must not call YouTube.");
    }
}
