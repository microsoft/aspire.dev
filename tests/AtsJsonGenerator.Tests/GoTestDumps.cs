using System.Text.Json;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

/// <summary>
/// Builds ATS dumps shaped like the output of <c>aspire sdk dump --format json</c>
/// for the Go docs-site tests.
/// </summary>
internal static class GoTestDumps
{
    public const string PackageName = "Contoso.Widgets";
    public const string BuilderTypeId = "Aspire.Hosting/Aspire.Hosting.IDistributedApplicationBuilder";
    public const string ApplicationTypeId = "Aspire.Hosting/Aspire.Hosting.DistributedApplication";
    public const string ReferenceExpressionTypeId = "Aspire.Hosting/Aspire.Hosting.ApplicationModel.ReferenceExpression";
    public const string CreateBuilderOptionsTypeId = "Aspire.Hosting/Aspire.Hosting.CreateBuilderOptions";
    public const string InteractionInputCollectionTypeId = "Aspire.Hosting/Aspire.Hosting.InteractionInputCollection";
    public const string WidgetTypeId = "Contoso.Widgets/Contoso.Widgets.WidgetResource";
    public const string GadgetTypeId = "Contoso.Widgets/Contoso.Widgets.GadgetResource";
    public const string ThingTypeId = "Contoso.Widgets/Contoso.Widgets.ThingResource";
    public const string ResourceTypeId = "Contoso.Widgets/Contoso.Widgets.IResource";
    public const string ModeFullName = "Contoso.Widgets.WidgetMode";

    // Types owned by the core package that integration dumps also contain.
    public const string CoreResourceTypeId = "Aspire.Hosting/Aspire.Hosting.CoreResource";
    public const string CoreOptionsTypeId = "Aspire.Hosting/Aspire.Hosting.CoreOptions";
    public const string CoreModeFullName = "Aspire.Hosting.CoreMode";
    public const string ToolTypeId = "Contoso.Tools/Contoso.Tools.ToolResource";
    public const string ToolOptionsTypeId = "Contoso.Tools/Contoso.Tools.ToolOptions";
    public const string ToolKindFullName = "Contoso.Tools.ToolKind";

    public static AtsDumpTypeRef Primitive(string typeId, bool isNullable = false) => new()
    {
        TypeId = typeId,
        Category = AtsTypeCategories.Primitive,
        IsNullable = isNullable,
    };

    public static AtsDumpTypeRef HandleRef(string typeId, bool isInterface = false) => new()
    {
        TypeId = typeId,
        Category = AtsTypeCategories.Handle,
        IsInterface = isInterface,
    };

    public static AtsDumpTypeRef BuilderRef() => HandleRef(BuilderTypeId, isInterface: true);

    public static AtsDumpTypeRef ApplicationRef() => HandleRef(ApplicationTypeId);

    public static AtsDumpTypeRef WidgetRef() => HandleRef(WidgetTypeId);

    public static AtsDumpTypeRef GadgetRef() => HandleRef(GadgetTypeId);

    public static AtsDumpTypeRef ThingRef() => HandleRef(ThingTypeId);

    public static AtsDumpTypeRef DtoRef(string typeId) => new()
    {
        TypeId = typeId,
        Category = AtsTypeCategories.Dto,
    };

    public static AtsDumpTypeRef EnumRef(string fullName) => new()
    {
        TypeId = $"enum:{fullName}",
        Category = AtsTypeCategories.Enum,
    };

    public static AtsDumpTypeRef CallbackRef() => new()
    {
        TypeId = "callback",
        Category = AtsTypeCategories.Callback,
    };

    public static AtsDumpTypeRef ListOf(AtsDumpTypeRef element, bool isReadOnly = false) => new()
    {
        TypeId = $"Aspire.Hosting/List<{element.TypeId}>",
        Category = AtsTypeCategories.List,
        ElementType = element,
        IsReadOnly = isReadOnly,
    };

    public static AtsDumpTypeRef DictOf(AtsDumpTypeRef key, AtsDumpTypeRef value, bool isReadOnly = false) => new()
    {
        TypeId = $"Aspire.Hosting/Dict<{key.TypeId},{value.TypeId}>",
        Category = AtsTypeCategories.Dict,
        KeyType = key,
        ValueType = value,
        IsReadOnly = isReadOnly,
    };

    public static AtsDumpTypeRef UnionOf(params AtsDumpTypeRef[] members) => new()
    {
        TypeId = string.Join('|', members.Select(member => member.TypeId)),
        Category = AtsTypeCategories.Union,
        UnionTypes = [.. members],
    };

    public static AtsDumpParameter Param(string name, AtsDumpTypeRef type, bool isOptional = false) => new()
    {
        Name = name,
        Type = type,
        IsOptional = isOptional,
    };

    public static AtsDumpParameter CallbackParam(
        string name,
        AtsDumpTypeRef? returnType,
        params (string Name, AtsDumpTypeRef Type)[] parameters) => new()
    {
        Name = name,
        Type = CallbackRef(),
        IsCallback = true,
        CallbackParameters = [.. parameters.Select(parameter => new AtsDumpCallbackParam { Name = parameter.Name, Type = parameter.Type })],
        CallbackReturnType = returnType,
    };

    /// <summary>
    /// Creates a capability whose first parameter is the target, as the dump does for every capability.
    /// Pass an empty <paramref name="expandedTargets"/> for a capability with no concrete targets.
    /// </summary>
    public static AtsDumpCapability Method(
        string capabilityId,
        string methodName,
        AtsDumpTypeRef target,
        AtsDumpTypeRef? returnType,
        IEnumerable<AtsDumpParameter>? parameters = null,
        IEnumerable<AtsDumpTypeRef>? expandedTargets = null,
        bool returnsBuilder = false,
        string capabilityKind = "Method",
        string targetParameterName = "builder",
        string? qualifiedMethodName = null,
        AtsDumpDocumentation? documentation = null,
        string? description = null)
    {
        IEnumerable<AtsDumpParameter> callerParameters = parameters ?? [];
        IEnumerable<AtsDumpTypeRef> targets = expandedTargets ?? [target];

        return new AtsDumpCapability
        {
            CapabilityId = capabilityId,
            MethodName = methodName,
            QualifiedMethodName = qualifiedMethodName ?? methodName,
            CapabilityKind = capabilityKind,
            TargetTypeId = target.TypeId,
            TargetParameterName = targetParameterName,
            TargetType = target,
            ReturnsBuilder = returnsBuilder,
            ReturnType = returnType,
            Documentation = documentation,
            Description = description,
            Parameters = [Param(targetParameterName, target), .. callerParameters],
            ExpandedTargetTypes = [.. targets],
        };
    }

    public static AtsDumpCapability CreateBuilderCapability() => new()
    {
        CapabilityId = "Aspire.Hosting/createBuilder",
        MethodName = "createBuilder",
        QualifiedMethodName = "createBuilder",
        CapabilityKind = "Method",
        TargetTypeId = "any",
        TargetParameterName = "argsOrOptions",
        TargetType = Primitive("any"),
        ReturnType = BuilderRef(),
        ExpandedTargetTypes = [],
    };

    public static AtsDumpCapability BuildCapability() => Method(
        "Aspire.Hosting/build",
        "build",
        BuilderRef(),
        ApplicationRef(),
        capabilityKind: "InstanceMethod");

    public static AtsDumpExportedValue ExportedValue(string[] pathSegments, AtsDumpTypeRef type, object? value) => new()
    {
        PathSegments = [.. pathSegments],
        Type = type,
        Value = value is null ? null : JsonSerializer.SerializeToElement(value),
    };

    public static AtsDumpEnumType ModeEnum() => new()
    {
        TypeId = $"enum:{ModeFullName}",
        Name = "WidgetMode",
        Values = ["Fast", "Slow"],
    };

    /// <summary>
    /// A dump with the builder, application and a few resource handles but no capabilities.
    /// </summary>
    public static AtsDumpRoot CreateDump() => new()
    {
        Packages = [new AtsDumpPackageRef { Name = PackageName, Version = "2.4.0" }],
        HandleTypes =
        [
            new AtsDumpHandleType { AtsTypeId = BuilderTypeId, IsInterface = true },
            new AtsDumpHandleType { AtsTypeId = ApplicationTypeId },
            new AtsDumpHandleType { AtsTypeId = WidgetTypeId },
            new AtsDumpHandleType { AtsTypeId = GadgetTypeId },
        ],
    };

    /// <summary>
    /// A dump for the core package, which owns the builder, an options type, an enum and exported values.
    /// </summary>
    public static AtsDumpRoot CreateCoreDump() => new()
    {
        Packages = [new AtsDumpPackageRef { Name = "Aspire.Hosting", Version = "13.0.0" }],
        HandleTypes =
        [
            new AtsDumpHandleType { AtsTypeId = BuilderTypeId, IsInterface = true },
            new AtsDumpHandleType { AtsTypeId = ApplicationTypeId },
            new AtsDumpHandleType { AtsTypeId = CoreResourceTypeId },
        ],
        DtoTypes =
        [
            new AtsDumpDtoType
            {
                TypeId = CoreOptionsTypeId,
                Name = "CoreOptions",
                Properties = [new AtsDumpDtoProperty { Name = "size", Type = Primitive("number", isNullable: true), IsOptional = true }],
            },
        ],
        EnumTypes =
        [
            new AtsDumpEnumType { TypeId = $"enum:{CoreModeFullName}", Name = "CoreMode", Values = ["Fast", "Slow"] },
        ],
        Capabilities =
        [
            Method(
                "Aspire.Hosting/addCore",
                "addCore",
                BuilderRef(),
                HandleRef(CoreResourceTypeId),
                [Param("name", Primitive("string"))],
                returnsBuilder: true),
        ],
        ExportedValues =
        [
            ExportedValue(["Defaults", "Retries"], Primitive("number"), 3),
            ExportedValue(["Version", "Current"], Primitive("string"), "1.0"),
        ],
    };

    /// <summary>
    /// A dump for an integration. Dumps list every type their capabilities reference, so it repeats the
    /// core package's types and adds its own.
    /// </summary>
    public static AtsDumpRoot CreateToolsDump()
    {
        var dump = CreateCoreDump();
        dump.Packages.Add(new AtsDumpPackageRef { Name = "Contoso.Tools", Version = "2.4.0" });
        dump.HandleTypes.Add(new AtsDumpHandleType { AtsTypeId = ToolTypeId });
        dump.DtoTypes.Add(new AtsDumpDtoType { TypeId = ToolOptionsTypeId, Name = "ToolOptions" });
        dump.EnumTypes.Add(new AtsDumpEnumType { TypeId = $"enum:{ToolKindFullName}", Name = "ToolKind", Values = ["Cli"] });
        dump.Capabilities.Add(Method(
            "Contoso.Tools/addTool",
            "addTool",
            BuilderRef(),
            HandleRef(ToolTypeId),
            [
                Param("name", Primitive("string")),
                Param("mode", EnumRef(CoreModeFullName)),
                Param("options", DtoRef(CoreOptionsTypeId), isOptional: true),
            ],
            returnsBuilder: true));
        dump.ExportedValues.Add(ExportedValue(["Defaults", "Timeout"], Primitive("number"), 30));
        dump.ExportedValues.Add(ExportedValue(["ToolDefaults", "Size"], Primitive("number"), 5));

        return dump;
    }
}
