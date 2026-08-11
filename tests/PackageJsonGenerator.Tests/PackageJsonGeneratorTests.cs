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

    [Fact]
    public void GeneratePackageJson_RedactsConnectionStringPasswordsInEnumMemberDescriptions()
    {
        using var assembly = TestAssembly.Create(
            """
            namespace Sample.Library;

            public enum ConnectionMode
            {
                /// <summary>
                /// Connects using <c>Server=host,port;User ID=sa;Password=hunter2</c>.
                /// </summary>
                Direct = 0,
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
        var member = document.RootElement
            .GetProperty("types")
            .EnumerateArray()
            .Single(t => t.GetProperty("name").GetString() == "ConnectionMode")
            .GetProperty("enumMembers")
            .EnumerateArray()
            .Single(m => m.GetProperty("name").GetString() == "Direct");

        var description = member.GetProperty("description").GetString();

        Assert.NotNull(description);
        Assert.DoesNotContain("hunter2", description);
        Assert.Contains("Placeholder", description!);
    }

    [Fact]
    public void GeneratePackageJson_PreservesAspireAttributeConstructorAndNamedArguments()
    {
        using var attributes = TestAssembly.Create(
            AspireAttributesSource,
            assemblyName: "Aspire.Attribute.Dependency");
        using var consumer = TestAssembly.Create(
            AspireConsumerSource,
            assemblyName: "Aspire.Consumer",
            additionalReferences: [attributes.AssemblyPath]);
        var outputPath = Path.Combine(consumer.DirectoryPath, "Package.json");

        PackageJsonGenerator.GeneratePackageJson(
            consumer.AssemblyPath,
            consumer.References,
            outputPath,
            packageNameOverride: "Aspire.Consumer.Package");

        using var document = JsonDocument.Parse(File.ReadAllText(outputPath));
        var attribute = document.RootElement
            .GetProperty("types")
            .EnumerateArray()
            .Single(type => type.GetProperty("name").GetString() == "ExportedResource")
            .GetProperty("attributes")
            .EnumerateArray()
            .Single();

        Assert.Equal(
            ["resource-name", "3"],
            attribute.GetProperty("constructorArguments")
                .EnumerateArray()
                .Select(argument => argument.GetString()));
        Assert.Equal(
            "named-value",
            attribute.GetProperty("arguments").GetProperty("Alias").GetString());
    }

    [Fact]
    public void GeneratePackageJson_FailsWhenAspireAttributeDependencyIsMismatched()
    {
        using var attributes = TestAssembly.Create(
            AspireAttributesSource,
            assemblyName: "Aspire.Attribute.Dependency");
        using var consumer = TestAssembly.Create(
            AspireConsumerSource,
            assemblyName: "Aspire.Consumer",
            additionalReferences: [attributes.AssemblyPath]);
        using var mismatchedAttributes = TestAssembly.Create(
            """
            using System;
            using System.Reflection;
            [assembly: AssemblyVersion("1.0.0.0")]
            namespace Aspire.Hosting;
            [AttributeUsage(AttributeTargets.All)]
            public sealed class AspireExportAttribute : Attribute
            {
                public string? Alias { get; set; }
            }
            """,
            assemblyName: "Aspire.Attribute.Dependency");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            PackageJsonGenerator.GeneratePackageJson(
                consumer.AssemblyPath,
                [.. consumer.References.Where(reference => reference != attributes.AssemblyPath), mismatchedAttributes.AssemblyPath],
                Path.Combine(consumer.DirectoryPath, "Package.json"),
                packageNameOverride: "Aspire.Consumer.Package"));

        Assert.Contains("Aspire.Consumer.Package", exception.Message);
        Assert.Contains("ExportedResource", exception.Message);
        Assert.Contains("AspireExportAttribute", exception.Message);
        Assert.Contains("constructor", exception.Message);
    }

    [Fact]
    public void GeneratePackageJson_FailsWhenReferencedAttributeAssemblyIsMissing()
    {
        using var attributes = TestAssembly.Create(
            AspireAttributesSource,
            assemblyName: "Aspire.Attribute.Dependency");
        using var consumer = TestAssembly.Create(
            AspireConsumerSource,
            assemblyName: "Aspire.Consumer",
            additionalReferences: [attributes.AssemblyPath]);

        var exception = Assert.Throws<InvalidOperationException>(() =>
            PackageJsonGenerator.GeneratePackageJson(
                consumer.AssemblyPath,
                [.. consumer.References.Where(reference => reference != attributes.AssemblyPath)],
                Path.Combine(consumer.DirectoryPath, "Package.json"),
                packageNameOverride: "Aspire.Consumer.Package"));

        Assert.Contains("Aspire.Consumer.Package", exception.Message);
        Assert.Contains("ExportedResource", exception.Message);
        Assert.Contains("AspireExportAttribute", exception.Message);
        Assert.Contains("class", exception.Message);
    }

    [Fact]
    public void GeneratePackageJson_FailsWhenInputAssemblyReferenceIsMissing()
    {
        using var dependency = TestAssembly.Create(
            "namespace External.Dependency; public class ExternalBase;",
            assemblyName: "External.Dependency");
        using var consumer = TestAssembly.Create(
            "namespace Sample.Library; public sealed class ExportedResource : External.Dependency.ExternalBase;",
            assemblyName: "Aspire.Consumer",
            additionalReferences: [dependency.AssemblyPath]);

        var exception = Assert.Throws<InvalidOperationException>(() =>
            PackageJsonGenerator.GeneratePackageJson(
                consumer.AssemblyPath,
                [.. consumer.References.Where(reference => reference != dependency.AssemblyPath)],
                Path.Combine(consumer.DirectoryPath, "Package.json"),
                packageNameOverride: "Aspire.Consumer.Package"));

        Assert.Contains("Aspire.Consumer.Package", exception.Message);
        Assert.Contains("unresolved referenced assemblies", exception.Message);
        Assert.Contains("External.Dependency", exception.Message);
    }

    [Fact]
    public void GeneratePackageJson_FailsWhenPublicApiTypeCannotBeResolved()
    {
        using var dependency = TestAssembly.Create(
            "namespace External.Dependency; public sealed class ExpectedType;",
            assemblyName: "External.Dependency");
        using var consumer = TestAssembly.Create(
            "namespace Sample.Library; public sealed class ExportedResource { public External.Dependency.ExpectedType GetValue() => new(); }",
            assemblyName: "Aspire.Consumer",
            additionalReferences: [dependency.AssemblyPath]);
        using var mismatchedDependency = TestAssembly.Create(
            "namespace External.Dependency; public sealed class OtherType;",
            assemblyName: "External.Dependency");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            PackageJsonGenerator.GeneratePackageJson(
                consumer.AssemblyPath,
                [.. consumer.References.Where(reference => reference != dependency.AssemblyPath), mismatchedDependency.AssemblyPath],
                Path.Combine(consumer.DirectoryPath, "Package.json"),
                packageNameOverride: "Aspire.Consumer.Package"));

        Assert.Contains("Aspire.Consumer.Package", exception.Message);
        Assert.Contains("GetValue", exception.Message);
        Assert.Contains("unresolved public API type", exception.Message);
        Assert.Contains("ExpectedType", exception.Message);
    }

    [Fact]
    public void GeneratePackageJson_FailsWhenTypeAttributeArgumentCannotBeResolved()
    {
        using var dependency = TestAssembly.Create(
            "namespace External.Dependency; public sealed class ExpectedType;",
            assemblyName: "External.Dependency");
        using var consumer = TestAssembly.Create(
            """
            using System;
            namespace Aspire.Hosting
            {
                [AttributeUsage(AttributeTargets.All)]
                public sealed class AspireExportAttribute(Type resourceType) : Attribute;
            }
            namespace Sample.Library
            {
                [Aspire.Hosting.AspireExport(typeof(External.Dependency.ExpectedType))]
                public sealed class ExportedResource;
            }
            """,
            assemblyName: "Aspire.Consumer",
            additionalReferences: [dependency.AssemblyPath]);
        using var mismatchedDependency = TestAssembly.Create(
            "namespace External.Dependency; public sealed class OtherType;",
            assemblyName: "External.Dependency");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            PackageJsonGenerator.GeneratePackageJson(
                consumer.AssemblyPath,
                [.. consumer.References.Where(reference => reference != dependency.AssemblyPath), mismatchedDependency.AssemblyPath],
                Path.Combine(consumer.DirectoryPath, "Package.json"),
                packageNameOverride: "Aspire.Consumer.Package"));

        Assert.Contains("Aspire.Consumer.Package", exception.Message);
        Assert.Contains("AspireExportAttribute", exception.Message);
        Assert.Contains("constructor arguments contain an unresolved value", exception.Message);
    }

    [Fact]
    public void GeneratePackageJson_FailsWhenTypeArrayAttributeArgumentCannotBeResolved()
    {
        using var dependency = TestAssembly.Create(
            "namespace External.Dependency; public sealed class ExpectedType;",
            assemblyName: "External.Dependency");
        using var consumer = TestAssembly.Create(
            """
            using System;
            namespace Aspire.Hosting
            {
                [AttributeUsage(AttributeTargets.All)]
                public sealed class AspireUnionAttribute(params Type[] resourceTypes) : Attribute;
            }
            namespace Sample.Library
            {
                [Aspire.Hosting.AspireUnion(typeof(External.Dependency.ExpectedType), typeof(string))]
                public sealed class ExportedResource;
            }
            """,
            assemblyName: "Aspire.Consumer",
            additionalReferences: [dependency.AssemblyPath]);
        using var mismatchedDependency = TestAssembly.Create(
            "namespace External.Dependency; public sealed class OtherType;",
            assemblyName: "External.Dependency");

        var exception = Assert.Throws<InvalidOperationException>(() =>
            PackageJsonGenerator.GeneratePackageJson(
                consumer.AssemblyPath,
                [.. consumer.References.Where(reference => reference != dependency.AssemblyPath), mismatchedDependency.AssemblyPath],
                Path.Combine(consumer.DirectoryPath, "Package.json"),
                packageNameOverride: "Aspire.Consumer.Package"));

        Assert.Contains("Aspire.Consumer.Package", exception.Message);
        Assert.Contains("AspireUnionAttribute", exception.Message);
        Assert.Contains("constructor arguments contain an unresolved value", exception.Message);
    }

    private const string AspireAttributesSource =
        """
        using System;
        using System.Reflection;
        [assembly: AssemblyVersion("1.0.0.0")]
        namespace Aspire.Hosting;
        [AttributeUsage(AttributeTargets.All)]
        public sealed class AspireExportAttribute(string name, int order) : Attribute
        {
            public string Name { get; } = name;
            public int Order { get; } = order;
            public string? Alias { get; set; }
        }
        """;

    private const string AspireConsumerSource =
        """
        using Aspire.Hosting;
        namespace Sample.Library;
        [AspireExport("resource-name", 3, Alias = "named-value")]
        public sealed class ExportedResource;
        """;

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

        public static TestAssembly Create(
            string source,
            string assemblyName,
            string[]? additionalReferences = null) =>
            Create([source], assemblyName, additionalReferences);

        public static TestAssembly Create(
            string[] sources,
            string assemblyName = "Sample.Library",
            string[]? additionalReferences = null)
        {
            var tempDirectory = Directory.CreateTempSubdirectory("pkg-generator-tests-");
            var assemblyPath = Path.Combine(tempDirectory.FullName, $"{assemblyName}.dll");
            var pdbPath = Path.ChangeExtension(assemblyPath, ".pdb");
            var xmlPath = Path.ChangeExtension(assemblyPath, ".xml");

            var trustedPlatformAssemblies = ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES"))
                ?.Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
                ?? throw new InvalidOperationException("Trusted platform assemblies were not available.");

            var references = trustedPlatformAssemblies
                .Where(path => path.EndsWith(".dll", StringComparison.OrdinalIgnoreCase))
                .Concat(additionalReferences ?? [])
                .ToArray();

            var compilation = CSharpCompilation.Create(
                assemblyName: assemblyName,
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
