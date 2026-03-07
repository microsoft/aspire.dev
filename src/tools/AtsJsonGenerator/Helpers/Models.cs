using System.Text.Json.Serialization;

namespace AtsJsonGenerator;

// ════════════════════════════════════════════════════════════════════
//  INPUT MODELS — deserialized from `aspire sdk dump --json` output
// ════════════════════════════════════════════════════════════════════

internal sealed class AtsDumpRoot
{
    [JsonPropertyName("Packages")]
    public List<AtsDumpPackageRef> Packages { get; init; } = [];

    [JsonPropertyName("Capabilities")]
    public List<AtsDumpCapability> Capabilities { get; init; } = [];

    [JsonPropertyName("HandleTypes")]
    public List<AtsDumpHandleType> HandleTypes { get; init; } = [];

    [JsonPropertyName("DtoTypes")]
    public List<AtsDumpDtoType> DtoTypes { get; init; } = [];

    [JsonPropertyName("EnumTypes")]
    public List<AtsDumpEnumType> EnumTypes { get; init; } = [];

    [JsonPropertyName("Diagnostics")]
    public List<object> Diagnostics { get; init; } = [];
}

internal sealed class AtsDumpPackageRef
{
    [JsonPropertyName("Name")]
    public required string Name { get; init; }

    [JsonPropertyName("Version")]
    public string? Version { get; init; }
}

internal sealed class AtsDumpCapability
{
    [JsonPropertyName("CapabilityId")]
    public required string CapabilityId { get; init; }

    [JsonPropertyName("MethodName")]
    public required string MethodName { get; init; }

    [JsonPropertyName("OwningTypeName")]
    public string? OwningTypeName { get; init; }

    [JsonPropertyName("QualifiedMethodName")]
    public required string QualifiedMethodName { get; init; }

    [JsonPropertyName("Description")]
    public string? Description { get; init; }

    [JsonPropertyName("CapabilityKind")]
    public required string CapabilityKind { get; init; }

    [JsonPropertyName("TargetTypeId")]
    public string? TargetTypeId { get; init; }

    [JsonPropertyName("TargetParameterName")]
    public string? TargetParameterName { get; init; }

    [JsonPropertyName("ReturnsBuilder")]
    public bool ReturnsBuilder { get; init; }

    [JsonPropertyName("Parameters")]
    public List<AtsDumpParameter> Parameters { get; init; } = [];

    [JsonPropertyName("ReturnType")]
    public AtsDumpTypeRef? ReturnType { get; init; }

    [JsonPropertyName("TargetType")]
    public AtsDumpTypeRef? TargetType { get; init; }

    [JsonPropertyName("ExpandedTargetTypes")]
    public List<AtsDumpTypeRef> ExpandedTargetTypes { get; init; } = [];
}

internal sealed class AtsDumpParameter
{
    [JsonPropertyName("Name")]
    public required string Name { get; init; }

    [JsonPropertyName("Type")]
    public required AtsDumpTypeRef Type { get; init; }

    [JsonPropertyName("IsOptional")]
    public bool IsOptional { get; init; }

    [JsonPropertyName("IsNullable")]
    public bool IsNullable { get; init; }

    [JsonPropertyName("IsCallback")]
    public bool IsCallback { get; init; }

    [JsonPropertyName("DefaultValue")]
    public string? DefaultValue { get; init; }

    [JsonPropertyName("CallbackParameters")]
    public List<AtsDumpCallbackParam>? CallbackParameters { get; init; }

    [JsonPropertyName("CallbackReturnType")]
    public AtsDumpTypeRef? CallbackReturnType { get; init; }
}

internal sealed class AtsDumpCallbackParam
{
    [JsonPropertyName("Name")]
    public required string Name { get; init; }

    [JsonPropertyName("Type")]
    public required AtsDumpTypeRef Type { get; init; }
}

internal sealed class AtsDumpTypeRef
{
    [JsonPropertyName("TypeId")]
    public required string TypeId { get; init; }

    [JsonPropertyName("Category")]
    public required string Category { get; init; }

    [JsonPropertyName("IsInterface")]
    public bool IsInterface { get; init; }

    [JsonPropertyName("IsReadOnly")]
    public bool IsReadOnly { get; init; }

    [JsonPropertyName("ElementType")]
    public AtsDumpTypeRef? ElementType { get; init; }
}

internal sealed class AtsDumpHandleType
{
    [JsonPropertyName("AtsTypeId")]
    public required string AtsTypeId { get; init; }

    [JsonPropertyName("IsInterface")]
    public bool IsInterface { get; init; }

    [JsonPropertyName("ExposeProperties")]
    public bool ExposeProperties { get; init; }

    [JsonPropertyName("ExposeMethods")]
    public bool ExposeMethods { get; init; }

    [JsonPropertyName("ImplementedInterfaces")]
    public List<AtsDumpTypeRef> ImplementedInterfaces { get; init; } = [];

    [JsonPropertyName("BaseTypeHierarchy")]
    public List<AtsDumpTypeRef> BaseTypeHierarchy { get; init; } = [];
}

internal sealed class AtsDumpDtoType
{
    [JsonPropertyName("TypeId")]
    public required string TypeId { get; init; }

    [JsonPropertyName("Name")]
    public required string Name { get; init; }

    [JsonPropertyName("Properties")]
    public List<AtsDumpDtoProperty> Properties { get; init; } = [];
}

internal sealed class AtsDumpDtoProperty
{
    [JsonPropertyName("Name")]
    public required string Name { get; init; }

    [JsonPropertyName("Type")]
    public required AtsDumpTypeRef Type { get; init; }

    [JsonPropertyName("IsOptional")]
    public bool IsOptional { get; init; }
}

internal sealed class AtsDumpEnumType
{
    [JsonPropertyName("TypeId")]
    public required string TypeId { get; init; }

    [JsonPropertyName("Name")]
    public required string Name { get; init; }

    [JsonPropertyName("Values")]
    public List<string> Values { get; init; } = [];
}

// ════════════════════════════════════════════════════════════════════
//  OUTPUT MODELS — serialized to JSON for the docs site
// ════════════════════════════════════════════════════════════════════

/// <summary>
/// Root model for a TypeScript API package JSON file consumed by the docs site.
/// </summary>
internal sealed class TsPackageModel
{
    [JsonPropertyName("package")]
    public required TsPackageInfo Package { get; init; }

    [JsonPropertyName("functions")]
    public List<TsFunctionModel> Functions { get; init; } = [];

    [JsonPropertyName("handleTypes")]
    public List<TsHandleTypeModel> HandleTypes { get; init; } = [];

    [JsonPropertyName("dtoTypes")]
    public List<TsDtoTypeModel> DtoTypes { get; init; } = [];

    [JsonPropertyName("enumTypes")]
    public List<TsEnumTypeModel> EnumTypes { get; init; } = [];
}

internal sealed class TsPackageInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("version")]
    public string? Version { get; init; }

    [JsonPropertyName("language")]
    public string Language => "typescript";

    [JsonPropertyName("sourceRepository")]
    public string? SourceRepository { get; init; }

    [JsonPropertyName("sourceCommit")]
    public string? SourceCommit { get; init; }
}

internal sealed class TsFunctionModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("capabilityId")]
    public required string CapabilityId { get; init; }

    [JsonPropertyName("qualifiedName")]
    public required string QualifiedName { get; init; }

    [JsonPropertyName("description")]
    public string? Description { get; init; }

    [JsonPropertyName("kind")]
    public required string Kind { get; init; }

    [JsonPropertyName("signature")]
    public required string Signature { get; init; }

    [JsonPropertyName("parameters")]
    public List<TsParameterModel> Parameters { get; init; } = [];

    [JsonPropertyName("returnType")]
    public required string ReturnType { get; init; }

    [JsonPropertyName("returnsBuilder")]
    public bool ReturnsBuilder { get; init; }

    [JsonPropertyName("targetTypeId")]
    public string? TargetTypeId { get; init; }

    [JsonPropertyName("expandedTargetTypes")]
    public List<string> ExpandedTargetTypes { get; init; } = [];
}

internal sealed class TsParameterModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isOptional")]
    public bool IsOptional { get; init; }

    [JsonPropertyName("isNullable")]
    public bool IsNullable { get; init; }

    [JsonPropertyName("defaultValue")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? DefaultValue { get; init; }

    [JsonPropertyName("isCallback")]
    public bool IsCallback { get; init; }

    [JsonPropertyName("callbackSignature")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CallbackSignature { get; init; }
}

internal sealed class TsHandleTypeModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("kind")]
    public string Kind => "handle";

    [JsonPropertyName("isInterface")]
    public bool IsInterface { get; init; }

    [JsonPropertyName("exposeProperties")]
    public bool ExposeProperties { get; init; }

    [JsonPropertyName("exposeMethods")]
    public bool ExposeMethods { get; init; }

    [JsonPropertyName("implementedInterfaces")]
    public List<string> ImplementedInterfaces { get; init; } = [];

    /// <summary>
    /// Capabilities that target this handle type.
    /// </summary>
    [JsonPropertyName("capabilities")]
    public List<TsFunctionModel> Capabilities { get; init; } = [];
}

internal sealed class TsDtoTypeModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("kind")]
    public string Kind => "dto";

    [JsonPropertyName("fields")]
    public List<TsDtoFieldModel> Fields { get; init; } = [];
}

internal sealed class TsDtoFieldModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isOptional")]
    public bool IsOptional { get; init; }
}

internal sealed class TsEnumTypeModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("kind")]
    public string Kind => "enum";

    [JsonPropertyName("members")]
    public List<string> Members { get; init; } = [];
}
