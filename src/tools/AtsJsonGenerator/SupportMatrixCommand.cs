using System.CommandLine;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Serialization;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator;

internal static class SupportMatrixCommand
{
    private static readonly Option<string> s_inputDirOption = new("--input-dir", "-i")
    {
        Required = true,
        Description = "Directory containing staged semantic AppHost module JSON files.",
    };

    private static readonly Option<string> s_outputOption = new("--output", "-o")
    {
        Required = true,
        Description = "Path to write the aggregated apphost-language-support.json file.",
    };

    private static readonly Option<string?> s_baselineDirOption = new("--baseline-dir")
    {
        Description = "Optional directory containing existing modules to preserve when their package is not staged.",
    };

    private static readonly Option<string[]> s_replacePackageOption = new("--replace-package")
    {
        AllowMultipleArgumentsPerToken = true,
        Description = "Package names to remove from the baseline even when regeneration produced no module.",
    };

    public static Command GetCommand()
    {
        var command = new Command(
            "support",
            "Aggregates semantic AppHost module files into the language support matrix.")
        {
            s_inputDirOption,
            s_outputOption,
            s_baselineDirOption,
            s_replacePackageOption,
        };

        command.SetAction(static parseResult =>
        {
            var inputDirectory = parseResult.GetValue(s_inputDirOption)!;
            var output = parseResult.GetValue(s_outputOption)!;
            var baselineDirectory = parseResult.GetValue(s_baselineDirOption);
            var replacePackages = parseResult.GetValue(s_replacePackageOption);
            return Aggregate(inputDirectory, output, baselineDirectory, replacePackages);
        });

        return command;
    }

    internal static int Aggregate(
        string inputDirectory,
        string outputPath,
        string? baselineDirectory = null,
        string[]? replacePackages = null)
    {
        try
        {
            var staged = SupportMatrixAggregator.ReadModules(inputDirectory);
            var baseline = baselineDirectory is null || !Directory.Exists(baselineDirectory)
                ? []
                : SupportMatrixAggregator.ReadModules(baselineDirectory);
            var replacements = (replacePackages ?? [])
                .Where(package => !string.IsNullOrWhiteSpace(package))
                .ToHashSet(StringComparer.OrdinalIgnoreCase);
            var matrix = SupportMatrixAggregator.Aggregate(staged, baseline, replacements);
            var outputDirectory = Path.GetDirectoryName(outputPath);
            if (!string.IsNullOrEmpty(outputDirectory))
            {
                Directory.CreateDirectory(outputDirectory);
            }

            var options = new JsonSerializerOptions
            {
                WriteIndented = true,
                DefaultIgnoreCondition = JsonIgnoreCondition.WhenWritingDefault,
                Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping,
            };
            var changed = StableFileWriter.WriteIfChanged(
                outputPath,
                JsonSerializer.Serialize(matrix, options));
            Console.WriteLine(
                $"{(changed ? "Generated" : "Unchanged")}: {outputPath} " +
                $"({matrix.Packages.Count} packages)");
            return 0;
        }
        catch (Exception exception)
        {
            Console.Error.WriteLine($"Failed to aggregate support matrix: {exception.Message}");
            return 1;
        }
    }
}
