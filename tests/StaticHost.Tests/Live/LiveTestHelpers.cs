namespace StaticHost.Tests.Live;

internal static class LiveTestHelpers
{
    public static LiveStatusBroadcaster CreateBroadcaster(int coalesceMs = 0, TimeProvider? timeProvider = null) =>
        new(
            Options.Create(new LiveStatusOptions { CoalesceWindowMs = coalesceMs }),
            NullLogger<LiveStatusBroadcaster>.Instance,
            timeProvider);

    public static HttpResponseMessage JsonResponse(string json, HttpStatusCode statusCode = HttpStatusCode.OK) =>
        new(statusCode)
        {
            Content = new StringContent(json, Encoding.UTF8, "application/json"),
        };
}

internal sealed class TestOptionsMonitor<T>(T currentValue) : IOptionsMonitor<T>
{
    public T CurrentValue { get; set; } = currentValue;

    public T Get(string? name) => CurrentValue;

    public IDisposable? OnChange(Action<T, string?> listener) => NullDisposable.Instance;

    private sealed class NullDisposable : IDisposable
    {
        public static readonly NullDisposable Instance = new();

        public void Dispose()
        {
        }
    }
}

internal sealed record RecordedRequest(
    HttpMethod Method,
    Uri? RequestUri,
    IReadOnlyDictionary<string, string[]> Headers,
    string? Content)
{
    public string? Header(string name) =>
        Headers.TryGetValue(name, out var values) ? string.Join(",", values) : null;
}

internal sealed class RecordingHttpMessageHandler(Func<RecordedRequest, HttpResponseMessage> responder) : HttpMessageHandler
{
    public List<RecordedRequest> Requests { get; } = [];

    protected override async Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
    {
        var content = request.Content is null
            ? null
            : await request.Content.ReadAsStringAsync(cancellationToken);

        var headerPairs = request.Content is null
            ? request.Headers
            : request.Headers.Concat(request.Content.Headers);

        var headers = headerPairs
            .ToDictionary(
                header => header.Key,
                header => header.Value.ToArray(),
                StringComparer.OrdinalIgnoreCase);

        var recorded = new RecordedRequest(request.Method, request.RequestUri, headers, content);
        Requests.Add(recorded);

        return responder(recorded);
    }
}

internal sealed class TestHttpClientFactory : IHttpClientFactory
{
    private readonly Dictionary<string, HttpClient> _clients = new(StringComparer.Ordinal);

    public void AddClient(string name, HttpMessageHandler handler)
    {
        _clients.Add(name, new HttpClient(handler));
    }

    public HttpClient CreateClient(string name) =>
        _clients.TryGetValue(name, out var client)
            ? client
            : throw new InvalidOperationException($"No test HTTP client named '{name}' was registered.");
}
