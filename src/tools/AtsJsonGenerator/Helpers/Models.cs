using System.Text.Json;
using System.Text.Json.Serialization;

namespace AtsJsonGenerator;

// Input models for the stable `aspire sdk dump --format json` schema.
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

    [JsonPropertyName("ExportedValues")]
    public List<AtsDumpExportedValue> ExportedValues { get; init; } = [];

    [JsonPropertyName("Diagnostics")]
    public List<JsonElement> Diagnostics { get; init; } = [];
}

internal sealed class AtsDumpPackageRef
{
    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Version")]
    public string? Version { get; init; }
}

internal sealed class AtsDumpCapability
{
    [JsonPropertyName("CapabilityId")]
    public string CapabilityId { get; init; } = "";

    [JsonPropertyName("MethodName")]
    public string MethodName { get; init; } = "";

    [JsonPropertyName("OwningTypeName")]
    public string? OwningTypeName { get; init; }

    [JsonPropertyName("QualifiedMethodName")]
    public string QualifiedMethodName { get; init; } = "";

    [JsonPropertyName("Description")]
    public string? Description { get; init; }

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }

    [JsonPropertyName("CapabilityKind")]
    public string CapabilityKind { get; init; } = "";

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

internal sealed class AtsDumpDocumentation
{
    [JsonPropertyName("Summary")]
    public string? Summary { get; init; }

    [JsonPropertyName("Remarks")]
    public string? Remarks { get; init; }

    [JsonPropertyName("Returns")]
    public string? Returns { get; init; }

    [JsonPropertyName("Parameters")]
    public List<AtsDumpParameterDoc> Parameters { get; init; } = [];
}

internal sealed class AtsDumpParameterDoc
{
    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Description")]
    public string? Description { get; init; }
}

internal sealed class AtsDumpParameter
{
    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Type")]
    public AtsDumpTypeRef? Type { get; init; }

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

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }
}

internal sealed class AtsDumpCallbackParam
{
    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Type")]
    public AtsDumpTypeRef? Type { get; init; }

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }
}

internal sealed class AtsDumpTypeRef
{
    [JsonPropertyName("TypeId")]
    public string TypeId { get; init; } = "";

    [JsonPropertyName("Category")]
    public string Category { get; init; } = "";

    [JsonPropertyName("IsInterface")]
    public bool IsInterface { get; init; }

    [JsonPropertyName("IsNullable")]
    public bool? IsNullable { get; init; }

    [JsonPropertyName("IsReadOnly")]
    public bool IsReadOnly { get; init; }

    [JsonPropertyName("ElementType")]
    public AtsDumpTypeRef? ElementType { get; init; }

    [JsonPropertyName("KeyType")]
    public AtsDumpTypeRef? KeyType { get; init; }

    [JsonPropertyName("ValueType")]
    public AtsDumpTypeRef? ValueType { get; init; }

    [JsonPropertyName("UnionTypes")]
    public List<AtsDumpTypeRef>? UnionTypes { get; init; }
}

internal sealed class AtsDumpHandleType
{
    [JsonPropertyName("AtsTypeId")]
    public string AtsTypeId { get; init; } = "";

    [JsonPropertyName("IsInterface")]
    public bool IsInterface { get; init; }

    [JsonPropertyName("ExposeProperties")]
    public bool ExposeProperties { get; init; }

    [JsonPropertyName("ExposeMethods")]
    public bool ExposeMethods { get; init; }

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }

    [JsonPropertyName("ImplementedInterfaces")]
    public List<AtsDumpTypeRef> ImplementedInterfaces { get; init; } = [];

    [JsonPropertyName("BaseTypeHierarchy")]
    public List<AtsDumpTypeRef> BaseTypeHierarchy { get; init; } = [];
}

internal sealed class AtsDumpDtoType
{
    [JsonPropertyName("TypeId")]
    public string TypeId { get; init; } = "";

    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Description")]
    public string? Description { get; init; }

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }

    [JsonPropertyName("Properties")]
    public List<AtsDumpDtoProperty> Properties { get; init; } = [];
}

internal sealed class AtsDumpDtoProperty
{
    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Type")]
    public AtsDumpTypeRef? Type { get; init; }

    [JsonPropertyName("IsOptional")]
    public bool IsOptional { get; init; }

    [JsonPropertyName("IsNullable")]
    public bool IsNullable { get; init; }

    [JsonPropertyName("IsCallback")]
    public bool IsCallback { get; init; }

    [JsonPropertyName("CallbackParameters")]
    public List<AtsDumpCallbackParam>? CallbackParameters { get; init; }

    [JsonPropertyName("CallbackReturnType")]
    public AtsDumpTypeRef? CallbackReturnType { get; init; }

    [JsonPropertyName("Description")]
    public string? Description { get; init; }

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }
}

internal sealed class AtsDumpEnumType
{
    [JsonPropertyName("TypeId")]
    public string TypeId { get; init; } = "";

    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }

    [JsonPropertyName("Values")]
    public List<string> Values { get; init; } = [];

    [JsonPropertyName("ValueInfos")]
    public List<AtsDumpEnumValueInfo> ValueInfos { get; init; } = [];
}

internal sealed class AtsDumpEnumValueInfo
{
    [JsonPropertyName("Name")]
    public string Name { get; init; } = "";

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }
}

internal sealed class AtsDumpExportedValue
{
    [JsonPropertyName("PathSegments")]
    public List<string> PathSegments { get; init; } = [];

    [JsonPropertyName("Type")]
    public AtsDumpTypeRef? Type { get; init; }

    [JsonPropertyName("Value")]
    public JsonElement? Value { get; init; }

    [JsonPropertyName("Description")]
    public string? Description { get; init; }

    [JsonPropertyName("Documentation")]
    public AtsDumpDocumentation? Documentation { get; init; }
}

// Language-neutral semantic package model consumed by apphost-modules.
internal sealed class AppHostModuleModel
{
    [JsonPropertyName("schemaVersion")]
    public string SchemaVersion { get; init; } = "1.0";

    [JsonPropertyName("generatorProvenance")]
    public required AppHostGeneratorProvenanceModel GeneratorProvenance { get; init; }

    [JsonPropertyName("dumpProvenance")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AppHostDumpProvenanceModel? DumpProvenance { get; init; }

    [JsonPropertyName("package")]
    public required AppHostPackageInfo Package { get; init; }

    [JsonPropertyName("items")]
    public List<AppHostItemModel> Items { get; init; } = [];
}

internal sealed class AppHostGeneratorProvenanceModel
{
    [JsonPropertyName("repository")]
    public required string Repository { get; init; }

    [JsonPropertyName("commit")]
    public required string Commit { get; init; }

    [JsonPropertyName("lockFile")]
    public required string LockFile { get; init; }
}

internal sealed class AppHostDumpProvenanceModel
{
    [JsonPropertyName("cliVersion")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CliVersion { get; init; }

    [JsonPropertyName("productCommit")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ProductCommit { get; init; }

    [JsonPropertyName("generatedAt")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? GeneratedAt { get; init; }
}

internal sealed class AppHostPackageInfo
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("version")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Version { get; init; }

    [JsonPropertyName("sourceRepository")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SourceRepository { get; init; }

    [JsonPropertyName("sourceCommit")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SourceCommit { get; init; }
}

internal sealed class AppHostItemModel
{
    [JsonPropertyName("id")]
    public required string Id { get; init; }

    [JsonPropertyName("kind")]
    public required string Kind { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? FullName { get; init; }

    [JsonPropertyName("capabilityId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CapabilityId { get; init; }

    [JsonPropertyName("qualifiedName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? QualifiedName { get; init; }

    [JsonPropertyName("capabilityKind")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CapabilityKind { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }

    [JsonPropertyName("remarks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Remarks { get; init; }

    [JsonPropertyName("returns")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Returns { get; init; }

    [JsonPropertyName("targetTypeId")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? TargetTypeId { get; init; }

    [JsonPropertyName("expandedTargetTypes")]
    public List<string> ExpandedTargetTypes { get; init; } = [];

    [JsonPropertyName("returnsBuilder")]
    public bool ReturnsBuilder { get; init; }

    [JsonPropertyName("parameters")]
    public List<AppHostParameterModel> Parameters { get; init; } = [];

    [JsonPropertyName("returnType")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ReturnType { get; init; }

    [JsonPropertyName("fields")]
    public List<AppHostFieldModel> Fields { get; init; } = [];

    [JsonPropertyName("members")]
    public List<AppHostEnumMemberModel> Members { get; init; } = [];

    [JsonPropertyName("pathSegments")]
    public List<string> PathSegments { get; init; } = [];

    [JsonPropertyName("value")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public JsonElement? Value { get; init; }

    [JsonPropertyName("isInterface")]
    public bool IsInterface { get; init; }

    [JsonPropertyName("exposeProperties")]
    public bool ExposeProperties { get; init; }

    [JsonPropertyName("exposeMethods")]
    public bool ExposeMethods { get; init; }

    [JsonPropertyName("implementedInterfaces")]
    public List<string> ImplementedInterfaces { get; init; } = [];

    [JsonPropertyName("baseTypeHierarchy")]
    public List<string> BaseTypeHierarchy { get; init; } = [];

    [JsonPropertyName("projections")]
    public Dictionary<string, AppHostProjectionModel> Projections { get; init; } = new(StringComparer.Ordinal);
}

internal sealed class AppHostProjectionModel
{
    [JsonPropertyName("status")]
    public required string Status { get; init; }

    [JsonPropertyName("validation")]
    public string Validation { get; init; } = "source-derived";

    [JsonPropertyName("reason")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Reason { get; init; }

    [JsonPropertyName("identifier")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Identifier { get; init; }

    [JsonPropertyName("signature")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Signature { get; init; }

    [JsonPropertyName("declaration")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Declaration { get; init; }

    [JsonPropertyName("sourceFile")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? SourceFile { get; init; }

    [JsonPropertyName("kind")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Kind { get; init; }

    [JsonPropertyName("parameters")]
    public List<AppHostParameterModel> Parameters { get; init; } = [];

    [JsonPropertyName("return")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AppHostReturnModel? Return { get; init; }

    [JsonPropertyName("fields")]
    public List<AppHostFieldModel> Fields { get; init; } = [];

    [JsonPropertyName("members")]
    public List<AppHostEnumMemberModel> Members { get; init; } = [];

    [JsonPropertyName("implementedInterfaces")]
    public List<string> ImplementedInterfaces { get; init; } = [];

    [JsonPropertyName("valueExpression")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? ValueExpression { get; init; }
}

internal sealed class AppHostParameterModel
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

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }
}

internal sealed class AppHostFieldModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isOptional")]
    public bool IsOptional { get; init; }

    [JsonPropertyName("isNullable")]
    public bool IsNullable { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }
}

internal sealed class AppHostEnumMemberModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("value")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public object? Value { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }
}

internal sealed class AppHostReturnModel
{
    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("errorModel")]
    public required string ErrorModel { get; init; }
}

internal sealed class AppHostSupportMatrixModel
{
    [JsonPropertyName("schemaVersion")]
    public string SchemaVersion { get; init; } = "1.0";

    [JsonPropertyName("generatedFrom")]
    public required AppHostSupportGeneratedFromModel GeneratedFrom { get; init; }

    [JsonPropertyName("packages")]
    public Dictionary<string, AppHostSupportPackageModel> Packages { get; init; } = new(StringComparer.Ordinal);
}

internal sealed class AppHostSupportGeneratedFromModel
{
    [JsonPropertyName("repository")]
    public required string Repository { get; init; }

    [JsonPropertyName("commit")]
    public required string Commit { get; init; }

    [JsonPropertyName("lockFile")]
    public required string LockFile { get; init; }

    [JsonPropertyName("dumpProvenance")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AppHostDumpProvenanceModel? DumpProvenance { get; init; }
}

internal sealed class AppHostSupportPackageModel
{
    [JsonPropertyName("package")]
    public required AppHostSupportPackageInfoModel Package { get; init; }

    [JsonPropertyName("dumpProvenance")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public AppHostDumpProvenanceModel? DumpProvenance { get; init; }

    [JsonPropertyName("items")]
    public Dictionary<string, AppHostSupportItemModel> Items { get; init; } = new(StringComparer.Ordinal);
}

internal sealed class AppHostSupportPackageInfoModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("version")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Version { get; init; }
}

internal sealed class AppHostSupportItemModel
{
    [JsonPropertyName("kind")]
    public required string Kind { get; init; }

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("languages")]
    public Dictionary<string, AppHostSupportStatusModel> Languages { get; init; } = new(StringComparer.Ordinal);
}

internal sealed class AppHostSupportStatusModel
{
    [JsonPropertyName("supported")]
    [JsonIgnore(Condition = JsonIgnoreCondition.Never)]
    public bool Supported { get; init; }

    [JsonPropertyName("validation")]
    public string Validation { get; init; } = "source-derived";

    [JsonPropertyName("reason")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Reason { get; init; }
}
