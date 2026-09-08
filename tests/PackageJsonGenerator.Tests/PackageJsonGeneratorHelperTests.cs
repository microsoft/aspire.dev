using PackageJsonGenerator.Helpers;

namespace PackageJsonGenerator.Tests;

public sealed class PackageJsonGeneratorHelperTests
{
    [Fact]
    public void BuildRawGitHubUrl_StripsGitSuffix()
    {
        var rawUrl = PackageJsonGenerator.BuildRawGitHubUrl(
            "https://github.com/microsoft/aspire.git",
            "abc123",
            "src/Aspire.Hosting/Foo.cs");

        Assert.Equal(
            "https://raw.githubusercontent.com/microsoft/aspire/abc123/src/Aspire.Hosting/Foo.cs",
            rawUrl);
    }

    [Fact]
    public void BuildRawGitHubUrl_ReturnsNullForNonGitHubRepositories()
    {
        var rawUrl = PackageJsonGenerator.BuildRawGitHubUrl(
            "https://example.com/org/repo",
            "abc123",
            "src/Foo.cs");

        Assert.Null(rawUrl);
    }

    [Fact]
    public void FindTypeDeclarationLine_PrefersClosestMatchingDeclaration()
    {
        var lines = new[]
        {
            "// class Widget",
            "public sealed class WidgetBuilder",
            "",
            "public sealed class Widget",
            "{",
            "}",
            "",
            "public sealed class Widget",
            "{",
            "}",
        };

        var declarationLine = PackageJsonGenerator.FindTypeDeclarationLine(lines, "Widget", pdbHintLine: 8);

        Assert.Equal(8, declarationLine);
    }

    [Theory]
    [InlineData("42-42", 42)]
    [InlineData("42-99", 42)]
    [InlineData(null, 0)]
    [InlineData("invalid", 0)]
    public void ParseStartLine_ParsesExpectedValue(string? sourceLines, int expected)
    {
        Assert.Equal(expected, PackageJsonGenerator.ParseStartLine(sourceLines));
    }

    [Theory]
    [InlineData("/_/src/Aspire.Hosting/Foo.cs", "src/Aspire.Hosting/Foo.cs")]
    [InlineData(
        @"C:\build\src\Aspire.Hosting.AWS\Lambda\LambdaExtensions.cs",
        "src/Aspire.Hosting.AWS/Lambda/LambdaExtensions.cs")]
    [InlineData(
        "/home/runner/work/repo/repo/src/Aspire.Hosting.DocumentDB/DocumentDBBuilderExtensions.cs",
        "src/Aspire.Hosting.DocumentDB/DocumentDBBuilderExtensions.cs")]
    [InlineData(@"src\Aspire.Hosting\Foo.cs", "src/Aspire.Hosting/Foo.cs")]
    public void NormalizeSourcePath_ReturnsRepositoryRelativePath(string path, string expected)
    {
        Assert.Equal(expected, PdbSourceReader.NormalizeSourcePath(path));
    }

    [Theory]
    [InlineData(@"C:\build\generated\Foo.cs")]
    [InlineData(@"C:generated\Foo.cs")]
    [InlineData("/home/runner/work/repo/generated/Foo.cs")]
    [InlineData("../src/Foo.cs")]
    public void NormalizeSourcePath_RejectsUnsafePath(string path)
    {
        Assert.Throws<InvalidDataException>(() => PdbSourceReader.NormalizeSourcePath(path));
    }

    [Fact]
    public void NormalizeSourcePath_IgnoresEmptyDocumentName()
    {
        Assert.Null(PdbSourceReader.NormalizeSourcePath(""));
    }
}
