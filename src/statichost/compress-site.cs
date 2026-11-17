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

Parallel.ForEach(files, file =>
{
    // Reuse a copy stamped with its source's exact time, so an unchanged site compresses once.
    // "Newer than the source" is not enough: a cache restore or an archive extraction gives
    // new content an older time, and the copy of the old content would be published.
    var target = Path.Combine(outputDirectory, file.SitePath + ".br");
    var sourceTime = File.GetLastWriteTimeUtc(file.Source);
    if (!File.Exists(target) || File.GetLastWriteTimeUtc(target) != sourceTime)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(target)!);
        var temporary = target + ".tmp";
        using (var input = File.OpenRead(file.Source))
        using (var output = File.Create(temporary))
        // Optimal is brotli quality 4, which the SDK used at publish (_BlazorBrotliCompressionLevel).
        // SmallestSize (11) saves about a sixth more but compresses about 100 times slower.
        using (var brotli = new BrotliStream(output, CompressionLevel.Optimal))
        {
            input.CopyTo(brotli);
        }

        File.SetLastWriteTimeUtc(temporary, sourceTime);
        File.Move(temporary, target, overwrite: true);
        Interlocked.Increment(ref compressed);
    }

    // A copy that saves nothing (tiny files) is not worth serving.
    if (new FileInfo(target).Length < new FileInfo(file.Source).Length)
    {
        published.Add(file.SitePath + ".br");
    }
});

File.WriteAllLines(publishedPath, published.Order(StringComparer.Ordinal));
Console.WriteLine($"Site: {files.Count} files to compress, {compressed} compressed now, {published.Count} brotli copies published.");
return 0;
