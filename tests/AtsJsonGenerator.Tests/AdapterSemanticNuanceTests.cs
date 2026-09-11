using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

public sealed class AdapterSemanticNuanceTests
{
    [Fact]
    public void Python_NullableNonNullDefaultUsesOmissionSentinel()
    {
        var dump = CreateSingleCapabilityDump(
            "ConfigureLabel",
            new AtsDumpParameter
            {
                Name = "label",
                Type = new AtsDumpTypeRef
                {
                    TypeId = "string",
                    Category = "Primitive",
                    IsNullable = true,
                },
                IsOptional = true,
                IsNullable = true,
                DefaultValue = "fallback",
            });

        var projection = AtsTransformer.Transform(dump, "Contoso")
            .Items.Single()
            .Projections["python"];

        Assert.Contains(
            "label: str | None = typing.cast(str | None, _ASPIRE_UNSET)",
            projection.Signature);
        Assert.Equal(
            "typing.cast(str | None, _ASPIRE_UNSET)",
            Assert.Single(projection.Parameters).DefaultValue);
    }

    [Fact]
    public void Python_UsesPinnedGeneratorAbbreviations()
    {
        var dump = CreateSingleCapabilityDump(
            "AddDockerComposeEnvironmentAsync",
            new AtsDumpParameter
            {
                Name = "configurationDirectory",
                Type = new AtsDumpTypeRef { TypeId = "string", Category = "Primitive" },
            });

        var projection = AtsTransformer.Transform(dump, "Contoso")
            .Items.Single()
            .Projections["python"];

        Assert.Equal("add_docker_compose_env", projection.Identifier);
        Assert.Contains("config_dir: str", projection.Signature);
    }

    [Fact]
    public void Go_UsesDirectDtoOrWrapperOptionsAndDeferredFirstError()
    {
        var model = AtsTransformer.Transform(
            AtsJsonGeneratorTests.LoadFixture(),
            "Contoso.Hosting.Widgets");

        var direct = model.Items.Single(item =>
            item.Id == "capability:Contoso.Hosting.Widgets/withSettings")
            .Projections["go"];
        Assert.Contains("options ...*WidgetOptions", direct.Signature);
        Assert.DoesNotContain("type WithSettingsOptions", direct.Declaration);
        Assert.Equal("deferred", direct.Return?.ErrorModel);

        var wrapper = model.Items.Single(item =>
            item.Id == "capability:Contoso.Hosting.Widgets/addWidget")
            .Projections["go"];
        Assert.Contains("type AddWidgetAsyncOptions struct", wrapper.Declaration);
        Assert.Contains("Port *float64 `json:\"port,omitempty\"`", wrapper.Declaration);
        Assert.Contains("OnReady func(resource WidgetResource) `json:\"-\"`", wrapper.Declaration);
        Assert.Contains("CancellationToken *CancellationToken `json:\"-\"`", wrapper.Declaration);

        var handle = model.Items.Single(item => item.Id == "handle:Contoso.WidgetResource")
            .Projections["go"];
        Assert.Contains("Err() error", handle.Declaration);
        Assert.Equal("Fluent failures use first-error-wins deferred Err().", handle.Reason);
    }

    [Fact]
    public void TypeScriptAndGo_TreatStableDumpOptionsHandlesAsDirectOptions()
    {
        var dump = CreateSingleCapabilityDump(
            "AddProject",
            new AtsDumpParameter
            {
                Name = "options",
                Type = new AtsDumpTypeRef
                {
                    TypeId = "Aspire.ProjectResourceOptions",
                    Category = "Handle",
                },
                IsOptional = true,
            },
            additionalParameter:
            new AtsDumpParameter
            {
                Name = "cancellationToken",
                Type = new AtsDumpTypeRef
                {
                    TypeId = "cancellationToken",
                    Category = "Primitive",
                },
                IsOptional = true,
            });

        var projections = AtsTransformer.Transform(dump, "Aspire.Hosting")
            .Items.Single()
            .Projections;

        var typeScript = projections["typescript"];
        Assert.Contains("options?: ProjectResourceOptions", typeScript.Signature);
        Assert.Contains("cancellationToken?: AbortSignal", typeScript.Signature);
        Assert.DoesNotContain("AddProjectOptions", typeScript.Declaration);
        Assert.DoesNotContain("Awaitable<ProjectResourceOptions>", typeScript.Declaration);

        var go = projections["go"];
        Assert.Contains("options ...*AddProjectOptions", go.Signature);
        Assert.Contains("type AddProjectOptions struct", go.Declaration);
    }

    [Fact]
    public void Java_SuffixesKeywordsAndPreservesEnumWireValues()
    {
        var dump = CreateSingleCapabilityDump(
            "return",
            new AtsDumpParameter
            {
                Name = "class",
                Type = new AtsDumpTypeRef { TypeId = "string", Category = "Primitive" },
            });
        var capability = AtsTransformer.Transform(dump, "Contoso")
            .Items.Single()
            .Projections["java"];

        Assert.Equal("return_", capability.Identifier);
        Assert.Contains("String class_", capability.Signature);

        var enumProjection = AtsTransformer.Transform(
            AtsJsonGeneratorTests.LoadFixture(),
            "Contoso.Hosting.Widgets")
            .Items.Single(item => item.Id == "enum:Contoso.WidgetMode")
            .Projections["java"];
        Assert.Contains(enumProjection.Members, member =>
            member.Name == "SAFE_MODE" && Equals(member.Value, "SafeMode"));

        var collidedOptions = AtsTransformer.Transform(
            AtsJsonGeneratorTests.LoadFixture(),
            "Contoso.Hosting.Widgets")
            .Items.Single(item => item.Id == "capability:Contoso.Hosting.Widgets/configureText")
            .Projections["java"];
        Assert.Contains("Configure1Options", collidedOptions.Declaration);
        Assert.DoesNotContain("ConfigureOptions1", collidedOptions.Declaration);
    }

    [Fact]
    public void Rust_UsesPositionalOptionsAndValueForUnionAndUnknown()
    {
        var fixture = AtsTransformer.Transform(
            AtsJsonGeneratorTests.LoadFixture(),
            "Contoso.Hosting.Widgets");
        var options = fixture.Items.Single(item =>
            item.Id == "capability:Contoso.Hosting.Widgets/configureCount")
            .Projections["rust"];
        Assert.Contains("count: Option<f64>, mode: Option<WidgetMode>", options.Signature);
        Assert.DoesNotContain("Options", options.Signature);

        var union = fixture.Items.Single(item =>
            item.Id == "capability:Contoso.Hosting.Widgets/chooseTarget")
            .Projections["rust"];
        Assert.Contains("target: Value", union.Signature);

        var unknownDump = CreateSingleCapabilityDump(
            "UseUnknown",
            new AtsDumpParameter
            {
                Name = "input",
                Type = new AtsDumpTypeRef { TypeId = "Contoso.External", Category = "Unknown" },
            });
        var unknown = AtsTransformer.Transform(unknownDump, "Contoso")
            .Items.Single()
            .Projections["rust"];
        Assert.Contains("input: Value", unknown.Signature);

        var enumProjection = fixture.Items.Single(item => item.Id == "enum:Contoso.WidgetMode")
            .Projections["rust"];
        Assert.Contains("PartialEq, Eq", enumProjection.Declaration);
    }

    [Fact]
    public void Rust_DocumentsAddExecutableRuntimeArgumentLimitation()
    {
        var dump = CreateSingleCapabilityDump(
            "addExecutable",
            new AtsDumpParameter
            {
                Name = "args",
                Type = new AtsDumpTypeRef
                {
                    TypeId = "array",
                    Category = "Array",
                    ElementType = new AtsDumpTypeRef { TypeId = "string", Category = "Primitive" },
                },
            },
            "Aspire.Hosting/addExecutable");

        var projection = AtsTransformer.Transform(dump, "Aspire.Hosting")
            .Items.Single()
            .Projections["rust"];

        Assert.Contains("ATS server cannot deserialize the String[] argument contract", projection.Reason);
    }

    private static AtsDumpRoot CreateSingleCapabilityDump(
        string methodName,
        AtsDumpParameter parameter,
        string? capabilityId = null,
        AtsDumpParameter? additionalParameter = null)
        => new()
        {
            Capabilities =
            [
                new AtsDumpCapability
                {
                    CapabilityId = capabilityId ?? $"Contoso/{methodName}",
                    MethodName = methodName,
                    QualifiedMethodName = $"Contoso.Extensions.{methodName}",
                    CapabilityKind = "Method",
                    Parameters = additionalParameter is null ? [parameter] : [parameter, additionalParameter],
                    ReturnType = new AtsDumpTypeRef { TypeId = "void", Category = "Primitive" },
                },
            ],
        };
}
