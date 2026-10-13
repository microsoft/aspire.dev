using System.Diagnostics;
using System.Globalization;
using System.IO.Compression;
using System.Text.RegularExpressions;
using System.Xml.Linq;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.TestHost;
using Microsoft.Extensions.Hosting;

namespace StaticHost.Tests;

public sealed class PublishingTargetsTests(PublishingFixture fixture) : IClassFixture<PublishingFixture>
{
    [Fact]
    public void PublishUsesOptimalBrotliByDefault()
    {
        Assert.Contains("brotliLevel=Optimal", fixture.DefaultOutput);
        AssertCompressedAssets(fixture.DefaultDirectory, CompressionLevel.Optimal);
    }

    [Fact]
    public void PublishHonorsExplicitCompressionLevel()
    {
        Assert.Contains("brotliLevel=SmallestSize", fixture.SmallestSizeOutput);
        AssertCompressedAssets(fixture.SmallestSizeDirectory, CompressionLevel.SmallestSize);
    }

    [Fact]
    public void PublishHonorsLegacyCompressionLevel()
    {
        Assert.Contains("brotliLevel=SmallestSize", fixture.LegacyOutput);
        AssertCompressedAssets(fixture.LegacyDirectory, CompressionLevel.SmallestSize);
    }

    [Fact]
    public void PublishLogsCompressionAndMetadataDurations()
    {
        Assert.Contains("[publish-timing] compression start assets=4 brotliLevel=Optimal", fixture.DefaultOutput);
        Assert.Contains("[publish-timing] compression complete durationSeconds=", fixture.DefaultOutput);
        Assert.Contains("[publish-timing] static asset metadata and manifest complete durationSeconds=", fixture.DefaultOutput);
        var durations = Regex.Matches(fixture.DefaultOutput, @"durationSeconds=([0-9.eE+-]+)");
        Assert.Equal(2, durations.Count);
        foreach (Match duration in durations)
        {
            Assert.True(double.Parse(duration.Groups[1].Value, CultureInfo.InvariantCulture) >= 0);
        }
    }

    [Fact]
    public async Task PublishMeasurementVerifiesAssetsAndRejectsIncompleteOutput()
    {
        var complete = await fixture.MeasureAsync(includeMissingFile: false);
        Assert.True(complete.ExitCode == 0, complete.Log);
        var incomplete = await fixture.MeasureAsync(includeMissingFile: true);
        Assert.NotEqual(0, incomplete.ExitCode);
        Assert.Contains("Frontend output is missing from the published host", incomplete.Log);
    }

    [Fact]
    public async Task PublishMeasurementRejectsIncorrectBrotliContent()
    {
        var result = await fixture.MeasureAsync(includeMissingFile: false, corruptBrotli: true);
        Assert.NotEqual(0, result.ExitCode);
        Assert.Contains("Brotli content differs from the original", result.Log);
    }

    [Theory]
    [InlineData("/index.html")]
    [InlineData("/reference/api/sample.md")]
    [InlineData("/_astro/app.abc123.css")]
    public async Task PublishedEndpointsPreserveContentAndBrotliNegotiation(string path)
    {
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            EnvironmentName = Environments.Production,
            ContentRootPath = fixture.DefaultDirectory,
            ApplicationName = typeof(PublishingTargetsTests).Assembly.GetName().Name
        });
        builder.WebHost.UseTestServer();
        await using var app = builder.Build();
        app.MapStaticAssets(Path.Combine(fixture.DefaultDirectory, "PublishFixture.staticwebassets.endpoints.json"));
        await app.StartAsync();
        using var client = app.GetTestClient();

        using var plain = await client.GetAsync(path);
        Assert.Equal(HttpStatusCode.OK, plain.StatusCode);
        Assert.Empty(plain.Content.Headers.ContentEncoding);
        var expected = await plain.Content.ReadAsByteArrayAsync();

        using var request = new HttpRequestMessage(HttpMethod.Get, path);
        request.Headers.AcceptEncoding.ParseAdd("br");
        using var compressed = await client.SendAsync(request);
        Assert.Equal(HttpStatusCode.OK, compressed.StatusCode);
        Assert.Contains("br", compressed.Content.Headers.ContentEncoding);
        await using var encoded = await compressed.Content.ReadAsStreamAsync();
        await using var decoder = new BrotliStream(encoded, CompressionMode.Decompress);
        using var restored = new MemoryStream();
        await decoder.CopyToAsync(restored);
        Assert.Equal(expected, restored.ToArray());

        using var gzipRequest = new HttpRequestMessage(HttpMethod.Get, path);
        gzipRequest.Headers.AcceptEncoding.ParseAdd("gzip");
        using var fallback = await client.SendAsync(gzipRequest);
        Assert.Equal(HttpStatusCode.OK, fallback.StatusCode);
        Assert.Empty(fallback.Content.Headers.ContentEncoding);
        Assert.Equal(expected, await fallback.Content.ReadAsByteArrayAsync());

        if (path.StartsWith("/_astro/", StringComparison.Ordinal))
        {
            Assert.True(plain.Headers.CacheControl?.Public);
            Assert.Equal(TimeSpan.FromDays(365), plain.Headers.CacheControl?.MaxAge);
            Assert.Contains(plain.Headers.CacheControl!.Extensions, value => value.Name == "immutable");
            Assert.Equal(plain.Headers.CacheControl?.ToString(), compressed.Headers.CacheControl?.ToString());
        }
        else
        {
            Assert.False(plain.Headers.CacheControl?.Extensions.Any(value => value.Name == "immutable") ?? false);
        }
    }

    private static void AssertCompressedAssets(string directory, CompressionLevel level)
    {
        foreach (var path in PublishingFixture.AssetPaths)
        {
            var published = Path.Combine(directory, "wwwroot", path);
            var original = File.ReadAllBytes(published);
            using var expected = new MemoryStream();
            using (var compressor = new BrotliStream(expected, level, leaveOpen: true))
            {
                compressor.Write(original);
            }
            Assert.Equal(expected.ToArray(), File.ReadAllBytes(published + ".br"));
            Assert.False(File.Exists(published + ".gz"));
        }
    }
}

public sealed class PublishingFixture : IAsyncLifetime
{
    internal static readonly string[] AssetPaths =
    [
        "index.html",
        Path.Combine("reference", "api", "sample.md"),
        Path.Combine("reference", "api", "sample", "index.html"),
        Path.Combine("_astro", "app.abc123.css")
    ];

    private readonly string _root = Path.Combine(Path.GetTempPath(), $"aspire-publish-test-{Guid.NewGuid():N}");

    public string DefaultDirectory => Path.Combine(_root, "default", "publish");
    public string SmallestSizeDirectory => Path.Combine(_root, "smallest", "publish");
    public string LegacyDirectory => Path.Combine(_root, "legacy", "publish");
    public string DefaultOutput { get; private set; } = string.Empty;
    public string SmallestSizeOutput { get; private set; } = string.Empty;
    public string LegacyOutput { get; private set; } = string.Empty;

    public async Task InitializeAsync()
    {
        DefaultOutput = await PublishAsync("default", null);
        SmallestSizeOutput = await PublishAsync("smallest", "-p:BrotliCompressionLevel=SmallestSize");
        LegacyOutput = await PublishAsync("legacy", "-p:_BlazorBrotliCompressionLevel=SmallestSize");
    }

    public Task DisposeAsync()
    {
        if (Directory.Exists(_root))
        {
            Directory.Delete(_root, recursive: true);
        }
        return Task.CompletedTask;
    }

    public async Task<(int ExitCode, string Log)> MeasureAsync(bool includeMissingFile, bool corruptBrotli = false)
    {
        var directory = Path.Combine(_root, $"measure-{Guid.NewGuid():N}");
        var frontend = Path.Combine(directory, "frontend");
        var publish = Path.Combine(directory, "publish");
        var diagnostics = Path.Combine(directory, "diagnostics");
        Directory.CreateDirectory(Path.Combine(diagnostics, "images"));
        foreach (var path in AssetPaths)
        {
            var file = Path.Combine(frontend, path);
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            File.Copy(Path.Combine(DefaultDirectory, "wwwroot", path), file);
            var published = Path.Combine(publish, "wwwroot", path);
            Directory.CreateDirectory(Path.GetDirectoryName(published)!);
            File.Copy(file, published);
            File.Copy(Path.Combine(DefaultDirectory, "wwwroot", path + ".br"), published + ".br");
        }
        if (includeMissingFile)
        {
            await File.WriteAllTextAsync(Path.Combine(frontend, "missing.html"), "missing");
        }
        if (corruptBrotli)
        {
            await using var output = File.Create(Path.Combine(publish, "wwwroot", "index.html.br"));
            await using var compressor = new BrotliStream(output, CompressionLevel.Optimal);
            await compressor.WriteAsync(Encoding.UTF8.GetBytes("incorrect content"));
        }
        await File.WriteAllTextAsync(Path.Combine(diagnostics, "images", "fixture.tar.gz"), "fixture archive");
        await File.WriteAllTextAsync(Path.Combine(diagnostics, "publish.log"), DefaultOutput);
        var start = new ProcessStartInfo("pwsh")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        foreach (var argument in new[]
        {
            "-NoProfile", "-NonInteractive", "-File",
            Path.Combine(AppContext.BaseDirectory, "PublishFixture", "Measure-StaticHostPublish.ps1"),
            "-PublishDirectory", publish,
            "-FrontendDirectory", frontend,
            "-DiagnosticsDirectory", diagnostics,
            "-SummaryPath", Path.Combine(diagnostics, "summary.md")
        })
        {
            start.ArgumentList.Add(argument);
        }
        return await RunAsync(start, "publish measurements");
    }

    private async Task<string> PublishAsync(string name, string? compressionProperty)
    {
        var directory = Path.Combine(_root, name);
        Directory.CreateDirectory(directory);
        foreach (var path in AssetPaths)
        {
            var file = Path.Combine(directory, "wwwroot", path);
            Directory.CreateDirectory(Path.GetDirectoryName(file)!);
            var contents = path.EndsWith(".css", StringComparison.Ordinal)
                ? string.Concat(Enumerable.Range(0, 100).Select(index => $".item-{index} {{ color: #345678; padding: {index}px; }}\n"))
                : string.Concat(Enumerable.Range(0, 100).Select(index => $"<p>Asset {index}: Aspire documentation and API reference.</p>\n"));
            await File.WriteAllTextAsync(file, contents);
        }
        await File.WriteAllTextAsync(Path.Combine(directory, "Program.cs"), "var app = WebApplication.CreateBuilder(args).Build(); app.MapStaticAssets(); app.Run();");
        var targets = Path.Combine(AppContext.BaseDirectory, "PublishFixture");
        var project = new XDocument(new XElement("Project",
            new XAttribute("Sdk", "Microsoft.NET.Sdk.Web"),
            new XElement("PropertyGroup",
                new XElement("TargetFramework", "net10.0"),
                new XElement("ImplicitUsings", "enable"),
                new XElement("EnableDefaultCompressionFormats", "false"),
                new XElement("PublishCompressionFormats", "brotli")),
            new XElement("Import", new XAttribute("Project", Path.Combine(targets, "Publishing.targets"))),
            new XElement("Import", new XAttribute("Project", Path.Combine(targets, "Caching.targets")))));
        await File.WriteAllTextAsync(Path.Combine(directory, "PublishFixture.csproj"), project.ToString());

        var start = new ProcessStartInfo("dotnet")
        {
            WorkingDirectory = directory,
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true
        };
        foreach (var argument in new[] { "publish", "--configuration", "Release", "--nologo", "--verbosity", "minimal", "--output", Path.Combine(directory, "publish") })
        {
            start.ArgumentList.Add(argument);
        }
        if (compressionProperty is not null)
        {
            start.ArgumentList.Add(compressionProperty);
        }
        var results = Environment.GetEnvironmentVariable("TEST_RESULTS_DIR");
        if (!string.IsNullOrEmpty(results))
        {
            Directory.CreateDirectory(results);
            start.ArgumentList.Add($"-bl:{Path.Combine(results, $"StaticHost.Publish.{name}.binlog")};ProjectImports=None");
        }
        start.Environment["DOTNET_CLI_TELEMETRY_OPTOUT"] = "1";
        var result = await RunAsync(start, $"publish fixture '{name}'");
        Assert.True(result.ExitCode == 0, $"Publish fixture '{name}' failed with exit code {result.ExitCode}.\n{result.Log}");
        return result.Log;
    }

    private static async Task<(int ExitCode, string Log)> RunAsync(ProcessStartInfo start, string name)
    {
        using var process = new Process { StartInfo = start };
        Assert.True(process.Start(), $"Failed to start {name}.");
        var output = process.StandardOutput.ReadToEndAsync();
        var error = process.StandardError.ReadToEndAsync();
        using var timeout = new System.Threading.CancellationTokenSource(TimeSpan.FromMinutes(3));
        try
        {
            await process.WaitForExitAsync(timeout.Token);
        }
        catch (OperationCanceledException) when (timeout.IsCancellationRequested)
        {
            process.Kill(entireProcessTree: true);
            await process.WaitForExitAsync();
            throw new TimeoutException($"{name} timed out.\n{await output}\n{await error}");
        }
        return (process.ExitCode, $"{await output}\n{await error}");
    }
}
