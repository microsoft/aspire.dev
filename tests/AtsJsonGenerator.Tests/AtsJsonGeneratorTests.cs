using System.CommandLine;
using System.Text.Json;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

public sealed class AtsJsonGeneratorTests
{
    [Fact]
    public void Transform_ReconcilesEveryAtsIdentityAndProjection()
    {
        var dump = LoadFixture();

        var result = AtsTransformer.Transform(
            dump,
            "Contoso.Hosting.Widgets",
            sourceRepository: "https://github.com/dotnet/aspire",
            sourceCommit: "62028348b5d02dfc8f8baf03a4472946537b0d16");

        Assert.Equal("1.0", result.SchemaVersion);
        Assert.Equal(AtsTransformer.UpstreamRepository, result.GeneratorProvenance.Repository);
        Assert.Equal(AtsTransformer.UpstreamCommit, result.GeneratorProvenance.Commit);
        Assert.Equal(AtsTransformer.UpstreamLockFile, result.GeneratorProvenance.LockFile);
        Assert.Null(result.DumpProvenance);
        Assert.Equal("1.2.3", result.Package.Version);
        Assert.Equal("https://github.com/microsoft/aspire", result.Package.SourceRepository);
        Assert.Equal(dump.Capabilities.Count, result.Items.Count(item => item.Kind == "capability"));
        Assert.Equal(dump.HandleTypes.Count, result.Items.Count(item => item.Kind == "handle"));
        Assert.Equal(dump.DtoTypes.Count, result.Items.Count(item => item.Kind == "dto"));
        Assert.Equal(dump.EnumTypes.Count, result.Items.Count(item => item.Kind == "enum"));
        Assert.Equal(dump.ExportedValues.Count, result.Items.Count(item => item.Kind == "exportedValue"));

        var expectedIdentities = dump.Capabilities.Select(capability => $"capability:{capability.CapabilityId}")
            .Concat(dump.HandleTypes.Select(handle => $"handle:{AtsTransformer.StripAssemblyPrefix(handle.AtsTypeId)}"))
            .Concat(dump.DtoTypes.Select(dto => $"dto:{AtsTransformer.StripAssemblyPrefix(dto.TypeId)}"))
            .Concat(dump.EnumTypes.Select(enumType => $"enum:{enumType.TypeId["enum:".Length..]}"))
            .Concat(dump.ExportedValues.Select(value => $"exportedValue:{string.Join(".", value.PathSegments)}"))
            .Order(StringComparer.Ordinal);
        Assert.Equal(expectedIdentities, result.Items.Select(item => item.Id).Order(StringComparer.Ordinal));

        foreach (var item in result.Items)
        {
            Assert.Equal(AtsTransformer.Languages, item.Projections.Keys);
            foreach (var projection in item.Projections.Values)
            {
                Assert.Contains(projection.Status, new[] { "supported", "unsupported" });
                Assert.Equal("source-derived", projection.Validation);
                if (projection.Status == "unsupported")
                {
                    Assert.False(string.IsNullOrWhiteSpace(projection.Reason));
                }
                else
                {
                    Assert.False(string.IsNullOrWhiteSpace(projection.Identifier));
                    Assert.False(string.IsNullOrWhiteSpace(projection.SourceFile));
                }
            }
        }
    }

    [Fact]
    public void Transform_ConsumesCompleteStableDumpSchema()
    {
        var dump = LoadFixture();
        var labels = Assert.Single(
            dump.Capabilities,
            capability => capability.CapabilityId.EndsWith("/getLabels", StringComparison.Ordinal));
        Assert.Equal("string", labels.ReturnType!.KeyType!.TypeId);
        Assert.Equal("string", labels.ReturnType.ValueType!.TypeId);

        var target = Assert.Single(
            dump.Capabilities,
            capability => capability.CapabilityId.EndsWith("/chooseTarget", StringComparison.Ordinal))
            .Parameters.Single(parameter => parameter.Name == "target");
        Assert.Equal(2, target.Type!.UnionTypes!.Count);

        var exported = Assert.Single(
            dump.ExportedValues,
            value => value.PathSegments.SequenceEqual(["WidgetDefaults", "Options"]));
        Assert.Equal("WidgetDefaults.Options", string.Join(".", exported.PathSegments));
        Assert.Equal(JsonValueKind.Object, exported.Value!.Value.ValueKind);
        Assert.Null(exported.Description);
    }

    [Fact]
    public void Transform_EmitsStructuredTypeAndValueProjectionFields()
    {
        var result = AtsTransformer.Transform(LoadFixture(), "Contoso.Hosting.Widgets");

        var dto = result.Items.Single(item => item.Id == "dto:Contoso.WidgetOptions");
        Assert.All(dto.Projections.Values, projection =>
        {
            Assert.False(string.IsNullOrWhiteSpace(projection.Identifier));
            Assert.NotEmpty(projection.Fields);
            Assert.All(projection.Fields, field =>
            {
                Assert.False(string.IsNullOrWhiteSpace(field.Name));
                Assert.False(string.IsNullOrWhiteSpace(field.Type));
            });
        });

        var enumType = result.Items.Single(item => item.Id == "enum:Contoso.WidgetMode");
        Assert.All(enumType.Projections.Values, projection =>
        {
            Assert.Equal(2, projection.Members.Count);
            Assert.All(projection.Members, member =>
                Assert.NotNull(member.Value));
        });

        var exportedValue = result.Items.Single(item =>
            item.Id == "exportedValue:WidgetDefaults.Options");
        Assert.All(exportedValue.Projections.Values, projection =>
            Assert.False(string.IsNullOrWhiteSpace(projection.ValueExpression)));

        var handle = result.Items.Single(item => item.Id == "handle:Contoso.WidgetResource");
        Assert.All(handle.Projections.Values, projection =>
        {
            Assert.Contains(projection.Kind, new[] { "interface", "class", "handle" });
            Assert.NotNull(projection.ImplementedInterfaces);
        });
    }

    [Fact]
    public void TransformFile_WritesSemanticPackageSupportMatrixAndLf()
    {
        using var directory = new TestDirectory();
        var output = Path.Combine(directory.Path, "apphost-modules", "Contoso.Hosting.Widgets.json");
        var support = Path.Combine(directory.Path, "support", "Contoso.Hosting.Widgets.json");

        var exitCode = GenerateCommand.TransformFile(
            FixturePath,
            output,
            packageName: "Contoso.Hosting.Widgets",
            version: null,
            sourceRepo: null,
            sourceCommit: null,
            supportOutputPath: support,
            dumpCliVersion: "13.2.0-preview.1",
            dumpProductCommit: "abcdef123456",
            dumpGeneratedAt: "2026-09-09T09:30:00Z");

        Assert.Equal(0, exitCode);
        Assert.DoesNotContain("\r", File.ReadAllText(output));
        var supportJson = File.ReadAllText(support);
        Assert.DoesNotContain("\r", supportJson);
        Assert.Contains("\"supported\": false", supportJson);

        var package = JsonSerializer.Deserialize<AppHostModuleModel>(File.ReadAllText(output));
        var matrix = JsonSerializer.Deserialize<AppHostSupportMatrixModel>(supportJson);
        Assert.NotNull(package);
        Assert.NotNull(matrix);
        Assert.Equal("13.2.0-preview.1", package.DumpProvenance?.CliVersion);
        Assert.Equal("abcdef123456", package.DumpProvenance?.ProductCommit);
        Assert.Equal("2026-09-09T09:30:00Z", package.DumpProvenance?.GeneratedAt);
        Assert.Equal(AtsTransformer.UpstreamRepository, matrix.GeneratedFrom.Repository);
        Assert.Equal(AtsTransformer.UpstreamCommit, matrix.GeneratedFrom.Commit);
        Assert.Equal(AtsTransformer.UpstreamLockFile, matrix.GeneratedFrom.LockFile);
        Assert.Equal(package.DumpProvenance?.CliVersion, matrix.GeneratedFrom.DumpProvenance?.CliVersion);
        Assert.Equal(package.DumpProvenance?.ProductCommit, matrix.GeneratedFrom.DumpProvenance?.ProductCommit);

        var supportPackage = Assert.Single(matrix.Packages);
        Assert.Equal("Contoso.Hosting.Widgets@1.2.3", supportPackage.Key);
        Assert.Equal(package.Items.Count, supportPackage.Value.Items.Count);
        Assert.All(supportPackage.Value.Items.Values, entry =>
        {
            Assert.Equal(AtsTransformer.Languages, entry.Languages.Keys);
            Assert.All(entry.Languages.Values, language =>
                Assert.Equal("source-derived", language.Validation));
        });

        var unsupported = supportPackage.Value.Items[
            "capability:Contoso.Hosting.Widgets/legacyCallback"];
        Assert.All(unsupported.Languages.Values, status =>
        {
            Assert.False(status.Supported);
            Assert.Equal("Callback defaults cannot be represented faithfully.", status.Reason);
        });
    }

    [Fact]
    public async Task RootCommand_PackageVersionGeneratesOutputFile()
    {
        using var directory = new TestDirectory();
        var output = Path.Combine(directory.Path, "Contoso.Hosting.Widgets.json");
        var command = GenerateCommand.GetCommand();

        var exitCode = await command.Parse(
            [
                "--input", FixturePath,
                "--output", output,
                "--package-name", "Contoso.Hosting.Widgets",
                "--package-version", "13.5.3",
            ])
            .InvokeAsync();

        Assert.Equal(0, exitCode);
        Assert.True(File.Exists(output));
        var model = JsonSerializer.Deserialize<AppHostModuleModel>(File.ReadAllText(output));
        Assert.NotNull(model);
        Assert.Equal("13.5.3", model.Package.Version);
    }

    [Fact]
    public void BaseDeduplication_UsesSharedAtsIdentityAcrossAllProjections()
    {
        using var directory = new TestDirectory();
        var source = AtsTransformer.Transform(LoadFixture(), "Contoso.Hosting.Widgets");
        var baseModel = new AppHostModuleModel
        {
            GeneratorProvenance = source.GeneratorProvenance,
            Package = new AppHostPackageInfo { Name = "Aspire.Hosting" },
            Items =
            [
                source.Items.Single(item => item.Id == "capability:Contoso.Hosting.Widgets/addWidget"),
                source.Items.Single(item => item.Id == "dto:Contoso.WidgetOptions"),
                source.Items.Single(item => item.Id == "exportedValue:WidgetDefaults.Mode"),
            ],
        };
        var basePath = Path.Combine(directory.Path, "base.json");
        var outputPath = Path.Combine(directory.Path, "output.json");
        File.WriteAllText(basePath, JsonSerializer.Serialize(baseModel));

        var exitCode = GenerateCommand.TransformFile(
            FixturePath,
            outputPath,
            packageName: "Contoso.Hosting.Widgets",
            version: null,
            sourceRepo: null,
            sourceCommit: null,
            basePath: basePath);

        Assert.Equal(0, exitCode);
        var result = JsonSerializer.Deserialize<AppHostModuleModel>(File.ReadAllText(outputPath));
        Assert.NotNull(result);
        Assert.DoesNotContain(result.Items, item => baseModel.Items.Any(baseItem => baseItem.Id == item.Id));
        Assert.All(result.Items, item => Assert.Equal(AtsTransformer.Languages, item.Projections.Keys));
    }

    [Fact]
    public void TransformFile_DoesNotRewriteUnchangedOutput()
    {
        using var directory = new TestDirectory();
        var output = Path.Combine(directory.Path, "module.json");

        Assert.Equal(0, GenerateCommand.TransformFile(
            FixturePath,
            output,
            packageName: "Contoso.Hosting.Widgets",
            version: null,
            sourceRepo: null,
            sourceCommit: null));

        var stableTimestamp = new DateTime(2001, 1, 2, 3, 4, 5, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(output, stableTimestamp);

        Assert.Equal(0, GenerateCommand.TransformFile(
            FixturePath,
            output,
            packageName: "Contoso.Hosting.Widgets",
            version: null,
            sourceRepo: null,
            sourceCommit: null));

        Assert.Equal(stableTimestamp, File.GetLastWriteTimeUtc(output));
    }

    [Fact]
    public void ProjectionAccounting_FailsWhenAnyLanguageIsAbsent()
    {
        var result = AtsTransformer.Transform(LoadFixture(), "Contoso.Hosting.Widgets");
        result.Items[0].Projections.Remove("rust");

        var exception = Assert.Throws<InvalidOperationException>(
            () => AtsTransformer.ValidateProjectionAccounting(result.Items));

        Assert.Contains("missing its 'rust' projection", exception.Message);
    }

    [Fact]
    public void TransformFile_ReturnsErrorWhenInputIsMissing()
    {
        using var directory = new TestDirectory();
        var exitCode = GenerateCommand.TransformFile(
            Path.Combine(directory.Path, "missing.json"),
            Path.Combine(directory.Path, "output.json"),
            packageName: "Contoso.Tools",
            version: null,
            sourceRepo: null,
            sourceCommit: null);

        Assert.Equal(1, exitCode);
    }

    internal static AtsDumpRoot LoadFixture()
        => JsonSerializer.Deserialize<AtsDumpRoot>(File.ReadAllText(FixturePath))
            ?? throw new InvalidOperationException("Synthetic ATS fixture could not be read.");

    internal static string FixturePath
        => Path.Combine(AppContext.BaseDirectory, "Fixtures", "synthetic-ats.json");

    private sealed class TestDirectory : IDisposable
    {
        public TestDirectory()
        {
            Path = System.IO.Path.Combine(
                AppContext.BaseDirectory,
                "test-output-" + Guid.NewGuid().ToString("N"));
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
