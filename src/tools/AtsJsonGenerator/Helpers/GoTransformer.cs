using System.Text.Encodings.Web;
using System.Text.Json;
using static AtsJsonGenerator.Helpers.GoNaming;

namespace AtsJsonGenerator.Helpers;

/// <summary>
/// Transforms the raw <c>aspire sdk dump --format json</c> output into the Go API model for the docs site.
/// </summary>
/// <remarks>
/// The Go SDK generator in microsoft/aspire (<c>AtsGoCodeGenerator</c>) is the source of truth for the
/// surface that is documented here: every name, signature and error model is derived by
/// <see cref="GoSdkResolver"/> with the same rules, so the reference matches the generated SDK.
/// </remarks>
internal static class GoTransformer
{
    // Go interpreted string literals use the same escapes as JSON strings, so a serialized string is a valid
    // literal. Relaxed escaping keeps characters such as '+' and '<' readable instead of \u002B and \u003C.
    private static readonly JsonSerializerOptions s_literalOptions = new()
    {
        Encoder = JavaScriptEncoder.UnsafeRelaxedJsonEscaping
    };

    // The Go SDK generator writes these accessors by hand on InteractionInputCollection, so the dump
    // carries no record of them.
    private static readonly GoSynthesizedMemberModel[] s_interactionInputCollectionMembers =
    [
        new()
        {
            Name = "Get",
            Signature = "Get(name string) (*InteractionInput, error)",
            Description = "Get returns the input with the specified name, or nil if no input matches."
        },
        new()
        {
            Name = "Required",
            Signature = "Required(name string) (*InteractionInput, error)",
            Description = "Required returns the input with the specified name, or an error if no input matches."
        },
        new()
        {
            Name = "Value",
            Signature = "Value(name string) (string, error)",
            Description = "Value returns the value of the input with the specified name, or an empty string if no input matches or it has no value."
        },
        new()
        {
            Name = "RequiredValue",
            Signature = "RequiredValue(name string) (string, error)",
            Description = "RequiredValue returns the value of the input with the specified name, or an error if no input matches."
        },
    ];

    /// <summary>
    /// Transform the deserialized dump output into a <see cref="GoPackageModel"/>.
    /// </summary>
    /// <param name="tolerateKnownScannerDiagnostics">
    /// Accept error diagnostics that <see cref="KnownScannerDiagnostics"/> attributes to known scanner defects.
    /// Any other error diagnostic still fails the transform.
    /// </param>
    /// <param name="knownTypes">
    /// The types that supporting packages already document. Names and interface-ness come from them so the types
    /// this package shares with those packages are named the same way in every module.
    /// </param>
    public static GoPackageModel Transform(
        AtsDumpRoot dump,
        string packageName,
        string? version = null,
        string? sourceRepository = null,
        string? sourceCommit = null,
        bool tolerateKnownScannerDiagnostics = false,
        GoKnownTypes? knownTypes = null)
    {
        AtsTransformer.ThrowIfErrorDiagnostics(dump, tolerateKnownScannerDiagnostics);

        sourceRepository = AtsTransformer.NormalizeSourceRepository(sourceRepository);
        version = AtsTransformer.ResolvePackageVersion(dump, packageName, version);

        var resolver = new GoSdkResolver(dump, knownTypes ?? GoKnownTypes.None);
        var handleModels = TransformHandles(dump, resolver);

        var functionModels = new List<GoFunctionModel>();
        var skippedCapabilityIds = new List<string>();
        foreach (var capability in dump.Capabilities)
        {
            if (TransformCapability(capability, resolver) is { } function)
            {
                functionModels.Add(function);
            }
            else if (!GoSdkResolver.IsRuntimeProvided(capability))
            {
                skippedCapabilityIds.Add(capability.CapabilityId);
            }
        }

        functionModels = functionModels
            .OrderBy(f => f.QualifiedName, StringComparer.Ordinal)
            .ThenBy(f => f.CapabilityId, StringComparer.Ordinal)
            .ToList();

        foreach (var function in functionModels)
        {
            if (function.TargetTypeId is { } targetTypeId && handleModels.TryGetValue(targetTypeId, out var handle))
            {
                handle.Capabilities.Add(function);
            }
        }

        return new GoPackageModel
        {
            Package = new GoPackageInfo
            {
                Name = packageName,
                Version = version,
                SourceRepository = sourceRepository,
                SourceCommit = sourceCommit,
            },
            Functions = functionModels,
            HandleTypes = handleModels.Values
                .OrderBy(h => h.FullName, StringComparer.Ordinal)
                .ThenBy(h => h.Name, StringComparer.Ordinal)
                .ToList(),
            DtoTypes = dump.DtoTypes
                .Where(dto => resolver.GetDtoName(dto.TypeId) is not null)
                .Select(dto => TransformDto(dto, resolver))
                .OrderBy(d => d.FullName, StringComparer.Ordinal)
                .ToList(),
            EnumTypes = dump.EnumTypes
                .Select(e => TransformEnum(e, resolver))
                .OrderBy(e => e.FullName, StringComparer.Ordinal)
                .ToList(),
            ExportedValues = TransformExportedValues(dump, resolver),
            SkippedCapabilityIds = skippedCapabilityIds.Order(StringComparer.Ordinal).ToList(),
        };
    }

    private static Dictionary<string, GoHandleTypeModel> TransformHandles(AtsDumpRoot dump, GoSdkResolver resolver)
    {
        var dumpHandles = new Dictionary<string, AtsDumpHandleType>(StringComparer.Ordinal);
        foreach (var handle in dump.HandleTypes)
        {
            dumpHandles.TryAdd(handle.AtsTypeId, handle);
        }

        // Types that only appear in capability signatures have no handle entry in the dump, so they
        // are documented without a description.
        var models = new Dictionary<string, GoHandleTypeModel>(StringComparer.Ordinal);
        foreach (var (typeId, name) in resolver.InterfaceNames)
        {
            dumpHandles.TryGetValue(typeId, out var dumpHandle);
            var isInterface = resolver.IsInterface(typeId);

            models[typeId] = new GoHandleTypeModel
            {
                Name = name,
                FullName = AtsTransformer.StripAssemblyPrefix(typeId),
                IsInterface = isInterface,
                IsMarker = isInterface && !resolver.HasImplementation(typeId),
                Description = AtsTransformer.NormalizeDoc(dumpHandle?.Documentation?.Summary),
                Remarks = AtsTransformer.NormalizeDoc(dumpHandle?.Documentation?.Remarks),
                ImplementedInterfaces = dumpHandle?.ImplementedInterfaces
                    .Select(resolver.FindHandleName)
                    .OfType<string>()
                    .Distinct(StringComparer.Ordinal)
                    .Order(StringComparer.Ordinal)
                    .ToList() ?? [],
                SynthesizedMembers = typeId == GoSdkResolver.InteractionInputCollectionTypeId
                    ? [.. s_interactionInputCollectionMembers]
                    : [],
            };
        }

        return models;
    }

    /// <summary>
    /// Returns <see langword="null"/> when the Go SDK does not expose the capability.
    /// </summary>
    private static GoFunctionModel? TransformCapability(AtsDumpCapability capability, GoSdkResolver resolver)
    {
        if (capability.CapabilityId == GoSdkResolver.CreateBuilderCapabilityId)
        {
            return TransformCreateBuilder(capability, resolver);
        }

        if (capability.CapabilityId == GoSdkResolver.BuildCapabilityId)
        {
            return TransformBuild(capability, resolver);
        }

        var implementingTypeIds = resolver.GetImplementingTypeIds(capability);
        if (implementingTypeIds.Count == 0)
        {
            return null;
        }

        var (required, _) = GoSdkResolver.SplitParameters(capability);
        var options = resolver.GetOptions(capability);
        var returnType = GoSdkResolver.IsListOrDictAccessor(capability)
            ? new GoReturnInfo(resolver.MapTypeRefToGo(capability.ReturnType, false), GoErrorModels.None, ReturnsReceiver: false)
            : resolver.RenderReturn(capability);

        var name = ToPascalCase(capability.MethodName);

        return CreateFunctionModel(
            capability,
            name,
            signature: $"{name}({resolver.RenderParameterList(required, options)}) {returnType.ReturnType}",
            returnType,
            receiver: GetReceiverName(capability, resolver),
            parameters: TransformParameters(required, capability, resolver),
            options: TransformOptions(options, capability, resolver),
            appliesTo: implementingTypeIds
                .Select(typeId => resolver.InterfaceNames[typeId])
                .Order(StringComparer.Ordinal)
                .ToList());
    }

    // The Go SDK writes CreateBuilder by hand because it connects to the AppHost rather than calling a capability.
    private static GoFunctionModel TransformCreateBuilder(AtsDumpCapability capability, GoSdkResolver resolver)
    {
        var optionsName = resolver.CreateBuilderOptionsName;
        var returnType = new GoReturnInfo($"({resolver.BuilderInterfaceName}, error)", GoErrorModels.Returned, ReturnsReceiver: false);

        return CreateFunctionModel(
            capability,
            name: "CreateBuilder",
            signature: optionsName is null
                ? $"CreateBuilder() {returnType.ReturnType}"
                : $"CreateBuilder(options ...*{optionsName}) {returnType.ReturnType}",
            returnType,
            receiver: null,
            parameters: [],
            options: optionsName is null ? null : new GoOptionsModel { TypeName = optionsName, IsDirect = true },
            appliesTo: [],
            fallbackDescription: "CreateBuilder establishes a connection to the AppHost and returns a new builder.");
    }

    // Build is written by hand because it returns the application interface instead of the fluent builder.
    private static GoFunctionModel TransformBuild(AtsDumpCapability capability, GoSdkResolver resolver)
    {
        var returnType = new GoReturnInfo($"({resolver.ApplicationInterfaceName}, error)", GoErrorModels.Returned, ReturnsReceiver: false);

        return CreateFunctionModel(
            capability,
            name: "Build",
            signature: $"Build() {returnType.ReturnType}",
            returnType,
            receiver: resolver.BuilderInterfaceName,
            parameters: [],
            options: null,
            appliesTo: [resolver.BuilderInterfaceName],
            fallbackDescription: "Build invokes the build capability and returns the running application.");
    }

    private static GoFunctionModel CreateFunctionModel(
        AtsDumpCapability capability,
        string name,
        string signature,
        GoReturnInfo returnType,
        string? receiver,
        List<GoParameterModel> parameters,
        GoOptionsModel? options,
        List<string> appliesTo,
        string? fallbackDescription = null)
    {
        return new GoFunctionModel
        {
            Name = name,
            CapabilityId = capability.CapabilityId,
            QualifiedName = capability.QualifiedMethodName,

            // Prefer the richer Documentation.Summary; fall back to the legacy Description field for
            // older dumps that don't ship Documentation.
            Description = AtsTransformer.NormalizeDoc(capability.Documentation?.Summary)
                ?? AtsTransformer.NormalizeDoc(capability.Description)
                ?? fallbackDescription,
            Remarks = AtsTransformer.NormalizeDoc(capability.Documentation?.Remarks),
            Returns = AtsTransformer.NormalizeDoc(capability.Documentation?.Returns),
            Kind = capability.CapabilityKind,
            Signature = signature,
            Receiver = receiver,
            Parameters = parameters,
            Options = options,
            ReturnType = returnType.ReturnType,
            ReturnsReceiver = returnType.ReturnsReceiver,
            ErrorModel = returnType.ErrorModel,
            ReturnsBuilder = capability.ReturnsBuilder,
            TargetTypeId = capability.TargetTypeId,
            ExpandedTargetTypes = capability.ExpandedTargetTypes
                .Select(t => AtsTransformer.StripAssemblyPrefix(t.TypeId))
                .ToList(),
            AppliesTo = appliesTo,
        };
    }

    private static string? GetReceiverName(AtsDumpCapability capability, GoSdkResolver resolver)
    {
        if (capability.TargetTypeId is { } targetTypeId && resolver.InterfaceNames.TryGetValue(targetTypeId, out var name))
        {
            return name;
        }

        return capability.TargetType is { } targetType ? resolver.GetHandleName(targetType) : null;
    }

    private static List<GoParameterModel> TransformParameters(
        IReadOnlyList<AtsDumpParameter> parameters,
        AtsDumpCapability capability,
        GoSdkResolver resolver)
    {
        var docs = GetParameterDocs(capability);

        return parameters.Select(p => new GoParameterModel
        {
            Name = GetLocalIdentifier(p.Name),
            Type = resolver.RenderParameterType(p),
            IsCallback = p.IsCallback,
            CallbackSignature = p.IsCallback ? resolver.RenderCallbackType(p) : null,
            AllowedTypes = !p.IsCallback && p.Type.Category == AtsTypeCategories.Union
                ? resolver.GetUnionAllowedTypes(p.Type)
                : null,
            Description = GetParameterDescription(p, docs),
        }).ToList();
    }

    private static GoOptionsModel? TransformOptions(GoOptionsInfo? options, AtsDumpCapability capability, GoSdkResolver resolver)
    {
        if (options is null)
        {
            return null;
        }

        // A direct options DTO is documented once on the DTO itself.
        if (options.IsDirect)
        {
            return new GoOptionsModel { TypeName = options.TypeName, IsDirect = true };
        }

        var docs = GetParameterDocs(capability);

        return new GoOptionsModel
        {
            TypeName = options.TypeName,
            Fields = options.Parameters.Select(p => new GoOptionFieldModel
            {
                Name = ToPascalCase(p.Name),

                // Callbacks and cancellation tokens cannot be serialized, so the SDK tags them json:"-".
                JsonName = p.IsCallback || GoSdkResolver.IsCancellationToken(p) ? null : p.Name,
                Type = resolver.RenderOptionsFieldType(p),
                IsCallback = p.IsCallback,
                CallbackSignature = p.IsCallback ? resolver.RenderCallbackType(p) : null,
                Description = GetParameterDescription(p, docs),
            }).ToList(),
        };
    }

    // Parameter descriptions come from the capability's documentation block, keyed by ATS parameter name.
    private static Dictionary<string, string?> GetParameterDocs(AtsDumpCapability capability) =>
        capability.Documentation?.Parameters
            .Where(d => !string.IsNullOrWhiteSpace(d.Description))
            .GroupBy(d => d.Name, StringComparer.Ordinal)
            .ToDictionary(g => g.Key, g => g.First().Description, StringComparer.Ordinal)
        ?? new Dictionary<string, string?>(StringComparer.Ordinal);

    private static string? GetParameterDescription(AtsDumpParameter parameter, Dictionary<string, string?> docs) =>
        docs.TryGetValue(parameter.Name, out var description)
            ? AtsTransformer.NormalizeDoc(description)
            : AtsTransformer.NormalizeDoc(parameter.Documentation?.Summary);

    private static GoDtoTypeModel TransformDto(AtsDumpDtoType dto, GoSdkResolver resolver)
    {
        return new GoDtoTypeModel
        {
            Name = resolver.GetDtoName(dto.TypeId) ?? SanitizeIdentifier(dto.Name),
            FullName = AtsTransformer.StripAssemblyPrefix(dto.TypeId),
            Description = AtsTransformer.NormalizeDoc(dto.Documentation?.Summary) ?? AtsTransformer.NormalizeDoc(dto.Description),
            Remarks = AtsTransformer.NormalizeDoc(dto.Documentation?.Remarks),
            Fields = dto.Properties.Select(p => new GoDtoFieldModel
            {
                Name = ToPascalCase(p.Name),
                JsonName = p.Name,
                Type = resolver.MapDtoPropertyTypeToGo(p.Type, p.IsOptional),
                IsOptional = p.IsOptional,
                IsCallback = p.Type.Category == AtsTypeCategories.Callback,
                Description = AtsTransformer.NormalizeDoc(p.Documentation?.Summary) ?? AtsTransformer.NormalizeDoc(p.Description),
            }).ToList(),
        };
    }

    private static GoEnumTypeModel TransformEnum(AtsDumpEnumType enumType, GoSdkResolver resolver)
    {
        var fullName = StripEnumPrefix(enumType.TypeId);

        var goName = resolver.GetEnumName(enumType.TypeId) ?? SanitizeIdentifier(enumType.Name);

        var valueDocs = new Dictionary<string, AtsDumpEnumValueInfo>(StringComparer.Ordinal);
        foreach (var valueInfo in enumType.ValueInfos)
        {
            valueDocs.TryAdd(valueInfo.Name, valueInfo);
        }

        return new GoEnumTypeModel
        {
            Name = goName,
            FullName = fullName,
            Description = AtsTransformer.NormalizeDoc(enumType.Documentation?.Summary),
            Remarks = AtsTransformer.NormalizeDoc(enumType.Documentation?.Remarks),
            Members = enumType.Values.Select(value =>
            {
                valueDocs.TryGetValue(value, out var valueInfo);

                return new GoEnumMemberModel
                {
                    Name = $"{goName}{ToPascalCase(value)}",
                    Value = value,
                    Description = AtsTransformer.NormalizeDoc(valueInfo?.Documentation?.Summary),
                    Remarks = AtsTransformer.NormalizeDoc(valueInfo?.Documentation?.Remarks),
                };
            }).ToList(),
        };
    }

    // The Go SDK emits each group as `var Name = struct { Child T }{ Child: value }`, so the first path
    // segment is the variable and the rest address a field inside it.
    private static List<GoExportedValueModel> TransformExportedValues(AtsDumpRoot dump, GoSdkResolver resolver)
    {
        return dump.ExportedValues
            .Where(value => value.PathSegments.Count > 0)
            .GroupBy(value => value.PathSegments[0], StringComparer.Ordinal)
            .OrderBy(group => group.Key, StringComparer.Ordinal)
            .Select(group => new GoExportedValueModel
            {
                Name = group.Key,
                FullName = group.Key,
                Values = group
                    .Select(value => new GoExportedValueEntryModel
                    {
                        Path = string.Join('.', value.PathSegments.Skip(1)),
                        Type = resolver.MapTypeRefToGo(value.Type, false),
                        Value = FormatExportedValue(value, resolver),
                        Description = AtsTransformer.NormalizeDoc(value.Documentation?.Summary) ?? AtsTransformer.NormalizeDoc(value.Description),
                    })
                    .OrderBy(entry => entry.Path, StringComparer.Ordinal)
                    .ToList(),
            })
            .ToList();
    }

    // Scalars render as Go literals. Anything else (DTOs, collections) renders as its JSON text because
    // the reference only needs to show what the value is, not reproduce the SDK's composite literal.
    // Composites are re-serialized rather than copied with GetRawText(): the dump keeps its indentation and
    // the line endings of the OS that produced it, which would make the generated data differ per platform
    // and split a value across several lines of the one-line-per-value markdown lists.
    private static string FormatExportedValue(AtsDumpExportedValue exported, GoSdkResolver resolver)
    {
        if (exported.Value is not { } json || json.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return "nil";
        }

        var literal = json.ValueKind switch
        {
            JsonValueKind.String => JsonSerializer.Serialize(json.GetString(), s_literalOptions),
            JsonValueKind.True => "true",
            JsonValueKind.False => "false",
            JsonValueKind.Object or JsonValueKind.Array => JsonSerializer.Serialize(json, s_literalOptions),
            _ => json.GetRawText()
        };

        return exported.Type.Category == AtsTypeCategories.Enum && resolver.GetEnumName(exported.Type.TypeId) is { } enumName
            ? $"{enumName}({literal})"
            : literal;
    }
}
