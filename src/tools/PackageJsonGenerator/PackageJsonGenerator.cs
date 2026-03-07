// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System.Collections.Concurrent;
using System.Collections.Immutable;
using System.Text.RegularExpressions;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using PackageJsonGenerator.Helpers;

namespace PackageJsonGenerator;

public static class PackageJsonGenerator
{
    public static void GeneratePackageJson(string? inputAssembly, string[]? references, string? outputFile, string? versionOverride = null, string? packageNameOverride = null, string? sourceRepoOverride = null, string? sourceCommitOverride = null, ConcurrentDictionary<string, PortableExecutableReference>? referenceCache = null)
    {
        if (string.IsNullOrEmpty(inputAssembly))
        {
            throw new ArgumentException("Input assembly path is required.", nameof(inputAssembly));
        }

        if (references is null || references.Length is 0)
        {
            throw new ArgumentException("At least one reference assembly is required.", nameof(references));
        }

        if (string.IsNullOrEmpty(outputFile))
        {
            throw new ArgumentException("Output file path is required.", nameof(outputFile));
        }

        var inputReference = CreateMetadataReference(inputAssembly);
        var resolvedRefs = referenceCache is not null
            ? references.Select(r => referenceCache.GetOrAdd(r, CreateMetadataReference))
            : references.Select(CreateMetadataReference);
        var compilation = CSharpCompilation.Create(
            "PackageJsonGen",
            references: resolvedRefs.Concat([inputReference]));

        var assemblySymbol = (IAssemblySymbol)compilation.GetAssemblyOrModuleSymbol(inputReference)!;

        // Collect all public types from the assembly
        var types = new List<INamedTypeSymbol>();
        CollectTypes(assemblySymbol.GlobalNamespace, types, assemblySymbol);

        if (types.Count == 0)
        {
            Console.WriteLine($"No public types found in assembly: {assemblySymbol.Name}");
            return;
        }

        var assemblyName = !string.IsNullOrEmpty(packageNameOverride)
            ? packageNameOverride
            : assemblySymbol.Name;
        var assemblyVersion = !string.IsNullOrEmpty(versionOverride)
            ? versionOverride
            : assemblySymbol.Identity.Version.ToString();

        // Resolve source link info from assembly metadata or CLI overrides
        var sourceRepo = sourceRepoOverride;
        var sourceCommit = sourceCommitOverride;

        if (string.IsNullOrEmpty(sourceRepo) || string.IsNullOrEmpty(sourceCommit))
        {
            foreach (var attr in assemblySymbol.GetAttributes())
            {
                if (attr.AttributeClass?.ToDisplayString() == "System.Reflection.AssemblyMetadataAttribute"
                    && attr.ConstructorArguments.Length == 2)
                {
                    var key = attr.ConstructorArguments[0].Value as string;
                    var value = attr.ConstructorArguments[1].Value as string;

                    if (string.IsNullOrEmpty(sourceRepo) && key == "RepositoryUrl")
                        sourceRepo = value;
                    if (string.IsNullOrEmpty(sourceCommit) && key == "RepositoryCommit")
                        sourceCommit = value;
                }

                // Fallback: extract commit from InformationalVersion (e.g. "1.2.3+abc123def")
                if (string.IsNullOrEmpty(sourceCommit)
                    && attr.AttributeClass?.ToDisplayString() == "System.Reflection.AssemblyInformationalVersionAttribute"
                    && attr.ConstructorArguments.Length == 1)
                {
                    var infoVersion = attr.ConstructorArguments[0].Value as string;
                    if (infoVersion is not null)
                    {
                        var plusIdx = infoVersion.IndexOf('+');
                        if (plusIdx >= 0 && plusIdx + 1 < infoVersion.Length)
                        {
                            sourceCommit = infoVersion[(plusIdx + 1)..];
                        }
                    }
                }
            }
        }

        // Build canonical models
        var modelBuilder = new CanonicalModelBuilder(compilation);
        var typeModels = modelBuilder.BuildTypes(types.ToImmutableArray());

        // Enrich with PDB source info (file paths + line ranges)
        using (var pdbReader = new PdbSourceReader(inputAssembly))
        {
            if (pdbReader.HasPdb)
            {
                foreach (var typeModel in typeModels)
                {
                    var typeSource = pdbReader.GetTypeSource(typeModel.FullName);
                    if (typeSource is not null)
                    {
                        typeModel.SourceFile = typeSource.File;
                        // Use only the start line as a single-line anchor. The PDB
                        // aggregate range spans method implementations, not the type
                        // declaration. A start-line anchor locates the class (especially
                        // in multi-type files) without suggesting a misleading range.
                        typeModel.SourceLines = $"{typeSource.StartLine}-{typeSource.StartLine}";
                    }

                    foreach (var member in typeModel.Members)
                    {
                        var paramNames = member.Parameters?.Select(p => p.Name).ToList();
                        var memberSource = pdbReader.GetMemberSource(typeModel.FullName, member.Name, paramNames);
                        if (memberSource is not null)
                        {
                            member.SourceFile = memberSource.File;
                            if (memberSource.StartLine > 0)
                            {
                                member.SourceLines = memberSource.ToLineRange();
                            }
                        }
                    }
                }
            }

            // Fallback: infer source file paths for types that had no PDB sequence points
            // (interfaces without default methods, enums, delegates, const-only classes)
            foreach (var typeModel in typeModels)
            {
                if (typeModel.SourceFile is null)
                {
                    typeModel.SourceFile = pdbReader.InferTypeSourceFile(typeModel.FullName, typeModel.Namespace);
                }
            }
        }

        // For files with multiple types, the PDB-based StartLine points to the first
        // method body rather than the type declaration. Fetch actual source from the
        // repository to find exact declaration lines.
        AdjustSourceLinesForMultiTypeFiles(typeModels, sourceRepo, sourceCommit);

        // Emit JSON schema
        var schemaJson = SchemaEmitter.EmitAssemblySchema(
            assemblyName,
            assemblyVersion,
            "net10.0",
            typeModels,
            sourceRepo,
            sourceCommit);

        // Ensure output directory exists
        var outputDir = Path.GetDirectoryName(outputFile);
        if (!string.IsNullOrEmpty(outputDir) && !Directory.Exists(outputDir))
        {
            Directory.CreateDirectory(outputDir);
        }

        // Write the output file
        File.WriteAllText(outputFile, schemaJson);
        Console.WriteLine($"Generated: {outputFile}");
    }

    internal static PortableExecutableReference CreateMetadataReference(string path)
    {
        var docPath = Path.ChangeExtension(path, "xml");
        var documentationProvider = File.Exists(docPath)
            ? XmlDocumentationProvider.CreateFromFile(docPath)
            : null;

        return MetadataReference.CreateFromFile(path, documentation: documentationProvider);
    }

    private static void CollectTypes(
        INamespaceSymbol ns,
        List<INamedTypeSymbol> types,
        IAssemblySymbol targetAssembly)
    {
        foreach (var type in ns.GetTypeMembers())
        {
            CollectTypeAndNested(type, types);
        }

        foreach (var childNs in ns.GetNamespaceMembers())
        {
            if (SymbolEqualityComparer.Default.Equals(childNs.ContainingAssembly, targetAssembly))
            {
                CollectTypes(childNs, types, targetAssembly);
            }
        }
    }

    private static void CollectTypeAndNested(INamedTypeSymbol type, List<INamedTypeSymbol> types)
    {
        if (type.DeclaredAccessibility == Accessibility.Public && !IsCompilerGenerated(type)
            && !string.IsNullOrEmpty(type.Name))
        {
            types.Add(type);

            // Also collect public nested types
            foreach (var nestedType in type.GetTypeMembers())
            {
                CollectTypeAndNested(nestedType, types);
            }
        }
    }

    private static bool IsCompilerGenerated(INamedTypeSymbol type)
    {
        return type.Name.StartsWith("<") ||
               type.GetAttributes().Any(a =>
                   a.AttributeClass?.Name == "CompilerGeneratedAttribute");
    }

    /// <summary>
    /// For source files that contain multiple types, fetches the actual source text
    /// from the repository and finds the exact type declaration line. PDB sequence
    /// points only cover method bodies, so the aggregated StartLine can overshoot
    /// the real <c>class</c>/<c>interface</c>/<c>struct</c>/etc. keyword by several lines.
    /// </summary>
    private static void AdjustSourceLinesForMultiTypeFiles(
        List<CanonicalType> typeModels,
        string? sourceRepo,
        string? sourceCommit)
    {
        if (string.IsNullOrEmpty(sourceRepo) || string.IsNullOrEmpty(sourceCommit))
            return;

        // Only process files that contain multiple types with PDB-based source info
        var multiTypeFiles = typeModels
            .Where(t => t.SourceFile is not null && t.SourceLines is not null)
            .GroupBy(t => t.SourceFile!)
            .Where(g => g.Count() > 1)
            .ToList();

        if (multiTypeFiles.Count == 0) return;

        // Cache fetched source files so each file is downloaded at most once
        // (a single assembly may have several multi-type files).
        var sourceCache = new Dictionary<string, string[]?>();

        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(15) };

        // Use GITHUB_TOKEN when available (e.g. in CI) for higher rate limits.
        var token = Environment.GetEnvironmentVariable("GITHUB_TOKEN");
        if (!string.IsNullOrEmpty(token))
        {
            http.DefaultRequestHeaders.Authorization =
                new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", token);
        }

        foreach (var group in multiTypeFiles)
        {
            var lines = GetSourceLines(http, sourceCache, sourceRepo, sourceCommit, group.Key);
            if (lines is null)
            {
                // Source unavailable — the PDB-based lines point to method bodies,
                // not type declarations, so drop them rather than link to a wrong line.
                foreach (var typeModel in group)
                {
                    typeModel.SourceLines = null;
                }
                continue;
            }

            foreach (var typeModel in group)
            {
                var simpleName = PdbSourceReader.NormalizeGenericName(typeModel.Name);

                // For nested types like "Outer.Inner", use just the inner name
                var dotIdx = simpleName.LastIndexOf('.');
                if (dotIdx >= 0) simpleName = simpleName[(dotIdx + 1)..];

                var pdbHintLine = ParseStartLine(typeModel.SourceLines);
                var declarationLine = FindTypeDeclarationLine(lines, simpleName, pdbHintLine);
                if (declarationLine > 0)
                {
                    typeModel.SourceLines = $"{declarationLine}-{declarationLine}";
                }
                else
                {
                    // Regex found no match — drop the PDB-based line so the link
                    // points to the source file itself rather than a wrong line.
                    typeModel.SourceLines = null;
                }
            }
        }
    }

    /// <summary>
    /// Returns the source lines for the given file, fetching from GitHub on first
    /// access and caching for subsequent lookups.
    /// </summary>
    private static string[]? GetSourceLines(
        HttpClient http,
        Dictionary<string, string[]?> cache,
        string sourceRepo,
        string sourceCommit,
        string filePath)
    {
        if (cache.TryGetValue(filePath, out var cached))
            return cached;

        string[]? lines = null;
        var rawUrl = BuildRawGitHubUrl(sourceRepo, sourceCommit, filePath);
        if (rawUrl is not null)
        {
            try
            {
                var text = http.GetStringAsync(rawUrl).GetAwaiter().GetResult();
                lines = text.Split('\n');
            }
            catch
            {
                // Network failure — leave lines null so callers keep PDB-based values.
            }
        }

        cache[filePath] = lines;
        return lines;
    }

    private static string? BuildRawGitHubUrl(string sourceRepo, string sourceCommit, string filePath)
    {
        if (!Uri.TryCreate(sourceRepo, UriKind.Absolute, out var repoUri))
            return null;

        if (!repoUri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase))
            return null;

        var repoPath = repoUri.AbsolutePath.TrimEnd('/');
        if (repoPath.EndsWith(".git", StringComparison.OrdinalIgnoreCase))
            repoPath = repoPath[..^4];

        return $"https://raw.githubusercontent.com{repoPath}/{sourceCommit}/{filePath}";
    }

    /// <summary>
    /// Scans source lines for a type declaration matching <paramref name="typeName"/>.
    /// When multiple matches exist (e.g. a nested type reusing a common name),
    /// the match closest to <paramref name="pdbHintLine"/> wins.
    /// </summary>
    private static int FindTypeDeclarationLine(string[] lines, string typeName, int pdbHintLine)
    {
        var escapedName = Regex.Escape(typeName);
        var pattern = new Regex(
            $@"\b(?:class|interface|struct|enum|record|extension)\s+{escapedName}\b",
            RegexOptions.Compiled);

        int bestLine = -1;
        int bestDistance = int.MaxValue;

        for (int i = 0; i < lines.Length; i++)
        {
            var trimmed = lines[i].TrimStart();

            // Skip comment lines
            if (trimmed.StartsWith("//") || trimmed.StartsWith("/*") || trimmed.StartsWith("*"))
                continue;

            if (pattern.IsMatch(lines[i]))
            {
                int lineNum = i + 1; // 1-indexed
                int distance = pdbHintLine > 0 ? Math.Abs(lineNum - pdbHintLine) : 0;
                if (distance < bestDistance)
                {
                    bestDistance = distance;
                    bestLine = lineNum;
                }
            }
        }

        return bestLine;
    }

    private static int ParseStartLine(string? sourceLines)
    {
        if (sourceLines is null) return 0;
        var dash = sourceLines.IndexOf('-');
        return dash > 0 && int.TryParse(sourceLines[..dash], out var line) ? line : 0;
    }
}
