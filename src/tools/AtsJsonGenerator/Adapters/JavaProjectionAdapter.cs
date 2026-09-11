namespace AtsJsonGenerator.Helpers;

internal sealed class JavaProjectionAdapter : ProjectionAdapterBase
{
    private const string SourceFile = "Aspire.java";
    private static readonly HashSet<string> s_keywords = new(StringComparer.Ordinal)
    {
        "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char",
        "class", "const", "continue", "default", "do", "double", "else", "enum",
        "extends", "final", "finally", "float", "for", "goto", "if", "implements",
        "import", "instanceof", "int", "interface", "long", "native", "new", "package",
        "private", "protected", "public", "return", "short", "static", "strictfp",
        "super", "switch", "synchronized", "this", "throw", "throws", "transient",
        "try", "void", "volatile", "while",
    };

    private readonly Dictionary<string, string> _optionsNames = new(StringComparer.Ordinal);

    public JavaProjectionAdapter(AtsDumpRoot dump)
        : base(dump)
    {
        var usedNames = new HashSet<string>(
            dump.DtoTypes.Select(dto => dto.Name)
                .Concat(dump.EnumTypes.Select(enumType => enumType.Name))
                .Concat(dump.HandleTypes.Select(handle => TypeName(handle.AtsTypeId))),
            StringComparer.Ordinal);
        foreach (var capability in dump.Capabilities.OrderBy(SourceIdentity, StringComparer.Ordinal))
        {
            var optional = VisibleParameters(capability)
                .Where(parameter => parameter.IsOptional || parameter.IsNullable)
                .ToList();
            if (optional.Count > 1)
            {
                var methodName = ToPascalCase(capability.MethodName.Split('.').Last());
                var suffix = 0;
                string optionsName;
                do
                {
                    optionsName = $"{methodName}{(suffix == 0 ? "" : suffix)}Options";
                    suffix++;
                }
                while (!usedNames.Add(optionsName));
                _optionsNames[capability.CapabilityId] = optionsName;
            }
        }
    }

    public override string Language => "java";

    public override AppHostProjectionModel ProjectCapability(AtsDumpCapability capability)
    {
        if (HasCallbackDefault(capability))
        {
            return Unsupported("Callback defaults cannot be represented faithfully.", SourceFile);
        }

        var required = VisibleParameters(capability)
            .Where(parameter => !parameter.IsOptional && !parameter.IsNullable)
            .ToList();
        var optional = VisibleParameters(capability)
            .Where(parameter => parameter.IsOptional || parameter.IsNullable)
            .ToList();
        var identifier = SanitizeIdentifier(ToCamelCase(capability.MethodName.Split('.').Last()), s_keywords);
        var returnType = capability.ReturnsBuilder && capability.ReturnType is not null
            ? TypeName(capability.ReturnType.TypeId)
            : IsVoid(capability.ReturnType)
                ? "void"
                : MapType(capability.ReturnType, TypePosition.Return);
        var projected = new List<AppHostParameterModel>();
        var parameterParts = new List<string>();

        foreach (var parameter in required)
        {
            var name = SanitizeIdentifier(ToCamelCase(parameter.Name), s_keywords);
            var type = parameter.IsCallback ? MapCallback(parameter) : MapType(parameter.Type, TypePosition.Input);
            parameterParts.Add($"{type} {name}");
            projected.Add(Parameter(capability, parameter, name, type, optional: false, defaultValue: null,
                callbackSignature: parameter.IsCallback ? type : null));
        }

        string? optionsDeclaration = null;
        var overloads = new List<string>();
        if (optional.Count > 1)
        {
            var optionsName = _optionsNames.GetValueOrDefault(
                capability.CapabilityId,
                $"{ToPascalCase(capability.MethodName.Split('.').Last())}Options");
            parameterParts.Add($"{optionsName} options");
            projected.Add(new AppHostParameterModel { Name = "options", Type = optionsName, IsOptional = true });
            var fields = optional.Select(parameter =>
            {
                var name = SanitizeIdentifier(ToCamelCase(parameter.Name), s_keywords);
                var type = parameter.IsCallback
                    ? MapCallback(parameter)
                    : MapType(parameter.Type, TypePosition.Input, optional: true);
                return $"    private {type} {name};";
            });
            optionsDeclaration = $"final class {optionsName} {{\n{string.Join("\n", fields)}\n}}";
            overloads.Add($"public {returnType} {identifier}({string.Join(", ", parameterParts.Take(parameterParts.Count - 1))})");
        }
        else if (optional.Count == 1)
        {
            var parameter = optional[0];
            var name = SanitizeIdentifier(ToCamelCase(parameter.Name), s_keywords);
            var type = parameter.IsCallback
                ? MapCallback(parameter)
                : MapType(parameter.Type, TypePosition.Input, optional: true);
            parameterParts.Add($"{type} {name}");
            projected.Add(Parameter(capability, parameter, name, type, optional: true, defaultValue: null,
                callbackSignature: parameter.IsCallback ? type : null));
            overloads.Add($"public {returnType} {identifier}({string.Join(", ", parameterParts.Take(parameterParts.Count - 1))})");
        }

        overloads.AddRange(BuildUnionOverloads(identifier, returnType, required, optional.Count > 1 ? _optionsNames[capability.CapabilityId] : null));
        var signature = $"public {returnType} {identifier}({string.Join(", ", parameterParts)})";
        var declarations = new List<string>();
        if (optionsDeclaration is not null)
        {
            declarations.Add(optionsDeclaration);
        }
        declarations.Add(signature + " { ... }");
        declarations.AddRange(overloads.Distinct(StringComparer.Ordinal).Select(overload => overload + " { ... }"));
        var callbackFallback = VisibleParameters(capability).Any(parameter =>
            parameter.IsCallback && (parameter.CallbackParameters?.Count ?? 0) > 4);
        var unionFallback = VisibleParameters(capability).Any(parameter => IsUnion(parameter.Type));

        return new AppHostProjectionModel
        {
            Status = "supported",
            Reason = callbackFallback
                ? "Callbacks with more than four parameters use Function<Object[], Object>."
                : unionFallback
                    ? "Union inputs use AspireUnion plus generated concrete overloads."
                    : null,
            Identifier = identifier,
            Signature = signature,
            Declaration = string.Join("\n\n", declarations),
            SourceFile = SourceFile,
            Parameters = projected,
            Return = new AppHostReturnModel { Type = returnType, ErrorModel = "exception" },
        };
    }

    public override AppHostProjectionModel ProjectHandle(AtsDumpHandleType handle)
    {
        var identifier = TypeName(handle.AtsTypeId);
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = $"final class {identifier} extends Handle {{ }}",
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
                ? MapCallback(property.CallbackParameters, property.CallbackReturnType)
                : MapType(property.Type, TypePosition.Dto, property.IsOptional);
            return Field(property, SanitizeIdentifier(ToCamelCase(property.Name), s_keywords), type, property.IsOptional);
        }).ToList();
        var declarations = string.Join("\n", fields.Select(field => $"    private {field.Type} {field.Name};"));
        return new AppHostProjectionModel
        {
            Status = "supported",
            Reason = dto.Properties.Any(property => property.IsCallback && (property.CallbackParameters?.Count ?? 0) > 4)
                ? "Callbacks with more than four parameters use Function<Object[], Object>."
                : null,
            Identifier = dto.Name,
            Declaration = $"class {dto.Name} implements JsonSerializable {{\n{declarations}\n}}",
            SourceFile = SourceFile,
            Kind = "class",
            Fields = fields,
        };
    }

    public override AppHostProjectionModel ProjectEnum(AtsDumpEnumType enumType)
    {
        var members = Members(enumType, ToUpperSnakeCase, name => name);
        var body = string.Join(",\n", members.Select(member => $"    {member.Name}(\"{member.Value}\")"));
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = enumType.Name,
            Declaration = $"enum {enumType.Name} implements WireValueEnum {{\n{body};\n}}",
            SourceFile = SourceFile,
            Kind = "class",
            Members = members,
        };
    }

    public override AppHostProjectionModel ProjectExportedValue(AtsDumpExportedValue exportedValue)
    {
        var root = exportedValue.PathSegments.FirstOrDefault() ?? "Values";
        var leaf = exportedValue.PathSegments.LastOrDefault() ?? "VALUE";
        var identifier = string.Join(".", exportedValue.PathSegments);
        var type = MapType(exportedValue.Type, TypePosition.ExportedValue, optional: true);
        var expression = RenderJavaExportedValue(exportedValue.Value, exportedValue.Type);
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = $"final class {root} {{ public static final {type} {leaf} = {expression}; }}",
            SourceFile = SourceFile,
            ValueExpression = expression,
            Return = new AppHostReturnModel { Type = type, ErrorModel = "none" },
        };
    }

    protected override string MapType(AtsDumpTypeRef? type, TypePosition position, bool optional = false)
    {
        if (type is null)
        {
            return "Object";
        }

        var boxed = optional || position is TypePosition.Dto or TypePosition.ExportedValue || type.IsNullable == true;
        return type.Category.ToLowerInvariant() switch
        {
            "primitive" => MapPrimitive(type.TypeId, boxed),
            "enum" or "handle" or "type" or "dto" => TypeName(type.TypeId.Replace("enum:", "", StringComparison.Ordinal)),
            "callback" => "Object",
            "array" => $"{MapType(type.ElementType, position, type.ElementType?.IsNullable == true)}[]",
            "list" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"List<{MapType(type.ElementType, position, optional: true)}>"
                : $"AspireList<{MapType(type.ElementType, position, optional: true)}>",
            "dict" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"Map<{MapType(type.KeyType, position, optional: true)}, {MapType(type.ValueType, position, optional: true)}>"
                : $"AspireDict<{MapType(type.KeyType, position, optional: true)}, {MapType(type.ValueType, position, optional: true)}>",
            "union" => "AspireUnion",
            _ => "Object",
        };
    }

    protected override string MapCallback(
        IReadOnlyList<AtsDumpCallbackParam>? parameters,
        AtsDumpTypeRef? returnType)
    {
        var count = parameters?.Count ?? 0;
        if (count > 4)
        {
            return "Function<Object[], Object>";
        }

        var hasReturn = !IsVoid(returnType);
        var baseType = hasReturn ? $"AspireFunc{count}" : $"AspireAction{count}";
        var args = (parameters ?? []).Select(parameter => MapType(parameter.Type, TypePosition.Input, optional: true)).ToList();
        if (hasReturn)
        {
            args.Add(MapType(returnType, TypePosition.Return, optional: true));
        }

        return args.Count == 0 ? baseType : $"{baseType}<{string.Join(", ", args)}>";
    }

    private IEnumerable<string> BuildUnionOverloads(
        string methodName,
        string returnType,
        IReadOnlyList<AtsDumpParameter> required,
        string? optionsType)
    {
        var union = required.FirstOrDefault(parameter => IsUnion(parameter.Type));
        if (union?.Type?.UnionTypes is not { Count: > 0 } members)
        {
            return [];
        }

        return members.Select(member =>
        {
            var parts = required.Select(parameter =>
            {
                var name = SanitizeIdentifier(ToCamelCase(parameter.Name), s_keywords);
                var type = ReferenceEquals(parameter, union)
                    ? MapType(member, TypePosition.Input)
                    : parameter.IsCallback
                        ? MapCallback(parameter)
                        : MapType(parameter.Type, TypePosition.Input);
                return $"{type} {name}";
            }).ToList();
            if (optionsType is not null)
            {
                parts.Add($"{optionsType} options");
            }
            return $"public {returnType} {methodName}({string.Join(", ", parts)})";
        });
    }

    private static string MapPrimitive(string typeId, bool boxed) => typeId switch
    {
        "string" or "char" or "Guid" or "Uri" or "DateTime" or "DateTimeOffset" or "DateOnly" or "TimeOnly" => "String",
        "number" or "TimeSpan" => boxed ? "Number" : "double",
        "boolean" or "bool" => boxed ? "Boolean" : "boolean",
        "void" => "void",
        "any" => "Object",
        "CancellationToken" => "CancellationToken",
        _ => "Object",
    };

    private string RenderJavaExportedValue(System.Text.Json.JsonElement? value, AtsDumpTypeRef? type)
    {
        if (value is null || value.Value.ValueKind is System.Text.Json.JsonValueKind.Null or System.Text.Json.JsonValueKind.Undefined)
        {
            return "null";
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
            "enum" => $"{TypeName(type.TypeId.Replace("enum:", "", StringComparison.Ordinal))}.fromValue({QuoteString(element.GetString() ?? "")})",
            "dto" when element.ValueKind == System.Text.Json.JsonValueKind.Object && Dtos.TryGetValue(type.TypeId, out var dto)
                => $"new {dto.Name}() {{{{ {string.Join(" ", dto.Properties.Where(property => element.TryGetProperty(property.Name, out _)).Select(property => $"set{ToPascalCase(property.Name)}({RenderJavaExportedValue(element.GetProperty(property.Name), property.Type)});"))} }}}}",
            "array" when element.ValueKind == System.Text.Json.JsonValueKind.Array
                => $"new {MapType(type.ElementType, TypePosition.ExportedValue, optional: true)}[] {{ {string.Join(", ", element.EnumerateArray().Select(item => RenderJavaExportedValue(item, type.ElementType)))} }}",
            "list" when element.ValueKind == System.Text.Json.JsonValueKind.Array
                => $"new ArrayList<>(List.of({string.Join(", ", element.EnumerateArray().Select(item => RenderJavaExportedValue(item, type.ElementType)))}))",
            "dict" when element.ValueKind == System.Text.Json.JsonValueKind.Object
                => $"new HashMap<>(Map.ofEntries({string.Join(", ", element.EnumerateObject().Select(property => $"Map.entry({QuoteString(property.Name)}, {RenderJavaExportedValue(property.Value, type.ValueType)})"))}))",
            _ => element.GetRawText(),
        };
    }
}
