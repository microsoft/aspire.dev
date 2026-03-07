using System.CommandLine;
using System.Diagnostics;
using System.Text.Json;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator;

/// <summary>
/// Batch command: runs <c>aspire sdk dump --json</c> for multiple packages
/// and transforms the results into docs-site JSON files.
/// </summary>
internal static class BatchGenerateCommand
{
    private static readonly Option<string> s_outputDirOption = new("--output-dir", "-o")
    {
        Required = true,
        Description = "Directory to write the transformed JSON files.",
    };

    private static readonly Option<string?> s_aspireRepoOption = new("--aspire-repo")
    {
        Description = "Path to a local dotnet/aspire repo clone. When provided, discovers integration csproj files and dumps each.",
    };

    private static readonly Option<string[]> s_inputFilesOption = new("--input")
    {
        AllowMultipleArgumentsPerToken = true,
        Description = "One or more pre-generated JSON files from 'aspire sdk dump --json' to transform.",
    };

    private static readonly Option<string?> s_versionOption = new("--version")
    {
        Description = "Package version to include in the output metadata.",
    };

    private static readonly Option<string?> s_sourceRepoOption = new("--source-repo")
    {
        Description = "Source repository URL.",
    };

    private static readonly Option<string?> s_sourceCommitOption = new("--source-commit")
    {
        Description = "Source commit SHA.",
    };

    public static Command GetCommand()
    {
        var command = new Command("batch", "Process multiple ATS dump files or discover packages from an Aspire repo clone.")
        {
            s_outputDirOption,
            s_aspireRepoOption,
            s_inputFilesOption,
            s_versionOption,
            s_sourceRepoOption,
            s_sourceCommitOption,
        };

        command.SetAction(static parseResult =>
        {
            var outputDir = parseResult.GetValue(s_outputDirOption)!;
            var aspireRepo = parseResult.GetValue(s_aspireRepoOption);
            var inputFiles = parseResult.GetValue(s_inputFilesOption);
            var version = parseResult.GetValue(s_versionOption);
            var sourceRepo = parseResult.GetValue(s_sourceRepoOption);
            var sourceCommit = parseResult.GetValue(s_sourceCommitOption);

            return RunBatch(outputDir, aspireRepo, inputFiles, version, sourceRepo, sourceCommit);
        });

        return command;
    }

    private static int RunBatch(
        string outputDir,
        string? aspireRepo,
        string[]? inputFiles,
        string? version,
        string? sourceRepo,
        string? sourceCommit)
    {
        if (!Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
        }

        var sw = Stopwatch.StartNew();
        var files = new List<(string path, string packageName)>();

        // Collect input files from direct --input arguments
        if (inputFiles is { Length: > 0 })
        {
            foreach (var file in inputFiles)
            {
                if (File.Exists(file))
                {
                    var name = Path.GetFileNameWithoutExtension(file);
                    files.Add((file, name));
                }
                else
                {
                    Console.Error.WriteLine($"Input file not found: {file}");
                }
            }
        }

        // If an Aspire repo path is provided, run aspire sdk dump for each integration
        if (aspireRepo is not null)
        {
            var discovered = DiscoverAndDump(aspireRepo, outputDir);
            files.AddRange(discovered);
        }

        if (files.Count == 0)
        {
            Console.Error.WriteLine("No input files to process. Provide --input files or --aspire-repo path.");
            return 1;
        }

        Console.WriteLine($"Batch: processing {files.Count} packages");

        int success = 0, failed = 0;
        foreach (var (path, packageName) in files)
        {
            try
            {
                var outputPath = Path.Combine(outputDir, $"{packageName}.json");
                var result = GenerateCommand.TransformFile(
                    path, outputPath, packageName, version, sourceRepo, sourceCommit);

                if (result == 0)
                {
                    success++;
                }
                else
                {
                    failed++;
                }
            }
            catch (Exception ex)
            {
                Console.Error.WriteLine($"FAILED [{packageName}]: {ex.Message}");
                failed++;
            }
        }

        sw.Stop();
        Console.WriteLine($"Batch complete in {sw.Elapsed.TotalSeconds:F1}s: {success} succeeded, {failed} failed");
        return failed > 0 ? 1 : 0;
    }

    /// <summary>
    /// Discover integration projects in a dotnet/aspire repo clone and run
    /// <c>aspire sdk dump --json</c> for each.
    /// </summary>
    private static List<(string path, string packageName)> DiscoverAndDump(
        string aspireRepoPath,
        string outputDir)
    {
        var results = new List<(string, string)>();
        var tempDir = Path.Combine(outputDir, ".tmp-dumps");
        Directory.CreateDirectory(tempDir);

        // Core Aspire.Hosting dump (no integration argument)
        var coreOutput = Path.Combine(tempDir, "Aspire.Hosting.json");
        if (RunAspireSdkDump(aspireRepoPath, null, coreOutput))
        {
            results.Add((coreOutput, "Aspire.Hosting"));
        }

        // Discover integration projects with [AspireExport] attributes
        var hostingDirs = Directory.GetDirectories(aspireRepoPath, "Aspire.Hosting.*", SearchOption.TopDirectoryOnly)
            .Where(d =>
            {
                var dirName = Path.GetFileName(d);
                // Exclude infrastructure projects
                return !dirName.Contains("Analyzers") &&
                       !dirName.Contains("CodeGeneration") &&
                       !dirName.Contains("RemoteHost");
            });

        foreach (var dir in hostingDirs)
        {
            var dirName = Path.GetFileName(dir);
            var csproj = Path.Combine(dir, $"{dirName}.csproj");
            if (!File.Exists(csproj))
            {
                continue;
            }

            // Check for [AspireExport] attribute
            var csFiles = Directory.GetFiles(dir, "*.cs", SearchOption.AllDirectories)
                .Where(f => !f.Contains(Path.DirectorySeparatorChar + "obj" + Path.DirectorySeparatorChar) &&
                           !f.Contains(Path.DirectorySeparatorChar + "bin" + Path.DirectorySeparatorChar));

            var hasExport = csFiles.Any(f =>
            {
                try { return File.ReadAllText(f).Contains("[AspireExport("); }
                catch { return false; }
            });

            if (!hasExport)
            {
                continue;
            }

            var output = Path.Combine(tempDir, $"{dirName}.json");
            if (RunAspireSdkDump(aspireRepoPath, csproj, output))
            {
                results.Add((output, dirName));
            }
        }

        return results;
    }

    private static bool RunAspireSdkDump(string repoPath, string? csproj, string outputPath)
    {
        var args = csproj is not null
            ? $"sdk dump --json --ci \"{csproj}\" -o \"{outputPath}\""
            : $"sdk dump --json --ci -o \"{outputPath}\"";

        Console.WriteLine($"  Running: aspire {args}");

        try
        {
            var psi = new ProcessStartInfo
            {
                FileName = "aspire",
                Arguments = args,
                WorkingDirectory = repoPath,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
            };

            using var process = Process.Start(psi);
            if (process is null)
            {
                Console.Error.WriteLine("  Failed to start aspire CLI");
                return false;
            }

            process.WaitForExit(TimeSpan.FromMinutes(5));

            if (process.ExitCode != 0)
            {
                var stderr = process.StandardError.ReadToEnd();
                Console.Error.WriteLine($"  aspire sdk dump failed (exit {process.ExitCode}): {stderr}");
                return false;
            }

            return File.Exists(outputPath);
        }
        catch (Exception ex)
        {
            Console.Error.WriteLine($"  Error running aspire CLI: {ex.Message}");
            return false;
        }
    }
}
