using System.Security.Cryptography;

public sealed record InputFile(string Path, long Bytes, string Sha256);
public sealed record InputSnapshot(string Root, InputFile[] Files);

public static class CompressionInputs
{
    public static InputSnapshot Create(string directory)
    {
        var root = Path.GetFullPath(directory);
        var files = Directory.EnumerateFiles(root, "*", SearchOption.AllDirectories)
            .OrderBy(path => path, StringComparer.Ordinal)
            .Select(path => new InputFile(Path.GetRelativePath(root, path).Replace('\\', '/'),
                new FileInfo(path).Length, Hash(path))).ToArray();
        if (files.Length == 0) throw new InvalidDataException("Generated frontend output is empty.");
        return new InputSnapshot(root, files);
    }

    public static void Verify(InputSnapshot expected)
    {
        var actual = Create(expected.Root);
        if (!actual.Files.SequenceEqual(expected.Files))
        {
            throw new InvalidDataException("Generated frontend content changed between compression variants.");
        }
    }

    public static string Hash(string path)
    {
        using var stream = File.OpenRead(path);
        return Convert.ToHexString(SHA256.HashData(stream));
    }

    public static string Group(string path)
    {
        var parts = path.Split('/');
        return path.StartsWith("reference/api/", StringComparison.Ordinal)
            ? parts.Length > 3 ? string.Join('/', parts.Take(3)) : "reference/api"
            : parts.Length > 1 ? parts[0] : "(root)";
    }
}
