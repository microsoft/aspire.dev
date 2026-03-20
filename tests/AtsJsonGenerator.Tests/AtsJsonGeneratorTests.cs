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
            sourceRepo: "https://github.com/dotnet/aspire",
            sourceCommit: "abc123",
            basePath: basePath);

        Assert.Equal(0, exitCode);

        var result = JsonSerializer.Deserialize<TsPackageModel>(File.ReadAllText(outputPath));

        Assert.NotNull(result);
        Assert.Equal("Contoso.Tools", result.Package.Name);
        Assert.Equal("2.4.0", result.Package.Version);
        Assert.Equal("https://github.com/dotnet/aspire", result.Package.SourceRepository);
        Assert.Equal("abc123", result.Package.SourceCommit);

        var function = Assert.Single(result.Functions);
        Assert.Equal("unique-capability", function.CapabilityId);
        Assert.Equal("UseUnique(name: string): void", function.Signature);

        var handle = Assert.Single(result.HandleTypes);
        Assert.Equal("Contoso.Builder", handle.FullName);
        var handleCapability = Assert.Single(handle.Capabilities);
        Assert.Equal("unique-capability", handleCapability.CapabilityId);

        var dto = Assert.Single(result.DtoTypes);
        Assert.Equal("Contoso.UniqueOptions", dto.FullName);
        Assert.Equal("string[]", Assert.Single(dto.Fields).Type);

        var enumType = Assert.Single(result.EnumTypes);
        Assert.Equal("Contoso.UniqueMode", enumType.FullName);
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