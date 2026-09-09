using System.Text.Json;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

public sealed class SupportMatrixAggregatorTests
{
    [Fact]
    public void AggregateCommand_FullReconciliationContainsExactlyStagedModules()
    {
        using var directory = new TestDirectory();
        var staged = Directory.CreateDirectory(Path.Combine(directory.Path, "staged")).FullName;
        var output = Path.Combine(directory.Path, "apphost-language-support.json");
        WriteModule(staged, "z.json", CreateModule("Zulu.Hosting", "2.0.0", "Zulu/add"));
        WriteModule(staged, "a.json", CreateModule("Alpha.Hosting", "1.0.0", "Alpha/add"));

        Assert.Equal(0, SupportMatrixCommand.Aggregate(staged, output));

        var json = File.ReadAllText(output);
        var matrix = JsonSerializer.Deserialize<AppHostSupportMatrixModel>(json);
        Assert.NotNull(matrix);
        Assert.Equal(["Alpha.Hosting@1.0.0", "Zulu.Hosting@2.0.0"], matrix.Packages.Keys);
        Assert.True(
            json.IndexOf("\"Alpha.Hosting@1.0.0\"", StringComparison.Ordinal) <
            json.IndexOf("\"Zulu.Hosting@2.0.0\"", StringComparison.Ordinal));
    }

    [Fact]
    public void AggregateCommand_PartialReconciliationPreservesUnaffectedAndReplacesByPackageName()
    {
        using var directory = new TestDirectory();
        var staged = Directory.CreateDirectory(Path.Combine(directory.Path, "staged")).FullName;
        var baseline = Directory.CreateDirectory(Path.Combine(directory.Path, "baseline")).FullName;
        var output = Path.Combine(directory.Path, "apphost-language-support.json");

        WriteModule(baseline, "alpha.json", CreateModule("Alpha.Hosting", "1.0.0", "Alpha/add"));
        WriteModule(baseline, "beta-old.json", CreateModule("Beta.Hosting", "1.0.0", "Beta/old"));
        WriteModule(baseline, "removed.json", CreateModule("Removed.Hosting", "1.0.0", "Removed/old"));
        WriteModule(staged, "beta-new.json", CreateModule("Beta.Hosting", "2.0.0", "Beta/new"));
        WriteModule(staged, "gamma.json", CreateModule("Gamma.Hosting", "1.0.0", "Gamma/add"));

        Assert.Equal(
            0,
            SupportMatrixCommand.Aggregate(
                staged,
                output,
                baseline,
                ["Beta.Hosting", "Gamma.Hosting", "Removed.Hosting"]));

        var matrix = JsonSerializer.Deserialize<AppHostSupportMatrixModel>(File.ReadAllText(output));
        Assert.NotNull(matrix);
        Assert.Equal(
            ["Alpha.Hosting@1.0.0", "Beta.Hosting@2.0.0", "Gamma.Hosting@1.0.0"],
            matrix.Packages.Keys);
        Assert.DoesNotContain("Beta.Hosting@1.0.0", matrix.Packages.Keys);
        Assert.DoesNotContain("Removed.Hosting@1.0.0", matrix.Packages.Keys);
        Assert.Contains(
            "capability:Beta/new",
            matrix.Packages["Beta.Hosting@2.0.0"].Items.Keys);
    }

    [Fact]
    public void AggregateCommand_IsStableAndPreservesPerPackageDumpProvenance()
    {
        using var directory = new TestDirectory();
        var staged = Directory.CreateDirectory(Path.Combine(directory.Path, "staged")).FullName;
        var output = Path.Combine(directory.Path, "apphost-language-support.json");
        WriteModule(staged, "alpha.json", CreateModule("Alpha.Hosting", "1.0.0", "Alpha/add"));

        Assert.Equal(0, SupportMatrixCommand.Aggregate(staged, output));
        var timestamp = new DateTime(2002, 2, 3, 4, 5, 6, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(output, timestamp);
        Assert.Equal(0, SupportMatrixCommand.Aggregate(staged, output));
        Assert.Equal(timestamp, File.GetLastWriteTimeUtc(output));

        var matrix = JsonSerializer.Deserialize<AppHostSupportMatrixModel>(File.ReadAllText(output));
        var package = Assert.Single(matrix!.Packages).Value;
        Assert.Equal("13.2.0", package.DumpProvenance?.CliVersion);
        Assert.Equal("product-commit", package.DumpProvenance?.ProductCommit);
    }

    [Fact]
    public void AggregateCommand_PartialReconciliationOnlyPublishesCommonRootDumpProvenance()
    {
        using var directory = new TestDirectory();
        var staged = Directory.CreateDirectory(Path.Combine(directory.Path, "staged")).FullName;
        var baseline = Directory.CreateDirectory(Path.Combine(directory.Path, "baseline")).FullName;
        var output = Path.Combine(directory.Path, "apphost-language-support.json");

        WriteModule(
            baseline,
            "alpha.json",
            CreateModule("Alpha.Hosting", "1.0.0", "Alpha/add", "13.1.0", "old-product"));
        WriteModule(
            staged,
            "beta.json",
            CreateModule("Beta.Hosting", "2.0.0", "Beta/add", "13.2.0", "new-product"));

        Assert.Equal(
            0,
            SupportMatrixCommand.Aggregate(staged, output, baseline, ["Beta.Hosting"]));

        var matrix = JsonSerializer.Deserialize<AppHostSupportMatrixModel>(File.ReadAllText(output));
        Assert.NotNull(matrix);
        Assert.Null(matrix.GeneratedFrom.DumpProvenance);
        Assert.Equal(
            "old-product",
            matrix.Packages["Alpha.Hosting@1.0.0"].DumpProvenance?.ProductCommit);
        Assert.Equal(
            "new-product",
            matrix.Packages["Beta.Hosting@2.0.0"].DumpProvenance?.ProductCommit);
    }

    private static AppHostModuleModel CreateModule(
        string packageName,
        string version,
        string capabilityId,
        string cliVersion = "13.2.0",
        string productCommit = "product-commit")
        => new()
        {
            GeneratorProvenance = new AppHostGeneratorProvenanceModel
            {
                Repository = AtsTransformer.UpstreamRepository,
                Commit = AtsTransformer.UpstreamCommit,
                LockFile = AtsTransformer.UpstreamLockFile,
            },
            DumpProvenance = new AppHostDumpProvenanceModel
            {
                CliVersion = cliVersion,
                ProductCommit = productCommit,
            },
            Package = new AppHostPackageInfo
            {
                Name = packageName,
                Version = version,
            },
            Items =
            [
                new AppHostItemModel
                {
                    Id = $"capability:{capabilityId}",
                    Kind = "capability",
                    Name = capabilityId.Split('/')[^1],
                    CapabilityId = capabilityId,
                    Projections = AtsTransformer.Languages.ToDictionary(
                        language => language,
                        language => new AppHostProjectionModel
                        {
                            Status = "supported",
                            Identifier = capabilityId.Split('/')[^1],
                            SourceFile = language + ".generated",
                        },
                        StringComparer.Ordinal),
                },
            ],
        };

    private static void WriteModule(
        string directory,
        string fileName,
        AppHostModuleModel module)
        => File.WriteAllText(
            Path.Combine(directory, fileName),
            JsonSerializer.Serialize(module));

    private sealed class TestDirectory : IDisposable
    {
        public TestDirectory()
        {
            Path = System.IO.Path.Combine(
                AppContext.BaseDirectory,
                "support-test-" + Guid.NewGuid().ToString("N"));
            Directory.CreateDirectory(Path);
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch
            {
            }
        }
    }
}
