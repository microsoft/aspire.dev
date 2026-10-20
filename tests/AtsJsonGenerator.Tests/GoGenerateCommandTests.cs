using System.CommandLine;
using System.Text.Json;
using AtsJsonGenerator.Helpers;
using static AtsJsonGenerator.Tests.GoTestDumps;

namespace AtsJsonGenerator.Tests;

[Collection(ConsoleCapture.CollectionName)]
public sealed class GoGenerateCommandTests
{
    [Fact]
    public void TransformFile_WritesTheGoDocsModel()
    {
        using var tempDirectory = new TempDirectory();

        var result = Generate(tempDirectory, PackageName, CreateWidgetDump());

        Assert.Equal(0, result.ExitCode);
        Assert.Equal(string.Empty, result.Error);

        var model = ReadGoPackage(result.OutputPath);
        Assert.Equal(PackageName, model.Package.Name);
        Assert.Equal("2.4.0", model.Package.Version);
        Assert.Equal("https://github.com/microsoft/aspire", model.Package.SourceRepository);
        Assert.Equal("abc123", model.Package.SourceCommit);
        Assert.Equal("AddWidget(name string) WidgetResource", Assert.Single(model.Functions).Signature);
        Assert.Equal(
            $"Generated: {result.OutputPath} ({model.Functions.Count} functions, {model.HandleTypes.Count} handles, {model.DtoTypes.Count} DTOs, {model.EnumTypes.Count} enums)",
            result.Output.Trim());
    }

    [Fact]
    public void TransformFile_WritesTheJsonContractTheDocsSiteReads()
    {
        using var tempDirectory = new TempDirectory();

        var result = Generate(tempDirectory, PackageName, CreateWidgetDump());

        using var document = JsonDocument.Parse(File.ReadAllText(result.OutputPath));
        var root = document.RootElement;
        Assert.Equal(
            ["package", "functions", "handleTypes", "dtoTypes", "enumTypes", "exportedValues"],
            root.EnumerateObject().Select(property => property.Name));

        var package = root.GetProperty("package");
        Assert.Equal("go", package.GetProperty("language").GetString());
        Assert.Equal("apphost/modules/aspire", package.GetProperty("importPath").GetString());
    }

    [Fact]
    public void TransformFile_DoesNotRewriteAnUnchangedModel()
    {
        using var tempDirectory = new TempDirectory();
        var first = Generate(tempDirectory, PackageName, CreateWidgetDump());
        var writeTime = new DateTime(2001, 1, 2, 0, 0, 0, DateTimeKind.Utc);
        File.SetLastWriteTimeUtc(first.OutputPath, writeTime);

        var second = Generate(tempDirectory, PackageName, CreateWidgetDump());

        Assert.Equal(0, second.ExitCode);
        Assert.StartsWith("Unchanged:", second.Output);
        Assert.Equal(writeTime, File.GetLastWriteTimeUtc(first.OutputPath));
    }

    [Fact]
    public void TransformFile_RejectsAnUnsupportedLanguage()
    {
        using var tempDirectory = new TempDirectory();

        var result = Generate(tempDirectory, PackageName, CreateWidgetDump(), language: "rust");

        Assert.Equal(1, result.ExitCode);
        Assert.Equal("Unsupported language 'rust'. Expected 'typescript' or 'go'.", result.Error.Trim());
        Assert.False(File.Exists(result.OutputPath));
    }

    [Fact]
    public void TransformFile_ReportsAMissingBaseFile()
    {
        using var tempDirectory = new TempDirectory();
        var basePath = Path.Combine(tempDirectory.Path, "missing.base.json");

        var result = Generate(tempDirectory, PackageName, CreateWidgetDump(), basePaths: [basePath]);

        Assert.Equal(1, result.ExitCode);
        Assert.Equal($"Base file not found: {basePath}", result.Error.Trim());
        Assert.False(File.Exists(result.OutputPath));
    }

    [Fact]
    public void TransformFile_FailsOnErrorDiagnosticsWithoutWritingTheModel()
    {
        using var tempDirectory = new TempDirectory();
        var dump = CreateWidgetDump();
        dump.Diagnostics.Add(new AtsDumpDiagnostic { Severity = "Error", Message = "scanner exploded" });

        var exception = Assert.Throws<InvalidOperationException>(() => Generate(tempDirectory, PackageName, dump));

        Assert.Contains("scanner exploded", exception.Message);
        Assert.False(File.Exists(Path.Combine(tempDirectory.Path, $"{PackageName}.json")));
    }

    [Fact]
    public void TransformFile_ReportsToleratedKnownScannerDiagnostics()
    {
        using var tempDirectory = new TempDirectory();
        var dump = new AtsDumpRoot
        {
            HandleTypes = AtsTransformerHelperTests.KnownProxyHandleTypes,
            Diagnostics =
            [
                new() { Severity = "Error", Message = AtsTransformerHelperTests.KustoInheritedDuplicate },
                new() { Severity = "Error", Message = AtsTransformerHelperTests.NetworkInheritedDuplicate },
            ],
        };

        Assert.Throws<InvalidOperationException>(() => Generate(tempDirectory, "Contoso.Tools", dump));

        var result = Generate(tempDirectory, "Contoso.Tools", dump, tolerateKnownScannerDiagnostics: true);

        Assert.Equal(0, result.ExitCode);
        Assert.True(File.Exists(result.OutputPath));
        var lines = result.Output.Split(Environment.NewLine);
        Assert.Contains($"{KnownScannerDiagnostics.ToleratedOutputPrefix} {AtsTransformerHelperTests.KustoInheritedDuplicate}", lines);
        Assert.Contains($"{KnownScannerDiagnostics.ToleratedOutputPrefix} {AtsTransformerHelperTests.NetworkInheritedDuplicate}", lines);
    }

    [Fact]
    public void TransformFile_ListsTheCapabilitiesTheGoSdkDoesNotExpose()
    {
        using var tempDirectory = new TempDirectory();
        var resource = HandleRef(ResourceTypeId, isInterface: true);
        var dump = CreateWidgetDump();
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = ResourceTypeId, IsInterface = true });
        dump.Capabilities.Add(Method("Contoso.Widgets/zeta", "zeta", resource, Primitive("string"), expandedTargets: []));
        dump.Capabilities.Add(Method("Contoso.Widgets/alpha", "alpha", resource, Primitive("string"), expandedTargets: []));

        var result = Generate(tempDirectory, PackageName, dump);

        Assert.Equal(0, result.ExitCode);
        Assert.Contains(
            "Skipped 2 capabilities without a concrete Go type: Contoso.Widgets/alpha, Contoso.Widgets/zeta",
            result.Output.Split(Environment.NewLine));
        Assert.Equal(
            ["Contoso.Widgets/addWidget"],
            ReadGoPackage(result.OutputPath).Functions.Select(function => function.CapabilityId));
    }

    [Fact]
    public void TransformFile_LeavesOutTheTypesOfABasePackageAndKeepsTheirNames()
    {
        using var tempDirectory = new TempDirectory();
        var core = Generate(tempDirectory, "Aspire.Hosting", CreateCoreDump());
        Assert.Equal(0, core.ExitCode);

        var tools = Generate(tempDirectory, "Contoso.Tools", CreateToolsDump(), basePaths: [core.OutputPath]);

        Assert.Equal(0, tools.ExitCode);
        var model = ReadGoPackage(tools.OutputPath);

        var function = Assert.Single(model.Functions);
        Assert.Equal("Contoso.Tools/addTool", function.CapabilityId);
        Assert.Equal("AddTool(name string, mode CoreMode, options ...*CoreOptions) ToolResource", function.Signature);
        Assert.Equal(["ToolResource"], model.HandleTypes.Select(handle => handle.Name));
        Assert.Equal(["ToolOptions"], model.DtoTypes.Select(dto => dto.Name));
        Assert.Equal(["ToolKind"], model.EnumTypes.Select(enumType => enumType.Name));
        Assert.Equal(["Defaults", "ToolDefaults"], model.ExportedValues.Select(group => group.Name));

        var defaults = Assert.Single(model.ExportedValues, group => group.Name == "Defaults");
        Assert.Equal(["Timeout"], defaults.Values.Select(value => value.Path));
    }

    [Fact]
    public void TransformFile_RemovesBaseCapabilitiesFromTheHandlesThatCarryThem()
    {
        using var tempDirectory = new TempDirectory();
        var basePath = Path.Combine(tempDirectory.Path, "base.json");
        File.WriteAllText(basePath, JsonSerializer.Serialize(new GoPackageModel
        {
            Package = new GoPackageInfo { Name = "Contoso.Base" },
            Functions =
            [
                new GoFunctionModel
                {
                    Name = "LegacyOp",
                    CapabilityId = "Contoso.Widgets/legacyOp",
                    QualifiedName = "legacyOp",
                    Kind = "InstanceMethod",
                    Signature = "LegacyOp() error",
                    ReturnType = "error",
                    ErrorModel = GoErrorModels.Returned,
                },
            ],
        }));

        var dump = CreateDump();
        dump.Capabilities.AddRange(
        [
            Method("Contoso.Widgets/legacyOp", "legacyOp", GadgetRef(), Primitive("void"), capabilityKind: "InstanceMethod"),
            Method("Contoso.Widgets/addNote", "addNote", GadgetRef(), Primitive("void"), capabilityKind: "InstanceMethod"),
        ]);

        var result = Generate(tempDirectory, PackageName, dump, basePaths: [basePath]);

        Assert.Equal(0, result.ExitCode);
        var model = ReadGoPackage(result.OutputPath);
        Assert.Equal(["Contoso.Widgets/addNote"], model.Functions.Select(function => function.CapabilityId));

        var gadget = Assert.Single(model.HandleTypes, handle => handle.Name == "GadgetResource");
        Assert.Equal(["Contoso.Widgets/addNote"], gadget.Capabilities.Select(capability => capability.CapabilityId));
    }

    [Fact]
    public async Task Command_GeneratesGoDocsJsonForTheGoLanguage()
    {
        using var tempDirectory = new TempDirectory();
        var inputPath = WriteDump(Path.Combine(tempDirectory.Path, "input.json"), CreateWidgetDump());
        var outputPath = Path.Combine(tempDirectory.Path, "output", "widgets.json");

        var result = await CaptureAsync(() => GenerateCommand.GetCommand()
            .Parse(["--input", inputPath, "--output", outputPath, "--package-name", PackageName, "--language", "go"])
            .InvokeAsync());

        Assert.Equal(0, result.ExitCode);
        var model = ReadGoPackage(outputPath);
        Assert.Equal(PackageName, model.Package.Name);
        Assert.Equal("AddWidget(name string) WidgetResource", Assert.Single(model.Functions).Signature);
    }

    [Fact]
    public async Task Command_GeneratesTypeScriptDocsJsonByDefault()
    {
        using var tempDirectory = new TempDirectory();
        var inputPath = WriteDump(Path.Combine(tempDirectory.Path, "input.json"), CreateWidgetDump());
        var outputPath = Path.Combine(tempDirectory.Path, "output", "widgets.json");

        var result = await CaptureAsync(() => GenerateCommand.GetCommand()
            .Parse(["--input", inputPath, "--output", outputPath, "--package-name", PackageName])
            .InvokeAsync());

        Assert.Equal(0, result.ExitCode);
        using var document = JsonDocument.Parse(File.ReadAllText(outputPath));
        Assert.Equal("typescript", document.RootElement.GetProperty("package").GetProperty("language").GetString());
    }

    [Fact]
    public void Command_RejectsALanguageItDoesNotSupport()
    {
        var parseResult = GenerateCommand.GetCommand()
            .Parse(["--input", "input.json", "--output", "output.json", "--language", "rust"]);

        Assert.Contains(parseResult.Errors, error => error.Message.Contains("rust", StringComparison.Ordinal));
    }

    [Fact]
    public async Task BatchCommand_GeneratesGoDocsJsonForEachInput()
    {
        using var tempDirectory = new TempDirectory();
        var inputPath = WriteDump(Path.Combine(tempDirectory.Path, "input", $"{PackageName}.json"), CreateWidgetDump());
        var outputDirectory = Path.Combine(tempDirectory.Path, "output");
        var rootCommand = GenerateCommand.GetCommand();
        rootCommand.Add(BatchGenerateCommand.GetCommand());

        var result = await CaptureAsync(() => rootCommand
            .Parse(["batch", "--input", inputPath, "--output-dir", outputDirectory, "--language", "go"])
            .InvokeAsync());

        Assert.Equal(0, result.ExitCode);
        Assert.Equal(string.Empty, result.Error);
        var model = ReadGoPackage(Path.Combine(outputDirectory, $"{PackageName}.json"));
        Assert.Equal("AddWidget(name string) WidgetResource", Assert.Single(model.Functions).Signature);
    }

    private static AtsDumpRoot CreateWidgetDump()
    {
        var dump = CreateDump();
        dump.Capabilities.Add(Method(
            "Contoso.Widgets/addWidget",
            "addWidget",
            BuilderRef(),
            WidgetRef(),
            [Param("name", Primitive("string"))],
            returnsBuilder: true));

        return dump;
    }

    private static string WriteDump(string path, AtsDumpRoot dump)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        File.WriteAllText(path, JsonSerializer.Serialize(dump));

        return path;
    }

    /// <summary>
    /// Runs <see cref="GenerateCommand.TransformFile"/> against a dump written next to the output,
    /// which is <c>{packageName}.json</c> in the same directory.
    /// </summary>
    private static GenerateResult Generate(
        TempDirectory tempDirectory,
        string packageName,
        AtsDumpRoot dump,
        string[]? basePaths = null,
        bool tolerateKnownScannerDiagnostics = false,
        string language = GenerateCommand.GoLanguage)
    {
        var inputPath = WriteDump(Path.Combine(tempDirectory.Path, $"{packageName}.dump.json"), dump);
        var outputPath = Path.Combine(tempDirectory.Path, $"{packageName}.json");

        var (exitCode, output, error) = Capture(() => GenerateCommand.TransformFile(
            inputPath,
            outputPath,
            packageName,
            version: null,
            sourceRepo: "https://github.com/microsoft/aspire",
            sourceCommit: "abc123",
            basePaths,
            tolerateKnownScannerDiagnostics,
            language));

        return new GenerateResult(outputPath, exitCode, output, error);
    }

    private static GoPackageModel ReadGoPackage(string path)
    {
        var model = JsonSerializer.Deserialize<GoPackageModel>(File.ReadAllText(path));
        Assert.NotNull(model);

        return model;
    }

    private static (int ExitCode, string Output, string Error) Capture(Func<int> action) =>
        CaptureAsync(() => Task.FromResult(action())).GetAwaiter().GetResult();

    // Console is process-wide, so every class that redirects it shares ConsoleCapture.CollectionName.
    private static async Task<(int ExitCode, string Output, string Error)> CaptureAsync(Func<Task<int>> action)
    {
        var originalOut = Console.Out;
        var originalError = Console.Error;
        using var capturedOut = new StringWriter();
        using var capturedError = new StringWriter();
        int exitCode;
        try
        {
            Console.SetOut(capturedOut);
            Console.SetError(capturedError);
            exitCode = await action();
        }
        finally
        {
            Console.SetOut(originalOut);
            Console.SetError(originalError);
        }

        return (exitCode, capturedOut.ToString(), capturedError.ToString());
    }

    private sealed record GenerateResult(string OutputPath, int ExitCode, string Output, string Error);

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = Directory.CreateTempSubdirectory("ats-json-generator-tests-").FullName;
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
