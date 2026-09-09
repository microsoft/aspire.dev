namespace AtsJsonGenerator.Helpers;

internal sealed class RustProjectionAdapter : ProjectionAdapterBase
{
    private const string SourceFile = "lib.rs";
    private static readonly HashSet<string> s_keywords = new(StringComparer.Ordinal)
    {
        "as", "break", "const", "continue", "crate", "else", "enum", "extern",
        "false", "fn", "for", "if", "impl", "in", "let", "loop", "match",
        "mod", "move", "mut", "pub", "ref", "return", "self", "Self", "static",
        "struct", "super", "trait", "true", "type", "unsafe", "use", "where", "while",
        "async", "await", "dyn",
    };

    public RustProjectionAdapter(AtsDumpRoot dump)
        : base(dump)
    {
    }

    public override string Language => "rust";

    public override AppHostProjectionModel ProjectCapability(AtsDumpCapability capability)
    {
        if (HasCallbackDefault(capability))
        {
            return Unsupported("Callback defaults cannot be represented faithfully.", SourceFile);
        }

        var projected = new List<AppHostParameterModel>();
        var parts = new List<string>();
        if (capability.TargetTypeId is not null)
        {
            parts.Add("&self");
        }

        foreach (var parameter in VisibleParameters(capability))
        {
            var name = SanitizeIdentifier(ToSnakeCase(parameter.Name), s_keywords);
            var optional = parameter.IsOptional || IsCancellationToken(parameter.Type);
            string type;
            if (parameter.IsCallback)
            {
                type = MapCallback(parameter);
            }
            else if (IsCancellationToken(parameter.Type))
            {
                type = "Option<&CancellationToken>";
            }
            else if (IsHandle(parameter.Type))
            {
                var handle = TypeName(parameter.Type!.TypeId);
                type = optional ? $"Option<&{handle}>" : $"&{handle}";
            }
            else
            {
                type = MapType(parameter.Type, TypePosition.Input, optional);
            }

            parts.Add($"{name}: {type}");
            projected.Add(Parameter(
                capability,
                parameter,
                name,
                type,
                optional,
                defaultValue: optional ? "None" : null,
                callbackSignature: parameter.IsCallback ? type : null));
        }

        var identifier = SanitizeIdentifier(ToSnakeCase(capability.MethodName.Split('.').Last()), s_keywords);
        var innerReturn = IsVoid(capability.ReturnType)
            ? "()"
            : MapType(capability.ReturnType, TypePosition.Return);
        var returnType = $"Result<{innerReturn}, Box<dyn std::error::Error>>";
        var signature = $"pub fn {identifier}({string.Join(", ", parts)}) -> {returnType}";
        var limitations = new List<string>();
        if (VisibleParameters(capability).Any(parameter => IsUnion(parameter.Type)))
        {
            limitations.Add("Union values are represented as serde_json::Value.");
        }
        if (capability.CapabilityId == "Aspire.Hosting/addExecutable")
        {
            limitations.Add(
                "Runtime invocation with executable arguments can fail because the ATS server cannot deserialize the String[] argument contract.");
        }

        return new AppHostProjectionModel
        {
            Status = "supported",
            Reason = limitations.Count > 0 ? string.Join(" ", limitations) : null,
            Identifier = identifier,
            Signature = signature,
            Declaration = signature + " { ... }",
            SourceFile = SourceFile,
            Parameters = projected,
            Return = new AppHostReturnModel { Type = returnType, ErrorModel = "result" },
        };
    }

    public override AppHostProjectionModel ProjectHandle(AtsDumpHandleType handle)
    {
        var identifier = TypeName(handle.AtsTypeId);
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = $"pub struct {identifier} {{ handle: Handle, client: Arc<AspireClient> }}",
            SourceFile = SourceFile,
            Kind = "class",
            ImplementedInterfaces = handle.ImplementedInterfaces.Select(type => TypeName(type.TypeId)).ToList(),
        };
    }

    public override AppHostProjectionModel ProjectDto(AtsDumpDtoType dto)
    {
        var fields = dto.Properties.Select(property =>
        {
            var type = property.IsCallback
                ? "Value"
                : MapType(property.Type, TypePosition.Dto, property.IsOptional);
            return Field(
                property,
                SanitizeIdentifier(ToSnakeCase(property.Name), s_keywords),
                type,
                property.IsOptional);
        }).ToList();
        var body = string.Join("\n", fields.Select(field => $"    pub {field.Name}: {field.Type},"));

        return new AppHostProjectionModel
        {
            Status = "supported",
            Reason = dto.Properties.Any(property => property.IsCallback)
                ? "DTO callback fields are represented as serde_json::Value because closures are not serde-serializable."
                : null,
            Identifier = dto.Name,
            Declaration = $"#[derive(Debug, Clone, Serialize, Deserialize)]\npub struct {dto.Name} {{\n{body}\n}}",
            SourceFile = SourceFile,
            Kind = "class",
            Fields = fields,
        };
    }

    public override AppHostProjectionModel ProjectEnum(AtsDumpEnumType enumType)
    {
        var members = Members(enumType, ToPascalCase, name => name);
        var body = string.Join("\n", members.Select((member, index) =>
            $"{(index == 0 ? "    #[default]\n" : "")}    #[serde(rename = \"{member.Value}\")]\n    {member.Name},"));
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = enumType.Name,
            Declaration = $"#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]\npub enum {enumType.Name} {{\n{body}\n}}",
            SourceFile = SourceFile,
            Kind = "class",
            Members = members,
        };
    }

    public override AppHostProjectionModel ProjectExportedValue(AtsDumpExportedValue exportedValue)
    {
        var modules = exportedValue.PathSegments.Take(Math.Max(0, exportedValue.PathSegments.Count - 1))
            .Select(segment => SanitizeIdentifier(ToSnakeCase(segment), s_keywords))
            .ToList();
        var identifier = SanitizeIdentifier(
            ToSnakeCase(exportedValue.PathSegments.LastOrDefault() ?? "value"),
            s_keywords);
        var type = MapType(exportedValue.Type, TypePosition.ExportedValue);
        var expression = RenderJsonValue(
            exportedValue.Value,
            exportedValue.Type,
            property => QuoteString(property),
            "null",
            "true",
            "false",
            value => QuoteString(value));
        var declaration = $"pub fn {identifier}() -> {type} {{ serde_json::from_value(json!({expression})).expect(\"generated exported value should deserialize\") }}";
        for (var index = modules.Count - 1; index >= 0; index--)
        {
            declaration = $"pub mod {modules[index]} {{ {declaration} }}";
        }

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = string.Join("::", modules.Append(identifier)),
            Declaration = declaration,
            SourceFile = SourceFile,
            ValueExpression = $"json!({expression})",
            Return = new AppHostReturnModel { Type = type, ErrorModel = "none" },
        };
    }

    protected override string MapType(AtsDumpTypeRef? type, TypePosition position, bool optional = false)
    {
        if (type is null)
        {
            return "Value";
        }

        var category = type.Category.ToLowerInvariant();
        var mapped = category switch
        {
            "primitive" => MapPrimitive(type.TypeId, position),
            "enum" or "handle" or "type" or "dto" => TypeName(type.TypeId.Replace("enum:", "", StringComparison.Ordinal)),
            "callback" => position == TypePosition.Dto
                ? "Value"
                : "Box<dyn Fn(Vec<Value>) -> Value + Send + Sync>",
            "array" => $"Vec<{MapType(type.ElementType, position)}>",
            "list" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"Vec<{MapType(type.ElementType, position)}>"
                : $"AspireList<{MapType(type.ElementType, position)}>",
            "dict" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"HashMap<{MapType(type.KeyType, position)}, {MapType(type.ValueType, position)}>"
                : $"AspireDict<{MapType(type.KeyType, position)}, {MapType(type.ValueType, position)}>",
            "union" => "Value",
            _ => "Value",
        };

        if ((optional || type.IsNullable == true) &&
            !mapped.StartsWith("Option<", StringComparison.Ordinal))
        {
            mapped = $"Option<{mapped}>";
        }
        return mapped;
    }

    protected override string MapCallback(
        IReadOnlyList<AtsDumpCallbackParam>? parameters,
        AtsDumpTypeRef? returnType)
        => "impl Fn(Vec<Value>) -> Value + Send + Sync + 'static";

    private static string MapPrimitive(string typeId, TypePosition position) => typeId switch
    {
        "string" or "char" or "Guid" or "Uri" or "DateTime" or "DateTimeOffset" or "DateOnly" or "TimeOnly"
            => position == TypePosition.Input ? "&str" : "String",
        "number" or "TimeSpan" => "f64",
        "boolean" or "bool" => "bool",
        "void" => "()",
        "any" => position == TypePosition.Input ? "&Value" : "Value",
        "CancellationToken" => position == TypePosition.Input ? "&CancellationToken" : "CancellationToken",
        _ => "Value",
    };
}
