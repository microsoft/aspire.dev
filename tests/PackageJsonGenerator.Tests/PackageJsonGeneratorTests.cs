using System.Text.Json;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;

namespace PackageJsonGenerator.Tests;

public sealed class PackageJsonGeneratorTests
{
    [Fact]
    public void GeneratePackageJson_WritesSelectedTargetFrameworkMetadata()
    {
        using var assembly = TestAssembly.Create(
            """
            namespace Sample.Library;

            public sealed class Widget
            {
                public string Name => "demo";
            }
            """);

        var outputPath = Path.Combine(assembly.DirectoryPath, "Package.json");

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        using var document = JsonDocument.Parse(File.ReadAllText(outputPath));
        var package = document.RootElement.GetProperty("package");

        Assert.Equal("Sample.Package", package.GetProperty("name").GetString());
        Assert.Equal("1.2.3", package.GetProperty("version").GetString());
        Assert.Equal("net8.0", package.GetProperty("targetFramework").GetString());
    }

    [Fact]
    public void GeneratePackageJson_DoesNotMarkEnumsAsSealed()
    {
        using var assembly = TestAssembly.Create(
            """
            namespace Sample.Library;

            public enum WidgetState
            {
                Unknown = 0,
                Ready = 1,
            }
            """);

        var outputPath = Path.Combine(assembly.DirectoryPath, "Package.json");

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        using var document = JsonDocument.Parse(File.ReadAllText(outputPath));
        var type = document.RootElement
            .GetProperty("types")
            .EnumerateArray()
            .Single(t => t.GetProperty("name").GetString() == "WidgetState");

        Assert.Equal("enum", type.GetProperty("kind").GetString());
        Assert.False(type.TryGetProperty("isSealed", out _));
    }

    [Fact]
    public void GeneratePackageJson_PreservesPlainTextXmlListItems()
    {
        using var assembly = TestAssembly.Create(
            """
            namespace Sample.Library;

            public sealed class Widget
            {
                /// <summary>Does work.</summary>
                /// <remarks>
                /// Happens when either:
                /// <list type="bullet">
                /// <item>The first condition is met.</item>
                /// <item><para>The second condition is met.</para></item>
                /// </list>
                /// </remarks>
                public void Run()
                {
                }
            }
            """);

        var outputPath = Path.Combine(assembly.DirectoryPath, "Package.json");

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        using var document = JsonDocument.Parse(File.ReadAllText(outputPath));
        var method = document.RootElement
            .GetProperty("types")
            .EnumerateArray()
            .Single(t => t.GetProperty("name").GetString() == "Widget")
            .GetProperty("members")
            .EnumerateArray()
            .Single(m => m.GetProperty("name").GetString() == "Run");

        var remarks = method.GetProperty("docs").GetProperty("remarks").EnumerateArray().ToArray();
        var list = remarks.Single(node => node.GetProperty("kind").GetString() == "list");
        var items = list.GetProperty("items").EnumerateArray().ToArray();

        Assert.Equal(2, items.Length);
        Assert.Equal("The first condition is met.", items[0]
            .GetProperty("description")
            .EnumerateArray()
            .Single()
            .GetProperty("text")
            .GetString());

        var secondDescription = items[1]
            .GetProperty("description")
            .EnumerateArray()
            .Single();
        Assert.Equal("para", secondDescription.GetProperty("kind").GetString());
        Assert.Equal("The second condition is met.", secondDescription
            .GetProperty("children")
            .EnumerateArray()
            .Single()
            .GetProperty("text")
            .GetString());
    }

    [Fact]
    public void GeneratePackageJson_NormalizesToLfAndSkipsRewritingUnchangedOutput()
    {
        using var assembly = TestAssembly.Create(
            """
            namespace Sample.Library;

            public sealed class Widget
            {
                public string Name => "demo";
            }
            """);

        var outputPath = Path.Combine(assembly.DirectoryPath, "Package.json");

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        var initialContent = File.ReadAllText(outputPath);
        Assert.DoesNotContain("\r", initialContent);

        File.WriteAllText(outputPath, initialContent.Replace("\n", "\r\n", StringComparison.Ordinal));
        File.SetLastWriteTimeUtc(outputPath, new DateTime(2001, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var crlfWriteTime = File.GetLastWriteTimeUtc(outputPath);

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        var normalizedContent = File.ReadAllText(outputPath);
        Assert.DoesNotContain("\r", normalizedContent);
        Assert.NotEqual(crlfWriteTime, File.GetLastWriteTimeUtc(outputPath));

        File.SetLastWriteTimeUtc(outputPath, new DateTime(2001, 1, 2, 0, 0, 0, DateTimeKind.Utc));
        var unchangedWriteTime = File.GetLastWriteTimeUtc(outputPath);

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        Assert.Equal(unchangedWriteTime, File.GetLastWriteTimeUtc(outputPath));
    }

    [Fact]
    public void GeneratePackageJson_IncludesNestedTypesFromPartialDeclarations()
    {
        // Two partial declarations split across separate source files, mirroring
        // FoundryModel.cs + FoundryModel.Generated.cs. Roslyn merges partials, so
        // both nested types should be discoverable from the parent.
        using var assembly = TestAssembly.Create(
            [
                """
                namespace Sample.Library;

                public partial class Container
                {
                    public sealed class OpenAI
                    {
                        public string Name => "openai";
                    }
                }
                """,
                """
                namespace Sample.Library;

                public partial class Container
                {
                    public sealed class Anthropic
                    {
                        public string Name => "anthropic";
                    }
                }
                """,
            ]);

        var outputPath = Path.Combine(assembly.DirectoryPath, "Package.json");

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        using var document = JsonDocument.Parse(File.ReadAllText(outputPath));
        var types = document.RootElement.GetProperty("types").EnumerateArray().ToList();

        var container = types.Single(t => t.GetProperty("fullName").GetString() == "Sample.Library.Container");
        var nested = container.GetProperty("nestedTypes")
            .EnumerateArray()
            .Select(e => e.GetString())
            .ToList();

        Assert.Equal(
            ["Sample.Library.Container.Anthropic", "Sample.Library.Container.OpenAI"],
            nested);

        // Nested types should also be present as standalone type entries.
        Assert.Contains(types, t => t.GetProperty("fullName").GetString() == "Sample.Library.Container.OpenAI");
        Assert.Contains(types, t => t.GetProperty("fullName").GetString() == "Sample.Library.Container.Anthropic");
    }

    [Fact]
    public void GeneratePackageJson_OmitsNestedTypesArrayWhenNone()
    {
        using var assembly = TestAssembly.Create(
            """
            namespace Sample.Library;

            public sealed class Widget
            {
                public string Name => "demo";
            }
            """);

        var outputPath = Path.Combine(assembly.DirectoryPath, "Package.json");

        PackageJsonGenerator.GeneratePackageJson(
            assembly.AssemblyPath,
            assembly.References,
            outputPath,
            versionOverride: "1.2.3",
            packageNameOverride: "Sample.Package",
            targetFrameworkOverride: "net8.0");

        using var document = JsonDocument.Parse(File.ReadAllText(outputPath));
        var widget = document.RootElement
            .GetProperty("types")
            .EnumerateArray()
            .Single(t => t.GetProperty("name").GetString() == "Widget");

        Assert.False(widget.TryGetProperty("nestedTypes", out _));
    }

    private sealed class TestAssembly : IDisposable
    {
        private TestAssembly(string directoryPath, string assemblyPath, string[] references)
        {
            DirectoryPath = directoryPath;
            AssemblyPath = assemblyPath;
            References = references;
        }

        public string DirectoryPath { get; }

        public string AssemblyPath { get; }

        public string[] References { get; }

        public static TestAssembly Create(string source) => Create([source]);

        public static TestAssembly Create(string[] sources)
        {
            var tempDirectory = Directory.CreateTempSubdirectory("pkg-generator-tests-");
            var assemblyPath = Path.Combine(tempDirectory.FullName, "Sample.Library.dll");
            var pdbPath = Path.ChangeExtension(assemblyPath, ".pdb");
            var xmlPath = Path.ChangeExtension(assemblyPath, ".xml");

            var trustedPlatformAssemblies = ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES"))
                ?.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
                ?? throw new InvalidOperationException("Trusted platform assemblies were not available.");

            var references = trustedPlatformAssemblies
                .Where(path => path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
                .ToArray();

            var compilation = CSharpCompilation.Create(
                assemblyName: "Sample.Library",
                syntaxTrees: sources.Select(s => CSharpSyntaxTree.ParseText(s)),
                references: references.Select(reference => MetadataReference.CreateFromFile(reference)),
                options: new CSharpCompilationOptions(OutputKind.DynamicallyLinkedLibrary));

            using var assemblyStream = File.Create(assemblyPath);
            using var pdbStream = File.Create(pdbPath);
            using var xmlStream = File.Create(xmlPath);

            var emitResult = compilation.Emit(
                peStream: assemblyStream,
                pdbStream: pdbStream,
                xmlDocumentationStream: xmlStream,
                options: new Microsoft.CodeAnalysis.Emit.EmitOptions(
                    debugInformationFormat: Microsoft.CodeAnalysis.Emit.DebugInformationFormat.PortablePdb));

            Assert.True(
                emitResult.Success,
                string.Join(Environment.NewLine, emitResult.Diagnostics.Select(d => d.ToString())));

            return new TestAssembly(tempDirectory.FullName, assemblyPath, references);
        }

        public void Dispose()
        {
            try
            {
                Directory.Delete(DirectoryPath, recursive: true);
            }
            catch
            {
            }
        }
    }
}
