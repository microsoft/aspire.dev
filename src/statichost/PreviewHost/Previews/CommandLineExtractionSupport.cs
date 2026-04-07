namespace PreviewHost.Previews;

internal static class CommandLineExtractionSupport
{
    public static bool IsConfigurationSupported(PreviewHostOptions options) =>
        !options.UseCommandLineExtraction || TryResolveConfiguredTool(options, out _);

    public static string GetConfigurationValidationMessage() =>
        OperatingSystem.IsWindows()
            ? $"The '{PreviewHostOptions.SectionName}:ExtractionMode' setting is 'command-line', but 'tar.exe' is not available on PATH. Switch back to 'managed' or deploy PreviewHost on a Windows image that includes tar.exe."
            : $"The '{PreviewHostOptions.SectionName}:ExtractionMode' setting is 'command-line', but 'unzip' is not available on PATH. Chiseled .NET runtime images do not include unzip by default; switch back to 'managed' or deploy PreviewHost from a custom image with unzip installed.";

    public static bool TryResolveConfiguredTool(PreviewHostOptions options, out string? resolvedPath)
    {
        resolvedPath = null;

        if (!options.UseCommandLineExtraction)
        {
            return true;
        }

        return TryResolveCommand(options.CommandLineExtractionCommandName!, out resolvedPath);
    }

    private static bool TryResolveCommand(string commandName, out string? resolvedPath)
    {
        resolvedPath = null;

        if (Path.IsPathRooted(commandName) && File.Exists(commandName))
        {
            resolvedPath = commandName;
            return true;
        }

        var pathValue = Environment.GetEnvironmentVariable("PATH");
        if (string.IsNullOrWhiteSpace(pathValue))
        {
            return false;
        }

        var searchNames = GetSearchNames(commandName);
        foreach (var directory in pathValue.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries))
        {
            foreach (var searchName in searchNames)
            {
                var candidate = Path.Combine(directory, searchName);
                if (File.Exists(candidate))
                {
                    resolvedPath = candidate;
                    return true;
                }
            }
        }

        return false;
    }

    private static IEnumerable<string> GetSearchNames(string commandName)
    {
        yield return commandName;

        if (!OperatingSystem.IsWindows() || Path.HasExtension(commandName))
        {
            yield break;
        }

        var pathExt = Environment.GetEnvironmentVariable("PATHEXT");
        var extensions = string.IsNullOrWhiteSpace(pathExt)
            ? [".exe", ".cmd", ".bat"]
            : pathExt.Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);

        foreach (var extension in extensions)
        {
            yield return $"{commandName}{extension}";
        }
    }
}
