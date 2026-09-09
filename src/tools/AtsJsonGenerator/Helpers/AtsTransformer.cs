namespace AtsJsonGenerator.Helpers;

internal static class AtsTransformer
{
    internal static readonly string[] Languages = ["typescript", "python", "go", "java", "rust"];
    internal static readonly string[] ValidationLevels = ["source-derived", "upstream-test-validated", "sdk-output-validated"];
    internal const string UpstreamRepository = "microsoft/aspire";
    internal const string UpstreamCommit = "62028348b5d02dfc8f8baf03a4472946537b0d16";
    internal const string UpstreamLockFile = "src/tools/AtsJsonGenerator/upstream-sources.lock.json";
    private const string NewAspireRepositoryUrl = "https://github.com/microsoft/aspire";

    public static AppHostModuleModel Transform(
        AtsDumpRoot dump,
        string packageName,
        string? version = null,
        string? sourceRepository = null,
        string? sourceCommit = null,
        AppHostDumpProvenanceModel? dumpProvenance = null)
    {
        ArgumentNullException.ThrowIfNull(dump);
        if (string.IsNullOrWhiteSpace(packageName))
        {
            throw new InvalidOperationException("Package name must not be empty.");
        }

        version ??= dump.Packages
            .FirstOrDefault(package => string.Equals(package.Name, packageName, StringComparison.OrdinalIgnoreCase))
            ?.Version;
        var package = new AppHostPackageInfo
        {
            Name = packageName,
            Version = version,
            SourceRepository = NormalizeSourceRepository(sourceRepository),
            SourceCommit = sourceCommit,
        };

        ILanguageProjectionAdapter[] adapters =
        [
            new TypeScriptProjectionAdapter(dump),
            new PythonProjectionAdapter(dump),
            new GoProjectionAdapter(dump),
            new JavaProjectionAdapter(dump),
            new RustProjectionAdapter(dump),
        ];

        var items = new List<AppHostItemModel>();
        items.AddRange(dump.Capabilities
            .OrderBy(capability => capability.CapabilityId, StringComparer.Ordinal)
            .Select(capability => TransformCapability(capability, adapters)));
        items.AddRange(dump.HandleTypes
            .OrderBy(handle => StripAssemblyPrefix(handle.AtsTypeId), StringComparer.Ordinal)
            .Select(handle => TransformHandle(handle, adapters)));
        items.AddRange(dump.DtoTypes
            .OrderBy(dto => StripAssemblyPrefix(dto.TypeId), StringComparer.Ordinal)
            .Select(dto => TransformDto(dto, adapters)));
        items.AddRange(dump.EnumTypes
            .OrderBy(enumType => EnumFullName(enumType), StringComparer.Ordinal)
            .Select(enumType => TransformEnum(enumType, adapters)));
        items.AddRange(dump.ExportedValues
            .OrderBy(value => string.Join(".", value.PathSegments), StringComparer.Ordinal)
            .Select(value => TransformExportedValue(value, adapters)));

        EnsureUniqueIdentities(items);
        ValidateProjectionAccounting(items);

        return new AppHostModuleModel
        {
            GeneratorProvenance = new AppHostGeneratorProvenanceModel
            {
                Repository = UpstreamRepository,
                Commit = UpstreamCommit,
                LockFile = UpstreamLockFile,
            },
            DumpProvenance = dumpProvenance,
            Package = package,
            Items = items,
        };
    }

    public static void DeduplicateAgainstBase(AppHostModuleModel model, AppHostModuleModel baseModel)
    {
        var baseIds = baseModel.Items.Select(item => item.Id).ToHashSet(StringComparer.Ordinal);
        model.Items.RemoveAll(item => baseIds.Contains(item.Id));
        ValidateProjectionAccounting(model.Items);
    }

    public static AppHostSupportMatrixModel CreateSupportMatrix(AppHostModuleModel model)
    {
        return SupportMatrixAggregator.Aggregate([model]);
    }

    private static AppHostItemModel TransformCapability(
        AtsDumpCapability capability,
        IEnumerable<ILanguageProjectionAdapter> adapters)
    {
        if (string.IsNullOrWhiteSpace(capability.CapabilityId))
        {
            throw new InvalidOperationException("Every capability must have a CapabilityId.");
        }

        var visibleParameters = capability.Parameters
            .Where(parameter => !string.Equals(parameter.Name, capability.TargetParameterName, StringComparison.Ordinal))
            .ToList();
        var docs = capability.Documentation?.Parameters.ToDictionary(
            parameter => parameter.Name,
            parameter => NormalizeDoc(parameter.Description),
            StringComparer.Ordinal)
            ?? new Dictionary<string, string?>(StringComparer.Ordinal);

        return new AppHostItemModel
        {
            Id = $"capability:{capability.CapabilityId}",
            Kind = "capability",
            Name = capability.MethodName,
            CapabilityId = capability.CapabilityId,
            QualifiedName = capability.QualifiedMethodName,
            CapabilityKind = capability.CapabilityKind,
            Description = NormalizeDoc(capability.Documentation?.Summary) ?? NormalizeDoc(capability.Description),
            Remarks = NormalizeDoc(capability.Documentation?.Remarks),
            Returns = NormalizeDoc(capability.Documentation?.Returns),
            TargetTypeId = capability.TargetTypeId,
            ExpandedTargetTypes = capability.ExpandedTargetTypes.Select(type => type.TypeId).ToList(),
            ReturnsBuilder = capability.ReturnsBuilder,
            Parameters = visibleParameters.Select(parameter => new AppHostParameterModel
            {
                Name = parameter.Name,
                Type = FormatTypeRef(parameter.Type),
                IsOptional = parameter.IsOptional,
                IsNullable = parameter.IsNullable || parameter.Type?.IsNullable == true,
                DefaultValue = parameter.DefaultValue,
                IsCallback = parameter.IsCallback,
                CallbackSignature = parameter.IsCallback ? FormatCallback(parameter) : null,
                Description = docs.GetValueOrDefault(parameter.Name),
            }).ToList(),
            ReturnType = FormatTypeRef(capability.ReturnType),
            Projections = Project(adapters, adapter => adapter.ProjectCapability(capability)),
        };
    }

    private static AppHostItemModel TransformHandle(
        AtsDumpHandleType handle,
        IEnumerable<ILanguageProjectionAdapter> adapters)
    {
        var fullName = StripAssemblyPrefix(handle.AtsTypeId);
        return new AppHostItemModel
        {
            Id = $"handle:{fullName}",
            Kind = "handle",
            Name = SimpleName(fullName),
            FullName = fullName,
            Description = NormalizeDoc(handle.Documentation?.Summary),
            Remarks = NormalizeDoc(handle.Documentation?.Remarks),
            IsInterface = handle.IsInterface,
            ExposeProperties = handle.ExposeProperties,
            ExposeMethods = handle.ExposeMethods,
            ImplementedInterfaces = handle.ImplementedInterfaces.Select(type => StripAssemblyPrefix(type.TypeId)).ToList(),
            BaseTypeHierarchy = handle.BaseTypeHierarchy.Select(type => StripAssemblyPrefix(type.TypeId)).ToList(),
            Projections = Project(adapters, adapter => adapter.ProjectHandle(handle)),
        };
    }

    private static AppHostItemModel TransformDto(
        AtsDumpDtoType dto,
        IEnumerable<ILanguageProjectionAdapter> adapters)
    {
        var fullName = StripAssemblyPrefix(dto.TypeId);
        return new AppHostItemModel
        {
            Id = $"dto:{fullName}",
            Kind = "dto",
            Name = dto.Name,
            FullName = fullName,
            Description = NormalizeDoc(dto.Documentation?.Summary) ?? NormalizeDoc(dto.Description),
            Remarks = NormalizeDoc(dto.Documentation?.Remarks),
            Fields = dto.Properties.Select(property => new AppHostFieldModel
            {
                Name = property.Name,
                Type = property.IsCallback
                    ? FormatCallback(property.CallbackParameters, property.CallbackReturnType)
                    : FormatTypeRef(property.Type),
                IsOptional = property.IsOptional,
                IsNullable = property.IsNullable || property.Type?.IsNullable == true,
                Description = NormalizeDoc(property.Documentation?.Summary) ?? NormalizeDoc(property.Description),
            }).ToList(),
            Projections = Project(adapters, adapter => adapter.ProjectDto(dto)),
        };
    }

    private static AppHostItemModel TransformEnum(
        AtsDumpEnumType enumType,
        IEnumerable<ILanguageProjectionAdapter> adapters)
    {
        var fullName = EnumFullName(enumType);
        var valueDocs = enumType.ValueInfos.ToDictionary(
            value => value.Name,
            value => NormalizeDoc(value.Documentation?.Summary),
            StringComparer.Ordinal);
        return new AppHostItemModel
        {
            Id = $"enum:{fullName}",
            Kind = "enum",
            Name = enumType.Name,
            FullName = fullName,
            Description = NormalizeDoc(enumType.Documentation?.Summary),
            Remarks = NormalizeDoc(enumType.Documentation?.Remarks),
            Members = enumType.Values.Select(value => new AppHostEnumMemberModel
            {
                Name = value,
                Value = value,
                Description = valueDocs.GetValueOrDefault(value),
            }).ToList(),
            Projections = Project(adapters, adapter => adapter.ProjectEnum(enumType)),
        };
    }

    private static AppHostItemModel TransformExportedValue(
        AtsDumpExportedValue value,
        IEnumerable<ILanguageProjectionAdapter> adapters)
    {
        if (value.PathSegments.Count == 0)
        {
            throw new InvalidOperationException("Every exported value must have at least one PathSegments entry.");
        }

        var path = string.Join(".", value.PathSegments);
        return new AppHostItemModel
        {
            Id = $"exportedValue:{path}",
            Kind = "exportedValue",
            Name = value.PathSegments[^1],
            FullName = path,
            Description = NormalizeDoc(value.Documentation?.Summary) ?? NormalizeDoc(value.Description),
            Remarks = NormalizeDoc(value.Documentation?.Remarks),
            PathSegments = value.PathSegments,
            Value = value.Value,
            ReturnType = FormatTypeRef(value.Type),
            Projections = Project(adapters, adapter => adapter.ProjectExportedValue(value)),
        };
    }

    private static Dictionary<string, AppHostProjectionModel> Project(
        IEnumerable<ILanguageProjectionAdapter> adapters,
        Func<ILanguageProjectionAdapter, AppHostProjectionModel> projector)
    {
        var projections = new Dictionary<string, AppHostProjectionModel>(StringComparer.Ordinal);
        foreach (var adapter in adapters)
        {
            projections.Add(adapter.Language, projector(adapter));
        }
        return projections;
    }

    private static void EnsureUniqueIdentities(IEnumerable<AppHostItemModel> items)
    {
        var duplicate = items.GroupBy(item => item.Id, StringComparer.Ordinal)
            .FirstOrDefault(group => group.Count() > 1);
        if (duplicate is not null)
        {
            throw new InvalidOperationException($"Duplicate ATS identity '{duplicate.Key}'.");
        }
    }

    internal static void ValidateProjectionAccounting(IEnumerable<AppHostItemModel> items)
    {
        foreach (var item in items)
        {
            foreach (var language in Languages)
            {
                if (!item.Projections.TryGetValue(language, out var projection))
                {
                    throw new InvalidOperationException(
                        $"ATS item '{item.Id}' is missing its '{language}' projection.");
                }

                if (projection.Status is not ("supported" or "unsupported"))
                {
                    throw new InvalidOperationException(
                        $"ATS item '{item.Id}' has invalid '{language}' status '{projection.Status}'.");
                }

                if (!ValidationLevels.Contains(projection.Validation, StringComparer.Ordinal))
                {
                    throw new InvalidOperationException(
                        $"ATS item '{item.Id}' has invalid '{language}' validation level '{projection.Validation}'.");
                }

                if (projection.Status == "unsupported" && string.IsNullOrWhiteSpace(projection.Reason))
                {
                    throw new InvalidOperationException(
                        $"ATS item '{item.Id}' has an unsupported '{language}' projection without a reason.");
                }

                if (projection.Status == "supported" &&
                    (string.IsNullOrWhiteSpace(projection.Identifier) ||
                     string.IsNullOrWhiteSpace(projection.SourceFile)))
                {
                    throw new InvalidOperationException(
                        $"ATS item '{item.Id}' has an incomplete supported '{language}' projection.");
                }
            }

            if (item.Projections.Count != Languages.Length)
            {
                var extras = item.Projections.Keys.Except(Languages, StringComparer.Ordinal);
                throw new InvalidOperationException(
                    $"ATS item '{item.Id}' has unexpected projections: {string.Join(", ", extras)}.");
            }
        }
    }

    internal static string FormatTypeRef(AtsDumpTypeRef? typeRef)
    {
        if (typeRef is null)
        {
            return "void";
        }

        var category = typeRef.Category.ToLowerInvariant();
        var formatted = category switch
        {
            "primitive" => typeRef.TypeId,
            "callback" => "callback",
            "array" => $"{FormatTypeRef(typeRef.ElementType)}[]",
            "list" => $"list<{FormatTypeRef(typeRef.ElementType)}>",
            "dict" => $"map<{FormatTypeRef(typeRef.KeyType)}, {FormatTypeRef(typeRef.ValueType)}>",
            "union" => string.Join(" | ", (typeRef.UnionTypes ?? []).Select(FormatTypeRef).Distinct(StringComparer.Ordinal)),
            _ => SimplifyTypeId(typeRef.TypeId),
        };

        if (typeRef.IsNullable == true && formatted is not ("void" or "any"))
        {
            formatted += " | null";
        }
        return formatted;
    }

    internal static string SimplifyTypeId(string typeId)
    {
        var stripped = StripAssemblyPrefix(typeId);
        return FormatReflectionType(stripped);
    }

    internal static string StripAssemblyPrefix(string typeId)
    {
        var slashIndex = typeId.IndexOf('/');
        var stripped = slashIndex >= 0 ? typeId[(slashIndex + 1)..] : typeId;
        return stripped.Contains("[[", StringComparison.Ordinal)
            ? CleanAssemblyQualifiedGenerics(stripped)
            : stripped;
    }

    private static string FormatCallback(AtsDumpParameter parameter)
        => FormatCallback(parameter.CallbackParameters, parameter.CallbackReturnType);

    private static string FormatCallback(
        IReadOnlyList<AtsDumpCallbackParam>? parameters,
        AtsDumpTypeRef? returnType)
    {
        var args = string.Join(", ", (parameters ?? []).Select(parameter =>
            $"{parameter.Name}: {FormatTypeRef(parameter.Type)}"));
        return $"({args}) => {FormatTypeRef(returnType)}";
    }

    private static string? NormalizeSourceRepository(string? sourceRepository)
    {
        if (string.IsNullOrWhiteSpace(sourceRepository))
        {
            return null;
        }

        var trimmed = sourceRepository.Trim();
        if (Uri.TryCreate(trimmed, UriKind.Absolute, out var repositoryUri) &&
            repositoryUri.Host.Equals("github.com", StringComparison.OrdinalIgnoreCase))
        {
            var segments = repositoryUri.AbsolutePath.Trim('/').Split('/', StringSplitOptions.RemoveEmptyEntries);
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

    private static string EnumFullName(AtsDumpEnumType enumType)
        => enumType.TypeId.StartsWith("enum:", StringComparison.Ordinal)
            ? enumType.TypeId["enum:".Length..]
            : StripAssemblyPrefix(enumType.TypeId);

    private static string? NormalizeDoc(string? value)
        => string.IsNullOrWhiteSpace(value) ? null : value.Trim();

    private static string SimpleName(string fullName)
    {
        var generic = fullName.IndexOf('<');
        var prefix = generic >= 0 ? fullName[..generic] : fullName;
        var suffix = generic >= 0 ? fullName[generic..] : "";
        var delimiter = Math.Max(prefix.LastIndexOf('.'), prefix.LastIndexOf('+'));
        return (delimiter >= 0 ? prefix[(delimiter + 1)..] : prefix) + suffix;
    }

    private static string FormatReflectionType(string typeName)
    {
        var arraySuffix = "";
        while (typeName.EndsWith("[]", StringComparison.Ordinal))
        {
            arraySuffix += "[]";
            typeName = typeName[..^2];
        }

        var arityIndex = typeName.IndexOf('`');
        var argumentsIndex = arityIndex >= 0
            ? typeName.IndexOf("[[", arityIndex, StringComparison.Ordinal)
            : -1;
        if (arityIndex >= 0 &&
            argumentsIndex >= 0 &&
            TrySplitReflectionGenericArguments(typeName, argumentsIndex, out var arguments))
        {
            var genericName = SimpleName(typeName[..arityIndex]);
            return $"{genericName}<{string.Join(",", arguments.Select(FormatReflectionType))}>{arraySuffix}";
        }

        return $"{FormatPrimitiveType(SimpleName(typeName))}{arraySuffix}";
    }

    private static bool TrySplitReflectionGenericArguments(
        string typeName,
        int startIndex,
        out List<string> arguments)
    {
        arguments = [];
        var argumentStart = startIndex + 2;
        var depth = 1;
        var index = argumentStart;

        while (index < typeName.Length)
        {
            if (index + 1 < typeName.Length && typeName[index] == '[' && typeName[index + 1] == ']')
            {
                index += 2;
                continue;
            }

            if (index + 1 < typeName.Length && typeName[index] == '[' && typeName[index + 1] == '[')
            {
                depth++;
                index += 2;
                continue;
            }

            if (index + 1 < typeName.Length && typeName[index] == ']' && typeName[index + 1] == ']')
            {
                depth--;
                if (depth == 0)
                {
                    arguments.Add(typeName[argumentStart..index]);
                    return index + 2 == typeName.Length;
                }
                index += 2;
                continue;
            }

            if (depth == 1 &&
                index + 2 < typeName.Length &&
                typeName[index] == ']' &&
                typeName[index + 1] == ',' &&
                typeName[index + 2] == '[')
            {
                arguments.Add(typeName[argumentStart..index]);
                argumentStart = index + 3;
                index += 3;
                continue;
            }

            index++;
        }
        arguments = [];
        return false;
    }

    private static string FormatPrimitiveType(string typeName) => typeName switch
    {
        "String" => "string",
        "Boolean" => "boolean",
        "Byte" or "SByte" or "Int16" or "UInt16" or "Int32" or "UInt32" or
            "Int64" or "UInt64" or "Single" or "Double" or "Decimal" => "number",
        "Object" => "any",
        _ => typeName,
    };

    private static string CleanAssemblyQualifiedGenerics(string typeId)
    {
        var result = new System.Text.StringBuilder(typeId.Length);
        var index = 0;
        while (index < typeId.Length)
        {
            if (index + 1 < typeId.Length &&
                typeId[index] == '[' &&
                typeId[index + 1] == '[' &&
                TryCleanGenericArgumentList(typeId, index, out var cleaned, out var nextIndex))
            {
                result.Append(cleaned);
                index = nextIndex;
                continue;
            }

            result.Append(typeId[index]);
            index++;
        }
        return result.ToString();
    }

    private static bool TryCleanGenericArgumentList(
        string typeId,
        int startIndex,
        out string cleaned,
        out int nextIndex)
    {
        var result = new System.Text.StringBuilder("[[");
        var index = startIndex + 2;
        while (index < typeId.Length)
        {
            var argumentStart = index;
            var bracketDepth = 0;
            while (index < typeId.Length)
            {
                if (typeId[index] == '[')
                {
                    bracketDepth++;
                }
                else if (typeId[index] == ']')
                {
                    if (bracketDepth == 0)
                    {
                        break;
                    }
                    bracketDepth--;
                }
                index++;
            }

            if (index >= typeId.Length)
            {
                break;
            }

            var argument = typeId[argumentStart..index];
            var separator = FindTopLevelComma(argument);
            var typeName = separator >= 0 ? argument[..separator] : argument;
            result.Append(CleanAssemblyQualifiedGenerics(typeName.Trim()));

            if (index + 1 < typeId.Length && typeId[index + 1] == ']')
            {
                result.Append("]]");
                cleaned = result.ToString();
                nextIndex = index + 2;
                return true;
            }

            if (index + 2 < typeId.Length && typeId[index + 1] == ',' && typeId[index + 2] == '[')
            {
                result.Append("],[");
                index += 3;
                continue;
            }
            break;
        }

        cleaned = "";
        nextIndex = startIndex;
        return false;
    }

    private static int FindTopLevelComma(string value)
    {
        var bracketDepth = 0;
        for (var index = 0; index < value.Length; index++)
        {
            bracketDepth += value[index] == '[' ? 1 : value[index] == ']' ? -1 : 0;
            if (value[index] == ',' && bracketDepth == 0)
            {
                return index;
            }
        }
        return -1;
    }
}
