using System.Text.Json;
using AtsJsonGenerator.Helpers;
using static AtsJsonGenerator.Tests.GoTestDumps;

namespace AtsJsonGenerator.Tests;

public sealed class GoTransformerTests
{
    private const string GadgetOptionsTypeId = "Contoso.Widgets/Contoso.Widgets.GadgetOptions";
    private const string WidgetOptionsTypeId = "Contoso.Widgets/Contoso.Widgets.WidgetOptions";
    private const string InnerOptionsTypeId = "Contoso.Widgets/Contoso.Widgets.InnerOptions";
    private const string FactoryContextTypeId = "Contoso.Widgets/Contoso.Widgets.FactoryContext";
    private const string ParameterResourceTypeId = "Contoso.Widgets/Contoso.Widgets.ParameterResource";
    private const string LifetimeFullName = "Aspire.Hosting.ApplicationModel.ContainerLifetime";
    private const string CommandOptionsFullName = "Aspire.Hosting.ApplicationModel.CommandOptions";
    private const string CommandOptionsTypeId = "Aspire.Hosting/" + CommandOptionsFullName;

    [Fact]
    public void Transform_ReadsPackageMetadataFromTheDump()
    {
        var model = GoTransformer.Transform(CreateDump(), PackageName);

        Assert.Equal(PackageName, model.Package.Name);
        Assert.Equal("2.4.0", model.Package.Version);
        Assert.Equal("go", model.Package.Language);
        Assert.Equal("apphost/modules/aspire", model.Package.ImportPath);
    }

    [Fact]
    public void Transform_PrefersAnExplicitVersionAndRecordsTheSource()
    {
        var model = GoTransformer.Transform(
            CreateDump(),
            PackageName,
            version: "3.0.0",
            sourceRepository: "https://github.com/microsoft/aspire",
            sourceCommit: "abc123");

        Assert.Equal("3.0.0", model.Package.Version);
        Assert.Equal("https://github.com/microsoft/aspire", model.Package.SourceRepository);
        Assert.Equal("abc123", model.Package.SourceCommit);
    }

    [Fact]
    public void Transform_ThrowsOnErrorDiagnostics()
    {
        var dump = CreateDump();
        dump.Diagnostics.Add(new AtsDumpDiagnostic { Severity = "Error", Message = "scanner exploded" });

        var exception = Assert.Throws<InvalidOperationException>(() => GoTransformer.Transform(dump, PackageName));

        Assert.Contains("scanner exploded", exception.Message);
    }

    [Fact]
    public void Transform_ToleratesKnownScannerDiagnosticsOnlyWhenRequested()
    {
        var dump = new AtsDumpRoot
        {
            Packages = [new AtsDumpPackageRef { Name = PackageName, Version = "2.4.0" }],
            HandleTypes = AtsTransformerHelperTests.KnownProxyHandleTypes,
            Diagnostics = [new AtsDumpDiagnostic { Severity = "Error", Message = AtsTransformerHelperTests.KustoInheritedDuplicate }],
        };

        Assert.Throws<InvalidOperationException>(() => GoTransformer.Transform(dump, PackageName));

        var model = GoTransformer.Transform(dump, PackageName, tolerateKnownScannerDiagnostics: true);

        Assert.Equal(PackageName, model.Package.Name);
    }

    [Fact]
    public void Transform_RendersCreateBuilderWithTheOptionsDto()
    {
        var model = GoTransformer.Transform(CreateEntryPointDump(includeCreateBuilderOptions: true), PackageName);

        var function = GetFunction(model, "Aspire.Hosting/createBuilder");
        Assert.Equal("CreateBuilder(options ...*CreateBuilderOptions) (DistributedApplicationBuilder, error)", function.Signature);
        Assert.Equal("returned", function.ErrorModel);
        Assert.Null(function.Receiver);
        Assert.Empty(function.AppliesTo);
        Assert.Equal("CreateBuilder establishes a connection to the AppHost and returns a new builder.", function.Description);

        var options = GetOptions(function);
        Assert.Equal("CreateBuilderOptions", options.TypeName);
        Assert.True(options.IsDirect);
        Assert.Empty(options.Fields);
    }

    [Fact]
    public void Transform_RendersCreateBuilderWithoutOptionsWhenTheDumpHasNoOptionsDto()
    {
        var model = GoTransformer.Transform(CreateEntryPointDump(includeCreateBuilderOptions: false), PackageName);

        var function = GetFunction(model, "Aspire.Hosting/createBuilder");
        Assert.Equal("CreateBuilder() (DistributedApplicationBuilder, error)", function.Signature);
        Assert.Null(function.Options);
    }

    [Fact]
    public void Transform_RendersBuildOnTheBuilder()
    {
        var model = GoTransformer.Transform(CreateEntryPointDump(includeCreateBuilderOptions: false), PackageName);

        var function = GetFunction(model, "Aspire.Hosting/build");
        Assert.Equal("Build() (DistributedApplication, error)", function.Signature);
        Assert.Equal("returned", function.ErrorModel);
        Assert.Equal("DistributedApplicationBuilder", function.Receiver);
        Assert.Equal(["DistributedApplicationBuilder"], function.AppliesTo);

        var builder = GetHandle(model, "DistributedApplicationBuilder");
        Assert.True(builder.IsInterface);
        Assert.False(builder.IsMarker);
        Assert.Equal(["Aspire.Hosting/build"], builder.Capabilities.Select(capability => capability.CapabilityId));
    }

    [Theory]
    [InlineData("Contoso.Widgets/addWidget", "AddWidget(name string) WidgetResource", "deferred")]
    [InlineData("Contoso.Widgets/withLabel", "WithLabel(label string, options ...*WithLabelOptions) WidgetResource", "deferred")]
    [InlineData("Contoso.Widgets/getCount", "GetCount() (float64, error)", "returned")]
    [InlineData("Contoso.Widgets/reset", "Reset() error", "returned")]
    [InlineData("Contoso.Widgets/touch", "Touch() error", "returned")]
    [InlineData("Contoso.Widgets/withKind", "WithKind(type_ string, range_ string) WidgetResource", "deferred")]
    [InlineData("Contoso.Widgets/addGadget", "AddGadget(name string, options ...*GadgetOptions) GadgetResource", "deferred")]
    [InlineData("Contoso.Widgets/withFactory", "WithFactory(path string, factory func(arg FactoryContext) string) WidgetResource", "deferred")]
    [InlineData("Contoso.Widgets/withEndpoint", "WithEndpoint(endpoint any) WidgetResource", "deferred")]
    [InlineData("Contoso.Widgets/WidgetResource.tags", "Tags() *List[string]", "none")]
    [InlineData("Contoso.Widgets/WidgetResource.labels", "Labels() ([]string, error)", "returned")]
    [InlineData("Contoso.Widgets/WidgetResource.env", "Env() *Dict[string, string]", "none")]
    [InlineData("Contoso.Widgets/run", "Run(options ...*RunOptions) error", "returned")]
    [InlineData("Contoso.Widgets/withMode", "WithMode(mode WidgetMode, options ...*WithModeOptions) WidgetResource", "deferred")]
    public void Transform_RendersGoSignatures(string capabilityId, string signature, string errorModel)
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        var function = GetFunction(model, capabilityId);
        Assert.Equal(signature, function.Signature);
        Assert.Equal(errorModel, function.ErrorModel);
    }

    [Fact]
    public void Transform_RecordsTheReceiverAndTheTypesAFunctionAppliesTo()
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        var addWidget = GetFunction(model, "Contoso.Widgets/addWidget");
        Assert.Equal("DistributedApplicationBuilder", addWidget.Receiver);
        Assert.Equal(["DistributedApplicationBuilder"], addWidget.AppliesTo);
        Assert.True(addWidget.ReturnsBuilder);
        Assert.False(addWidget.ReturnsReceiver);

        var withLabel = GetFunction(model, "Contoso.Widgets/withLabel");
        Assert.Equal("WidgetResource", withLabel.Receiver);
        Assert.Equal(["WidgetResource"], withLabel.AppliesTo);
        Assert.True(withLabel.ReturnsReceiver);
    }

    [Fact]
    public void Transform_GroupsCapabilitiesUnderTheirTargetHandle()
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        Assert.Equal(
            ["Contoso.Widgets/addGadget", "Contoso.Widgets/addWidget"],
            GetHandle(model, "DistributedApplicationBuilder").Capabilities.Select(capability => capability.CapabilityId).Order(StringComparer.Ordinal));
        Assert.Equal(
            ["Contoso.Widgets/run"],
            GetHandle(model, "DistributedApplication").Capabilities.Select(capability => capability.CapabilityId));
    }

    [Fact]
    public void Transform_CarriesDocumentationOntoFunctionsAndParameters()
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        var documented = GetFunction(model, "Contoso.Widgets/withLabel");
        Assert.Equal("Adds a label to the widget.", documented.Description);
        Assert.Equal("Labels are case sensitive.", documented.Remarks);
        Assert.Equal("The widget builder.", documented.Returns);
        Assert.Equal("The label text.", Assert.Single(documented.Parameters).Description);

        var legacy = GetFunction(model, "Contoso.Widgets/getCount");
        Assert.Equal("Gets the number of widgets.", legacy.Description);
        Assert.Null(legacy.Remarks);
    }

    [Theory]
    [InlineData("Contoso.Widgets/withLabel", "WithLabelOptions", "Tag", "tag", "*string")]
    [InlineData("Contoso.Widgets/withMode", "WithModeOptions", "Fallback", "fallback", "*WidgetMode")]
    [InlineData("Contoso.Widgets/run", "RunOptions", "CancellationToken", null, "*CancellationToken")]
    public void Transform_CollectsOptionalParametersIntoAnOptionsStruct(
        string capabilityId,
        string typeName,
        string fieldName,
        string? jsonName,
        string fieldType)
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        var options = GetOptions(GetFunction(model, capabilityId));
        Assert.Equal(typeName, options.TypeName);
        Assert.False(options.IsDirect);

        var field = Assert.Single(options.Fields);
        Assert.Equal(fieldName, field.Name);
        Assert.Equal(jsonName, field.JsonName);
        Assert.Equal(fieldType, field.Type);
    }

    [Fact]
    public void Transform_PassesAnOptionsDtoDirectlyAndOmitsOptionsWhenThereAreNoOptionalParameters()
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        var direct = GetOptions(GetFunction(model, "Contoso.Widgets/addGadget"));
        Assert.Equal("GadgetOptions", direct.TypeName);
        Assert.True(direct.IsDirect);
        Assert.Empty(direct.Fields);

        Assert.Null(GetFunction(model, "Contoso.Widgets/getCount").Options);
    }

    [Fact]
    public void Transform_ListsOnlyRequiredParametersAndEscapesGoKeywords()
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        var withLabel = GetFunction(model, "Contoso.Widgets/withLabel");
        Assert.Equal(["label"], withLabel.Parameters.Select(parameter => parameter.Name));

        var withKind = GetFunction(model, "Contoso.Widgets/withKind");
        Assert.Equal(["type_", "range_"], withKind.Parameters.Select(parameter => parameter.Name));
    }

    [Fact]
    public void Transform_DescribesCallbackAndUnionParameters()
    {
        var model = GoTransformer.Transform(CreateShapesDump(), PackageName);

        var factory = Assert.Single(GetFunction(model, "Contoso.Widgets/withFactory").Parameters, parameter => parameter.Name == "factory");
        Assert.True(factory.IsCallback);
        Assert.Equal("func(arg FactoryContext) string", factory.Type);
        Assert.Equal("func(arg FactoryContext) string", factory.CallbackSignature);
        Assert.Null(factory.AllowedTypes);

        var endpoint = Assert.Single(GetFunction(model, "Contoso.Widgets/withEndpoint").Parameters);
        Assert.False(endpoint.IsCallback);
        Assert.Equal("any", endpoint.Type);
        Assert.Equal(["string", "ParameterResource"], endpoint.AllowedTypes);
    }

    [Fact]
    public void Transform_ExpandsInterfaceTargetsOntoTheConcreteTypesThatImplementThem()
    {
        var resource = HandleRef(ResourceTypeId, isInterface: true);
        var dump = CreateDump();
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = ResourceTypeId, IsInterface = true });
        dump.Capabilities.Add(Method(
            "Contoso.Widgets/withDescription",
            "withDescription",
            resource,
            resource,
            [Param("description", Primitive("string"))],
            expandedTargets: [WidgetRef(), GadgetRef()],
            returnsBuilder: true));

        var model = GoTransformer.Transform(dump, PackageName);

        var function = GetFunction(model, "Contoso.Widgets/withDescription");
        Assert.Equal("WithDescription(description string) Resource", function.Signature);
        Assert.Equal("Resource", function.Receiver);
        Assert.Equal("Resource", function.ReturnType);
        Assert.True(function.ReturnsReceiver);
        Assert.Equal(["GadgetResource", "WidgetResource"], function.AppliesTo);
        Assert.Equal(
            ["Contoso.Widgets/withDescription"],
            GetHandle(model, "Resource").Capabilities.Select(capability => capability.CapabilityId));
    }

    [Fact]
    public void Transform_QualifiesHandleNamesThatCollideAcrossAssemblies()
    {
        var dump = new AtsDumpRoot
        {
            Packages = [new AtsDumpPackageRef { Name = PackageName, Version = "2.4.0" }],
            HandleTypes =
            [
                new AtsDumpHandleType { AtsTypeId = "Contoso.A/Contoso.Widget" },
                new AtsDumpHandleType { AtsTypeId = "Contoso.B/Contoso.Widget" },
            ],
        };

        var model = GoTransformer.Transform(dump, PackageName);

        Assert.Equal(["Contoso_BWidget", "Widget"], model.HandleTypes.Select(handle => handle.Name).Order(StringComparer.Ordinal));
        Assert.All(model.HandleTypes, handle => Assert.Equal("Contoso.Widget", handle.FullName));
    }

    [Fact]
    public void Transform_NumbersHandleNamesThatStillCollideAfterQualification()
    {
        var dump = new AtsDumpRoot
        {
            Packages = [new AtsDumpPackageRef { Name = PackageName, Version = "2.4.0" }],
            HandleTypes =
            [
                new AtsDumpHandleType { AtsTypeId = "Contoso.A/Contoso.Widget" },
                new AtsDumpHandleType { AtsTypeId = "Contoso.B/Contoso.X.Widget" },
                new AtsDumpHandleType { AtsTypeId = "Contoso.B/Contoso.Y.Widget" },
            ],
        };

        var model = GoTransformer.Transform(dump, PackageName);

        Assert.Equal(
            ["Contoso_BWidget", "Widget", "Widget2"],
            model.HandleTypes.Select(handle => handle.Name).Order(StringComparer.Ordinal));
    }

    [Fact]
    public void Transform_StripsTheInterfacePrefixOnlyFromInterfacesTheDumpDoesNotOwn()
    {
        var dump = CreateDump();
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = ResourceTypeId, IsInterface = true });
        dump.Capabilities.Add(Method(
            "Contoso.Widgets/useLogger",
            "useLogger",
            WidgetRef(),
            WidgetRef(),
            [
                Param("logger", HandleRef("Microsoft.Extensions.Logging/Microsoft.Extensions.Logging.ILogger", isInterface: true)),
                Param("compute", HandleRef("Contoso.Widgets/Contoso.Widgets.IComputeResource", isInterface: true)),
            ],
            returnsBuilder: true));

        var model = GoTransformer.Transform(dump, PackageName);

        Assert.Equal(
            "UseLogger(logger Logger, compute IComputeResource) WidgetResource",
            GetFunction(model, "Contoso.Widgets/useLogger").Signature);

        var logger = GetHandle(model, "Logger");
        Assert.True(logger.IsInterface);
        Assert.True(logger.IsMarker);

        var compute = GetHandle(model, "IComputeResource");
        Assert.False(compute.IsInterface);
        Assert.False(compute.IsMarker);

        var resource = GetHandle(model, "Resource");
        Assert.True(resource.IsInterface);
        Assert.True(resource.IsMarker);
    }

    [Fact]
    public void Transform_DescribesHandlesAndListsOnlyTheInterfacesTheGoSdkExposes()
    {
        var dump = new AtsDumpRoot
        {
            Packages = [new AtsDumpPackageRef { Name = PackageName, Version = "2.4.0" }],
            HandleTypes =
            [
                new AtsDumpHandleType { AtsTypeId = ResourceTypeId, IsInterface = true },
                new AtsDumpHandleType
                {
                    AtsTypeId = WidgetTypeId,
                    Documentation = new AtsDumpDocumentation { Summary = "A widget.", Remarks = "Widgets spin." },
                    ImplementedInterfaces =
                    [
                        HandleRef(ResourceTypeId, isInterface: true),
                        HandleRef("System.Private.CoreLib/System.IDisposable", isInterface: true),
                    ],
                    BaseTypeHierarchy = [HandleRef("Contoso.Widgets/Contoso.Widgets.WidgetBase")],
                },
            ],
        };

        var model = GoTransformer.Transform(dump, PackageName);

        var widget = GetHandle(model, "WidgetResource");
        Assert.Equal("Contoso.Widgets.WidgetResource", widget.FullName);
        Assert.Equal("A widget.", widget.Description);
        Assert.Equal("Widgets spin.", widget.Remarks);
        Assert.Equal(["Resource"], widget.ImplementedInterfaces);
        Assert.False(JsonSerializer.SerializeToElement(widget).TryGetProperty("baseTypeHierarchy", out _));
    }

    [Fact]
    public void Transform_AddsTheSynthesizedMembersToInteractionInputCollection()
    {
        var dump = CreateDump();
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = InteractionInputCollectionTypeId });

        var model = GoTransformer.Transform(dump, PackageName);

        var members = GetHandle(model, "InteractionInputCollection").SynthesizedMembers;
        Assert.Equal(["Get", "Required", "Value", "RequiredValue"], members.Select(member => member.Name));
        Assert.Equal(
            [
                "Get(name string) (*InteractionInput, error)",
                "Required(name string) (*InteractionInput, error)",
                "Value(name string) (string, error)",
                "RequiredValue(name string) (string, error)",
            ],
            members.Select(member => member.Signature));
        Assert.All(members, member => Assert.False(string.IsNullOrWhiteSpace(member.Description)));
    }

    [Fact]
    public void Transform_SharesAnOptionsStructOnlyWhenTheOptionalFieldsMatch()
    {
        var dump = CreateDump();
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = ThingTypeId });
        dump.DtoTypes.Add(new AtsDumpDtoType { TypeId = "Contoso.Widgets/Contoso.Widgets.WithThingOptions", Name = "WithThingOptions" });
        dump.Capabilities.AddRange(
        [
            Method(
                "Contoso.Widgets/widgetWithTag",
                "withTag",
                WidgetRef(),
                WidgetRef(),
                [Param("tag", Primitive("string"), isOptional: true)],
                returnsBuilder: true),
            Method(
                "Contoso.Widgets/gadgetWithTag",
                "withTag",
                GadgetRef(),
                GadgetRef(),
                [Param("tag", Primitive("string"), isOptional: true)],
                returnsBuilder: true),
            Method(
                "Contoso.Widgets/thingWithTag",
                "withTag",
                ThingRef(),
                ThingRef(),
                [Param("count", Primitive("number"), isOptional: true)],
                returnsBuilder: true),
            Method(
                "Contoso.Widgets/widgetWithThing",
                "withThing",
                WidgetRef(),
                WidgetRef(),
                [Param("name", Primitive("string"), isOptional: true)],
                returnsBuilder: true),
        ]);

        var model = GoTransformer.Transform(dump, PackageName);

        Assert.Equal("WithTagOptions", GetOptions(GetFunction(model, "Contoso.Widgets/widgetWithTag")).TypeName);
        Assert.Equal("WithTagOptions", GetOptions(GetFunction(model, "Contoso.Widgets/gadgetWithTag")).TypeName);
        Assert.Equal("ThingResourceWithTagOptions", GetOptions(GetFunction(model, "Contoso.Widgets/thingWithTag")).TypeName);
        Assert.Equal("WidgetResourceWithThingOptions", GetOptions(GetFunction(model, "Contoso.Widgets/widgetWithThing")).TypeName);
    }

    [Theory]
    [InlineData("name", "Name", "string", false, false)]
    [InlineData("retries", "Retries", "*float64", true, false)]
    [InlineData("labels", "Labels", "[]string", false, false)]
    [InlineData("env", "Env", "map[string]string", false, false)]
    [InlineData("mode", "Mode", "*WidgetMode", true, false)]
    [InlineData("target", "Target", "any", false, false)]
    [InlineData("onReady", "OnReady", "func(...any) any", false, true)]
    [InlineData("inner", "Inner", "*InnerOptions", false, false)]
    [InlineData("expression", "Expression", "*ReferenceExpression", false, false)]
    public void Transform_MapsDtoFields(string jsonName, string name, string type, bool isOptional, bool isCallback)
    {
        var model = GoTransformer.Transform(CreateDtoDump(), PackageName);

        var dto = Assert.Single(model.DtoTypes, candidate => candidate.Name == "WidgetOptions");
        var field = Assert.Single(dto.Fields, candidate => candidate.JsonName == jsonName);
        Assert.Equal(name, field.Name);
        Assert.Equal(type, field.Type);
        Assert.Equal(isOptional, field.IsOptional);
        Assert.Equal(isCallback, field.IsCallback);
    }

    [Fact]
    public void Transform_DescribesDtosAndOmitsTheReferenceExpressionDto()
    {
        var model = GoTransformer.Transform(CreateDtoDump(), PackageName);

        Assert.Equal(["InnerOptions", "WidgetOptions"], model.DtoTypes.Select(dto => dto.Name).Order(StringComparer.Ordinal));

        var widgetOptions = Assert.Single(model.DtoTypes, dto => dto.Name == "WidgetOptions");
        Assert.Equal("Contoso.Widgets.WidgetOptions", widgetOptions.FullName);
        Assert.Equal("Options for a widget.", widgetOptions.Description);
    }

    [Fact]
    public void Transform_PrefixesEnumMembersWithTheEnumName()
    {
        var dump = CreateDump();
        dump.EnumTypes.Add(new AtsDumpEnumType
        {
            TypeId = $"enum:{ModeFullName}",
            Name = "WidgetMode",
            Documentation = new AtsDumpDocumentation { Summary = "How fast the widget spins." },
            Values = ["Fast", "Slow"],
            ValueInfos =
            [
                new AtsDumpEnumValueInfo
                {
                    Name = "Fast",
                    Documentation = new AtsDumpDocumentation { Summary = "Spins quickly." },
                },
            ],
        });

        var model = GoTransformer.Transform(dump, PackageName);

        var enumType = Assert.Single(model.EnumTypes);
        Assert.Equal("WidgetMode", enumType.Name);
        Assert.Equal(ModeFullName, enumType.FullName);
        Assert.Equal("How fast the widget spins.", enumType.Description);
        Assert.Equal(["WidgetModeFast", "WidgetModeSlow"], enumType.Members.Select(member => member.Name));
        Assert.Equal(["Fast", "Slow"], enumType.Members.Select(member => member.Value));
        Assert.Equal("Spins quickly.", Assert.Single(enumType.Members, member => member.Name == "WidgetModeFast").Description);
        Assert.Null(Assert.Single(enumType.Members, member => member.Name == "WidgetModeSlow").Description);
    }

    [Fact]
    public void Transform_RendersExportedValuesAsGoLiterals()
    {
        var model = GoTransformer.Transform(CreateExportedValuesDump(), PackageName);

        Assert.Equal(["Defaults", "Version"], model.ExportedValues.Select(group => group.Name));

        var defaults = Assert.Single(model.ExportedValues, group => group.Name == "Defaults");
        Assert.Equal("Defaults", defaults.FullName);
        Assert.Equal(
            [
                ("Absent", "string", "nil"),
                ("Enabled", "bool", "true"),
                ("Missing", "string", "nil"),
                ("Mode", "WidgetMode", "WidgetMode(\"fast\")"),
                ("Name", "string", "\"widget\""),
                ("Retries", "float64", "3"),
            ],
            defaults.Values.Select(value => (value.Path, value.Type, value.Value)));

        var version = Assert.Single(model.ExportedValues, group => group.Name == "Version");
        var current = Assert.Single(version.Values);
        Assert.Equal(string.Empty, current.Path);
        Assert.Equal("\"1.0+build<5>\"", current.Value);
    }

    [Theory]
    [InlineData("\r\n")]
    [InlineData("\n")]
    public void Transform_RendersCompositeExportedValuesAsSingleLineJson(string newLine)
    {
        var dump = CreateDump();
        AddWidgetOptionsDtos(dump);

        // The dump is indented, so the raw text of a composite value spans several lines.
        var indented = string.Join(newLine, "{", "  \"Name\": \"fast+<1>\",", "  \"Tags\": [", "    1,", "    2", "  ]", "}");
        using var document = JsonDocument.Parse(indented);
        dump.ExportedValues.Add(new AtsDumpExportedValue
        {
            PathSegments = ["Presets", "Fast"],
            Type = DtoRef(WidgetOptionsTypeId),
            Value = document.RootElement.Clone(),
        });

        var model = GoTransformer.Transform(dump, PackageName);

        var presets = Assert.Single(model.ExportedValues);
        var fast = Assert.Single(presets.Values);
        Assert.Equal("{\"Name\":\"fast+<1>\",\"Tags\":[1,2]}", fast.Value);
    }

    [Fact]
    public void Transform_ReportsCapabilitiesWithoutAConcreteTypeAsSkipped()
    {
        var resource = HandleRef(ResourceTypeId, isInterface: true);
        var dump = CreateDump();
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = ResourceTypeId, IsInterface = true });
        dump.Capabilities.Add(Method("Contoso.Widgets/zeta", "zeta", resource, Primitive("string"), expandedTargets: []));
        dump.Capabilities.Add(Method("Contoso.Widgets/alpha", "alpha", resource, Primitive("string"), expandedTargets: []));

        var model = GoTransformer.Transform(dump, PackageName);

        Assert.Empty(model.Functions);
        Assert.Equal(["Contoso.Widgets/alpha", "Contoso.Widgets/zeta"], model.SkippedCapabilityIds);
    }

    [Fact]
    public void Transform_IgnoresRuntimeProvidedCapabilitiesWithoutReportingThemAsSkipped()
    {
        var dump = CreateDump();
        dump.Capabilities.AddRange(
        [
            Method("Aspire.Hosting/List.add", "add", ListOf(Primitive("string")), null, expandedTargets: []),
            Method("Aspire.Hosting/Dict.set", "set", DictOf(Primitive("string"), Primitive("string")), null, expandedTargets: []),
            Method("Aspire.Hosting/ReferenceExpression.format", "format", HandleRef(ReferenceExpressionTypeId), Primitive("string"), expandedTargets: []),
        ]);

        var model = GoTransformer.Transform(dump, PackageName);

        Assert.Empty(model.Functions);
        Assert.Empty(model.SkippedCapabilityIds);
    }

    [Fact]
    public void Transform_IsIndependentOfTheOrderOfTheDump()
    {
        var dump = CreateRichDump();
        var reversed = new AtsDumpRoot
        {
            Packages = dump.Packages,
            Capabilities = [.. dump.Capabilities.AsEnumerable().Reverse()],
            HandleTypes = [.. dump.HandleTypes.AsEnumerable().Reverse()],
            DtoTypes = [.. dump.DtoTypes.AsEnumerable().Reverse()],
            EnumTypes = [.. dump.EnumTypes.AsEnumerable().Reverse()],
            ExportedValues = [.. dump.ExportedValues.AsEnumerable().Reverse()],
        };

        var expected = JsonSerializer.Serialize(GoTransformer.Transform(dump, PackageName));
        var actual = JsonSerializer.Serialize(GoTransformer.Transform(reversed, PackageName));

        Assert.Equal(expected, actual);
    }

    [Fact]
    public void GoKnownTypes_NoneKnowsNothing()
    {
        var known = GoKnownTypes.None;

        Assert.Empty(known.Handles);
        Assert.Empty(known.DtoNames);
        Assert.Empty(known.EnumNames);
        Assert.False(known.TryGetHandle("Aspire.Hosting/Aspire.Hosting.ApplicationModel.ContainerResource", out _));
        Assert.Null(known.GetDtoName(CommandOptionsTypeId));
        Assert.Null(known.GetEnumName(LifetimeFullName));
    }

    [Fact]
    public void GoKnownTypes_KeepsTheFirstDeclarationOfAType()
    {
        var other = new GoPackageModel
        {
            Package = new GoPackageInfo { Name = "Contoso.Other" },
            DtoTypes = [new GoDtoTypeModel { Name = "Renamed", FullName = CommandOptionsFullName }],
        };

        var known = new GoKnownTypes([CreateCoreModel(), other]);

        Assert.Equal("CommandOptions", known.GetDtoName(CommandOptionsTypeId));
    }

    [Theory]
    [InlineData("Aspire.Hosting.ApplicationModel.ContainerLifetime")]
    [InlineData("enum:Aspire.Hosting.ApplicationModel.ContainerLifetime")]
    public void GoKnownTypes_FindsAnEnumByItsFullNameOrItsEnumTypeId(string typeId)
    {
        var known = new GoKnownTypes([CreateCoreModel()]);

        Assert.Equal("ContainerLifetime", known.GetEnumName(typeId));
    }

    [Fact]
    public void GoKnownTypes_FindsHandlesAndDtosByAssemblyQualifiedTypeId()
    {
        var known = new GoKnownTypes([CreateCoreModel()]);

        Assert.True(known.TryGetHandle("Aspire.Hosting/Aspire.Hosting.ApplicationModel.IResource", out var marker));
        Assert.Equal(new GoKnownHandle("Resource", IsInterface: true, HasImplementation: false), marker);

        Assert.True(known.TryGetHandle("Aspire.Hosting/Aspire.Hosting.ApplicationModel.ContainerResource", out var concrete));
        Assert.Equal(new GoKnownHandle("ContainerResource", IsInterface: false, HasImplementation: true), concrete);

        Assert.Equal("CommandOptions", known.GetDtoName(CommandOptionsTypeId));
    }

    [Fact]
    public void Transform_UsesTheBaseNameForAReferencedEnumTheDumpDoesNotDeclare()
    {
        var dump = CreateDump();
        dump.Capabilities.Add(Method(
            "Contoso.Widgets/withLifetime",
            "withLifetime",
            WidgetRef(),
            WidgetRef(),
            [Param("lifetime", EnumRef(LifetimeFullName))],
            returnsBuilder: true));

        var model = GoTransformer.Transform(dump, PackageName, knownTypes: new GoKnownTypes([CreateCoreModel()]));

        Assert.Equal(
            "WithLifetime(lifetime ContainerLifetime) WidgetResource",
            GetFunction(model, "Contoso.Widgets/withLifetime").Signature);
        Assert.Empty(model.EnumTypes);
    }

    [Fact]
    public void Transform_KeepsTheBaseNamesOfTypesTheDumpRedeclares()
    {
        var dump = CreateDump();
        dump.EnumTypes.Add(new AtsDumpEnumType
        {
            TypeId = $"enum:{LifetimeFullName}",
            Name = "ContainerLifetime",
            Values = ["Session", "Persistent"],
        });
        dump.DtoTypes.Add(new AtsDumpDtoType { TypeId = CommandOptionsTypeId, Name = "CommandOptions" });
        dump.Capabilities.Add(Method(
            "Contoso.Widgets/withLifetime",
            "withLifetime",
            WidgetRef(),
            WidgetRef(),
            [
                Param("lifetime", EnumRef(LifetimeFullName)),
                Param("options", DtoRef(CommandOptionsTypeId), isOptional: true),
            ],
            returnsBuilder: true));

        var model = GoTransformer.Transform(dump, PackageName, knownTypes: new GoKnownTypes([CreateCoreModel()]));

        var enumType = Assert.Single(model.EnumTypes);
        Assert.Equal("ContainerLifetime", enumType.Name);
        Assert.Equal(["ContainerLifetimeSession", "ContainerLifetimePersistent"], enumType.Members.Select(member => member.Name));
        Assert.Equal("CommandOptions", Assert.Single(model.DtoTypes).Name);
        Assert.Equal(
            "WithLifetime(lifetime ContainerLifetime, options ...*CommandOptions) WidgetResource",
            GetFunction(model, "Contoso.Widgets/withLifetime").Signature);
    }

    [Fact]
    public void Transform_RenamesDumpTypesThatCollideWithBaseTypes()
    {
        var dump = CreateDump();
        dump.DtoTypes.Add(new AtsDumpDtoType { TypeId = "Contoso.Widgets/Contoso.Widgets.CommandOptions", Name = "CommandOptions" });
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = "Contoso.Widgets/Contoso.Widgets.ContainerResource" });

        var model = GoTransformer.Transform(dump, PackageName, knownTypes: new GoKnownTypes([CreateCoreModel()]));

        var dto = Assert.Single(model.DtoTypes);
        Assert.Equal("CommandOptions2", dto.Name);
        Assert.Equal("Contoso.Widgets.CommandOptions", dto.FullName);
        Assert.Contains(model.HandleTypes, handle => handle.Name == "Contoso_WidgetsContainerResource");
    }

    private static GoFunctionModel GetFunction(GoPackageModel model, string capabilityId) =>
        Assert.Single(model.Functions, function => function.CapabilityId == capabilityId);

    private static GoOptionsModel GetOptions(GoFunctionModel function)
    {
        Assert.NotNull(function.Options);
        return function.Options;
    }

    private static GoHandleTypeModel GetHandle(GoPackageModel model, string name) =>
        Assert.Single(model.HandleTypes, handle => handle.Name == name);

    private static AtsDumpRoot CreateEntryPointDump(bool includeCreateBuilderOptions)
    {
        var dump = CreateDump();
        dump.Capabilities.Add(CreateBuilderCapability());
        dump.Capabilities.Add(BuildCapability());

        if (includeCreateBuilderOptions)
        {
            dump.DtoTypes.Add(new AtsDumpDtoType { TypeId = CreateBuilderOptionsTypeId, Name = "CreateBuilderOptions" });
        }

        return dump;
    }

    private static AtsDumpRoot CreateShapesDump()
    {
        var dump = CreateDump();
        dump.EnumTypes.Add(ModeEnum());
        dump.DtoTypes.Add(new AtsDumpDtoType
        {
            TypeId = GadgetOptionsTypeId,
            Name = "GadgetOptions",
            Properties = [new AtsDumpDtoProperty { Name = "size", Type = Primitive("number", isNullable: true), IsOptional = true }],
        });

        var text = Primitive("string");

        dump.Capabilities.AddRange(
        [
            Method("Contoso.Widgets/addWidget", "addWidget", BuilderRef(), WidgetRef(), [Param("name", text)], returnsBuilder: true),
            Method(
                "Contoso.Widgets/withLabel",
                "withLabel",
                WidgetRef(),
                WidgetRef(),
                [Param("label", text), Param("tag", Primitive("string", isNullable: true), isOptional: true)],
                returnsBuilder: true,
                documentation: new AtsDumpDocumentation
                {
                    Summary = "Adds a label to the widget.",
                    Remarks = "Labels are case sensitive.",
                    Returns = "The widget builder.",
                    Parameters = [new AtsDumpParameterDoc { Name = "label", Description = "The label text." }],
                }),
            Method("Contoso.Widgets/getCount", "getCount", WidgetRef(), Primitive("number"), description: "Gets the number of widgets."),
            Method("Contoso.Widgets/reset", "reset", WidgetRef(), Primitive("void")),
            Method("Contoso.Widgets/touch", "touch", WidgetRef(), null),
            Method("Contoso.Widgets/withKind", "withKind", WidgetRef(), WidgetRef(), [Param("type", text), Param("range", text)], returnsBuilder: true),
            Method(
                "Contoso.Widgets/addGadget",
                "addGadget",
                BuilderRef(),
                GadgetRef(),
                [Param("name", text), Param("options", DtoRef(GadgetOptionsTypeId), isOptional: true)],
                returnsBuilder: true),
            Method(
                "Contoso.Widgets/withFactory",
                "withFactory",
                WidgetRef(),
                WidgetRef(),
                [Param("path", text), CallbackParam("factory", text, ("arg", HandleRef(FactoryContextTypeId)))],
                returnsBuilder: true),
            Method(
                "Contoso.Widgets/withEndpoint",
                "withEndpoint",
                WidgetRef(),
                WidgetRef(),
                [Param("endpoint", UnionOf(text, HandleRef(ParameterResourceTypeId)))],
                returnsBuilder: true),
            Method(
                "Contoso.Widgets/WidgetResource.tags",
                "tags",
                WidgetRef(),
                ListOf(text),
                capabilityKind: "PropertyGetter",
                targetParameterName: "context",
                qualifiedMethodName: "WidgetResource.tags"),
            Method(
                "Contoso.Widgets/WidgetResource.labels",
                "labels",
                WidgetRef(),
                ListOf(text, isReadOnly: true),
                capabilityKind: "PropertyGetter",
                targetParameterName: "context",
                qualifiedMethodName: "WidgetResource.labels"),
            Method(
                "Contoso.Widgets/WidgetResource.env",
                "env",
                WidgetRef(),
                DictOf(text, text),
                capabilityKind: "PropertyGetter",
                targetParameterName: "context",
                qualifiedMethodName: "WidgetResource.env"),
            Method(
                "Contoso.Widgets/run",
                "run",
                ApplicationRef(),
                Primitive("void"),
                [Param("cancellationToken", Primitive("cancellationToken"), isOptional: true)],
                capabilityKind: "InstanceMethod"),
            Method(
                "Contoso.Widgets/withMode",
                "withMode",
                WidgetRef(),
                WidgetRef(),
                [Param("mode", EnumRef(ModeFullName)), Param("fallback", EnumRef(ModeFullName), isOptional: true)],
                returnsBuilder: true),
        ]);

        return dump;
    }

    private static AtsDumpRoot CreateDtoDump()
    {
        var dump = CreateDump();
        dump.EnumTypes.Add(ModeEnum());
        AddWidgetOptionsDtos(dump);

        return dump;
    }

    private static AtsDumpRoot CreateExportedValuesDump()
    {
        var dump = CreateDump();
        dump.EnumTypes.Add(ModeEnum());
        AddExportedValues(dump);

        return dump;
    }

    private static AtsDumpRoot CreateRichDump()
    {
        var dump = CreateShapesDump();
        AddWidgetOptionsDtos(dump);
        AddExportedValues(dump);

        return dump;
    }

    private static void AddWidgetOptionsDtos(AtsDumpRoot dump)
    {
        dump.DtoTypes.Add(new AtsDumpDtoType { TypeId = InnerOptionsTypeId, Name = "InnerOptions" });
        dump.DtoTypes.Add(new AtsDumpDtoType { TypeId = ReferenceExpressionTypeId, Name = "ReferenceExpression" });
        dump.DtoTypes.Add(new AtsDumpDtoType
        {
            TypeId = WidgetOptionsTypeId,
            Name = "WidgetOptions",
            Description = "Options for a widget.",
            Properties =
            [
                new AtsDumpDtoProperty { Name = "name", Type = Primitive("string") },
                new AtsDumpDtoProperty { Name = "retries", Type = Primitive("number", isNullable: true), IsOptional = true },
                new AtsDumpDtoProperty { Name = "labels", Type = ListOf(Primitive("string")) },
                new AtsDumpDtoProperty { Name = "env", Type = DictOf(Primitive("string"), Primitive("string")) },
                new AtsDumpDtoProperty { Name = "mode", Type = EnumRef(ModeFullName), IsOptional = true },
                new AtsDumpDtoProperty { Name = "target", Type = UnionOf(Primitive("string"), HandleRef(ParameterResourceTypeId)) },
                new AtsDumpDtoProperty { Name = "onReady", Type = CallbackRef() },
                new AtsDumpDtoProperty { Name = "inner", Type = DtoRef(InnerOptionsTypeId) },
                new AtsDumpDtoProperty { Name = "expression", Type = DtoRef(ReferenceExpressionTypeId) },
            ],
        });
    }

    private static void AddExportedValues(AtsDumpRoot dump)
    {
        dump.ExportedValues.AddRange(
        [
            ExportedValue(["Defaults", "Retries"], Primitive("number"), 3),
            ExportedValue(["Defaults", "Name"], Primitive("string"), "widget"),
            ExportedValue(["Defaults", "Enabled"], Primitive("boolean"), true),
            ExportedValue(["Defaults", "Mode"], EnumRef(ModeFullName), "fast"),
            ExportedValue(["Defaults", "Missing"], Primitive("string"), null),
            new AtsDumpExportedValue
            {
                PathSegments = ["Defaults", "Absent"],
                Type = Primitive("string"),
                Value = JsonSerializer.SerializeToElement<string?>(null),
            },
            ExportedValue(["Version"], Primitive("string"), "1.0+build<5>"),
        ]);
    }

    private static GoPackageModel CreateCoreModel() => new()
    {
        Package = new GoPackageInfo { Name = "Aspire.Hosting" },
        HandleTypes =
        [
            new GoHandleTypeModel { Name = "ContainerResource", FullName = "Aspire.Hosting.ApplicationModel.ContainerResource" },
            new GoHandleTypeModel
            {
                Name = "Resource",
                FullName = "Aspire.Hosting.ApplicationModel.IResource",
                IsInterface = true,
                IsMarker = true,
            },
        ],
        DtoTypes = [new GoDtoTypeModel { Name = "CommandOptions", FullName = CommandOptionsFullName }],
        EnumTypes =
        [
            new GoEnumTypeModel
            {
                Name = "ContainerLifetime",
                FullName = LifetimeFullName,
                Members =
                [
                    new GoEnumMemberModel { Name = "ContainerLifetimeSession", Value = "Session" },
                    new GoEnumMemberModel { Name = "ContainerLifetimePersistent", Value = "Persistent" },
                ],
            },
        ],
    };
}
