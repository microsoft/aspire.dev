using System.Text;
using static AtsJsonGenerator.Helpers.GoNaming;

namespace AtsJsonGenerator.Helpers;

// Type and signature rendering. These rules reproduce the Go SDK generator's output so the documented
// signatures can be pasted into an AppHost.
internal sealed partial class GoSdkResolver
{
    public string MapTypeRefToGo(AtsDumpTypeRef? typeRef, bool isOptional)
    {
        if (typeRef is null)
        {
            return "any";
        }

        if (typeRef.TypeId == ReferenceExpressionTypeId)
        {
            return "*ReferenceExpression";
        }

        var baseType = typeRef.Category switch
        {
            AtsTypeCategories.Primitive => MapPrimitiveType(typeRef.TypeId),
            AtsTypeCategories.Enum => MapEnumType(typeRef.TypeId),
            AtsTypeCategories.Handle => MapHandleType(typeRef.TypeId),
            AtsTypeCategories.Dto => "*" + MapDtoType(typeRef.TypeId),

            // The dump records no signature for a callback that is a DTO property, so it can only be shown loosely typed.
            AtsTypeCategories.Callback => "func(...any) any",
            AtsTypeCategories.Array => $"[]{MapTypeRefToGo(typeRef.ElementType, false)}",
            AtsTypeCategories.List => typeRef.IsReadOnly
                ? $"[]{MapTypeRefToGo(typeRef.ElementType, false)}"
                : $"*List[{MapTypeRefToGo(typeRef.ElementType, false)}]",
            AtsTypeCategories.Dict => typeRef.IsReadOnly
                ? $"map[{MapTypeRefToGo(typeRef.KeyType, false)}]{MapTypeRefToGo(typeRef.ValueType, false)}"
                : $"*Dict[{MapTypeRefToGo(typeRef.KeyType, false)}, {MapTypeRefToGo(typeRef.ValueType, false)}]",
            _ => "any"
        };

        if ((isOptional || ShouldApplyNullableType(typeRef)) && !IsNilableGoType(baseType))
        {
            return $"*{baseType}";
        }

        return baseType;
    }

    /// <summary>
    /// DTO fields keep collections as plain slices and maps because DTOs are serialized as JSON.
    /// </summary>
    public string MapDtoPropertyTypeToGo(AtsDumpTypeRef? typeRef, bool isOptional)
    {
        if (typeRef is null)
        {
            return "any";
        }

        if (typeRef.TypeId == ReferenceExpressionTypeId)
        {
            return "*ReferenceExpression";
        }

        var baseType = typeRef.Category switch
        {
            AtsTypeCategories.Array or AtsTypeCategories.List => $"[]{MapDtoPropertyTypeToGo(typeRef.ElementType, false)}",
            AtsTypeCategories.Dict => $"map[{MapDtoPropertyTypeToGo(typeRef.KeyType, false)}]{MapDtoPropertyTypeToGo(typeRef.ValueType, false)}",
            AtsTypeCategories.Union => "any",
            _ => MapTypeRefToGo(typeRef, isOptional: false)
        };

        if (isOptional && !IsNilableGoType(baseType))
        {
            return $"*{baseType}";
        }

        return baseType;
    }

    public string RenderParameterType(AtsDumpParameter parameter)
    {
        if (parameter.IsCallback)
        {
            return RenderCallbackType(parameter);
        }

        if (IsCancellationToken(parameter))
        {
            return "*CancellationToken";
        }

        return MapTypeRefToGo(parameter.Type, parameter.IsOptional);
    }

    /// <summary>
    /// The type of a field in a generated options struct. Optional values are pointers so an unset field is distinguishable.
    /// </summary>
    public string RenderOptionsFieldType(AtsDumpParameter parameter)
    {
        if (parameter.IsCallback)
        {
            return RenderCallbackType(parameter);
        }

        if (IsCancellationToken(parameter))
        {
            return "*CancellationToken";
        }

        return MapTypeRefToGo(parameter.Type, isOptional: true);
    }

    public string RenderCallbackType(AtsDumpParameter parameter)
    {
        var builder = new StringBuilder("func(");

        if (parameter.CallbackParameters is { Count: > 0 } callbackParameters)
        {
            builder.AppendJoin(", ", callbackParameters.Select(p => $"{GetLocalIdentifier(p.Name)} {MapTypeRefToGo(p.Type, false)}"));
        }
        else
        {
            builder.Append("...any");
        }

        builder.Append(')');

        var returnType = parameter.CallbackReturnType;
        if (returnType is not null && returnType.TypeId != VoidTypeId)
        {
            builder.Append(' ').Append(MapTypeRefToGo(returnType, false));
        }
        else if (parameter.CallbackParameters is null)
        {
            // Without recorded parameters the callback is only known to be a function, so it is shown with a loosely typed result.
            builder.Append(" any");
        }

        return builder.ToString();
    }

    /// <summary>
    /// The comma-separated parameter list of the Go method: required parameters in order, then the
    /// trailing variadic options argument when the capability has optional parameters.
    /// </summary>
    public string RenderParameterList(IReadOnlyList<AtsDumpParameter> required, GoOptionsInfo? options)
    {
        var parts = required
            .Select(p => $"{GetLocalIdentifier(p.Name)} {RenderParameterType(p)}")
            .ToList();

        if (options is not null)
        {
            parts.Add($"options ...*{options.TypeName}");
        }

        return string.Join(", ", parts);
    }

    /// <summary>
    /// Describes what the Go method returns and how a failure surfaces.
    /// </summary>
    public GoReturnInfo RenderReturn(AtsDumpCapability capability)
    {
        var returnType = capability.ReturnType;
        if (returnType is null || returnType.TypeId == VoidTypeId)
        {
            return new GoReturnInfo("error", GoErrorModels.Returned, ReturnsReceiver: false);
        }

        if (returnType.Category != AtsTypeCategories.Handle)
        {
            return new GoReturnInfo($"({MapTypeRefToGo(returnType, false)}, error)", GoErrorModels.Returned, ReturnsReceiver: false);
        }

        // Handle results are fluent: the call never returns an error, the failure is stored on the result and read with Err().
        var returnsReceiver = string.Equals(returnType.TypeId, capability.TargetTypeId, StringComparison.Ordinal);
        return new GoReturnInfo(MapTypeRefToGo(returnType, false), GoErrorModels.Deferred, returnsReceiver);
    }

    /// <summary>
    /// The Go types a union parameter accepts. The parameter itself is declared as <c>any</c>.
    /// </summary>
    public List<string> GetUnionAllowedTypes(AtsDumpTypeRef typeRef)
    {
        var allowed = typeRef.UnionTypes
            .Select(unionType => MapTypeRefToGo(unionType, false))
            .Distinct(StringComparer.Ordinal)
            .ToList();

        return allowed.Count > 0 ? allowed : ["any"];
    }

    private string MapHandleType(string typeId) =>
        _interfaceNames.TryGetValue(typeId, out var name) ? name : "handleReference";

    private string MapDtoType(string typeId) =>
        _dtoNames.TryGetValue(typeId, out var name) ? name : _knownTypes.GetDtoName(typeId) ?? "map[string]any";

    private string MapEnumType(string typeId) =>
        _enumNames.TryGetValue(typeId, out var name) ? name : "string";

    // Primitive ids are the literals in Aspire.TypeSystem/AtsConstants.cs. Dates and times are plain
    // strings on the wire and a TimeSpan is a number of milliseconds.
    private static string MapPrimitiveType(string typeId) => typeId switch
    {
        "string" or "char" => "string",
        "number" => "float64",
        "boolean" => "bool",
        VoidTypeId => "",
        "any" => "any",
        "datetime" or "datetimeoffset" or "dateonly" or "timeonly" => "string",
        "timespan" => "float64",
        "guid" or "uri" => "string",
        CancellationTokenTypeId => "*CancellationToken",
        _ => "any"
    };

    private static bool IsNilableGoType(string typeName) =>
        typeName.StartsWith('*')
        || typeName.StartsWith("[]", StringComparison.Ordinal)
        || typeName.StartsWith("map[", StringComparison.Ordinal)
        || typeName == "any"
        || typeName.StartsWith("func(", StringComparison.Ordinal);

    private static bool ShouldApplyNullableType(AtsDumpTypeRef typeRef) =>
        typeRef.IsNullable
        && typeRef.Category is AtsTypeCategories.Primitive or AtsTypeCategories.Enum
        && typeRef.TypeId is not (VoidTypeId or "any" or CancellationTokenTypeId);
}

/// <summary>
/// The Go return clause of a method.
/// </summary>
/// <param name="ReturnType">The clause as written after the parameter list, for example <c>error</c> or <c>(string, error)</c>.</param>
/// <param name="ErrorModel">One of <see cref="GoErrorModels"/>.</param>
/// <param name="ReturnsReceiver">True when the method returns the type it was called on.</param>
internal sealed record GoReturnInfo(string ReturnType, string ErrorModel, bool ReturnsReceiver);
