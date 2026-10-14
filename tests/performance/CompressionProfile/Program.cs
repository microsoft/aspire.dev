using System.Diagnostics;
using System.Formats.Tar;
using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Xml.Linq;
using Microsoft.AspNetCore.Hosting.Server;
using Microsoft.AspNetCore.Hosting.Server.Features;
using Microsoft.Build.Framework;
using Microsoft.Build.Logging;

if (args.Length == 0 || args.Length != (args[0] == "verify" ? 2 : args[0] == "subset" ? 5 : 3))
{
    throw new ArgumentException("Usage: CompressionProfile snapshot|describe|image|tasks|serve <input> <output-or-url>, or verify <snapshot>");
}

switch (args[0])
{
    case "snapshot":
        WriteJson(args[2], CompressionInputs.Create(args[1]));
        break;
    case "subset":
        using (var comparison = JsonDocument.Parse(File.ReadAllText(args[2])))
        {
            var expected = comparison.RootElement.GetProperty("variants")[0].GetProperty("output").GetProperty("pages");
            var selected = expected.EnumerateArray().Select(page => page.GetProperty("path").GetString()
                ?? throw new InvalidDataException("Missing representative page path.")).ToHashSet(StringComparer.Ordinal);
            var root = Path.GetFullPath(args[1]);
            var destination = Path.GetFullPath(args[3]);
            var subsetWebRoot = Path.Combine(destination, "wwwroot");
            var extensions = new HashSet<string>(StringComparer.OrdinalIgnoreCase)
            {
                ".js", ".mjs", ".css", ".svg", ".png", ".jpg", ".jpeg", ".webp", ".gif",
                ".ico", ".woff", ".woff2", ".otf", ".ttf", ".wasm", ".webmanifest"
            };
            foreach (var file in Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories))
            {
                var relative = Path.GetRelativePath(root, file).Replace('\\', '/');
                if (!selected.Contains(relative) && !extensions.Contains(Path.GetExtension(file))) continue;
                var output = Path.Combine(subsetWebRoot, relative);
                Directory.CreateDirectory(Path.GetDirectoryName(output)!);
                File.Copy(file, output, overwrite: false);
            }
            foreach (var page in expected.EnumerateArray())
            {
                var path = Path.Combine(subsetWebRoot, page.GetProperty("path").GetString()!);
                if (CompressionInputs.Hash(path) != page.GetProperty("sha256").GetString())
                {
                    throw new InvalidDataException($"Downloaded representative page differs from the complete-corpus profile: {path}.");
                }
            }
            Directory.CreateDirectory(destination);
            File.WriteAllText(Path.Combine(destination, "Program.cs"),
                "var app = WebApplication.CreateBuilder(args).Build(); app.MapStaticAssets(); app.Run();");
            var project = new XDocument(new XElement("Project", new XAttribute("Sdk", "Microsoft.NET.Sdk.Web"),
                new XElement("PropertyGroup",
                    new XElement("TargetFramework", "net10.0"), new XElement("ImplicitUsings", "enable"),
                    new XElement("EnableDefaultCompressionFormats", "false"),
                    new XElement("PublishCompressionFormats", "brotli")),
                new XElement("Import", new XAttribute("Project", Path.Combine(Path.GetFullPath(args[4]), "Publishing.targets"))),
                new XElement("Import", new XAttribute("Project", Path.Combine(Path.GetFullPath(args[4]), "Caching.targets")))));
            File.WriteAllText(Path.Combine(destination, "StaticHost.csproj"), project.ToString());
        }
        break;
    case "verify":
        CompressionInputs.Verify(ReadJson<InputSnapshot>(args[1]));
        Console.WriteLine("[prebuilt-frontend] Verified unchanged generated content.");
        break;
    case "describe":
        var webRoot = Path.Combine(args[1], "wwwroot");
        var files = Directory.EnumerateFiles(webRoot, "*", SearchOption.AllDirectories)
            .Select(file => new { Path = Path.GetRelativePath(webRoot, file).Replace('\\', '/'), Bytes = new FileInfo(file).Length })
            .OrderBy(file => file.Path, StringComparer.Ordinal).ToArray();
        var groups = files.GroupBy(file => CompressionInputs.Group(file.Path));
        var pageGroups = new[]
        {
            ("home", "index.html"),
            ("guide", "get-started/first-app/index.html"),
            ("csharp", MedianPage("reference/api/csharp/")),
            ("typescript", MedianPage("reference/api/typescript/"))
        };
        WriteJson(args[2], new
        {
            environment = new
            {
                runtime = System.Runtime.InteropServices.RuntimeInformation.FrameworkDescription,
                os = System.Runtime.InteropServices.RuntimeInformation.OSDescription,
                architecture = System.Runtime.InteropServices.RuntimeInformation.ProcessArchitecture.ToString(),
                cores = Environment.ProcessorCount,
                sourceCommit = Environment.GetEnvironmentVariable("GITHUB_SHA")
            },
            files = files.Length,
            totalBytes = files.Sum(file => file.Bytes),
            brotliFiles = files.Count(file => file.Path.EndsWith(".br", StringComparison.Ordinal)),
            brotliBytes = files.Where(file => file.Path.EndsWith(".br", StringComparison.Ordinal)).Sum(file => file.Bytes),
            groups = groups.Select(group => new
            {
                name = group.Key,
                bytes = group.Sum(file => file.Bytes),
                brotliBytes = group.Where(file => file.Path.EndsWith(".br", StringComparison.Ordinal)).Sum(file => file.Bytes)
            }),
            pages = pageGroups.Select(page => new
            {
                name = page.Item1,
                path = page.Item2,
                bytes = new FileInfo(Path.Combine(webRoot, page.Item2)).Length,
                brotliBytes = new FileInfo(Path.Combine(webRoot, page.Item2 + ".br")).Length,
                sha256 = CompressionInputs.Hash(Path.Combine(webRoot, page.Item2)),
                nativeDecode = DecodeProfile(Path.Combine(webRoot, page.Item2))
            })
        });
        string MedianPage(string prefix)
        {
            var pages = files.Where(file => file.Path.StartsWith(prefix, StringComparison.Ordinal) &&
                file.Path.EndsWith(".html", StringComparison.Ordinal)).OrderBy(file => file.Bytes)
                .ThenBy(file => file.Path, StringComparer.Ordinal).ToArray();
            if (pages.Length == 0) throw new InvalidDataException($"No HTML pages for {prefix}.");
            return pages[pages.Length / 2].Path;
        }
        break;
    case "image":
        WriteJson(args[2], InspectImage(args[1]));
        break;
    case "tasks":
        var tasks = new Dictionary<(int Node, int Project, int Target, int Task), TaskStartedEventArgs>();
        var durations = new Dictionary<string, double>(StringComparer.Ordinal);
        var source = new BinaryLogReplayEventSource();
        source.TaskStarted += (_, e) =>
        {
            if (e.TaskName is not ("BrotliCompress" or "Copy" or "CreateNewImage" or "UpdateExternallyDefinedStaticWebAssets")) return;
            var c = e.BuildEventContext ?? throw new InvalidDataException("A task lacks build context.");
            tasks.Add((c.NodeId, c.ProjectContextId, c.TargetId, c.TaskId), e);
        };
        source.TaskFinished += (_, e) =>
        {
            var c = e.BuildEventContext ?? throw new InvalidDataException("A task lacks build context.");
            if (!tasks.Remove((c.NodeId, c.ProjectContextId, c.TargetId, c.TaskId), out var start)) return;
            var name = e.TaskName ?? throw new InvalidDataException("A task lacks its name.");
            durations[name] = durations.GetValueOrDefault(name) + (e.Timestamp - start.Timestamp).TotalSeconds;
        };
        source.Replay(args[1]);
        if (tasks.Count != 0 || !durations.ContainsKey("BrotliCompress"))
        {
            throw new InvalidDataException("Compression task timing is missing or incomplete.");
        }
        WriteJson(args[2], durations);
        break;
    case "serve":
        var started = Stopwatch.StartNew();
        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = Path.GetFullPath(args[1]),
            WebRootPath = "wwwroot",
            EnvironmentName = Environments.Production
        });
        builder.Logging.SetMinimumLevel(LogLevel.Warning);
        builder.WebHost.UseUrls(args[2]);
        await using (var app = builder.Build())
        {
            app.UseDefaultFiles();
            app.UseRouting();
            app.MapGet("/__profile/stats", () =>
            {
                using var process = Process.GetCurrentProcess();
                return new
                {
                    cpuMilliseconds = process.TotalProcessorTime.TotalMilliseconds,
                    workingSetBytes = process.WorkingSet64,
                    peakWorkingSetBytes = process.PeakWorkingSet64,
                    startupMilliseconds = started.Elapsed.TotalMilliseconds
                };
            });
            app.MapStaticAssets(Path.Combine(Path.GetFullPath(args[1]), "StaticHost.staticwebassets.endpoints.json"));
            await app.StartAsync();
            started.Stop();
            Console.WriteLine($"Serving published SDK endpoints at {app.Services.GetRequiredService<IServer>().Features.Get<IServerAddressesFeature>()?.Addresses.First()}");
            await app.WaitForShutdownAsync();
        }
        break;
    default:
        throw new ArgumentException($"Unknown command: {args[0]}");
}

static T ReadJson<T>(string path) => JsonSerializer.Deserialize<T>(File.ReadAllText(path))
    ?? throw new InvalidDataException($"Invalid JSON in {path}.");

static void WriteJson(string path, object value) =>
    File.WriteAllText(path, JsonSerializer.Serialize(value, new JsonSerializerOptions { WriteIndented = true }));

static object DecodeProfile(string path)
{
    var compressed = File.ReadAllBytes(path + ".br");
    using (var input = new MemoryStream(compressed))
    using (var decoder = new BrotliStream(input, CompressionMode.Decompress))
    {
        if (Convert.ToHexString(SHA256.HashData(decoder)) != CompressionInputs.Hash(path))
        {
            throw new InvalidDataException($"Incorrect Brotli content: {path}.");
        }
    }
    var milliseconds = new List<double>();
    for (var repeat = 0; repeat < 31; repeat++)
    {
        using var input = new MemoryStream(compressed);
        using var decoder = new BrotliStream(input, CompressionMode.Decompress);
        var timer = Stopwatch.StartNew();
        decoder.CopyTo(Stream.Null);
        timer.Stop();
        if (repeat > 0) milliseconds.Add(timer.Elapsed.TotalMilliseconds);
    }
    milliseconds.Sort();
    return new
    {
        samples = milliseconds.Count,
        medianMilliseconds = (milliseconds[14] + milliseconds[15]) / 2,
        minMilliseconds = milliseconds[0],
        maxMilliseconds = milliseconds[^1],
        methodology = ".NET BrotliStream decode from memory; one warmup, no disk IO; not Chromium decoder CPU."
    };
}

static object InspectImage(string path)
{
    var documents = new Dictionary<string, JsonElement>(StringComparer.Ordinal);
    using var file = File.OpenRead(path);
    var gzip = file.ReadByte() == 0x1f && file.ReadByte() == 0x8b;
    file.Position = 0;
    using Stream input = gzip ? new GZipStream(file, CompressionMode.Decompress) : file;
    using var reader = new TarReader(input);
    while (reader.GetNextEntry() is { } entry)
    {
        if (entry.DataStream is null || entry.Length > 1024 * 1024) continue;
        using var data = new MemoryStream();
        entry.DataStream.CopyTo(data);
        var bytes = data.ToArray();
        if (bytes.Length == 0 || bytes[0] != '{') continue;
        using var document = JsonDocument.Parse(bytes);
        documents.Add(entry.Name.TrimStart('.', '/'), document.RootElement.Clone());
    }
    var index = documents["index.json"];
    var digest = index.GetProperty("manifests")[0].GetProperty("digest").GetString()
        ?? throw new InvalidDataException("Missing OCI image digest.");
    var manifest = documents["blobs/" + digest.Replace(':', '/')];
    var layers = manifest.GetProperty("layers").EnumerateArray()
        .Select(layer => layer.GetProperty("digest").GetString()).ToArray();
    if (layers.Length < 2) throw new InvalidDataException("Expected base and application layers.");
    return new { archiveBytes = new FileInfo(path).Length, baseLayers = layers[..^1], applicationLayer = layers[^1] };
}
