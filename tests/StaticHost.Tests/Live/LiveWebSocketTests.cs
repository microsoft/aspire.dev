using System.Net.WebSockets;

namespace StaticHost.Tests.Live;

public sealed class LiveWebSocketTests
{
    private static readonly TimeSpan Timeout = TimeSpan.FromSeconds(10);

    [Fact]
    public async Task Upgrade_SendsInitialStateThenUpdates()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync();
        using var cts = new CancellationTokenSource(Timeout);
        using var socket = await server.ConnectAsync(cts.Token);
        Assert.Equal(WebSocketState.Open, socket.State);

        var initial = await ReceiveJsonAsync(socket, cts.Token);
        Assert.Equal("state", initial.GetProperty("type").GetString());
        Assert.False(initial.GetProperty("data").GetProperty("isLive").GetBoolean());

        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            Twitch = new TwitchStatus(true, "aspiredotdev", null),
        });
        var update = await ReceiveJsonAsync(socket, cts.Token);
        Assert.Equal("state", update.GetProperty("type").GetString());
        var data = update.GetProperty("data");
        Assert.True(data.GetProperty("isLive").GetBoolean());
        Assert.Equal("twitch", data.GetProperty("primarySource").GetString());
        Assert.Equal("aspiredotdev", data.GetProperty("twitch").GetProperty("channel").GetString());
    }

    [Fact]
    public async Task Upgrade_SeedsLateSubscribersWithTheCurrentState()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync();
        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            YouTube = new YouTubeStatus(true, "video-123"),
        });

        using var cts = new CancellationTokenSource(Timeout);
        using var socket = await server.ConnectAsync(cts.Token);
        var initial = await ReceiveJsonAsync(socket, cts.Token);
        Assert.Equal("video-123", initial.GetProperty("data").GetProperty("youtube").GetProperty("videoId").GetString());
    }

    [Fact]
    public async Task Heartbeat_IsSentEveryFifteenSeconds()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync(streamMaxLifetimeSeconds: 24 * 60 * 60);
        using var cts = new CancellationTokenSource(Timeout);
        using var socket = await server.ConnectAsync(cts.Token);
        await ReceiveJsonAsync(socket, cts.Token);

        for (var i = 0; i < 20; i++)
        {
            server.Time.Advance(TimeSpan.FromSeconds(15));
            var heartbeat = await ReceiveJsonAsync(socket, cts.Token);
            Assert.Equal("hb", heartbeat.GetProperty("type").GetString());
        }

        // Updates still flow after many heartbeats.
        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            Twitch = new TwitchStatus(true, "aspiredotdev", null),
        });
        Assert.Equal("state", (await ReceiveJsonAsync(socket, cts.Token)).GetProperty("type").GetString());
    }

    [Fact]
    public async Task NonWebSocketRequest_IsRejectedWithBadRequest()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync();
        using var response = await server.Client.GetAsync("/api/live/ws");

        Assert.Equal(HttpStatusCode.BadRequest, response.StatusCode);
        Assert.True(response.Headers.CacheControl?.NoStore);
        Assert.Contains("WebSocket", await response.Content.ReadAsStringAsync(), StringComparison.Ordinal);
    }

    [Fact]
    public async Task RemovedSseEndpoint_IsNotFound()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync();
        using var response = await server.Client.GetAsync("/api/live/stream");

        Assert.Equal(HttpStatusCode.NotFound, response.StatusCode);
    }

    [Fact]
    public async Task MaxLifetime_ClosesGracefullyWithinJitteredBound()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync(streamMaxLifetimeSeconds: 600);
        using var cts = new CancellationTokenSource(Timeout);
        using var socket = await server.ConnectAsync(cts.Token);
        await ReceiveJsonAsync(socket, cts.Token);

        // The jittered lifetime is never shorter than 80% of the maximum.
        for (var elapsed = 15; elapsed < 480; elapsed += 15)
        {
            server.Time.Advance(TimeSpan.FromSeconds(15));
            Assert.Equal("hb", (await ReceiveJsonAsync(socket, cts.Token)).GetProperty("type").GetString());
        }
        Assert.Equal(WebSocketState.Open, socket.State);
        Assert.False(server.SocketEnded.Task.IsCompleted);

        // Advance to the full 600-second maximum.
        server.Time.Advance(TimeSpan.FromSeconds(600 - 465));
        var close = await ReceiveCloseAsync(socket, cts.Token);
        Assert.Equal(WebSocketCloseStatus.NormalClosure, close.CloseStatus);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "ack", cts.Token);
        await server.SocketEnded.Task.WaitAsync(Timeout);
    }

    [Fact]
    public async Task HostShutdown_ClosesWithGoingAway()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync();
        using var cts = new CancellationTokenSource(Timeout);
        using var socket = await server.ConnectAsync(cts.Token);
        await ReceiveJsonAsync(socket, cts.Token);

        server.Lifetime.StopApplication();

        var close = await ReceiveCloseAsync(socket, cts.Token);
        Assert.Equal(WebSocketCloseStatus.EndpointUnavailable, close.CloseStatus);
        await socket.CloseOutputAsync(WebSocketCloseStatus.NormalClosure, "ack", cts.Token);
        await server.SocketEnded.Task.WaitAsync(Timeout);
    }

    [Fact]
    public async Task ClientClose_EndsTheHandlerAndStopsFanOut()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync();
        using var cts = new CancellationTokenSource(Timeout);
        using var socket = await server.ConnectAsync(cts.Token);
        await ReceiveJsonAsync(socket, cts.Token);

        await socket.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", cts.Token);

        await server.SocketEnded.Task.WaitAsync(Timeout);
        Assert.Equal(WebSocketState.Closed, socket.State);
        // Publishing after the subscriber left must not throw.
        await server.Broadcaster.UpdateAsync(new LiveStatusUpdate
        {
            Twitch = new TwitchStatus(true, "aspiredotdev", null),
        });
    }

    [Fact]
    public async Task ClientAbort_EndsTheHandler()
    {
        await using var server = await LiveEndpointsTests.LiveHttpServer.StartAsync();
        using var cts = new CancellationTokenSource(Timeout);
        using var socket = await server.ConnectAsync(cts.Token);
        await ReceiveJsonAsync(socket, cts.Token);

        socket.Abort();

        await server.SocketEnded.Task.WaitAsync(Timeout);
    }

    private static async Task<JsonElement> ReceiveJsonAsync(WebSocket socket, CancellationToken cancellationToken)
    {
        var message = await ReceiveAsync(socket, cancellationToken);
        Assert.Equal(WebSocketMessageType.Text, message.Type);
        return JsonDocument.Parse(message.Text).RootElement.Clone();
    }

    private static async Task<WebSocketReceiveResult> ReceiveCloseAsync(WebSocket socket, CancellationToken cancellationToken)
    {
        // Heartbeats due in the same time jump may arrive before the close frame.
        while (true)
        {
            var message = await ReceiveAsync(socket, cancellationToken);
            if (message.Type == WebSocketMessageType.Close) return message.Result;
            Assert.Equal("hb", JsonDocument.Parse(message.Text).RootElement.GetProperty("type").GetString());
        }
    }

    private static async Task<(WebSocketMessageType Type, string Text, WebSocketReceiveResult Result)> ReceiveAsync(
        WebSocket socket, CancellationToken cancellationToken)
    {
        var buffer = new byte[4096];
        using var message = new MemoryStream();
        WebSocketReceiveResult result;
        do
        {
            result = await socket.ReceiveAsync(buffer, cancellationToken);
            message.Write(buffer, 0, result.Count);
        }
        while (!result.EndOfMessage);

        return (result.MessageType, Encoding.UTF8.GetString(message.ToArray()), result);
    }
}
