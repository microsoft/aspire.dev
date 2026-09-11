using System.CommandLine;
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

    private static readonly Option<string> s_packageNameOption = new("--package-name")
    {
        Description = "Package name override. Defaults to inferring from the input file name.",
    };

    private static readonly Option<string?> s_packageVersionOption = new("--package-version")
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

    private static readonly Option<string?> s_baseOption = new("--base")
    {
        Description = "Path to a base semantic package JSON. ATS identities already present in the base are excluded from the output.",
    };

    private static readonly Option<string?> s_supportOutputOption = new("--support-output")
    {
        Description = "Optional path to write the package support matrix generated from all language projections.",
    };

    private static readonly Option<string?> s_dumpCliVersionOption = new("--dump-cli-version")
    {
        Description = "Optional Aspire CLI version that produced the input dump.",
    };

    private static readonly Option<string?> s_dumpProductCommitOption = new("--dump-product-commit")
    {
        Description = "Optional Aspire product commit represented by the input dump.",
    };

    private static readonly Option<string?> s_dumpGeneratedAtOption = new("--dump-generated-at")
    {
        Description = "Optional timestamp supplied by the dump-producing workflow.",
    };

    public static RootCommand GetCommand()
    {
        var command = new RootCommand("Transforms 'aspire sdk dump --format json' output into docs-site JSON.")
        {
            s_inputOption,
            s_outputOption,
            s_packageNameOption,
            s_packageVersionOption,
            s_sourceRepoOption,
            s_sourceCommitOption,
            s_baseOption,
            s_supportOutputOption,
            s_dumpCliVersionOption,
            s_dumpProductCommitOption,
            s_dumpGeneratedAtOption,
        };

        command.SetAction(static parseResult =>
        {
            var input = parseResult.GetValue(s_inputOption)!;
            var output = parseResult.GetValue(s_outputOption)!;
            var packageName = parseResult.GetValue(s_packageNameOption);
            var version = parseResult.GetValue(s_packageVersionOption);
            var sourceRepo = parseResult.GetValue(s_sourceRepoOption);
            var sourceCommit = parseResult.GetValue(s_sourceCommitOption);
            var basePath = parseResult.GetValue(s_baseOption);
            var supportOutputPath = parseResult.GetValue(s_supportOutputOption);
            var dumpCliVersion = parseResult.GetValue(s_dumpCliVersionOption);
            var dumpProductCommit = parseResult.GetValue(s_dumpProductCommitOption);
            var dumpGeneratedAt = parseResult.GetValue(s_dumpGeneratedAtOption);

            return TransformFile(
                input,
                output,
                packageName,
                version,
                sourceRepo,
                sourceCommit,
                basePath,
                supportOutputPath,
                dumpCliVersion,
                dumpProductCommit,
                dumpGeneratedAt);
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
        string? basePath = null,
        string? supportOutputPath = null,
        string? dumpCliVersion = null,
        string? dumpProductCommit = null,
        string? dumpGeneratedAt = null)
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

        AppHostModuleModel result;
        try
        {
            var dumpProvenance = CreateDumpProvenance(
                dumpCliVersion,
                dumpProductCommit,
                dumpGeneratedAt);
            result = AtsTransformer.Transform(
                dump,
                packageName,
                version,
                sourceRepo,
                sourceCommit,
                dumpProvenance);
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Failed to transform '{inputPath}': {exception.Message}");
            return 1;
        }

        // Deduplicate against the base (core) package
        if (basePath is not null)
        {
            if (!File.Exists(basePath))
            {
                Console.Error.WriteLine($"Base file not found: {basePath}");
                return 1;
            }

            var baseJson = File.ReadAllText(basePath);
            var baseModel = JsonSerializer.Deserialize<AppHostModuleModel>(baseJson);
            if (baseModel is not null)
            {
                AtsTransformer.DeduplicateAgainstBase(result, baseModel);
            }
        }

        var outputDir = Path.GetDirectoryName(outputPath);
        if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
        }

        var options = new JsonSerializerOptions
        {
            WriteIndented = true,
            DefaultIgnoreCondition = System.Text.Json.Serialization.JsonIgnoreCondition.WhenWritingDefault,
            // Match the C# packages JSON output: emit characters like `, <, >, ', + and other
            // non-ASCII content as their literal UTF-8 bytes rather than \uXXXX escape sequences.
            // The output is read by Astro at build time, not embedded in HTML, so the relaxed
            // encoder is safe and keeps diffs human-readable.
            Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
        };
        var wroteFile = StableFileWriter.WriteIfChanged(outputPath, JsonSerializer.Serialize(result, options));

        if (supportOutputPath is not null)
        {
            var supportDirectory = Path.GetDirectoryName(supportOutputPath);
            if (!string.IsNullOrEmpty(supportDirectory))
            {
                Directory.CreateDirectory(supportDirectory);
            }

            var matrix = AtsTransformer.CreateSupportMatrix(result);
            StableFileWriter.WriteIfChanged(supportOutputPath, JsonSerializer.Serialize(matrix, options));
        }

        var counts = result.Items
            .GroupBy(item => item.Kind, StringComparer.Ordinal)
            .ToDictionary(group => group.Key, group => group.Count(), StringComparer.Ordinal);
        Console.WriteLine(
            $"{(wroteFile ? "Generated" : "Unchanged")}: {outputPath} " +
            $"({counts.GetValueOrDefault("capability")} capabilities, " +
            $"{counts.GetValueOrDefault("handle")} handles, " +
            $"{counts.GetValueOrDefault("dto")} DTOs, " +
            $"{counts.GetValueOrDefault("enum")} enums, " +
            $"{counts.GetValueOrDefault("exportedValue")} exported values)");
        return 0;
    }

    private static AppHostDumpProvenanceModel? CreateDumpProvenance(
        string? cliVersion,
        string? productCommit,
        string? generatedAt)
    {
        cliVersion = NormalizeOptionalValue(cliVersion);
        productCommit = NormalizeOptionalValue(productCommit);
        generatedAt = NormalizeOptionalValue(generatedAt);
        if (cliVersion is null && productCommit is null && generatedAt is null)
        {
            return null;
        }

        return new AppHostDumpProvenanceModel
        {
            CliVersion = cliVersion,
            ProductCommit = productCommit,
            GeneratedAt = generatedAt,
        };
    }

    private static string? NormalizeOptionalValue(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();
}
