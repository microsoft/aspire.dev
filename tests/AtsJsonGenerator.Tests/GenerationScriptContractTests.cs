namespace AtsJsonGenerator.Tests;

public sealed class GenerationScriptContractTests
{
    [Fact]
    public void GenerationScript_PassesPackageVersionForCoreAndIntegrations()
    {
        var script = File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "generate-apphost-api-json.ps1"));

        Assert.Equal(2, CountOccurrences(script, "$version = $pkg.Version"));
        Assert.Equal(
            2,
            CountOccurrences(
                script,
                "$transformArgs += @(\"--package-version\", $version)"));
        Assert.DoesNotContain("\"--version\", $version", script, StringComparison.Ordinal);
    }

    [Fact]
    public void GenerationScript_IsolatesPublicPackageRestoreAndDisablesParallelism()
    {
        var script = File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "generate-apphost-api-json.ps1"));

        Assert.Contains("$env:RestoreSources = $NuGetOrgServiceIndex", script, StringComparison.Ordinal);
        Assert.Contains("$env:RestoreIgnoreFailedSources = \"true\"", script, StringComparison.Ordinal);
        Assert.Contains("$env:RestoreDisableParallel = \"true\"", script, StringComparison.Ordinal);
        Assert.Contains("$env:RestoreDisableParallel = $previousRestoreDisableParallel", script, StringComparison.Ordinal);
    }

    [Fact]
    public void GenerationScript_AcceptsAnExternalCoreModuleForResumableChunks()
    {
        var script = File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "generate-apphost-api-json.ps1"));

        Assert.Contains("[string]$BaseModulePath", script, StringComparison.Ordinal);
        Assert.Contains("[System.IO.Path]::GetFullPath($BaseModulePath)", script, StringComparison.Ordinal);
        Assert.Contains("$transformArgs += @(\"--base\", $coreOutputFile)", script, StringComparison.Ordinal);
        Assert.Contains("[switch]$SkipBuild", script, StringComparison.Ordinal);
        Assert.Contains("if (-not $SkipBuild)", script, StringComparison.Ordinal);

        var compatibilityScript = File.ReadAllText(
            Path.Combine(AppContext.BaseDirectory, "generate-ts-api-json.ps1"));
        Assert.Contains("[string]$BaseModulePath", compatibilityScript, StringComparison.Ordinal);
        Assert.Contains("[switch]$SkipBuild", compatibilityScript, StringComparison.Ordinal);
    }

    private static int CountOccurrences(string value, string search)
    {
        var count = 0;
        var index = 0;
        while ((index = value.IndexOf(search, index, StringComparison.Ordinal)) >= 0)
        {
            count++;
            index += search.Length;
        }
        return count;
    }
}
