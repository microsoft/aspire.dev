using System.CommandLine;
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

    private static readonly Option<string?> s_baseOption = new("--base")
    {
        Description = "Path to the core Aspire.Hosting docs-site JSON. When provided, capabilities and types already present in the base are excluded from the output.",
    };

    public static RootCommand GetCommand()
    {
        var command = new RootCommand("Transforms 'aspire sdk dump --format json' output into docs-site JSON.")
        {
            s_inputOption,
            s_outputOption,
            s_packageNameOption,
            s_versionOption,
            s_sourceRepoOption,
            s_sourceCommitOption,
            s_baseOption,
        };

        command.SetAction(static parseResult =>
        {
            var input = parseResult.GetValue(s_inputOption)!;
            var output = parseResult.GetValue(s_outputOption)!;
            var packageName = parseResult.GetValue(s_packageNameOption);
            var version = parseResult.GetValue(s_versionOption);
            var sourceRepo = parseResult.GetValue(s_sourceRepoOption);
            var sourceCommit = parseResult.GetValue(s_sourceCommitOption);
            var basePath = parseResult.GetValue(s_baseOption);

            return TransformFile(input, output, packageName, version, sourceRepo, sourceCommit, basePath);
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
        string? basePath = null)
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

        var result = AtsTransformer.Transform(dump, packageName, version, sourceRepo, sourceCommit);

        // Deduplicate against the base (core) package
        if (basePath is not null)
        {
            if (!File.Exists(basePath))
            {
                Console.Error.WriteLine($"Base file not found: {basePath}");
                return 1;
            }

            var baseJson = File.ReadAllText(basePath);
            var baseModel = JsonSerializer.Deserialize<TsPackageModel>(baseJson);
            if (baseModel is not null)
            {
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
        };
        var wroteFile = StableFileWriter.WriteIfChanged(outputPath, JsonSerializer.Serialize(result, options));

        Console.WriteLine($"{(wroteFile ? "Generated" : "Unchanged")}: {outputPath} ({result.Functions.Count} functions, {result.HandleTypes.Count} handles, {result.DtoTypes.Count} DTOs, {result.EnumTypes.Count} enums)");
        return 0;
    }
}
