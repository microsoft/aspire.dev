namespace AtsJsonGenerator.Helpers;

internal sealed class PythonProjectionAdapter : ProjectionAdapterBase
{
    private const string SourceFile = "aspire.py";
    private static readonly HashSet<string> s_keywords = new(StringComparer.Ordinal)
    {
        "and", "as", "assert", "async", "await", "break", "class", "continue", "def",
        "del", "elif", "else", "except", "False", "finally", "for", "from", "global",
        "if", "import", "in", "is", "lambda", "None", "nonlocal", "not", "or",
        "pass", "raise", "return", "True", "try", "while", "with", "yield",
    };

    public PythonProjectionAdapter(AtsDumpRoot dump)
        : base(dump)
    {
    }

    public override string Language => "python";

    public override AppHostProjectionModel ProjectCapability(AtsDumpCapability capability)
    {
        if (HasCallbackDefault(capability))
        {
            return Unsupported("Callback defaults cannot be represented faithfully.", SourceFile);
        }

        var projected = new List<AppHostParameterModel>();
        var requiredParts = new List<string>();
        var optionalParts = new List<string>();
        foreach (var parameter in VisibleParameters(capability))
        {
            var name = IsCancellationToken(parameter.Type)
                ? "timeout"
                : SanitizeIdentifier(ToPythonSnakeCase(parameter.Name), s_keywords);
            var type = parameter.IsCallback
                ? MapCallback(parameter)
                : IsCancellationToken(parameter.Type)
                    ? "int"
                    : MapType(parameter.Type, TypePosition.Input);
            var optional = parameter.IsOptional || parameter.IsNullable || IsCancellationToken(parameter.Type);
            var pythonDefault = optional
                ? MapDefault(parameter.DefaultValue, "None", "True", "False", value => QuoteString(value))
                : null;
            var renderedType = type;
            var defaultValue = pythonDefault;
            if (optional && pythonDefault == "None" && !AllowsNone(renderedType))
            {
                renderedType += " | None";
            }
            else if (optional && pythonDefault is not null)
            {
                if (parameter.IsNullable && !AllowsNone(renderedType))
                {
                    renderedType += " | None";
                }

                if (parameter.IsNullable || AllowsNone(type))
                {
                    defaultValue = $"typing.cast({renderedType}, _ASPIRE_UNSET)";
                }
            }
            var part = optional
                ? $"{name}: {renderedType} = {defaultValue}"
                : $"{name}: {type}";
            (optional ? optionalParts : requiredParts).Add(part);
            projected.Add(Parameter(
                capability,
                parameter,
                name,
                renderedType,
                optional,
                defaultValue,
                parameter.IsCallback ? type : null));
        }

        var signatureParts = new List<string>();
        if (capability.TargetTypeId is not null)
        {
            signatureParts.Add("self");
        }
        signatureParts.AddRange(requiredParts);
        if (optionalParts.Count > 0)
        {
            signatureParts.Add("*");
            signatureParts.AddRange(optionalParts);
        }

        var identifier = SanitizeIdentifier(
            StripAsyncSuffix(ToPythonSnakeCase(capability.MethodName.Split('.').Last())),
            s_keywords);
        var returnType = IsVoid(capability.ReturnType)
            ? "None"
            : MapType(capability.ReturnType, TypePosition.Return);
        var signature = $"def {identifier}({string.Join(", ", signatureParts)}) -> {returnType}";

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Signature = signature,
            Declaration = signature + ": ...",
            SourceFile = SourceFile,
            Parameters = projected,
            Return = new AppHostReturnModel { Type = returnType, ErrorModel = "exception" },
        };
    }

    public override AppHostProjectionModel ProjectHandle(AtsDumpHandleType handle)
    {
        var name = TypeName(handle.AtsTypeId);
        if (handle.IsInterface && GenericArity(handle.AtsTypeId) > 1)
        {
            return Unsupported("Python cannot project generic handle interfaces with more than one type argument.", SourceFile);
        }

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = name,
            Declaration = $"class {name}(Handle): ...",
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
                : MapType(property.Type, TypePosition.Dto);
            return Field(property, property.Name, type, optional: true);
        }).ToList();
        var body = fields.Count == 0
            ? "    pass"
            : string.Join("\n", fields.Select(field => $"    {field.Name}: {field.Type}"));

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = dto.Name,
            Declaration = $"class {dto.Name}(typing.TypedDict, total=False):\n{body}",
            SourceFile = SourceFile,
            Kind = "class",
            Fields = fields,
        };
    }

    public override AppHostProjectionModel ProjectEnum(AtsDumpEnumType enumType)
    {
        var members = Members(enumType, name => name, name => name);
        var literals = string.Join(", ", enumType.Values.Select(value => QuoteString(value)));
        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = enumType.Name,
            Declaration = $"{enumType.Name} = typing.Literal[{literals}]",
            SourceFile = SourceFile,
            Kind = "class",
            Members = members,
        };
    }

    public override AppHostProjectionModel ProjectExportedValue(AtsDumpExportedValue exportedValue)
    {
        var path = string.Join(".", exportedValue.PathSegments);
        var identifier = exportedValue.PathSegments.LastOrDefault() ?? "value";
        var expression = RenderJsonValue(
            exportedValue.Value,
            exportedValue.Type,
            property => QuoteString(property),
            "None",
            "True",
            "False",
            value => QuoteString(value),
            arrayOpen: "[",
            arrayClose: "]",
            objectOpen: "{",
            objectClose: "}");
        var type = MapType(exportedValue.Type, TypePosition.ExportedValue);

        return new AppHostProjectionModel
        {
            Status = "supported",
            Identifier = identifier,
            Declaration = $"{path} = {expression}",
            SourceFile = SourceFile,
            ValueExpression = expression,
            Return = new AppHostReturnModel { Type = type, ErrorModel = "none" },
        };
    }

    protected override string MapType(AtsDumpTypeRef? type, TypePosition position, bool optional = false)
    {
        if (type is null)
        {
            return "typing.Any";
        }

        var category = type.Category.ToLowerInvariant();
        var mapped = category switch
        {
            "primitive" => MapPrimitive(type.TypeId),
            "enum" or "handle" or "type" or "dto" => TypeName(type.TypeId.Replace("enum:", "", StringComparison.Ordinal)),
            "callback" => "typing.Callable",
            "array" => $"typing.Iterable[{MapType(type.ElementType, position)}]",
            "list" => position == TypePosition.Dto
                ? $"typing.Iterable[{MapType(type.ElementType, position)}]"
                : $"AspireList[{MapType(type.ElementType, position)}]",
            "dict" => type.IsReadOnly || position is TypePosition.Dto or TypePosition.ExportedValue
                ? $"typing.Mapping[{MapType(type.KeyType, position)}, {MapType(type.ValueType, position)}]"
                : $"AspireDict[{MapType(type.KeyType, position)}, {MapType(type.ValueType, position)}]",
            "union" => string.Join(" | ", (type.UnionTypes ?? []).Select(member => MapType(member, position)).Distinct(StringComparer.Ordinal)),
            _ => "typing.Any",
        };

        if (type.IsNullable == true &&
            category is "primitive" or "enum" &&
            type.TypeId is not ("void" or "any" or "CancellationToken") &&
            !AllowsNone(mapped))
        {
            mapped += " | None";
        }

        return mapped;
    }

    protected override string MapCallback(
        IReadOnlyList<AtsDumpCallbackParam>? parameters,
        AtsDumpTypeRef? returnType)
    {
        var args = string.Join(", ", (parameters ?? []).Select(parameter =>
            MapType(parameter.Type, TypePosition.Input)));
        var result = IsVoid(returnType) ? "None" : MapType(returnType, TypePosition.Return);
        return $"typing.Callable[[{args}], {result}]";
    }

    private static string ToPythonSnakeCase(string value)
        => ToSnakeCase(value)
            .Replace("environment", "env", StringComparison.Ordinal)
            .Replace("configuration", "config", StringComparison.Ordinal)
            .Replace("application", "app", StringComparison.Ordinal)
            .Replace("variable", "var", StringComparison.Ordinal)
            .Replace("directory", "dir", StringComparison.Ordinal);

    private static string MapPrimitive(string typeId) => typeId switch
    {
        "string" or "char" or "Guid" or "Uri" => "str",
        "number" => "int",
        "boolean" or "bool" => "bool",
        "void" => "None",
        "any" => "typing.Any",
        "DateTime" or "DateTimeOffset" => "datetime.datetime",
        "DateOnly" => "datetime.date",
        "TimeOnly" => "datetime.time",
        "TimeSpan" => "float",
        "CancellationToken" => "CancellationToken",
        _ => typeId,
    };

    private static bool AllowsNone(string type)
        => type.Split(" | ", StringSplitOptions.TrimEntries).Contains("None", StringComparer.Ordinal);

    private static int GenericArity(string typeId)
    {
        var tick = typeId.IndexOf('`');
        if (tick < 0 || tick + 1 >= typeId.Length)
        {
            return 0;
        }

        return int.TryParse(typeId.AsSpan(tick + 1, 1), out var arity) ? arity : 0;
    }
}
