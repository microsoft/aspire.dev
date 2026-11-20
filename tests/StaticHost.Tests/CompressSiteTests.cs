using System.Diagnostics;
using System.IO.Compression;

namespace StaticHost.Tests;

/// <summary>
/// Runs src/statichost/compress-site.cs, the file-based app the publish uses to write the site's
/// brotli copies.
/// </summary>
public sealed class CompressSiteTests
{
    [Fact]
    public async Task Rewrites_a_copy_whose_source_changed_but_kept_its_length_and_time()
    {
        using var work = new TempWebRoot();
        var source = Path.Combine(work.Path, "site", "page.html");
        var output = Path.Combine(work.Path, "br");
        var copy = Path.Combine(output, "page.html.br");
        var first = new string('a', 2048);
        var second = new string('b', 2048);
        work.WriteFile("site/page.html", first);
        work.WriteFile("files.txt", $"{source}\tpage.html\n");
        var time = File.GetLastWriteTimeUtc(source);

        Assert.Contains("1 compressed now", await RunAsync(work.Path, output));
        Assert.Equal(first, Decompress(copy));

        Assert.Contains("0 compressed now", await RunAsync(work.Path, output));

        // A restore: new bytes, same length, the old time.
        await File.WriteAllTextAsync(source, second);
        File.SetLastWriteTimeUtc(source, time);

        Assert.Contains("1 compressed now", await RunAsync(work.Path, output));
        Assert.Equal(second, Decompress(copy));
    }

    private static async Task<string> RunAsync(string work, string output)
    {
        var start = new ProcessStartInfo(Environment.GetEnvironmentVariable("DOTNET_HOST_PATH") ?? "dotnet")
        {
            RedirectStandardOutput = true,
            RedirectStandardError = true,
            UseShellExecute = false,
            CreateNoWindow = true,
        };
        foreach (var argument in new[]
        {
            "run", "--file", FindCompressSite(), "--",
            Path.Combine(work, "files.txt"), output, ".html", Path.Combine(work, "published.txt"),
        })
        {
            start.ArgumentList.Add(argument);
        }

        using var process = Process.Start(start)!;
        var stdout = process.StandardOutput.ReadToEndAsync();
        var stderr = process.StandardError.ReadToEndAsync();
        await process.WaitForExitAsync();

        Assert.True(process.ExitCode == 0, $"compress-site.cs exited with {process.ExitCode}: {await stdout}{await stderr}");
        return await stdout;
    }

    private static string FindCompressSite()
    {
        for (var directory = new DirectoryInfo(AppContext.BaseDirectory); directory is not null; directory = directory.Parent)
        {
            var path = Path.Combine(directory.FullName, "src", "statichost", "compress-site.cs");
            if (File.Exists(path))
            {
                return path;
            }
        }

        throw new FileNotFoundException("compress-site.cs was not found above the test's directory.");
    }

    private static string Decompress(string path)
    {
        using var input = File.OpenRead(path);
        using var brotli = new BrotliStream(input, CompressionMode.Decompress);
        using var reader = new StreamReader(brotli);
        return reader.ReadToEnd();
    }
}
