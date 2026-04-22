namespace AtsJsonGenerator.Helpers;

/// <summary>
/// Transforms the raw <c>aspire sdk dump --format json</c> output into the docs-site JSON model.
/// </summary>
internal static class AtsTransformer
{
    private const string NewAspireRepositoryUrl = "https://github.com/microsoft/aspire";

    /// <summary>
    /// Transform the deserialized dump output into a <see cref="TsPackageModel"/>.
    /// </summary>
    public static TsPackageModel Transform(
        AtsDumpRoot dump,
        string packageName,
        string? version = null,
        string? sourceRepository = null,
        string? sourceCommit = null)
    {
        sourceRepository = NormalizeSourceRepository(sourceRepository);

        // Fall back to the version from the dump's Packages metadata if not explicitly provided
        version ??= dump.Packages
            .FirstOrDefault(p => string.Equals(p.Name, packageName, StringComparison.OrdinalIgnoreCase))
            ?.Version;

        // Transform handle types
        var handleModels = dump.HandleTypes
            .Select(TransformHandle)
            .OrderBy(h => h.FullName)
            .ToList();

        // Build a lookup for associating capabilities with handle types
        var handleLookup = handleModels.ToDictionary(h => h.FullName, h => h);

        // Transform capabilities into functions
        var functionModels = dump.Capabilities
            .Select(TransformCapability)
            .OrderBy(f => f.QualifiedName)
            .ToList();

        // Associate capabilities with their target handle types
        foreach (var func in functionModels)
        {
            if (func.TargetTypeId is null)
            {
                continue;
            }

            var targetFullName = StripAssemblyPrefix(func.TargetTypeId);
            if (handleLookup.TryGetValue(targetFullName, out var handle))
            {
                handle.Capabilities.Add(func);
            }
        }

        // Transform DTO types
        var dtoModels = dump.DtoTypes
            .Select(TransformDto)
            .OrderBy(d => d.FullName)
            .ToList();

        // Transform enum types
        var enumModels = dump.EnumTypes
            .Select(TransformEnum)
            .OrderBy(e => e.FullName)
            .ToList();

        return new TsPackageModel
        {
            Package = new TsPackageInfo
            {
                Name = packageName,
                Version = version,
                SourceRepository = sourceRepository,
                SourceCommit = sourceCommit,
            },
            Functions = functionModels,
            HandleTypes = handleModels,
            DtoTypes = dtoModels,
            EnumTypes = enumModels,
        };
    }

    private static string? NormalizeSourceRepository(string? sourceRepository)
    {
        if (string.IsNullOrWhiteSpace(sourceRepository))
        {
            return sourceRepository;
        }

        var trimmed = sourceRepository.Trim();

        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var repoUri) &&
            repoUri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase))
        {
            var segments = repoUri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
            if (segments.Length == 2 &&
                segments[0].Equals("dotnet", StringComparison.OrdinalIgnoreCase) &&
                (segments[1].Equals("aspire", StringComparison.OrdinalIgnoreCase) ||
                 segments[1].Equals("aspire.git", StringComparison.OrdinalIgnoreCase)))
            {
                return NewAspireRepositoryUrl;
            }
        }

        return trimmed;
    }

    private static TsHandleTypeModel TransformHandle(AtsDumpHandleType h)
    {
        var fullName = StripAssemblyPrefix(h.AtsTypeId);
        return new TsHandleTypeModel
        {
            Name = SimpleName(fullName),
            FullName = fullName,
            IsInterface = h.IsInterface,
            ExposeProperties = h.ExposeProperties,
            ExposeMethods = h.ExposeMethods,
            ImplementedInterfaces = h.ImplementedInterfaces
                .Select(i => StripAssemblyPrefix(i.TypeId))
                .OrderBy(i => i)
                .ToList(),
        };
    }

    private static TsFunctionModel TransformCapability(AtsDumpCapability cap)
    {
        // Filter out the context/builder target parameter from visible params
        var visibleParams = cap.Parameters
            .Where(p => p.Name != cap.TargetParameterName)
            .ToList();

        var paramModels = visibleParams.Select(p => new TsParameterModel
        {
            Name = p.Name,
            Type = FormatTypeRef(p.Type),
            IsOptional = p.IsOptional,
            IsNullable = p.IsNullable,
            DefaultValue = p.DefaultValue,
            IsCallback = p.IsCallback,
            CallbackSignature = p.IsCallback ? FormatCallbackSignature(p) : null,
        }).ToList();

        // Build a TypeScript-style signature
        var paramParts = paramModels.Select(p =>
        {
            var opt = p.IsOptional ? "?" : "";
            var type = p.IsCallback && p.CallbackSignature is not null
                ? p.CallbackSignature
                : p.Type;
            return $"{p.Name}{opt}: {type}";
        });

        var returnTypeStr = FormatTypeRef(cap.ReturnType);
        var sig = $"{cap.MethodName}({string.Join(", ", paramParts)}): {returnTypeStr}";

        return new TsFunctionModel
        {
            Name = cap.MethodName,
            CapabilityId = cap.CapabilityId,
            QualifiedName = cap.QualifiedMethodName,
            Description = cap.Description,
            Kind = cap.CapabilityKind,
            Signature = sig,
            Parameters = paramModels,
            ReturnType = returnTypeStr,
            ReturnsBuilder = cap.ReturnsBuilder,
            TargetTypeId = cap.TargetTypeId,
            ExpandedTargetTypes = cap.ExpandedTargetTypes
                .Select(t => StripAssemblyPrefix(t.TypeId))
                .ToList(),
        };
    }

    private static TsDtoTypeModel TransformDto(AtsDumpDtoType dto)
    {
        var fullName = StripAssemblyPrefix(dto.TypeId);
        return new TsDtoTypeModel
        {
            Name = dto.Name,
            FullName = fullName,
            Fields = dto.Properties.Select(p => new TsDtoFieldModel
            {
                Name = p.Name,
                Type = FormatTypeRef(p.Type),
                IsOptional = p.IsOptional,
            }).ToList(),
        };
    }

    private static TsEnumTypeModel TransformEnum(AtsDumpEnumType e)
    {
        // EnumType TypeId is "enum:Full.Name" — strip "enum:" prefix
        var fullName = e.TypeId.StartsWith("enum:", StringComparison.Ordinal)
            ? e.TypeId["enum:".Length..]
            : e.TypeId;

        return new TsEnumTypeModel
        {
            Name = e.Name,
            FullName = fullName,
            Members = e.Values,
        };
    }

    /// <summary>
    /// Format a callback parameter into a TypeScript-style function type signature.
    /// </summary>
    private static string FormatCallbackSignature(AtsDumpParameter param)
    {
        if (param.CallbackParameters is null)
        {
            return "() => Promise<void>";
        }

        var cbParams = param.CallbackParameters.Select(p =>
            $"{p.Name}: {FormatTypeRef(p.Type)}");

        // The generated TypeScript SDK always exposes callbacks as async
        // (the aspire TS code generator hardcodes `=> Promise<T>` for every
        // callback because invocation happens over RPC). Mirror that here so
        // the docs signatures match the actual SDK types.
        var innerReturnType = param.CallbackReturnType is not null
            ? FormatTypeRef(param.CallbackReturnType)
            : "void";

        return $"({string.Join(", ", cbParams)}) => Promise<{innerReturnType}>";
    }

    /// <summary>
    /// Format a type reference for display, simplifying common patterns.
    /// </summary>
    internal static string FormatTypeRef(AtsDumpTypeRef? typeRef)
    {
        if (typeRef is null)
        {
            return "void";
        }

        return typeRef.Category switch
        {
            "Primitive" => typeRef.TypeId,
            "Callback" => "callback",
            "Array" when typeRef.ElementType is not null =>
                $"{FormatTypeRef(typeRef.ElementType)}[]",
            _ => SimplifyTypeId(typeRef.TypeId),
        };
    }

    /// <summary>
    /// Simplify a fully-qualified type ID for display.
    /// </summary>
    internal static string SimplifyTypeId(string typeId)
    {
        var stripped = StripAssemblyPrefix(typeId);
        return SimpleName(stripped);
    }

    /// <summary>
    /// Strip the "Assembly/" prefix from a type ID and clean assembly-qualified
    /// generic type arguments (e.g., <c>System.IEquatable`1[[TypeName, Assembly, Version=..., ...]]</c>).
    /// </summary>
    internal static string StripAssemblyPrefix(string typeId)
    {
        var slashIdx = typeId.IndexOf('/');
        var stripped = slashIdx >= 0 ? typeId[(slashIdx + 1)..] : typeId;

        // Clean assembly metadata from generic type arguments:
        // [[TypeName, AssemblyName, Version=..., Culture=..., PublicKeyToken=...]]
        // becomes [[TypeName]]
        if (stripped.Contains("[["))
        {
            stripped = CleanAssemblyQualifiedGenerics(stripped);
        }

        return stripped;
    }

    /// <summary>
    /// Remove assembly metadata from inside double-bracket generic type arguments.
    /// </summary>
    private static string CleanAssemblyQualifiedGenerics(string typeId)
    {
        var result = new System.Text.StringBuilder(typeId.Length);
        var i = 0;

        while (i < typeId.Length)
        {
            if (i + 1 < typeId.Length && typeId[i] == '[' && typeId[i + 1] == '[')
            {
                result.Append("[[");
                i += 2;

                // Read the type name (up to the first comma or closing bracket)
                while (i < typeId.Length && typeId[i] != ',' && typeId[i] != ']')
                {
                    result.Append(typeId[i]);
                    i++;
                }

                // Skip assembly metadata: everything between the comma and "]]"
                var depth = 1;
                while (i < typeId.Length && depth > 0)
                {
                    if (i + 1 < typeId.Length && typeId[i] == ']' && typeId[i + 1] == ']')
                    {
                        depth--;
                        if (depth == 0)
                        {
                            result.Append("]]");
                            i += 2;
                            break;
                        }
                    }
                    i++;
                }
            }
            else
            {
                result.Append(typeId[i]);
                i++;
            }
        }

        return result.ToString();
    }

    /// <summary>
    /// Extract the simple name from a fully-qualified name.
    /// </summary>
    private static string SimpleName(string fullName)
    {
        // Handle generic types: don't split inside angle brackets
        if (fullName.Contains('<'))
        {
            var angleIdx = fullName.IndexOf('<');
            var prefix = fullName[..angleIdx];
            var suffix = fullName[angleIdx..];
            return prefix.Split('.').Last() + suffix;
        }

        return fullName.Split('.').Last();
    }
}
