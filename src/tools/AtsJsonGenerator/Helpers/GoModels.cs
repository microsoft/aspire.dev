using System.Text.Json.Serialization;

namespace AtsJsonGenerator;

// ════════════════════════════════════════════════════════════════════
//  GO OUTPUT MODELS — serialized to JSON for the docs site
//
//  The Go SDK exposes every ATS capability as a method on a generated Go interface, so
//  these models describe the Go surface (Go identifiers, Go type syntax, Go error model)
//  rather than the ATS surface the TypeScript models describe.
// ════════════════════════════════════════════════════════════════════

/// <summary>
/// Root model for a Go API package JSON file consumed by the docs site.
/// </summary>
internal sealed class GoPackageModel
{
    [JsonPropertyName("package")]
    public required GoPackageInfo Package { get; init; }

    /// <summary>
    /// Every capability the Go SDK emits, including those also listed under a handle's
    /// <see cref="GoHandleTypeModel.Capabilities"/>.
    /// </summary>
    [JsonPropertyName("functions")]
    public List<GoFunctionModel> Functions { get; init; } = [];

    [JsonPropertyName("handleTypes")]
    public List<GoHandleTypeModel> HandleTypes { get; init; } = [];

    [JsonPropertyName("dtoTypes")]
    public List<GoDtoTypeModel> DtoTypes { get; init; } = [];

    [JsonPropertyName("enumTypes")]
    public List<GoEnumTypeModel> EnumTypes { get; init; } = [];

    [JsonPropertyName("exportedValues")]
    public List<GoExportedValueModel> ExportedValues { get; init; } = [];

    /// <summary>
    /// Capabilities in the dump that the Go SDK does not expose because no concrete Go type carries them.
    /// Runtime-provided collection and <c>ReferenceExpression</c> capabilities are expected and not listed.
    /// Reported by the generator but never written to the JSON.
    /// </summary>
    [JsonIgnore]
    public List<string> SkippedCapabilityIds { get; init; } = [];
}

/// <summary>
/// The values of <see cref="GoFunctionModel.ErrorModel"/>.
/// </summary>
internal static class GoErrorModels
{
    /// <summary>The method returns a trailing <c>error</c>.</summary>
    public const string Returned = "returned";

    /// <summary>The method returns a fluent handle; a failure is stored on it and read with <c>Err()</c>.</summary>
    public const string Deferred = "deferred";

    /// <summary>The method cannot fail.</summary>
    public const string None = "none";
}

internal sealed class GoPackageInfo
{
    /// <summary>
    /// The Go SDK emits every type into one flat package regardless of the NuGet package
    /// that contributes it, so all modules share this import path.
    /// </summary>
    internal const string SdkImportPath = "apphost/modules/aspire";

    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("version")]
    public string? Version { get; init; }

    [JsonPropertyName("language")]
    public string Language => "go";

    [JsonPropertyName("importPath")]
    public string ImportPath => SdkImportPath;

    [JsonPropertyName("sourceRepository")]
    public string? SourceRepository { get; init; }

    [JsonPropertyName("sourceCommit")]
    public string? SourceCommit { get; init; }
}

internal sealed class GoFunctionModel
{
    /// <summary>
    /// The Go method name, for example <c>AddRedis</c>.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("capabilityId")]
    public required string CapabilityId { get; init; }

    /// <summary>
    /// The ATS qualified name. Names without a '.' are standalone (extension) exports;
    /// dotted names are members of a handle type.
    /// </summary>
    [JsonPropertyName("qualifiedName")]
    public required string QualifiedName { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }

    [JsonPropertyName("remarks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Remarks { get; init; }

    [JsonPropertyName("returns")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Returns { get; init; }

    /// <summary>
    /// The ATS capability kind: Method, InstanceMethod, PropertyGetter or PropertySetter.
    /// </summary>
    [JsonPropertyName("kind")]
    public required string Kind { get; init; }

    /// <summary>
    /// The Go method signature without the <c>func</c> keyword, for example
    /// <c>AddRedis(name string, options ...*AddRedisOptions) RedisResource</c>.
    /// </summary>
    [JsonPropertyName("signature")]
    public required string Signature { get; init; }

    /// <summary>
    /// The Go name of the type that declares the method. Absent for package-level functions.
    /// </summary>
    [JsonPropertyName("receiver")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Receiver { get; init; }

    /// <summary>
    /// Required positional parameters. Optional parameters live in <see cref="Options"/>.
    /// </summary>
    [JsonPropertyName("parameters")]
    public List<GoParameterModel> Parameters { get; init; } = [];

    [JsonPropertyName("options")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public GoOptionsModel? Options { get; init; }

    /// <summary>
    /// The Go return clause, for example <c>error</c>, <c>(string, error)</c> or <c>RedisResource</c>.
    /// </summary>
    [JsonPropertyName("returnType")]
    public required string ReturnType { get; init; }

    /// <summary>
    /// True when the method returns the type it was called on, so each concrete type in
    /// <see cref="AppliesTo"/> substitutes its own name for <see cref="ReturnType"/>.
    /// </summary>
    [JsonPropertyName("returnsReceiver")]
    public bool ReturnsReceiver { get; init; }

    /// <summary>
    /// How failures surface: <c>returned</c> (the trailing <c>error</c> result), <c>deferred</c>
    /// (fluent handle returns; check <c>Err()</c> on the result) or <c>none</c>.
    /// </summary>
    [JsonPropertyName("errorModel")]
    public required string ErrorModel { get; init; }

    [JsonPropertyName("returnsBuilder")]
    public bool ReturnsBuilder { get; init; }

    [JsonPropertyName("targetTypeId")]
    public string? TargetTypeId { get; init; }

    [JsonPropertyName("expandedTargetTypes")]
    public List<string> ExpandedTargetTypes { get; init; } = [];

    /// <summary>
    /// The Go names of the concrete types that expose this method, sorted ordinally.
    /// </summary>
    [JsonPropertyName("appliesTo")]
    public List<string> AppliesTo { get; init; } = [];
}

internal sealed class GoParameterModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isCallback")]
    public bool IsCallback { get; init; }

    [JsonPropertyName("callbackSignature")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CallbackSignature { get; init; }

    /// <summary>
    /// For union parameters, the Go types the value may take. The parameter itself is <c>any</c>.
    /// </summary>
    [JsonPropertyName("allowedTypes")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public List<string>? AllowedTypes { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }
}

/// <summary>
/// The trailing variadic <c>options ...*T</c> parameter that carries optional values.
/// </summary>
internal sealed class GoOptionsModel
{
    /// <summary>
    /// The Go struct passed through the variadic parameter.
    /// </summary>
    [JsonPropertyName("typeName")]
    public required string TypeName { get; init; }

    /// <summary>
    /// True when <see cref="TypeName"/> is an existing DTO passed directly; its fields are
    /// documented on the DTO and <see cref="Fields"/> is empty.
    /// </summary>
    [JsonPropertyName("isDirect")]
    public bool IsDirect { get; init; }

    [JsonPropertyName("fields")]
    public List<GoOptionFieldModel> Fields { get; init; } = [];
}

internal sealed class GoOptionFieldModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    /// <summary>
    /// The JSON tag name. Absent for callbacks and cancellation tokens, which are tagged <c>json:"-"</c>.
    /// </summary>
    [JsonPropertyName("jsonName")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? JsonName { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isCallback")]
    public bool IsCallback { get; init; }

    [JsonPropertyName("callbackSignature")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? CallbackSignature { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }
}

internal sealed class GoHandleTypeModel
{
    /// <summary>
    /// The Go interface name, for example <c>RedisResource</c>.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("kind")]
    public string Kind => "handle";

    [JsonPropertyName("isInterface")]
    public bool IsInterface { get; init; }

    /// <summary>
    /// True for interface-metadata types that carry no methods of their own in Go; their methods
    /// are declared on each concrete type that implements them.
    /// </summary>
    [JsonPropertyName("isMarker")]
    public bool IsMarker { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }

    [JsonPropertyName("remarks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Remarks { get; init; }

    /// <summary>
    /// The Go interfaces this type implements. Go has no inheritance, so a CLR interface or base class
    /// the Go SDK does not expose (<c>IDisposable</c>, an unexported base type) is not listed.
    /// </summary>
    [JsonPropertyName("implementedInterfaces")]
    public List<string> ImplementedInterfaces { get; init; } = [];

    /// <summary>
    /// Capabilities that target this handle type directly. Methods that reach this type through an
    /// interface are listed on the function's <see cref="GoFunctionModel.AppliesTo"/> instead.
    /// </summary>
    [JsonPropertyName("capabilities")]
    public List<GoFunctionModel> Capabilities { get; init; } = [];

    /// <summary>
    /// Hand-authored members the Go SDK adds on top of the generated capabilities.
    /// </summary>
    [JsonPropertyName("synthesizedMembers")]
    public List<GoSynthesizedMemberModel> SynthesizedMembers { get; init; } = [];
}

internal sealed class GoSynthesizedMemberModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("signature")]
    public required string Signature { get; init; }

    [JsonPropertyName("description")]
    public required string Description { get; init; }
}

internal sealed class GoDtoTypeModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("kind")]
    public string Kind => "dto";

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }

    [JsonPropertyName("remarks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Remarks { get; init; }

    [JsonPropertyName("fields")]
    public List<GoDtoFieldModel> Fields { get; init; } = [];
}

internal sealed class GoDtoFieldModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("jsonName")]
    public required string JsonName { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    [JsonPropertyName("isOptional")]
    public bool IsOptional { get; init; }

    [JsonPropertyName("isCallback")]
    public bool IsCallback { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }
}

internal sealed class GoEnumTypeModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("kind")]
    public string Kind => "enum";

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }

    [JsonPropertyName("remarks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Remarks { get; init; }

    [JsonPropertyName("members")]
    public List<GoEnumMemberModel> Members { get; init; } = [];
}

internal sealed class GoEnumMemberModel
{
    /// <summary>
    /// The Go constant name, for example <c>ContainerLifetimePersistent</c>.
    /// </summary>
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    /// <summary>
    /// The string value the constant holds on the wire.
    /// </summary>
    [JsonPropertyName("value")]
    public required string Value { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }

    [JsonPropertyName("remarks")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Remarks { get; init; }
}

/// <summary>
/// A package-level Go variable that groups related constants, such as <c>WellKnownPipelineSteps</c>.
/// </summary>
internal sealed class GoExportedValueModel
{
    [JsonPropertyName("name")]
    public required string Name { get; init; }

    [JsonPropertyName("fullName")]
    public required string FullName { get; init; }

    [JsonPropertyName("kind")]
    public string Kind => "exportedValue";

    [JsonPropertyName("values")]
    public List<GoExportedValueEntryModel> Values { get; init; } = [];
}

internal sealed class GoExportedValueEntryModel
{
    /// <summary>
    /// The dotted field path below the group, for example <c>Publish</c>.
    /// </summary>
    [JsonPropertyName("path")]
    public required string Path { get; init; }

    [JsonPropertyName("type")]
    public required string Type { get; init; }

    /// <summary>
    /// The value rendered as a Go literal. Values with no scalar Go literal render as JSON text.
    /// </summary>
    [JsonPropertyName("value")]
    public required string Value { get; init; }

    [JsonPropertyName("description")]
    [JsonIgnore(Condition = JsonIgnoreCondition.WhenWritingNull)]
    public string? Description { get; init; }
}
