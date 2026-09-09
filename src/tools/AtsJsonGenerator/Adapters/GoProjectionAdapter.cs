using System.Text;

namespace AtsJsonGenerator.Helpers;

internal sealed class GoProjectionAdapter : ProjectionAdapterBase
{
    private const string SourceFile = "aspire.go";
    private static readonly HashSet<string> s_keywords = new(StringComparer.Ordinal)
    {
        "break", "default", "func", "interface", "select", "case", "defer", "go",
        "map", "struct", "chan", "else", "goto", "package", "switch", "const",
        "fallthrough", "if", "range", "type", "continue", "for", "import", "return", "var",
    };

    private readonly Dictionary<string, string> _handleNames = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _dtoNames = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _enumNames = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _optionsNames = new(StringComparer.Ordinal);

    public GoProjectionAdapter(AtsDumpRoot dump)
        : base(dump)
    {
        var allocator = new IdentifierAllocator(comparer: StringComparer.OrdinalIgnoreCase);
        foreach (var handle in dump.HandleTypes
            .OrderBy(handle => handle.IsInterface ? 0 : 1)
            .ThenBy(handle => handle.AtsTypeId, StringComparer.Ordinal))
        {
            var raw = TypeName(handle.AtsTypeId);
            var preferred = handle.IsInterface && raw.Length > 1 && raw[0] == 'I' && char.IsUpper(raw[1])
                ? raw[1..]
                : raw;
            _handleNames[handle.AtsTypeId] = allocator.Reserve(SanitizeIdentifier(preferred, s_keywords));
        }

        foreach (var dto in dump.DtoTypes.OrderBy(dto => dto.TypeId, StringComparer.Ordinal))
        {
            _dtoNames[dto.TypeId] = allocator.Reserve(SanitizeIdentifier(dto.Name, s_keywords));
        }

        foreach (var enumType in dump.EnumTypes.OrderBy(enumType => enumType.TypeId, StringComparer.Ordinal))
        {
            _enumNames[enumType.TypeId] = allocator.Reserve(SanitizeIdentifier(enumType.Name, s_keywords));
        }

        foreach (var capability in dump.Capabilities.OrderBy(SourceIdentity, StringComparer.Ordinal))
        {
            var optional = VisibleParameters(capability)
                .Where(parameter => parameter.IsOptional || IsCancellationToken(parameter.Type))
                .ToList();
            if (optional.Count == 0 || IsDirectOptionsParameter(optional))
            {
                continue;
            }

            var preferred = $"{ToPascalCase(capability.MethodName.Split('.').Last())}Options";
            var qualifier = capability.TargetTypeId is not null
                ? GetHandleName(capability.TargetTypeId)
                : null;
            _optionsNames[capability.CapabilityId] = allocator.Reserve(preferred, qualifier);
        }
    }

    public override string Language => "go";

    public override AppHostProjectionModel ProjectCapability(AtsDumpCapability capability)
    {
        if (HasCallbackDefault(capability))
        {
            return Unsupported("Callback defaults cannot be represented faithfully.", SourceFile);
        }

        var required = VisibleParameters(capability)
            .Where(parameter => !parameter.IsOptional && !IsCancellationToken(parameter.Type))
            .ToList();
        var optional = VisibleParameters(capability)
            .Where(parameter => parameter.IsOptional || IsCancellationToken(parameter.Type))
            .ToList();
        var projected = new List<AppHostParameterModel>();
        var parameterParts = new List<string>();

        foreach (var parameter in required)
        {
            var name = SanitizeIdentifier(ToCamelCase(parameter.Name), s_keywords);
            var type = parameter.IsCallback ? MapCallback(parameter) : MapType(parameter.Type, TypePosition.Input);
            parameterParts.Add($"{name} {type}");
            projected.Add(Parameter(capability, parameter, name, type, optional: false, defaultValue: null,
                callbackSignature: parameter.IsCallback ? type : null));
        }

        string? optionsDeclaration = null;
        if (optional.Count > 0)
        {
            var directOptions = IsDirectOptionsParameter(optional) ? optional[0] : null;
            var optionsType = directOptions is not null
                ? MapDirectOptionsType(directOptions)
                : _optionsNames.GetValueOrDefault(
                    capability.CapabilityId,
                    $"{ToPascalCase(capability.MethodName.Split('.').Last())}Options");
            parameterParts.Add($"options ...*{optionsType}");
            projected.Add(new AppHostParameterModel
            {
                Name = "options",
                Type = $"...*{optionsType}",
                IsOptional = true,
            });

            if (directOptions is null)
            {
                var fields = optional.Select(parameter =>
                {
                    var type = parameter.IsCallback
                        ? MapCallback(parameter)
                        : IsCancellationToken(parameter.Type)
                            ? "*CancellationToken"
                            : MapType(parameter.Type, TypePosition.Input, optional: true);
                    var jsonTag = parameter.IsCallback || IsCancellationToken(parameter.Type)
                        ? "`json:\"-\"`"
                        : $"`json:\"{parameter.Name},omitempty\"`";
                    return $"\t{ToPascalCase(parameter.Name)} {type} {jsonTag}";
                });
                optionsDeclaration = $"type {optionsType} struct {{\n{string.Join("\n", fields)}\n}}";
            }
        }

        var identifier = ToPascalCase(capability.MethodName.Split('.').Last());
        var returnType = RenderReturn(capability);
        var signature = $"{identifier}({string.Join(", ", parameterParts)}){(string.IsNullOrEmpty(returnType) ? "" : " " + returnType)}";
        var declaration = optionsDeclaration is null
            ? signature
            : $"{optionsDeclaration}\n\n{signature}";
        var hasUnion = VisibleParameters(capability).Any(parameter => IsUnion(parameter.Type));

        return new AppHostProjectionModel
        {
            Status = "supported",
            Reason = hasUnion ? "Union inputs are projected as any and validated at runtime." : null,
            Identifier = identifier,
            Signature = signature,
            Declaration = declaration,
            SourceFile = SourceFile,
            Parameters = projected,
            Return = new AppHostReturnModel
            {
                Type = returnType,
                ErrorModel = IsHandle(capability.ReturnType) ? "deferred" : "result",
            },
        };
    }

    public override AppHostProjectionModel ProjectHandle(AtsDumpHandleType handle)
    {
        var name = GetHandleName(handle.AtsTypeId);
        var inherited = handle.ImplementedInterfaces.Select(type => GetHandleName(type.TypeId)).ToList();
        var members = inherited.Select(type => $"\t{type}").Append("\tErr() error");
        return new AppHostProjectionModel
        {
            Status = "supported",
            Reason = "Fluent failures use first-error-wins deferred Err().",
            Identifier = name,
            Declaration = $"type {name} interface {{\n{string.Join("\n", members)}\n}}",
            SourceFile = SourceFile,
            Kind = "interface",
            ImplementedInterfaces = inherited,
        };
    }

    public override AppHostProjectionModel ProjectDto(AtsDumpDtoType dto)
    {
        var identifier = GetDtoName(dto.TypeId);
        var fields = dto.Properties.Select(property =>
        {
            var type = property.IsCallback
                ? MapCallback(property.CallbackParameters, property.CallbackReturnType)
                : MapType(property.Type, TypePosition.Dto, property.IsOptional);
            return Field(property, ToPascalCase(property.Name), type, property.IsOptional);
        }).ToList();
        var body = string.Join("\n", fields.Select(field => $"\t{field.Name} {field.Type} `json:\"{FindOriginalProperty(dto, field.Name)},omitempty\"`"));
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = $"type {identifier} struct {{\n{body}\n}}",
            SourceFile = SourceFile,
            Kind = "class",
            Fields = fields,
        };
    }

    public override AppHostProjectionModel ProjectEnum(AtsDumpEnumType enumType)
    {
        var identifier = GetEnumName(enumType.TypeId);
        var members = Members(enumType, name => identifier + ToPascalCase(name), name => name);
        var constants = string.Join("\n", members.Select(member =>
            $"\t{member.Name} {identifier} = \"{member.Value}\""));
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = $"type {identifier} string\n\nconst (\n{constants}\n)",
            SourceFile = SourceFile,
            Kind = "class",
            Members = members,
        };
    }

    public override AppHostProjectionModel ProjectExportedValue(AtsDumpExportedValue exportedValue)
    {
        var root = exportedValue.PathSegments.FirstOrDefault() ?? "Values";
        var identifier = string.Join(".", exportedValue.PathSegments);
        var leaf = exportedValue.PathSegments.LastOrDefault() ?? "Value";
        var type = MapType(exportedValue.Type, TypePosition.ExportedValue);
        var expression = RenderGoExportedValue(exportedValue.Value, exportedValue.Type);
        var declaration = $"var {root} = struct {{ {leaf} {type} }}{{ {leaf}: {expression} }}";

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = declaration,
            SourceFile = SourceFile,
            ValueExpression = expression,
            Return = new AppHostReturnModel { Type = type, ErrorModel = "none" },
        };
    }

    protected override string MapType(AtsDumpTypeRef? type, TypePosition position, bool optional = false)
    {
        if (type is null)
        {
            return "any";
        }

        var category = type.Category.ToLowerInvariant();
        var mapped = category switch
        {
            "primitive" => MapPrimitive(type.TypeId),
            "enum" => GetEnumName(type.TypeId),
            "handle" or "type" => GetHandleName(type.TypeId),
            "dto" => "*" + GetDtoName(type.TypeId),
            "callback" => "func(...any) any",
            "array" => $"[]{MapType(type.ElementType, position)}",
            "list" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"[]{MapType(type.ElementType, position)}"
                : $"*List[{MapType(type.ElementType, position)}]",
            "dict" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"map[{MapType(type.KeyType, position)}]{MapType(type.ValueType, position)}"
                : $"*Dict[{MapType(type.KeyType, position)}, {MapType(type.ValueType, position)}]",
            "union" => "any",
            _ => "any",
        };

        if ((optional || type.IsNullable == true) && !IsNilable(mapped))
        {
            mapped = "*" + mapped;
        }

        return mapped;
    }

    protected override string MapCallback(
        IReadOnlyList<AtsDumpCallbackParam>? parameters,
        AtsDumpTypeRef? returnType)
    {
        if (parameters is null)
        {
            return "func(...any) any";
        }

        var args = string.Join(", ", parameters.Select(parameter =>
            $"{SanitizeIdentifier(ToCamelCase(parameter.Name), s_keywords)} {MapType(parameter.Type, TypePosition.Input)}"));
        var result = IsVoid(returnType) ? "" : " " + MapType(returnType, TypePosition.Return);
        return $"func({args}){result}";
    }

    private string RenderReturn(AtsDumpCapability capability)
    {
        if (IsVoid(capability.ReturnType))
        {
            return "error";
        }

        var type = MapType(capability.ReturnType, TypePosition.Return);
        return IsHandle(capability.ReturnType) ? type : $"({type}, error)";
    }

    private string GetHandleName(string typeId)
        => _handleNames.GetValueOrDefault(typeId, TypeName(typeId));

    private string GetDtoName(string typeId)
        => _dtoNames.GetValueOrDefault(typeId, TypeName(typeId));

    private string GetEnumName(string typeId)
        => _enumNames.GetValueOrDefault(typeId, TypeName(typeId.Replace("enum:", "", StringComparison.Ordinal)));

    private static bool IsNilable(string type)
        => type.StartsWith('*') || type.StartsWith("[]", StringComparison.Ordinal)
            || type.StartsWith("map[", StringComparison.Ordinal)
            || type.StartsWith("func(", StringComparison.Ordinal)
            || type == "any";

    private static string MapPrimitive(string typeId) => typeId switch
    {
        "string" or "char" or "Guid" or "Uri" or "DateTime" or "DateTimeOffset" or "DateOnly" or "TimeOnly" => "string",
        "number" or "TimeSpan" => "float64",
        "boolean" or "bool" => "bool",
        "void" => "",
        "any" => "any",
        "CancellationToken" => "*CancellationToken",
        _ => "any",
    };

    private static bool IsDirectOptionsParameter(IReadOnlyList<AtsDumpParameter> optional)
        => optional.Count == 1 &&
            string.Equals(optional[0].Name, "options", StringComparison.OrdinalIgnoreCase) &&
            IsOptionsDto(optional[0]);

    private string MapDirectOptionsType(AtsDumpParameter parameter)
    {
        var type = parameter.Type ??
            throw new InvalidOperationException("A direct options parameter must have a type.");
        return IsDto(type)
            ? MapType(type, TypePosition.Input).TrimStart('*')
            : TypeName(type.TypeId);
    }

    private static string FindOriginalProperty(AtsDumpDtoType dto, string projectedName)
        => dto.Properties.First(property => ToPascalCase(property.Name) == projectedName).Name;

    private string RenderGoExportedValue(System.Text.Json.JsonElement? value, AtsDumpTypeRef? type)
    {
        if (value is null || value.Value.ValueKind is System.Text.Json.JsonValueKind.Null or System.Text.Json.JsonValueKind.Undefined)
        {
            return "nil";
        }

        var element = value.Value;
        if (type is null)
        {
            return element.GetRawText();
        }

        return type.Category.ToLowerInvariant() switch
        {
            "primitive" => element.ValueKind == System.Text.Json.JsonValueKind.String
                ? QuoteString(element.GetString() ?? "")
                : element.GetRawText(),
            "enum" => $"{GetEnumName(type.TypeId)}({QuoteString(element.GetString() ?? "")})",
            "dto" when element.ValueKind == System.Text.Json.JsonValueKind.Object && Dtos.TryGetValue(type.TypeId, out var dto)
                => $"&{GetDtoName(type.TypeId)}{{{string.Join(", ", dto.Properties.Where(property => element.TryGetProperty(property.Name, out _)).Select(property => $"{ToPascalCase(property.Name)}: {RenderGoExportedValue(element.GetProperty(property.Name), property.Type)}"))}}}",
            "array" or "list" when element.ValueKind == System.Text.Json.JsonValueKind.Array
                => $"[]{MapType(type.ElementType, TypePosition.ExportedValue)}{{{string.Join(", ", element.EnumerateArray().Select(item => RenderGoExportedValue(item, type.ElementType)))}}}",
            "dict" when element.ValueKind == System.Text.Json.JsonValueKind.Object
                => $"map[{MapType(type.KeyType, TypePosition.ExportedValue)}]{MapType(type.ValueType, TypePosition.ExportedValue)}{{{string.Join(", ", element.EnumerateObject().Select(property => $"{QuoteString(property.Name)}: {RenderGoExportedValue(property.Value, type.ValueType)}"))}}}",
            _ => element.GetRawText(),
        };
    }
}
