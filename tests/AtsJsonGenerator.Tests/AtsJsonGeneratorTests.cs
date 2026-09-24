using System.Text.Json;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

public sealed class AtsJsonGeneratorTests
{
    [Fact]
    public void TransformFile_InfersMetadataAndDeduplicatesAgainstBaseModel()
    {
        using var tempDirectory = new TempDirectory();

        var inputPath = Path.Combine(tempDirectory.Path, "Contoso.Tools.json");
        var outputPath = Path.Combine(tempDirectory.Path, "output", "Contoso.Tools.json");
        var basePath = Path.Combine(tempDirectory.Path, "base.json");

        var dump = new AtsDumpRoot
        {
            Packages =
            [
                new AtsDumpPackageRef
                {
                    Name = "Contoso.Tools",
                    Version = "2.4.0",
                },
            ],
            HandleTypes =
            [
                new AtsDumpHandleType
                {
                    AtsTypeId = "Contoso.Assembly/Contoso.Builder",
                    ExposeMethods = true,
                    ExposeProperties = true,
                    BaseTypeHierarchy =
                    [
                        new AtsDumpTypeRef
                        {
                            TypeId = "Contoso.Assembly/Contoso.BaseBuilder",
                            Category = "Type",
                        },
                        new AtsDumpTypeRef
                        {
                            TypeId = "Contoso.Assembly/Contoso.RootBuilder",
                            Category = "Type",
                        },
                    ],
                },
            ],
            Capabilities =
            [
                new AtsDumpCapability
                {
                    CapabilityId = "shared-capability",
                    MethodName = "UseShared",
                    QualifiedMethodName = "Contoso.Builder.UseShared",
                    CapabilityKind = "method",
                    TargetTypeId = "Contoso.Assembly/Contoso.Builder",
                    TargetParameterName = "builder",
                    Parameters =
                    [
                        new AtsDumpParameter
                        {
                            Name = "builder",
                            Type = new AtsDumpTypeRef
                            {
                                TypeId = "Contoso.Assembly/Contoso.Builder",
                                Category = "Type",
                            },
                        },
                    ],
                    ReturnType = new AtsDumpTypeRef
                    {
                        TypeId = "void",
                        Category = "Primitive",
                    },
                    ExpandedTargetTypes =
                    [
                        new AtsDumpTypeRef
                        {
                            TypeId = "Contoso.Assembly/Contoso.Builder",
                            Category = "Type",
                        },
                    ],
                },
                new AtsDumpCapability
                {
                    CapabilityId = "unique-capability",
                    MethodName = "UseUnique",
                    QualifiedMethodName = "Contoso.Builder.UseUnique",
                    CapabilityKind = "method",
                    TargetTypeId = "Contoso.Assembly/Contoso.Builder",
                    TargetParameterName = "builder",
                    Parameters =
                    [
                        new AtsDumpParameter
                        {
                            Name = "builder",
                            Type = new AtsDumpTypeRef
                            {
                                TypeId = "Contoso.Assembly/Contoso.Builder",
                                Category = "Type",
                            },
                        },
                        new AtsDumpParameter
                        {
                            Name = "name",
                            Type = new AtsDumpTypeRef
                            {
                                TypeId = "string",
                                Category = "Primitive",
                            },
                        },
                    ],
                    ReturnType = new AtsDumpTypeRef
                    {
                        TypeId = "void",
                        Category = "Primitive",
                    },
                    ExpandedTargetTypes =
                    [
                        new AtsDumpTypeRef
                        {
                            TypeId = "Contoso.Assembly/Contoso.Builder",
                            Category = "Type",
                        },
                    ],
                },
            ],
            DtoTypes =
            [
                new AtsDumpDtoType
                {
                    TypeId = "Contoso.Assembly/Contoso.SharedOptions",
                    Name = "SharedOptions",
                },
                new AtsDumpDtoType
                {
                    TypeId = "Contoso.Assembly/Contoso.UniqueOptions",
                    Name = "UniqueOptions",
                    Properties =
                    [
                        new AtsDumpDtoProperty
                        {
                            Name = "Names",
                            IsOptional = true,
                            Type = new AtsDumpTypeRef
                            {
                                TypeId = "string",
                                Category = "Array",
                                ElementType = new AtsDumpTypeRef
                                {
                                    TypeId = "string",
                                    Category = "Primitive",
                                },
                            },
                        },
                        new AtsDumpDtoProperty
                        {
                            Name = "Region",
                            IsOptional = false,
                            Type = new AtsDumpTypeRef
                            {
                                TypeId = "string",
                                Category = "Primitive",
                            },
                        },
                    ],
                },
            ],
            EnumTypes =
            [
                new AtsDumpEnumType
                {
                    TypeId = "enum:Contoso.SharedMode",
                    Name = "SharedMode",
                    Values = ["One"],
                },
                new AtsDumpEnumType
                {
                    TypeId = "enum:Contoso.UniqueMode",
                    Name = "UniqueMode",
                    Values = ["Alpha", "Beta"],
                },
            ],
        };

        var baseModel = new TsPackageModel
        {
            Package = new TsPackageInfo
            {
                Name = "Aspire.Hosting",
            },
            Functions =
            [
                new TsFunctionModel
                {
                    Name = "UseShared",
                    CapabilityId = "shared-capability",
                    QualifiedName = "Contoso.Builder.UseShared",
                    Kind = "method",
                    Signature = "UseShared(): void",
                    ReturnType = "void",
                },
            ],
            DtoTypes =
            [
                new TsDtoTypeModel
                {
                    Name = "SharedOptions",
                    FullName = "Contoso.SharedOptions",
                },
            ],
            EnumTypes =
            [
                new TsEnumTypeModel
                {
                    Name = "SharedMode",
                    FullName = "Contoso.SharedMode",
                    Members = ["One"],
                },
            ],
        };

        File.WriteAllText(inputPath, JsonSerializer.Serialize(dump));
        File.WriteAllText(basePath, JsonSerializer.Serialize(baseModel));

        var exitCode = GenerateCommand.TransformFile(
            inputPath,
            outputPath,
            packageName: null,
            version: null,
            sourceRepo: "https://github.com/microsoft/aspire",
            sourceCommit: "abc123",
            basePaths: [basePath]);

        Assert.Equal(0, exitCode);

        var result = JsonSerializer.Deserialize<TsPackageModel>(File.ReadAllText(outputPath));

        Assert.NotNull(result);
        Assert.Equal("Contoso.Tools", result.Package.Name);
        Assert.Equal("2.4.0", result.Package.Version);
        Assert.Equal("https://github.com/microsoft/aspire", result.Package.SourceRepository);
        Assert.Equal("abc123", result.Package.SourceCommit);

        var function = Assert.Single(result.Functions);
        Assert.Equal("unique-capability", function.CapabilityId);
        Assert.Equal("UseUnique(name: string): void", function.Signature);

        var handle = Assert.Single(result.HandleTypes);
        Assert.Equal("Contoso.Builder", handle.FullName);
        Assert.Equal(
            ["Contoso.BaseBuilder", "Contoso.RootBuilder"],
            handle.BaseTypeHierarchy);
        var handleCapability = Assert.Single(handle.Capabilities);
        Assert.Equal("unique-capability", handleCapability.CapabilityId);

        var dto = Assert.Single(result.DtoTypes);
        Assert.Equal("Contoso.UniqueOptions", dto.FullName);
        Assert.Collection(
            dto.Fields,
            field =>
            {
                Assert.Equal("Names", field.Name);
                Assert.Equal("string[]", field.Type);
                Assert.True(field.IsOptional);
            },
            field =>
            {
                Assert.Equal("Region", field.Name);
                Assert.Equal("string", field.Type);
                Assert.True(field.IsOptional);
            });

        var enumType = Assert.Single(result.EnumTypes);
        Assert.Equal("Contoso.UniqueMode", enumType.FullName);
    }

    [Fact]
    public async Task TransformFile_RemovesSupportingContextWithoutDroppingIntegrationExports()
    {
        using var tempDirectory = new TempDirectory();
        var inputPath = Path.Combine(tempDirectory.Path, "input.json");
        var outputPath = Path.Combine(tempDirectory.Path, "output.json");
        var dump = new AtsDumpRoot
        {
            Capabilities = new[] { "Core/create", "Dotnet/create", "Radius/legacy", "Radius/generic" }
                .Select(id => new AtsDumpCapability
                {
                    CapabilityId = id,
                    MethodName = "withContainerImage",
                    QualifiedMethodName = "withContainerImage",
                    CapabilityKind = "Method",
                    TargetTypeId = "Dotnet/Dotnet.ProjectResource",
                    ExpandedTargetTypes =
                    [
                        new AtsDumpTypeRef
                        {
                            TypeId = "Dotnet/Dotnet.ProjectResource",
                            Category = "Handle",
                        },
                    ],
                }).ToList(),
            HandleTypes =
            [
                new AtsDumpHandleType { AtsTypeId = "Dotnet/Dotnet.ProjectResource" },
                new AtsDumpHandleType { AtsTypeId = "Radius/Radius.EnvironmentResource" },
            ],
        };
        File.WriteAllText(inputPath, JsonSerializer.Serialize(dump));
        var fullModel = AtsTransformer.Transform(dump, "Radius", "13.6.0");
        var basePaths = new List<string>();
        foreach (var name in new[] { "Core", "Dotnet" })
        {
            var basePath = Path.Combine(tempDirectory.Path, $"{name}.json");
            File.WriteAllText(basePath, JsonSerializer.Serialize(new TsPackageModel
            {
                Package = new TsPackageInfo { Name = name },
                Functions = fullModel.Functions.Where(f => f.CapabilityId.StartsWith($"{name}/", StringComparison.Ordinal)).ToList(),
                HandleTypes = fullModel.HandleTypes.Where(h => h.FullName.StartsWith($"{name}.", StringComparison.Ordinal)).ToList(),
            }));
            basePaths.Add(basePath);
        }

        var exitCode = await GenerateCommand.GetCommand().Parse(
        [
            "--input", inputPath, "--output", outputPath, "--package-name", "Radius",
            "--base", basePaths[0], "--base", basePaths[1],
        ]).InvokeAsync();

        Assert.Equal(0, exitCode);
        var result = JsonSerializer.Deserialize<TsPackageModel>(File.ReadAllText(outputPath));
        Assert.NotNull(result);
        Assert.Equal(["Radius/generic", "Radius/legacy"], result.Functions.Select(f => f.CapabilityId).Order());
        Assert.All(result.Functions, f => Assert.Equal(["Dotnet.ProjectResource"], f.ExpandedTargetTypes));
        Assert.Equal("Radius.EnvironmentResource", Assert.Single(result.HandleTypes).FullName);
    }

    [Theory]
    [InlineData(false)]
    [InlineData(true)]
    public void TransformFile_RejectsMissingOrNullSupportingContext(bool writeNull)
    {
        using var tempDirectory = new TempDirectory();
        var inputPath = Path.Combine(tempDirectory.Path, "input.json");
        var outputPath = Path.Combine(tempDirectory.Path, "output.json");
        var basePath = Path.Combine(tempDirectory.Path, "context.json");
        File.WriteAllText(inputPath, JsonSerializer.Serialize(new AtsDumpRoot()));
        if (writeNull)
        {
            File.WriteAllText(basePath, "null");
        }

        Assert.Equal(1, GenerateCommand.TransformFile(
            inputPath, outputPath, "Radius", null, null, null, [basePath]));
        Assert.False(File.Exists(outputPath));
    }

    [Fact]
    public void TransformFile_ReturnsErrorWhenInputIsMissing()
    {
        using var tempDirectory = new TempDirectory();

        var exitCode = GenerateCommand.TransformFile(
            Path.Combine(tempDirectory.Path, "missing.json"),
            Path.Combine(tempDirectory.Path, "output.json"),
            packageName: "Contoso.Tools",
            version: null,
            sourceRepo: null,
            sourceCommit: null);

        Assert.Equal(1, exitCode);
    }

    [Fact]
    public void TransformFile_NormalizesToLfAndSkipsRewritingUnchangedOutput()
    {
        using var tempDirectory = new TempDirectory();

        var inputPath = Path.Combine(tempDirectory.Path, "Contoso.Tools.json");
        var outputPath = Path.Combine(tempDirectory.Path, "output", "Contoso.Tools.json");

        var dump = new AtsDumpRoot
        {
            Packages =
            [
                new AtsDumpPackageRef
                {
                    Name = "Contoso.Tools",
                    Version = "2.4.0",
                },
            ],
            Capabilities =
            [
                new AtsDumpCapability
                {
                    CapabilityId = "unique-capability",
                    MethodName = "UseUnique",
                    QualifiedMethodName = "Contoso.Builder.UseUnique",
                    CapabilityKind = "method",
                    TargetTypeId = "Contoso.Assembly/Contoso.Builder",
                    TargetParameterName = "builder",
                    Parameters =
                    [
                        new AtsDumpParameter
                        {
                            Name = "builder",
                            Type = new AtsDumpTypeRef
                            {
                                TypeId = "Contoso.Assembly/Contoso.Builder",
                                Category = "Type",
                            },
                        },
                    ],
                    ReturnType = new AtsDumpTypeRef
                    {
                        TypeId = "void",
                        Category = "Primitive",
                    },
                    ExpandedTargetTypes =
                    [
                        new AtsDumpTypeRef
                        {
                            TypeId = "Contoso.Assembly/Contoso.Builder",
                            Category = "Type",
                        },
                    ],
                },
            ],
            HandleTypes =
            [
                new AtsDumpHandleType
                {
                    AtsTypeId = "Contoso.Assembly/Contoso.Builder",
                    ExposeMethods = true,
                    ExposeProperties = true,
                },
            ],
        };

        File.WriteAllText(inputPath, JsonSerializer.Serialize(dump));

        var firstExitCode = GenerateCommand.TransformFile(
            inputPath,
            outputPath,
            packageName: null,
            version: null,
            sourceRepo: "https://github.com/microsoft/aspire",
            sourceCommit: "abc123");

        Assert.Equal(0, firstExitCode);

        var initialContent = File.ReadAllText(outputPath);
        Assert.DoesNotContain("\r", initialContent);

        File.WriteAllText(outputPath, initialContent.Replace("\n", "\r\n", StringComparison.Ordinal));
        File.SetLastWriteTimeUtc(outputPath, new DateTime(2001, 1, 1, 0, 0, 0, DateTimeKind.Utc));
        var crlfWriteTime = File.GetLastWriteTimeUtc(outputPath);

        var secondExitCode = GenerateCommand.TransformFile(
            inputPath,
            outputPath,
            packageName: null,
            version: null,
            sourceRepo: "https://github.com/microsoft/aspire",
            sourceCommit: "abc123");

        Assert.Equal(0, secondExitCode);

        var normalizedContent = File.ReadAllText(outputPath);
        Assert.DoesNotContain("\r", normalizedContent);
        Assert.NotEqual(crlfWriteTime, File.GetLastWriteTimeUtc(outputPath));

        File.SetLastWriteTimeUtc(outputPath, new DateTime(2001, 1, 2, 0, 0, 0, DateTimeKind.Utc));
        var unchangedWriteTime = File.GetLastWriteTimeUtc(outputPath);

        var thirdExitCode = GenerateCommand.TransformFile(
            inputPath,
            outputPath,
            packageName: null,
            version: null,
            sourceRepo: "https://github.com/microsoft/aspire",
            sourceCommit: "abc123");

        Assert.Equal(0, thirdExitCode);
        Assert.Equal(unchangedWriteTime, File.GetLastWriteTimeUtc(outputPath));
    }

    private sealed class TempDirectory : IDisposable
    {
        public TempDirectory()
        {
            Path = Directory.CreateTempSubdirectory("ats-json-generator-tests-").FullName;
        }

        public string Path { get; }

        public void Dispose()
        {
            try
            {
                Directory.Delete(Path, recursive: true);
            }
            catch
            {
            }
        }
    }
}
