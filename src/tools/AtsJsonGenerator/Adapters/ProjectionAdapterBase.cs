using System.Globalization;
using System.Text;
using System.Text.Json;

namespace AtsJsonGenerator.Helpers;

internal interface ILanguageProjectionAdapter
{
    string Language { get; }

    AppHostProjectionModel ProjectCapability(AtsDumpCapability capability);

    AppHostProjectionModel ProjectHandle(AtsDumpHandleType handle);

    AppHostProjectionModel ProjectDto(AtsDumpDtoType dto);

    AppHostProjectionModel ProjectEnum(AtsDumpEnumType enumType);

    AppHostProjectionModel ProjectExportedValue(AtsDumpExportedValue exportedValue);
}

internal abstract class ProjectionAdapterBase : ILanguageProjectionAdapter
{
    protected ProjectionAdapterBase(AtsDumpRoot dump)
    {
        Dump = dump;
        Handles = dump.HandleTypes.ToDictionary(h => h.AtsTypeId, StringComparer.Ordinal);
        Dtos = dump.DtoTypes.ToDictionary(d => d.TypeId, StringComparer.Ordinal);
        Enums = dump.EnumTypes.ToDictionary(e => e.TypeId, StringComparer.Ordinal);
    }

    protected AtsDumpRoot Dump { get; }

    protected IReadOnlyDictionary<string, AtsDumpHandleType> Handles { get; }

    protected IReadOnlyDictionary<string, AtsDumpDtoType> Dtos { get; }

    protected IReadOnlyDictionary<string, AtsDumpEnumType> Enums { get; }

    public abstract string Language { get; }

    public abstract AppHostProjectionModel ProjectCapability(AtsDumpCapability capability);

    public abstract AppHostProjectionModel ProjectHandle(AtsDumpHandleType handle);

    public abstract AppHostProjectionModel ProjectDto(AtsDumpDtoType dto);

    public abstract AppHostProjectionModel ProjectEnum(AtsDumpEnumType enumType);

    public abstract AppHostProjectionModel ProjectExportedValue(AtsDumpExportedValue exportedValue);

    protected abstract string MapType(AtsDumpTypeRef? type, TypePosition position, bool optional = false);

    protected virtual string MapCallback(AtsDumpParameter parameter)
        => MapCallback(parameter.CallbackParameters, parameter.CallbackReturnType);

    protected abstract string MapCallback(
        IReadOnlyList<AtsDumpCallbackParam>? parameters,
        AtsDumpTypeRef? returnType);

    protected static IEnumerable<AtsDumpParameter> VisibleParameters(AtsDumpCapability capability)
        => capability.Parameters.Where(parameter =>
            !string.Equals(parameter.Name, capability.TargetParameterName, StringComparison.Ordinal));

    protected static string TypeName(string typeId)
    {
        var fullName = AtsTransformer.StripAssemblyPrefix(typeId);
        var tick = fullName.IndexOf('`');
        if (tick >= 0)
        {
            fullName = fullName[..tick];
        }

        var delimiter = Math.Max(fullName.LastIndexOf('.'), fullName.LastIndexOf('+'));
        return delimiter >= 0 ? fullName[(delimiter + 1)..] : fullName;
    }

    protected static string EnumFullName(AtsDumpEnumType enumType)
        => enumType.TypeId.StartsWith("enum:", StringComparison.Ordinal)
            ? enumType.TypeId["enum:".Length..]
            : AtsTransformer.StripAssemblyPrefix(enumType.TypeId);

    protected static string DocumentationSummary(AtsDumpDocumentation? documentation, string? fallback = null)
        => NormalizeDocumentation(documentation?.Summary) ?? NormalizeDocumentation(fallback) ?? "";

    protected static string? NormalizeDocumentation(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    protected static string? ParameterDescription(AtsDumpCapability capability, string parameterName)
        => NormalizeDocumentation(
            capability.Documentation?.Parameters
                .FirstOrDefault(parameter => string.Equals(parameter.Name, parameterName, StringComparison.Ordinal))
                ?.Description);

    protected static bool IsCancellationToken(AtsDumpTypeRef? type)
        => type is not null &&
            (string.Equals(TypeName(type.TypeId), "CancellationToken", StringComparison.OrdinalIgnoreCase)
                || type.TypeId.EndsWith("/System.Threading.CancellationToken", StringComparison.Ordinal));

    protected static bool IsVoid(AtsDumpTypeRef? type)
        => type is null || string.Equals(type.TypeId, "void", StringComparison.OrdinalIgnoreCase);

    protected static bool IsHandle(AtsDumpTypeRef? type)
        => string.Equals(type?.Category, "Handle", StringComparison.OrdinalIgnoreCase)
            || string.Equals(type?.Category, "Type", StringComparison.OrdinalIgnoreCase);

    protected static bool IsDto(AtsDumpTypeRef? type)
        => string.Equals(type?.Category, "Dto", StringComparison.OrdinalIgnoreCase);

    protected static bool IsOptionsDto(AtsDumpParameter parameter)
        => !parameter.IsCallback &&
            parameter.Type is { } type &&
            (IsDto(type) ||
                TypeName(type.TypeId).EndsWith("Options", StringComparison.Ordinal));

    protected static bool IsUnion(AtsDumpTypeRef? type)
        => string.Equals(type?.Category, "Union", StringComparison.OrdinalIgnoreCase);

    protected static bool IsArray(AtsDumpTypeRef? type)
        => string.Equals(type?.Category, "Array", StringComparison.OrdinalIgnoreCase);

    protected static bool IsList(AtsDumpTypeRef? type)
        => string.Equals(type?.Category, "List", StringComparison.OrdinalIgnoreCase);

    protected static bool IsDict(AtsDumpTypeRef? type)
        => string.Equals(type?.Category, "Dict", StringComparison.OrdinalIgnoreCase);

    protected static bool HasCallbackDefault(AtsDumpCapability capability)
        => VisibleParameters(capability).Any(parameter =>
            parameter.IsCallback && parameter.DefaultValue is not null);

    protected AppHostProjectionModel Unsupported(string reason, string sourceFile)
        => new()
        {
            Status = "unsupported",
            Reason = reason,
            SourceFile = sourceFile,
        };

    protected AppHostParameterModel Parameter(
        AtsDumpCapability capability,
        AtsDumpParameter parameter,
        string name,
        string type,
        bool optional,
        string? defaultValue,
        string? callbackSignature = null)
        => new()
        {
            Name = name,
            Type = type,
            IsOptional = optional,
            IsNullable = parameter.IsNullable || parameter.Type?.IsNullable == true,
            DefaultValue = defaultValue,
            IsCallback = parameter.IsCallback,
            CallbackSignature = callbackSignature,
            Description = ParameterDescription(capability, parameter.Name),
        };

    protected AppHostFieldModel Field(
        AtsDumpDtoProperty property,
        string name,
        string type,
        bool optional)
        => new()
        {
            Name = name,
            Type = type,
            IsOptional = optional,
            IsNullable = property.IsNullable || property.Type?.IsNullable == true,
            Description = NormalizeDocumentation(property.Documentation?.Summary)
                ?? NormalizeDocumentation(property.Description),
        };

    protected static List<AppHostEnumMemberModel> Members(
        AtsDumpEnumType enumType,
        Func<string, string> nameSelector,
        Func<string, object?> valueSelector)
    {
        var docs = enumType.ValueInfos.ToDictionary(
            value => value.Name,
            value => NormalizeDocumentation(value.Documentation?.Summary),
            StringComparer.Ordinal);

        return enumType.Values.Select(value => new AppHostEnumMemberModel
        {
            Name = nameSelector(value),
            Value = valueSelector(value),
            Description = docs.GetValueOrDefault(value),
        }).ToList();
    }

    protected static string ToCamelCase(string name)
    {
        if (string.IsNullOrEmpty(name) || char.IsLower(name[0]))
        {
            return name;
        }

        return char.ToLowerInvariant(name[0]) + name[1..];
    }

    protected static string ToPascalCase(string name)
    {
        if (string.IsNullOrEmpty(name) || char.IsUpper(name[0]))
        {
            return name;
        }

        return char.ToUpperInvariant(name[0]) + name[1..];
    }

    protected static string ToSnakeCase(string name)
    {
        if (string.IsNullOrEmpty(name))
        {
            return name;
        }

        var builder = new StringBuilder(name.Length + 8);
        for (var index = 0; index < name.Length; index++)
        {
            var character = name[index];
            if (char.IsUpper(character) &&
                index > 0 &&
                (char.IsLower(name[index - 1]) ||
                 (index + 1 < name.Length && char.IsLower(name[index + 1]))))
            {
                builder.Append('_');
            }

            builder.Append(char.ToLowerInvariant(character));
        }

        return builder.ToString().Replace('-', '_');
    }

    protected static string ToUpperSnakeCase(string name)
        => ToSnakeCase(name).ToUpperInvariant();

    protected static string StripAsyncSuffix(string name)
        => name.EndsWith("_async", StringComparison.Ordinal)
            ? name[..^"_async".Length]
            : name;

    protected static string QuoteString(string value, char quote = '"')
    {
        var escaped = value.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace(quote.ToString(), $"\\{quote}", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal);
        return $"{quote}{escaped}{quote}";
    }

    protected static string MapDefault(
        string? value,
        string nullLiteral,
        string trueLiteral,
        string falseLiteral,
        Func<string, string>? stringLiteral = null)
    {
        if (value is null ||
            string.Equals(value, "null", StringComparison.OrdinalIgnoreCase))
        {
            return nullLiteral;
        }

        if (bool.TryParse(value, out var boolean))
        {
            return boolean ? trueLiteral : falseLiteral;
        }

        if (double.TryParse(value, NumberStyles.Float, CultureInfo.InvariantCulture, out _))
        {
            return value;
        }

        if (value.Length >= 2 &&
            ((value[0] == '"' && value[^1] == '"') ||
             (value[0] == '\'' && value[^1] == '\'')))
        {
            value = value[1..^1];
        }

        return stringLiteral is null ? QuoteString(value) : stringLiteral(value);
    }

    protected string RenderJsonValue(
        JsonElement? element,
        AtsDumpTypeRef? type,
        Func<string, string> propertyName,
        string nullLiteral,
        string trueLiteral,
        string falseLiteral,
        Func<string, string> stringLiteral,
        string arrayOpen = "[",
        string arrayClose = "]",
        string objectOpen = "{ ",
        string objectClose = " }",
        string keyValueSeparator = ": ")
    {
        if (element is null || element.Value.ValueKind is JsonValueKind.Null or JsonValueKind.Undefined)
        {
            return nullLiteral;
        }

        var value = element.Value;
        return value.ValueKind switch
        {
            JsonValueKind.String => stringLiteral(value.GetString() ?? ""),
            JsonValueKind.True => trueLiteral,
            JsonValueKind.False => falseLiteral,
            JsonValueKind.Number => value.GetRawText(),
            JsonValueKind.Array => arrayOpen + string.Join(", ", value.EnumerateArray().Select(item =>
                RenderJsonValue(item, type?.ElementType, propertyName, nullLiteral, trueLiteral, falseLiteral, stringLiteral,
                    arrayOpen, arrayClose, objectOpen, objectClose, keyValueSeparator))) + arrayClose,
            JsonValueKind.Object => objectOpen + string.Join(", ", value.EnumerateObject().Select(property =>
                $"{propertyName(property.Name)}{keyValueSeparator}{RenderJsonValue(property.Value, ResolvePropertyType(type, property.Name), propertyName, nullLiteral, trueLiteral, falseLiteral, stringLiteral, arrayOpen, arrayClose, objectOpen, objectClose, keyValueSeparator)}")) + objectClose,
            _ => value.GetRawText(),
        };
    }

    private AtsDumpTypeRef? ResolvePropertyType(AtsDumpTypeRef? type, string propertyName)
    {
        if (type is null)
        {
            return null;
        }

        if (IsDict(type))
        {
            return type.ValueType;
        }

        if (IsDto(type) && Dtos.TryGetValue(type.TypeId, out var dto))
        {
            return dto.Properties.FirstOrDefault(property =>
                string.Equals(property.Name, propertyName, StringComparison.Ordinal))?.Type;
        }

        return null;
    }

    protected static string SanitizeIdentifier(string value, ISet<string> keywords)
    {
        if (string.IsNullOrWhiteSpace(value))
        {
            return "_";
        }

        var builder = new StringBuilder(value.Length);
        foreach (var character in value)
        {
            builder.Append(char.IsLetterOrDigit(character) || character == '_' ? character : '_');
        }

        if (!char.IsLetter(builder[0]) && builder[0] != '_')
        {
            builder.Insert(0, '_');
        }

        var result = builder.ToString();
        return keywords.Contains(result) ? result + "_" : result;
    }

    protected static string SourceIdentity(AtsDumpCapability capability)
        => string.IsNullOrEmpty(capability.CapabilityId)
            ? capability.QualifiedMethodName
            : capability.CapabilityId;
}

internal enum TypePosition
{
    Input,
    Return,
    Dto,
    ExportedValue,
}

internal sealed class IdentifierAllocator
{
    private readonly HashSet<string> _used;

    public IdentifierAllocator(IEnumerable<string>? reserved = null, StringComparer? comparer = null)
    {
        _used = new HashSet<string>(reserved ?? [], comparer ?? StringComparer.Ordinal);
    }

    public string Reserve(string preferred, string? qualifier = null)
    {
        if (_used.Add(preferred))
        {
            return preferred;
        }

        if (!string.IsNullOrEmpty(qualifier))
        {
            var qualified = qualifier + preferred;
            if (_used.Add(qualified))
            {
                return qualified;
            }
        }

        for (var suffix = 1; ; suffix++)
        {
            var candidate = preferred + suffix.ToString(CultureInfo.InvariantCulture);
            if (_used.Add(candidate))
            {
                return candidate;
            }
        }
    }
}
