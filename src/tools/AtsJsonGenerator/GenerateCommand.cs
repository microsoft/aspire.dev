using System.CommandLine;
using System.Diagnostics.CodeAnalysis;
using System.Text.Encodings.Web;
using System.Text.Json;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator;

/// <summary>
/// Root command: transform a single <c>aspire sdk dump --format json</c> output file
/// into a docs-site JSON file.
/// </summary>
internal static class GenerateCommand
{
    internal const string TypeScriptLanguage = "typescript";
    internal const string GoLanguage = "go";

    // Match the C# packages JSON output: emit characters like `, <, >, ', + and other
    // non-ASCII content as their literal UTF-8 bytes rather than \uXXXX escape sequences.
    // The output is read by Astro at build time, not embedded in HTML, so the relaxed
    // encoder is safe and keeps diffs human-readable.
    private static readonly JsonSerializerOptions s_outputSerializerOptions = new()
    {
        WriteIndented = true,
        DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault,
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
    };

    private static readonly Option<string> s_inputOption = new("--input", "-i")
    {
        Required = true,
        Description = "Path to the JSON file produced by 'aspire sdk dump --format json'.",
    };

    private static readonly Option<string> s_outputOption = new("--output", "-o")
    {
        Required = true,
        Description = "Path to write the transformed docs-site JSON file.",
    };

    private static readonly Option<string> s_languageOption = CreateLanguageOption();

    private static readonly Option<string> s_packageNameOption = new("--package-name")
    {
        Description = "Package name override. Defaults to inferring from the input file name.",
    };

    private static readonly Option<string?> s_versionOption = new("--version")
    {
        Description = "Package version to include in the output metadata.",
    };

    private static readonly Option<string?> s_sourceRepoOption = new("--source-repo")
    {
        Description = "Source repository URL (e.g. https://github.com/microsoft/aspire).",
    };

    private static readonly Option<string?> s_sourceCommitOption = new("--source-commit")
    {
        Description = "Source commit SHA.",
    };

    private static readonly Option<string[]> s_baseOption = new("--base")
    {
        AllowMultipleArgumentsPerToken = true,
        Description = "Paths to core and supporting-context docs-site JSON files. Capabilities and types already present in these packages are excluded from the output.",
    };

    private static readonly Option<bool> s_tolerateKnownScannerDiagnosticsOption = new("--tolerate-known-scanner-diagnostics")
    {
        Description = "Accept error diagnostics caused by known ATS scanner defects and report each one. Any other error diagnostic still fails.",
    };

    /// <summary>
    /// Creates the <c>--language</c> option. Each command needs its own instance because an option
    /// belongs to the command it is added to.
    /// </summary>
    internal static Option<string> CreateLanguageOption()
    {
        var option = new Option<string>("--language", "-l")
        {
            Description = $"Language of the docs-site JSON to generate: '{TypeScriptLanguage}' or '{GoLanguage}'.",
            DefaultValueFactory = static _ => TypeScriptLanguage,
        };
        option.AcceptOnlyFromAmong(TypeScriptLanguage, GoLanguage);

        return option;
    }

    public static RootCommand GetCommand()
    {
        var command = new RootCommand("Transforms 'aspire sdk dump --format json' output into docs-site JSON.")
        {
            s_inputOption,
            s_outputOption,
            s_languageOption,
            s_packageNameOption,
            s_versionOption,
            s_sourceRepoOption,
            s_sourceCommitOption,
            s_baseOption,
            s_tolerateKnownScannerDiagnosticsOption,
        };

        command.SetAction(static parseResult =>
        {
            var input = parseResult.GetValue(s_inputOption)!;
            var output = parseResult.GetValue(s_outputOption)!;
            var language = parseResult.GetValue(s_languageOption)!;
            var packageName = parseResult.GetValue(s_packageNameOption);
            var version = parseResult.GetValue(s_versionOption);
            var sourceRepo = parseResult.GetValue(s_sourceRepoOption);
            var sourceCommit = parseResult.GetValue(s_sourceCommitOption);
            var basePaths = parseResult.GetValue(s_baseOption);
            var tolerateKnownScannerDiagnostics = parseResult.GetValue(s_tolerateKnownScannerDiagnosticsOption);

            return TransformFile(
                input, output, packageName, version, sourceRepo, sourceCommit, basePaths, tolerateKnownScannerDiagnostics, language);
        });

        return command;
    }

    internal static int TransformFile(
        string inputPath,
        string outputPath,
        string? packageName,
        string? version,
        string? sourceRepo,
        string? sourceCommit,
        string[]? basePaths = null,
        bool tolerateKnownScannerDiagnostics = false,
        string language = TypeScriptLanguage)
    {
        if (!File.Exists(inputPath))
        {
            Console.Error.WriteLine($"Input file not found: {inputPath}");
            return 1;
        }

        // Infer package name from file name if not provided
        packageName ??= Path.GetFileNameWithoutExtension(inputPath);

        var json = File.ReadAllText(inputPath);
        var dump = JsonSerializer.Deserialize<AtsDumpRoot>(json);
        if (dump is null)
        {
            Console.Error.WriteLine($"Failed to deserialize: {inputPath}");
            return 1;
        }

        var exitCode = language switch
        {
            TypeScriptLanguage => WriteTypeScriptPackage(
                dump, outputPath, packageName, version, sourceRepo, sourceCommit, basePaths, tolerateKnownScannerDiagnostics),
            GoLanguage => WriteGoPackage(
                dump, outputPath, packageName, version, sourceRepo, sourceCommit, basePaths, tolerateKnownScannerDiagnostics),
            _ => ReportUnsupportedLanguage(language),
        };

        if (exitCode == 0 && tolerateKnownScannerDiagnostics)
        {
            foreach (var message in KnownScannerDiagnostics.GetToleratedErrors(dump))
            {
                Console.WriteLine($"{KnownScannerDiagnostics.ToleratedOutputPrefix} {message}");
            }
        }

        return exitCode;
    }

    private static int ReportUnsupportedLanguage(string language)
    {
        Console.Error.WriteLine($"Unsupported language '{language}'. Expected '{TypeScriptLanguage}' or '{GoLanguage}'.");
        return 1;
    }

    private static int WriteTypeScriptPackage(
        AtsDumpRoot dump,
        string outputPath,
        string packageName,
        string? version,
        string? sourceRepo,
        string? sourceCommit,
        string[]? basePaths,
        bool tolerateKnownScannerDiagnostics)
    {
        var result = AtsTransformer.Transform(
            dump, packageName, version, sourceRepo, sourceCommit, tolerateKnownScannerDiagnostics);

        // Supporting packages contribute scan targets, not APIs owned by this package.
        foreach (var basePath in basePaths ?? [])
        {
            if (!TryReadBaseModel<TsPackageModel>(basePath, out var baseModel))
            {
                return 1;
            }

            var baseFuncIds = new HashSet<string>(baseModel.Functions.Select(f => f.CapabilityId));
            var baseHandleIds = new HashSet<string>(baseModel.HandleTypes.Select(h => h.FullName));
            var baseDtoIds = new HashSet<string>(baseModel.DtoTypes.Select(d => d.FullName));
            var baseEnumIds = new HashSet<string>(baseModel.EnumTypes.Select(e => e.FullName));

            result.Functions.RemoveAll(f => baseFuncIds.Contains(f.CapabilityId));
            result.HandleTypes.RemoveAll(h => baseHandleIds.Contains(h.FullName));
            result.DtoTypes.RemoveAll(d => baseDtoIds.Contains(d.FullName));
            result.EnumTypes.RemoveAll(e => baseEnumIds.Contains(e.FullName));

            // Also strip base capabilities from handle type capabilities lists
            foreach (var handle in result.HandleTypes)
            {
                handle.Capabilities.RemoveAll(c => baseFuncIds.Contains(c.CapabilityId));
            }
        }

        var wroteFile = WriteModel(outputPath, result);

        Console.WriteLine($"{(wroteFile ? "Generated" : "Unchanged")}: {outputPath} ({result.Functions.Count} functions, {result.HandleTypes.Count} handles, {result.DtoTypes.Count} DTOs, {result.EnumTypes.Count} enums)");

        return 0;
    }

    private static int WriteGoPackage(
        AtsDumpRoot dump,
        string outputPath,
        string packageName,
        string? version,
        string? sourceRepo,
        string? sourceCommit,
        string[]? basePaths,
        bool tolerateKnownScannerDiagnostics)
    {
        // Supporting packages are read first because they decide the names of the types they share with this package.
        var baseModels = new List<GoPackageModel>();
        foreach (var basePath in basePaths ?? [])
        {
            if (!TryReadBaseModel<GoPackageModel>(basePath, out var baseModel))
            {
                return 1;
            }

            baseModels.Add(baseModel);
        }

        var result = GoTransformer.Transform(
            dump, packageName, version, sourceRepo, sourceCommit, tolerateKnownScannerDiagnostics, new GoKnownTypes(baseModels));

        // Supporting packages contribute scan targets, not APIs owned by this package.
        foreach (var baseModel in baseModels)
        {
            var baseFuncIds = new HashSet<string>(baseModel.Functions.Select(f => f.CapabilityId), StringComparer.Ordinal);
            var baseHandleIds = new HashSet<string>(baseModel.HandleTypes.Select(h => h.FullName), StringComparer.Ordinal);
            var baseDtoIds = new HashSet<string>(baseModel.DtoTypes.Select(d => d.FullName), StringComparer.Ordinal);
            var baseEnumIds = new HashSet<string>(baseModel.EnumTypes.Select(e => e.FullName), StringComparer.Ordinal);
            var baseExportedValueKeys = new HashSet<string>(
                baseModel.ExportedValues.SelectMany(g => g.Values.Select(v => GetExportedValueKey(g, v))),
                StringComparer.Ordinal);

            result.Functions.RemoveAll(f => baseFuncIds.Contains(f.CapabilityId));
            result.HandleTypes.RemoveAll(h => baseHandleIds.Contains(h.FullName));
            result.DtoTypes.RemoveAll(d => baseDtoIds.Contains(d.FullName));
            result.EnumTypes.RemoveAll(e => baseEnumIds.Contains(e.FullName));

            // Exported values are grouped by their root name, so a supporting package can own
            // individual values of a group that the base package also contributes to.
            foreach (var group in result.ExportedValues)
            {
                group.Values.RemoveAll(v => baseExportedValueKeys.Contains(GetExportedValueKey(group, v)));
            }

            result.ExportedValues.RemoveAll(g => g.Values.Count == 0);

            foreach (var handle in result.HandleTypes)
            {
                handle.Capabilities.RemoveAll(c => baseFuncIds.Contains(c.CapabilityId));
            }
        }

        var wroteFile = WriteModel(outputPath, result);

        Console.WriteLine($"{(wroteFile ? "Generated" : "Unchanged")}: {outputPath} ({result.Functions.Count} functions, {result.HandleTypes.Count} handles, {result.DtoTypes.Count} DTOs, {result.EnumTypes.Count} enums)");

        if (result.SkippedCapabilityIds.Count > 0)
        {
            // Capabilities that no concrete Go type carries are absent from the generated SDK, so they have no reference page.
            Console.WriteLine($"Skipped {result.SkippedCapabilityIds.Count} capabilities without a concrete Go type: {string.Join(", ", result.SkippedCapabilityIds)}");
        }

        return 0;
    }

    private static string GetExportedValueKey(GoExportedValueModel group, GoExportedValueEntryModel entry) =>
        $"{group.FullName}.{entry.Path}";

    private static bool TryReadBaseModel<TModel>(string basePath, [NotNullWhen(true)] out TModel? baseModel)
        where TModel : class
    {
        baseModel = null;

        if (!File.Exists(basePath))
        {
            Console.Error.WriteLine($"Base file not found: {basePath}");
            return false;
        }

        var baseJson = File.ReadAllText(basePath);
        baseModel = JsonSerializer.Deserialize<TModel>(baseJson);
        if (baseModel is null)
        {
            Console.Error.WriteLine($"Failed to deserialize base file: {basePath}");
            return false;
        }

        return true;
    }

    private static bool WriteModel<TModel>(string outputPath, TModel model)
    {
        var outputDir = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
        }

        return StableFileWriter.WriteIfChanged(outputPath, JsonSerializer.Serialize(model, s_outputSerializerOptions));
    }
}
