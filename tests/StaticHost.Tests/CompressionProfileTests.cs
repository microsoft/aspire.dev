namespace StaticHost.Tests;

public sealed class CompressionProfileTests
{
    [Fact]
    public void SnapshotDetectsChangedContentWithUnchangedFileSize()
    {
        using var root = new TempWebRoot();
        root.WriteFile("index.html", "before");
        var snapshot = CompressionInputs.Create(root.Path);
        CompressionInputs.Verify(snapshot);
        root.WriteFile("index.html", "change");
        Assert.Throws<InvalidDataException>(() => CompressionInputs.Verify(snapshot));
    }

    [Fact]
    public void SnapshotDetectsAddedAndRemovedFiles()
    {
        using var root = new TempWebRoot();
        root.WriteFile("index.html", "home");
        var snapshot = CompressionInputs.Create(root.Path);
        root.WriteFile("other.html", "other");
        Assert.Throws<InvalidDataException>(() => CompressionInputs.Verify(snapshot));
        File.Delete(Path.Combine(root.Path, "other.html"));
        CompressionInputs.Verify(snapshot);
        File.Delete(Path.Combine(root.Path, "index.html"));
        Assert.Throws<InvalidDataException>(() => CompressionInputs.Verify(snapshot));
    }

    [Theory]
    [InlineData("reference/api/csharp/type/index.html", "reference/api/csharp")]
    [InlineData("reference/api/typescript/type.md.br", "reference/api/typescript")]
    [InlineData("reference/api/index.html.br", "reference/api")]
    [InlineData("index.html", "(root)")]
    [InlineData("_astro/app.css.br", "_astro")]
    public void SizeGroupsKeepApiLanguagesAndStaticAssetsSeparate(string path, string expected)
    {
        Assert.Equal(expected, CompressionInputs.Group(path));
    }
}
