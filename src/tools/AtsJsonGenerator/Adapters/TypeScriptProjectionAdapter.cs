namespace AtsJsonGenerator.Helpers;

internal sealed class TypeScriptProjectionAdapter : ProjectionAdapterBase
{
    private const string SourceFile = "aspire.mts";
    private readonly Dictionary<string, string> _optionsNames = new(StringComparer.Ordinal);

    public TypeScriptProjectionAdapter(AtsDumpRoot dump)
        : base(dump)
    {
        var used = dump.DtoTypes.Select(dto => dto.Name)
            .Concat(dump.EnumTypes.Select(enumType => enumType.Name))
            .Concat(dump.HandleTypes.Select(handle => TypeName(handle.AtsTypeId)))
            .ToHashSet(StringComparer.Ordinal);

        foreach (var capability in dump.Capabilities.OrderBy(SourceIdentity, StringComparer.Ordinal))
        {
            var optional = VisibleParameters(capability)
                .Where(parameter => parameter.IsOptional || parameter.IsNullable)
                .ToList();
            if (optional.Count == 0 || TryGetDirectOptionsParameter(optional, out _))
            {
                continue;
            }

            var preferred = $"{ToPascalCase(SimpleMethodName(capability.MethodName))}Options";
            var capabilityName = capability.CapabilityId.Split('/').LastOrDefault();
            if (used.Add(preferred))
            {
                _optionsNames[capability.CapabilityId] = preferred;
                continue;
            }

            var alternate = $"{ToPascalCase(capabilityName ?? SimpleMethodName(capability.MethodName))}Options";
            if (used.Add(alternate))
            {
                _optionsNames[capability.CapabilityId] = alternate;
                continue;
            }

            for (var suffix = 1; ; suffix++)
            {
                var candidate = $"{alternate[..^"Options".Length]}{suffix}Options";
                if (used.Add(candidate))
                {
                    _optionsNames[capability.CapabilityId] = candidate;
                    break;
                }
            }
        }
    }

    public override string Language => "typescript";

    public override AppHostProjectionModel ProjectCapability(AtsDumpCapability capability)
    {
        if (HasCallbackDefault(capability))
        {
            return Unsupported("Callback defaults cannot be represented faithfully.", SourceFile);
        }

        if (VisibleParameters(capability).Any(parameter => HasEmptyUnion(parameter.Type)) ||
            HasEmptyUnion(capability.ReturnType))
        {
            return Unsupported("Union types must declare at least one member.", SourceFile);
        }

        var required = VisibleParameters(capability)
            .Where(parameter => !parameter.IsOptional && !parameter.IsNullable)
            .ToList();
        var optional = VisibleParameters(capability)
            .Where(parameter => parameter.IsOptional || parameter.IsNullable)
            .ToList();
        var projected = new List<AppHostParameterModel>();
        var signatureParts = new List<string>();

        foreach (var parameter in required)
        {
            var type = parameter.IsCallback ? MapCallback(parameter) : MapType(parameter.Type, TypePosition.Input);
            projected.Add(Parameter(capability, parameter, parameter.Name, type, optional: false, defaultValue: null,
                callbackSignature: parameter.IsCallback ? type : null));
            signatureParts.Add($"{parameter.Name}: {type}");
        }

        string? optionsDeclaration = null;
        if (optional.Count > 0)
        {
            if (TryGetDirectOptionsParameter(optional, out var directOptions))
            {
                var typeRef = directOptions!.Type ??
                    throw new InvalidOperationException("A direct options parameter must have a type.");
                var type = IsDto(typeRef)
                    ? MapType(typeRef, TypePosition.Input)
                    : TypeName(typeRef.TypeId);
                projected.Add(Parameter(capability, directOptions, directOptions.Name, type, optional: true, defaultValue: directOptions.DefaultValue));
                signatureParts.Add($"{directOptions.Name}?: {type}");

                foreach (var cancellationToken in optional.Where(parameter => IsCancellationToken(parameter.Type)))
                {
                    var cancellationType = MapType(cancellationToken.Type, TypePosition.Input);
                    projected.Add(Parameter(
                        capability,
                        cancellationToken,
                        cancellationToken.Name,
                        cancellationType,
                        optional: true,
                        defaultValue: cancellationToken.DefaultValue));
                    signatureParts.Add($"{cancellationToken.Name}?: {cancellationType}");
                }
            }
            else
            {
                var optionsName = _optionsNames.GetValueOrDefault(
                    capability.CapabilityId,
                    $"{ToPascalCase(SimpleMethodName(capability.MethodName))}Options");
                var optionFields = optional.Select(parameter =>
                {
                    var type = parameter.IsCallback ? MapCallback(parameter) : MapType(parameter.Type, TypePosition.Input);
                    return $"    {parameter.Name}?: {type};";
                });
                optionsDeclaration = $"export interface {optionsName} {{\n{string.Join("\n", optionFields)}\n}}";
                projected.Add(new AppHostParameterModel
                {
                    Name = "options",
                    Type = optionsName,
                    IsOptional = true,
                });
                signatureParts.Add($"options?: {optionsName}");
            }
        }

        var identifier = SimpleMethodName(capability.MethodName);
        var returnType = IsVoid(capability.ReturnType)
            ? "Promise<void>"
            : $"Promise<{MapType(capability.ReturnType, TypePosition.Return)}>";
        var signature = $"{identifier}({string.Join(", ", signatureParts)}): {returnType}";
        var declaration = optionsDeclaration is null
            ? signature
            : $"{optionsDeclaration}\n\n{signature}";

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Signature = signature,
            Declaration = declaration,
            SourceFile = SourceFile,
            Parameters = projected,
            Return = new AppHostReturnModel
            {
                Type = returnType,
                ErrorModel = "exception",
            },
        };
    }

    public override AppHostProjectionModel ProjectHandle(AtsDumpHandleType handle)
    {
        var name = TypeName(handle.AtsTypeId);
        var kind = handle.IsInterface ? "interface" : "handle";
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = name,
            Declaration = handle.IsInterface
                ? $"export interface {name} {{ }}"
                : $"export interface {name} extends HandleReference {{ }}",
            SourceFile = SourceFile,
            Kind = kind,
            ImplementedInterfaces = handle.ImplementedInterfaces.Select(type => TypeName(type.TypeId)).ToList(),
        };
    }

    public override AppHostProjectionModel ProjectDto(AtsDumpDtoType dto)
    {
        if (dto.Properties.Any(property => HasEmptyUnion(property.Type)))
        {
            return Unsupported("Union types must declare at least one member.", SourceFile);
        }

        var fields = dto.Properties.Select(property =>
        {
            var type = property.IsCallback
                ? MapCallback(property.CallbackParameters, property.CallbackReturnType)
                : MapType(property.Type, TypePosition.Dto);
            return Field(property, ToCamelCase(property.Name), type, optional: true);
        }).ToList();
        var body = string.Join("\n", fields.Select(field => $"    {field.Name}?: {field.Type};"));

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = dto.Name,
            Declaration = $"export interface {dto.Name} {{\n{body}\n}}",
            SourceFile = SourceFile,
            Kind = "interface",
            Fields = fields,
        };
    }

    public override AppHostProjectionModel ProjectEnum(AtsDumpEnumType enumType)
    {
        var members = Members(enumType, name => name, name => name);
        var body = string.Join("\n", members.Select(member => $"    {member.Name} = \"{member.Value}\","));
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = enumType.Name,
            Declaration = $"export enum {enumType.Name} {{\n{body}\n}}",
            SourceFile = SourceFile,
            Kind = "class",
            Members = members,
        };
    }

    public override AppHostProjectionModel ProjectExportedValue(AtsDumpExportedValue exportedValue)
    {
        if (HasEmptyUnion(exportedValue.Type))
        {
            return Unsupported("Union types must declare at least one member.", SourceFile);
        }

        var identifier = exportedValue.PathSegments.LastOrDefault() ?? "value";
        var type = MapType(exportedValue.Type, TypePosition.ExportedValue);
        var expression = RenderJsonValue(
            exportedValue.Value,
            exportedValue.Type,
            ToCamelCase,
            "null",
            "true",
            "false",
            value => QuoteString(value));
        if (exportedValue.Type is not null &&
            !string.Equals(exportedValue.Type.Category, "Primitive", StringComparison.OrdinalIgnoreCase))
        {
            expression = $"{expression} as {type}";
        }

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = $"export const {identifier} = {expression};",
            SourceFile = SourceFile,
            ValueExpression = expression,
            Return = new AppHostReturnModel { Type = type, ErrorModel = "none" },
        };
    }

    protected override string MapType(AtsDumpTypeRef? type, TypePosition position, bool optional = false)
    {
        if (type is null)
        {
            return "unknown";
        }

        var category = type.Category.ToLowerInvariant();
        var mapped = category switch
        {
            "primitive" => MapPrimitive(type.TypeId),
            "enum" => TypeName(type.TypeId.Replace("enum:", "", StringComparison.Ordinal)),
            "handle" or "type" => TypeName(type.TypeId),
            "dto" => TypeName(type.TypeId),
            "callback" => "Function",
            "array" => FormatArray(type, position),
            "list" => position == TypePosition.Dto
                ? FormatArray(type, position)
                : $"AspireList<{MapType(type.ElementType, position)}>",
            "dict" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"Record<{MapType(type.KeyType, position)}, {MapType(type.ValueType, position)}>"
                : $"AspireDict<{MapType(type.KeyType, position)}, {MapType(type.ValueType, position)}>",
            "union" => string.Join(" | ", (type.UnionTypes ?? []).Select(member => MapType(member, position)).Distinct(StringComparer.Ordinal)),
            _ => "any",
        };

        if (type.IsNullable == true &&
            category is "primitive" or "enum" &&
            type.TypeId is not ("void" or "any" or "CancellationToken"))
        {
            mapped += " | null";
        }

        if (position == TypePosition.Input && IsHandle(type))
        {
            mapped = $"Awaitable<{mapped}>";
        }
        else if (position == TypePosition.Input && IsCancellationToken(type))
        {
            mapped = "AbortSignal | CancellationToken";
        }

        return mapped;
    }

    protected override string MapCallback(
        IReadOnlyList<AtsDumpCallbackParam>? parameters,
        AtsDumpTypeRef? returnType)
    {
        var args = string.Join(", ", (parameters ?? []).Select(parameter =>
            $"{parameter.Name}: {MapType(parameter.Type, TypePosition.Return)}"));
        var result = IsVoid(returnType) ? "void" : MapType(returnType, TypePosition.Return);
        return $"({args}) => Promise<{result}>";
    }

    private string FormatArray(AtsDumpTypeRef type, TypePosition position)
    {
        var element = MapType(type.ElementType, position);
        return IsUnion(type.ElementType) || type.ElementType?.IsNullable == true
            ? $"({element})[]"
            : $"{element}[]";
    }

    private static string MapPrimitive(string typeId) => typeId switch
    {
        "string" or "char" or "Guid" or "Uri" or "DateTime" or "DateTimeOffset" or "DateOnly" or "TimeOnly" => "string",
        "number" or "TimeSpan" => "number",
        "boolean" or "bool" => "boolean",
        "void" => "void",
        "any" => "any",
        "CancellationToken" => "CancellationToken",
        _ => typeId,
    };

    private static string SimpleMethodName(string methodName)
        => methodName.Contains('.') ? methodName[(methodName.LastIndexOf('.') + 1)..] : methodName;

    private static bool TryGetDirectOptionsParameter(
        IReadOnlyList<AtsDumpParameter> optional,
        out AtsDumpParameter? directOptions)
    {
        var candidates = optional
            .Where(parameter => !IsCancellationToken(parameter.Type))
            .ToList();
        directOptions = candidates.Count == 1 ? candidates[0] : null;
        return directOptions is not null &&
            string.Equals(directOptions.Name, "options", StringComparison.Ordinal) &&
            IsOptionsDto(directOptions);
    }

    private static bool HasEmptyUnion(AtsDumpTypeRef? type)
    {
        if (type is null)
        {
            return false;
        }

        if (IsUnion(type) && type.UnionTypes is not { Count: > 0 })
        {
            return true;
        }

        return HasEmptyUnion(type.ElementType) ||
            HasEmptyUnion(type.KeyType) ||
            HasEmptyUnion(type.ValueType) ||
            (type.UnionTypes?.Any(HasEmptyUnion) ?? false);
    }
}
