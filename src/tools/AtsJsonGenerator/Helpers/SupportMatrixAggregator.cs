using System.Text.Json;

namespace AtsJsonGenerator.Helpers;

internal static class SupportMatrixAggregator
{
    public static AppHostSupportMatrixModel Aggregate(
        IReadOnlyList<AppHostModuleModel> stagedModules,
        IReadOnlyList<AppHostModuleModel>? baselineModules = null,
        IReadOnlySet<string>? replacedPackageNames = null)
    {
        foreach (var module in stagedModules)
        {
            AtsTransformer.ValidateProjectionAccounting(module.Items);
        }
        foreach (var module in baselineModules ?? [])
        {
            AtsTransformer.ValidateProjectionAccounting(module.Items);
        }

        var packagesToReplace = stagedModules
            .Select(module => module.Package.Name)
            .ToHashSet(StringComparer.OrdinalIgnoreCase);
        if (replacedPackageNames is not null)
        {
            packagesToReplace.UnionWith(replacedPackageNames);
        }
        var modules = (baselineModules ?? [])
            .Where(module => !packagesToReplace.Contains(module.Package.Name))
            .Concat(stagedModules)
            .OrderBy(PackageIdentity, StringComparer.Ordinal)
            .ToList();

        var duplicate = modules.GroupBy(PackageIdentity, StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
        {
            throw new InvalidOperationException(
                $"Duplicate semantic package identity '{duplicate.Key}'.");
        }
        var generator = GetGeneratorProvenance(modules);

        return new AppHostSupportMatrixModel
        {
            GeneratedFrom = new AppHostSupportGeneratedFromModel
            {
                Repository = generator.Repository,
                Commit = generator.Commit,
                LockFile = generator.LockFile,
                DumpProvenance = GetCommonDumpProvenance(modules),
            },
            Packages = modules.ToDictionary(
                PackageIdentity,
                CreatePackage,
                StringComparer.Ordinal),
        };
    }

    public static IReadOnlyList<AppHostModuleModel> ReadModules(string directory)
    {
        if (!Directory.Exists(directory))
        {
            throw new DirectoryNotFoundException(
                $"Semantic module directory not found: {directory}");
        }

        var modules = new List<AppHostModuleModel>();
        foreach (var path in Directory.GetFiles(directory, "*.json", SearchOption.TopDirectoryOnly)
            .Order(StringComparer.Ordinal))
        {
            try
            {
                var module = JsonSerializer.Deserialize<AppHostModuleModel>(File.ReadAllText(path))
                    ?? throw new InvalidOperationException("The document was empty.");
                modules.Add(module);
            }
            catch (Exception exception)
            {
                throw new InvalidOperationException(
                    $"Failed to read semantic module '{path}': {exception.Message}",
                    exception);
            }
        }

        return modules;
    }

    internal static string PackageIdentity(AppHostModuleModel module)
        => string.IsNullOrWhiteSpace(module.Package.Version)
            ? module.Package.Name
            : $"{module.Package.Name}@{module.Package.Version}";

    private static AppHostGeneratorProvenanceModel GetGeneratorProvenance(
        IReadOnlyList<AppHostModuleModel> modules)
    {
        if (modules.Count == 0)
        {
            return new AppHostGeneratorProvenanceModel
            {
                Repository = AtsTransformer.UpstreamRepository,
                Commit = AtsTransformer.UpstreamCommit,
                LockFile = AtsTransformer.UpstreamLockFile,
            };
        }

        var provenance = modules[0].GeneratorProvenance;
        if (modules.Skip(1).Any(module =>
            !string.Equals(module.GeneratorProvenance.Repository, provenance.Repository, StringComparison.Ordinal) ||
            !string.Equals(module.GeneratorProvenance.Commit, provenance.Commit, StringComparison.Ordinal) ||
            !string.Equals(module.GeneratorProvenance.LockFile, provenance.LockFile, StringComparison.Ordinal)))
        {
            throw new InvalidOperationException(
                "Staged semantic modules were produced by different generator revisions.");
        }

        return provenance;
    }

    private static AppHostDumpProvenanceModel? GetCommonDumpProvenance(
        IReadOnlyList<AppHostModuleModel> modules)
    {
        if (modules.Count == 0)
        {
            return null;
        }

        var first = modules[0].DumpProvenance;
        return modules.All(module => DumpProvenanceEquals(module.DumpProvenance, first))
            ? first
            : null;
    }

    private static bool DumpProvenanceEquals(
        AppHostDumpProvenanceModel? left,
        AppHostDumpProvenanceModel? right)
        => string.Equals(left?.CliVersion, right?.CliVersion, StringComparison.Ordinal) &&
            string.Equals(left?.ProductCommit, right?.ProductCommit, StringComparison.Ordinal) &&
            string.Equals(left?.GeneratedAt, right?.GeneratedAt, StringComparison.Ordinal);

    private static AppHostSupportPackageModel CreatePackage(AppHostModuleModel module)
        => new()
        {
            Package = new AppHostSupportPackageInfoModel
            {
                Name = module.Package.Name,
                Version = module.Package.Version,
            },
            DumpProvenance = module.DumpProvenance,
            Items = module.Items
                .OrderBy(item => item.Id, StringComparer.Ordinal)
                .ToDictionary(
                    item => item.Id,
                    item => new AppHostSupportItemModel
                    {
                        Kind = item.Kind,
                        Name = item.Name,
                        Languages = AtsTransformer.Languages.ToDictionary(
                            language => language,
                            language => new AppHostSupportStatusModel
                            {
                                Supported = item.Projections[language].Status == "supported",
                                Validation = item.Projections[language].Validation,
                                Reason = item.Projections[language].Reason,
                            },
                            StringComparer.Ordinal),
                    },
                    StringComparer.Ordinal),
        };
}
