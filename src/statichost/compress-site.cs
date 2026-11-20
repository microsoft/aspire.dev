// Writes a brotli copy of each text file of the site, for StaticHost to serve to clients that
// accept it. StaticHost's publish runs it (StaticHost/Site.targets); it also runs alone:
//
//   dotnet run --file compress-site.cs -- <files> <output directory> <extensions> <published list>
//
// <files>             One line per site file: its full path, a tab, its path in the site.
// <output directory>  Where the copies are written, at their path in the site plus ".br".
// <extensions>        The extensions to compress, separated by semicolons.
// <published list>    Written with the path in the site of each copy worth publishing.

using System.Collections.Concurrent;
using System.IO.Compression;
using System.Security.Cryptography;

if (args.Length != 4)
{
    Console.Error.WriteLine("Usage: compress-site.cs <files> <output directory> <extensions> <published list>");
    return 1;
}

var (filesPath, outputDirectory, extensionList, publishedPath) = (args[0], Path.GetFullPath(args[1]), args[2], args[3]);
var extensions = new HashSet<string>(extensionList.Split(';', StringSplitOptions.RemoveEmptyEntries), StringComparer.OrdinalIgnoreCase);

var files = File.ReadLines(filesPath)
    .Where(static line => line.Length > 0)
    .Select(static line => line.Split('\t', 2))
    .Select(static parts => (Source: parts[0], SitePath: parts[1].Replace('\\', '/')))
    .Where(file => extensions.Contains(Path.GetExtension(file.Source)))
    .ToList();

var published = new ConcurrentBag<string>();
var compressed = 0;
var stopwatch = System.Diagnostics.Stopwatch.StartNew();

// Brotli is single-threaded per stream, so one file per core keeps every core busy.
var parallelOptions = new ParallelOptions { MaxDegreeOfParallelism = Environment.ProcessorCount };
Parallel.ForEach(files, parallelOptions, file =>
{
    // Reuse a copy whose source has the same content, so an unchanged site compresses once. The
    // SHA-256 of the source the copy was written from is kept next to it (".br.sha256", which is
    // not published). A time, even an exact one, is not enough: a cache restore or an archive
    // extraction can give new content the old time, and the copy of the old content would be published.
    var target = Path.Combine(outputDirectory, file.SitePath + ".br");
    var stamp = target + ".sha256";
    string sourceHash;
    using (var source = File.OpenRead(file.Source))
    {
        sourceHash = Convert.ToHexString(SHA256.HashData(source));
    }

    if (!File.Exists(target) || !File.Exists(stamp) || File.ReadAllText(stamp) != sourceHash)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        // Without a stamp, a copy left half-updated by an interrupted run is written again.
        File.Delete(stamp);
        var temporary = target + ".tmp";
        using (var input = File.OpenRead(file.Source))
        using (var output = File.Create(temporary))
        // SmallestSize is brotli quality 11. On the site's HTML it writes about a tenth less than
        // quality 4-5 (16.4% of the original against 18.5%), and on /_astro's JS and CSS 22.8%
        // against 24.9%, at about 90 ms a page instead of 4. The copies are written once per
        // change and served many times, so the time is spent here rather than on every request.
        // Site.targets names the output directory after the quality, so copies written at
        // another quality are not reused.
        using (var brotli = new BrotliStream(output, CompressionLevel.SmallestSize))
        {
            input.CopyTo(brotli);
        }

        File.Move(temporary, target, overwrite: true);
        File.WriteAllText(stamp, sourceHash);
        Interlocked.Increment(ref compressed);
    }

    // A copy that saves nothing (tiny files) is not worth serving.
    if (new FileInfo(target).Length < new FileInfo(file.Source).Length)
    {
        published.Add(file.SitePath + ".br");
    }
});

File.WriteAllLines(publishedPath, published.Order(StringComparer.Ordinal));
Console.WriteLine($"Site: {files.Count} files to compress, {compressed} compressed now in {stopwatch.Elapsed.TotalSeconds:F0} s on {parallelOptions.MaxDegreeOfParallelism} threads, {published.Count} brotli copies published.");
return 0;
