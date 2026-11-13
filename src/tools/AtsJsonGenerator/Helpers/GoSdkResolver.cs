using System.Diagnostics.CodeAnalysis;
using static AtsJsonGenerator.Helpers.GoNaming;

namespace AtsJsonGenerator.Helpers;

/// <summary>
/// Resolves the Go names and type syntax that the Go SDK generator (<c>AtsGoCodeGenerator</c> in
/// microsoft/aspire) emits for an ATS dump, so the API reference documents the exact surface that
/// <c>aspire sdk generate -l go</c> produces.
/// </summary>
/// <remarks>
/// The SDK is a single flat Go package, so every type shares one namespace. The first type to claim
/// a name keeps it and later colliding types get a prefix or numeric suffix. That makes naming
/// depend on which packages are referenced and on the order types are visited, which is why the
/// dump is walked in the same order as the generator. A per-package dump lists only the handles
/// its own assemblies export plus the types its signatures mention, so it resolves names the way
/// an AppHost that references just that integration would.
/// </remarks>
internal sealed partial class GoSdkResolver
{
    // Well-known ids from Aspire.TypeSystem/AtsConstants.cs in microsoft/aspire.
    internal const string ReferenceExpressionTypeId = "Aspire.Hosting/Aspire.Hosting.ApplicationModel.ReferenceExpression";
    internal const string BuilderTypeId = "Aspire.Hosting/Aspire.Hosting.IDistributedApplicationBuilder";
    internal const string ApplicationTypeId = "Aspire.Hosting/Aspire.Hosting.DistributedApplication";
    internal const string BuildCapabilityId = "Aspire.Hosting/build";
    internal const string CreateBuilderCapabilityId = "Aspire.Hosting/createBuilder";
    internal const string InteractionInputCollectionTypeId = "Aspire.Hosting/Aspire.Hosting.InteractionInputCollection";

    private const string CancellationTokenTypeId = "cancellationToken";
    private const string VoidTypeId = "void";
    private const string DefaultTargetParameterName = "builder";
    private const string CreateBuilderOptionsDtoName = "CreateBuilderOptions";

    private readonly AtsDumpRoot _dump;
    private readonly GoKnownTypes _knownTypes;
    private readonly Dictionary<string, string> _enumNames = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _dtoNames = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _interfaceNames = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _implNames = new(StringComparer.Ordinal);
    private readonly Dictionary<string, bool> _isInterfaceType = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _optionsTypeNames = new(StringComparer.Ordinal);
    private readonly HashSet<string> _reservedNames = new(StringComparer.Ordinal);

    /// <param name="dump">The dump being documented.</param>
    /// <param name="knownTypes">The types that supporting packages already document.</param>
    public GoSdkResolver(AtsDumpRoot dump, GoKnownTypes knownTypes)
    {
        _dump = dump;
        _knownTypes = knownTypes;
        BuildNameMaps();
    }

    /// <summary>
    /// Every handle type the Go SDK emits, keyed by its raw ATS type id (including the assembly prefix).
    /// </summary>
    public IReadOnlyDictionary<string, string> InterfaceNames => _interfaceNames;

    public string? GetEnumName(string typeId) => _enumNames.GetValueOrDefault(typeId);

    public string? GetDtoName(string typeId) => _dtoNames.GetValueOrDefault(typeId);

    public bool IsInterface(string typeId) => _isInterfaceType.TryGetValue(typeId, out var isInterface) && isInterface;

    /// <summary>
    /// True when the handle has a concrete implementation that carries capability methods. Interfaces
    /// without one are markers that only exist for type assertions.
    /// </summary>
    public bool HasImplementation(string typeId) => _implNames.ContainsKey(typeId);

    /// <summary>
    /// The Go interface name of a handle type. Types that were never discovered as handles fall back to
    /// the name the generator would derive from the type id.
    /// </summary>
    public string GetHandleName(AtsDumpTypeRef typeRef) =>
        _interfaceNames.TryGetValue(typeRef.TypeId, out var name)
            ? name
            : SanitizeIdentifier(StripInterfacePrefix(ExtractTypeName(typeRef.TypeId), typeRef.IsInterface));

    /// <summary>
    /// The Go name of a type in a handle's CLR hierarchy, or <see langword="null"/> when the Go SDK has no type
    /// for it (<c>IDisposable</c>, <c>IEnumerable&lt;T&gt;</c>, an interface that no capability mentions).
    /// A type that a supporting package already documents keeps that package's name.
    /// </summary>
    public string? FindHandleName(AtsDumpTypeRef typeRef)
    {
        if (_interfaceNames.TryGetValue(typeRef.TypeId, out var name))
        {
            return name;
        }

        return _knownTypes.TryGetHandle(typeRef.TypeId, out var known) ? known.Name : null;
    }

    public string BuilderInterfaceName => _interfaceNames.GetValueOrDefault(BuilderTypeId) ?? "DistributedApplicationBuilder";

    public string ApplicationInterfaceName => _interfaceNames.GetValueOrDefault(ApplicationTypeId) ?? "DistributedApplication";

    /// <summary>
    /// The DTO that <c>CreateBuilder</c> accepts, or <see langword="null"/> when the AppHost model does not define one.
    /// </summary>
    public string? CreateBuilderOptionsName =>
        _dump.DtoTypes
            .Where(dto => string.Equals(dto.Name, CreateBuilderOptionsDtoName, StringComparison.Ordinal))
            .Select(dto => _dtoNames.GetValueOrDefault(dto.TypeId))
            .FirstOrDefault(name => name is not null);

    /// <summary>
    /// Capabilities the generator emits by hand (<c>Build</c> and <c>CreateBuilder</c>) instead of from metadata.
    /// </summary>
    public static bool IsSpecialCased(AtsDumpCapability capability) =>
        string.Equals(capability.CapabilityId, BuildCapabilityId, StringComparison.Ordinal)
        || string.Equals(capability.CapabilityId, CreateBuilderCapabilityId, StringComparison.Ordinal);

    /// <summary>
    /// Capabilities of the collection wrappers and <c>ReferenceExpression</c>. The Go SDK supplies those types in
    /// its hand-written runtime files (<c>List</c>, <c>Dict</c>, <c>ReferenceExpression</c>) instead of generating
    /// them, so there is no generated Go type to document the capability on.
    /// </summary>
    public static bool IsRuntimeProvided(AtsDumpCapability capability) =>
        string.Equals(capability.TargetTypeId, ReferenceExpressionTypeId, StringComparison.Ordinal)
        || capability.TargetType?.Category is AtsTypeCategories.List or AtsTypeCategories.Dict;

    /// <summary>
    /// The concrete Go types that carry the capability's method. An interface target contributes each
    /// of its expansions; a capability with no concrete target is not exposed by the Go SDK.
    /// </summary>
    public IReadOnlyList<string> GetImplementingTypeIds(AtsDumpCapability capability)
    {
        if (string.IsNullOrEmpty(capability.TargetTypeId))
        {
            return [];
        }

        IReadOnlyList<AtsDumpTypeRef> targets = capability.ExpandedTargetTypes.Count > 0
            ? capability.ExpandedTargetTypes
            : capability.TargetType is not null ? [capability.TargetType] : [];

        return targets
            .Select(target => target.TypeId)
            .Where(typeId => !string.IsNullOrEmpty(typeId) && _implNames.ContainsKey(typeId))
            .Distinct(StringComparer.Ordinal)
            .ToList();
    }

    /// <summary>
    /// True for a parameterless getter of a mutable list or dictionary. The Go SDK exposes these as
    /// <c>*List[T]</c> or <c>*Dict[K, V]</c> accessors that cannot fail.
    /// </summary>
    public static bool IsListOrDictAccessor(AtsDumpCapability capability)
    {
        var targetParameterName = capability.TargetParameterName ?? DefaultTargetParameterName;
        var hasOtherParameters = capability.Parameters
            .Any(p => !string.Equals(p.Name, targetParameterName, StringComparison.Ordinal));

        return !hasOtherParameters
            && capability.ReturnType is { Category: AtsTypeCategories.List or AtsTypeCategories.Dict, IsReadOnly: false };
    }

    /// <summary>
    /// Splits the capability's parameters (minus the target) into the positional ones and the ones
    /// that move into the trailing variadic options argument.
    /// </summary>
    public static (List<AtsDumpParameter> Required, List<AtsDumpParameter> Optional) SplitParameters(AtsDumpCapability capability)
    {
        var targetParameterName = capability.TargetParameterName ?? DefaultTargetParameterName;
        var required = new List<AtsDumpParameter>();
        var optional = new List<AtsDumpParameter>();

        foreach (var parameter in capability.Parameters)
        {
            if (string.Equals(parameter.Name, targetParameterName, StringComparison.Ordinal))
            {
                continue;
            }

            if (IsCancellationToken(parameter) || parameter.IsOptional)
            {
                optional.Add(parameter);
            }
            else
            {
                required.Add(parameter);
            }
        }

        return (required, optional);
    }

    /// <summary>
    /// Describes the trailing <c>options ...*T</c> argument for the capability, or <see langword="null"/>
    /// when the capability has no optional parameters.
    /// </summary>
    public GoOptionsInfo? GetOptions(AtsDumpCapability capability)
    {
        var (_, optional) = SplitParameters(capability);
        if (optional.Count == 0)
        {
            return null;
        }

        if (TryGetDirectOptionsParameter(optional, out var directOptionsParameter))
        {
            return new GoOptionsInfo(MapDtoType(directOptionsParameter.Type.TypeId), IsDirect: true, optional);
        }

        return new GoOptionsInfo(GetOptionsTypeName(capability), IsDirect: false, optional);
    }

    private string GetOptionsTypeName(AtsDumpCapability capability) =>
        _optionsTypeNames.TryGetValue(capability.CapabilityId, out var name)
            ? name
            : $"{ToPascalCase(capability.MethodName)}Options";

    private void BuildNameMaps()
    {
        ReserveKnownNames();

        // A supporting package that already documents a type keeps its name, even when this dump declares
        // the type again, so that the types left in this package still refer to it by that name.
        foreach (var enumType in _dump.EnumTypes)
        {
            _enumNames[enumType.TypeId] = _knownTypes.GetEnumName(enumType.TypeId)
                ?? ReserveName(SanitizeIdentifier(enumType.Name), takenLowercase: false);
        }

        // The dump lists only the enums its own assemblies define, but the Go generator sees every enum in
        // the app model, so an enum from another assembly (ProtocolType, HealthStatus) that a signature or
        // DTO field mentions is still declared and named in the SDK.
        foreach (var typeId in GetReferencedEnumTypeIds().Where(id => !_enumNames.ContainsKey(id)).Order(StringComparer.Ordinal))
        {
            _enumNames[typeId] = _knownTypes.GetEnumName(typeId)
                ?? ReserveName(SanitizeIdentifier(ExtractTypeName(typeId)), takenLowercase: false);
        }

        foreach (var dto in _dump.DtoTypes)
        {
            if (dto.TypeId == ReferenceExpressionTypeId)
            {
                // ReferenceExpression is part of the Go SDK runtime, so it never gets a generated type.
                continue;
            }

            _dtoNames[dto.TypeId] = _knownTypes.GetDtoName(dto.TypeId)
                ?? ReserveName(SanitizeIdentifier(dto.Name), takenLowercase: false);
        }

        // Handle types come from the dump's handle list and from every type a capability mentions,
        // because a type that is only referenced still needs a Go interface to be named in signatures.
        var handleTypeIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var handleType in _dump.HandleTypes)
        {
            if (handleType.AtsTypeId == ReferenceExpressionTypeId || IsCancellationTokenTypeId(handleType.AtsTypeId))
            {
                continue;
            }

            handleTypeIds.Add(handleType.AtsTypeId);
            _isInterfaceType[handleType.AtsTypeId] = handleType.IsInterface;
        }

        // An interface that appears as an expansion target (IDistributedApplicationBuilder expands to
        // itself) still needs a concrete implementation to host its capability methods.
        var expansionTargetIds = new HashSet<string>(StringComparer.Ordinal);
        var referencedInterfaceIds = new HashSet<string>(StringComparer.Ordinal);
        foreach (var capability in _dump.Capabilities)
        {
            CollectHandleTypeIds(handleTypeIds, referencedInterfaceIds, capability.TargetType);
            CollectHandleTypeIds(handleTypeIds, referencedInterfaceIds, capability.ReturnType);

            foreach (var parameter in capability.Parameters)
            {
                CollectHandleTypeIds(handleTypeIds, referencedInterfaceIds, parameter.Type);

                if (parameter.IsCallback && parameter.CallbackParameters is not null)
                {
                    foreach (var callbackParameter in parameter.CallbackParameters)
                    {
                        CollectHandleTypeIds(handleTypeIds, referencedInterfaceIds, callbackParameter.Type);
                    }
                }
            }

            foreach (var expanded in capability.ExpandedTargetTypes)
            {
                CollectHandleTypeIds(handleTypeIds, referencedInterfaceIds, expanded);

                if (!string.IsNullOrEmpty(expanded.TypeId))
                {
                    expansionTargetIds.Add(expanded.TypeId);
                }
            }
        }

        MarkReferencedInterfaces(referencedInterfaceIds);

        // A supporting package's answer is authoritative, so it also overrides what the dump says.
        foreach (var typeId in handleTypeIds)
        {
            if (_knownTypes.TryGetHandle(typeId, out var known))
            {
                _isInterfaceType[typeId] = known.IsInterface;
            }
        }

        // Interfaces reserve their names first so they get the bare name and concrete types fall back
        // to a prefix or numeric suffix when they collide.
        var ordered = handleTypeIds
            .OrderBy(id => IsInterface(id) ? 0 : 1)
            .ThenBy(id => id, StringComparer.Ordinal)
            .ToList();

        foreach (var typeId in ordered)
        {
            var isInterface = IsInterface(typeId);

            // The supporting package already reserved the name when it declared the type.
            if (_knownTypes.TryGetHandle(typeId, out var knownHandle))
            {
                _interfaceNames[typeId] = knownHandle.Name;
                if (knownHandle.HasImplementation)
                {
                    _implNames[typeId] = ToCamelCase(knownHandle.Name);
                }

                continue;
            }

            var needsImpl = !isInterface || expansionTargetIds.Contains(typeId);
            var sanitized = SanitizeIdentifier(StripInterfacePrefix(ExtractTypeName(typeId), isInterface));

            string interfaceName;
            if (isInterface && !needsImpl)
            {
                interfaceName = ReserveName(sanitized, takenLowercase: false);
            }
            else if (!_reservedNames.Contains(sanitized))
            {
                interfaceName = ReserveName(sanitized, takenLowercase: true);
            }
            else
            {
                var assemblyPrefix = SanitizeIdentifier(typeId.Split('/')[0]);
                var prefixed = $"{assemblyPrefix}{sanitized}";
                interfaceName = !_reservedNames.Contains(prefixed)
                    ? ReserveName(prefixed, takenLowercase: true)
                    : ReserveName(sanitized, takenLowercase: true);
            }

            _interfaceNames[typeId] = interfaceName;
            if (needsImpl)
            {
                _implNames[typeId] = ToCamelCase(interfaceName);
            }
        }

        BuildOptionsTypeNames();
    }

    /// <summary>
    /// Claims the names that supporting packages already use, so a type in this dump that collides with one
    /// of them is the one that gets a prefix or suffix, as it would when the packages are combined.
    /// </summary>
    private void ReserveKnownNames()
    {
        foreach (var handle in _knownTypes.Handles)
        {
            _reservedNames.Add(handle.Name);
            if (handle.HasImplementation)
            {
                _reservedNames.Add(ToCamelCase(handle.Name));
            }
        }

        foreach (var name in _knownTypes.DtoNames.Concat(_knownTypes.EnumNames))
        {
            _reservedNames.Add(name);
        }
    }

    /// <summary>
    /// Resolves the wrapper struct name for each capability that has optional parameters. Runs after
    /// enums, DTOs and handles are named so collisions with them are detected.
    /// </summary>
    private void BuildOptionsTypeNames()
    {
        var optionsNamesInUse = new HashSet<string>(StringComparer.Ordinal);

        // The first capability to claim each name, so later ones can check their fields are compatible before sharing it.
        var optionsNameFirstCapability = new Dictionary<string, AtsDumpCapability>(StringComparer.Ordinal);

        foreach (var capability in _dump.Capabilities)
        {
            var optional = GetOptionalParameters(capability);
            if (optional.Count == 0)
            {
                continue;
            }

            // A direct options DTO is passed as-is, so there is no wrapper struct to name.
            if (TryGetDirectOptionsParameter(optional, out _))
            {
                continue;
            }

            var simpleName = $"{ToPascalCase(capability.MethodName)}Options";
            string resolvedName;

            if (!_reservedNames.Contains(simpleName) && !optionsNamesInUse.Contains(simpleName))
            {
                resolvedName = simpleName;
                optionsNamesInUse.Add(simpleName);
                optionsNameFirstCapability[simpleName] = capability;
            }
            else if (optionsNamesInUse.Contains(simpleName) && !_reservedNames.Contains(simpleName))
            {
                // The same method name on another type. Sharing the struct is only safe when the optional
                // fields have identical types; for example RunAsEmulator on two resources can take
                // different emulator callback types, which need separate structs.
                if (optionsNameFirstCapability.TryGetValue(simpleName, out var firstCapability)
                    && AreOptionsCompatible(capability, firstCapability))
                {
                    resolvedName = simpleName;
                }
                else
                {
                    resolvedName = GetOptionsQualifiedName(capability, simpleName);
                    optionsNamesInUse.Add(resolvedName);
                    optionsNameFirstCapability[resolvedName] = capability;
                }
            }
            else
            {
                // The simple name collides with an enum, DTO or handle type.
                resolvedName = GetOptionsQualifiedName(capability, simpleName);
                optionsNamesInUse.Add(resolvedName);
                optionsNameFirstCapability[resolvedName] = capability;
            }

            _optionsTypeNames[capability.CapabilityId] = resolvedName;
        }
    }

    private string GetOptionsQualifiedName(AtsDumpCapability capability, string simpleName)
    {
        var targetName = capability.TargetTypeId is { } targetTypeId && _interfaceNames.TryGetValue(targetTypeId, out var name)
            ? name
            : capability.TargetTypeId ?? "Unknown";

        return $"{targetName}{simpleName}";
    }

    private bool AreOptionsCompatible(AtsDumpCapability first, AtsDumpCapability second)
    {
        var firstOptionals = GetOptionalParameters(first).OrderBy(p => p.Name, StringComparer.Ordinal).ToList();
        var secondOptionals = GetOptionalParameters(second).OrderBy(p => p.Name, StringComparer.Ordinal).ToList();
        if (firstOptionals.Count != secondOptionals.Count)
        {
            return false;
        }

        for (var i = 0; i < firstOptionals.Count; i++)
        {
            if (!string.Equals(firstOptionals[i].Name, secondOptionals[i].Name, StringComparison.Ordinal)
                || !string.Equals(RenderOptionsFieldType(firstOptionals[i]), RenderOptionsFieldType(secondOptionals[i]), StringComparison.Ordinal))
            {
                return false;
            }
        }

        return true;
    }

    private static List<AtsDumpParameter> GetOptionalParameters(AtsDumpCapability capability) =>
        SplitParameters(capability).Optional;

    /// <summary>
    /// A single optional <c>options</c> DTO is passed directly instead of through a generated wrapper.
    /// Go allows one trailing variadic, so a coexisting cancellation token prevents flattening.
    /// </summary>
    private static bool TryGetDirectOptionsParameter(
        IReadOnlyList<AtsDumpParameter> optionalParameters,
        [NotNullWhen(true)] out AtsDumpParameter? directOptionsParameter)
    {
        directOptionsParameter = null;

        if (optionalParameters.Count != 1)
        {
            return false;
        }

        var candidate = optionalParameters[0];
        if (candidate.IsCallback
            || IsCancellationToken(candidate)
            || !string.Equals(candidate.Name, "options", StringComparison.Ordinal)
            || candidate.Type.Category != AtsTypeCategories.Dto)
        {
            return false;
        }

        directOptionsParameter = candidate;
        return true;
    }

    private HashSet<string> GetReferencedEnumTypeIds()
    {
        var typeIds = new HashSet<string>(StringComparer.Ordinal);

        foreach (var capability in _dump.Capabilities)
        {
            CollectEnumTypeIds(typeIds, capability.ReturnType);

            foreach (var parameter in capability.Parameters)
            {
                CollectEnumTypeIds(typeIds, parameter.Type);
                CollectEnumTypeIds(typeIds, parameter.CallbackReturnType);

                foreach (var callbackParameter in parameter.CallbackParameters ?? [])
                {
                    CollectEnumTypeIds(typeIds, callbackParameter.Type);
                }
            }
        }

        foreach (var dto in _dump.DtoTypes)
        {
            foreach (var property in dto.Properties)
            {
                CollectEnumTypeIds(typeIds, property.Type);
            }
        }

        return typeIds;
    }

    private static void CollectEnumTypeIds(HashSet<string> typeIds, AtsDumpTypeRef? typeRef)
    {
        if (typeRef is null)
        {
            return;
        }

        if (typeRef.Category == AtsTypeCategories.Enum)
        {
            typeIds.Add(typeRef.TypeId);
        }

        CollectEnumTypeIds(typeIds, typeRef.ElementType);
        CollectEnumTypeIds(typeIds, typeRef.KeyType);
        CollectEnumTypeIds(typeIds, typeRef.ValueType);

        foreach (var unionType in typeRef.UnionTypes)
        {
            CollectEnumTypeIds(typeIds, unionType);
        }
    }

    /// <summary>
    /// The dump lists only the handles that its own assemblies define, while the Go generator sees every
    /// handle in the app model. A foreign interface that is only referenced from a signature (ILogger,
    /// IConfiguration) is one of those exported handles, so it is an interface that loses its "I" prefix.
    /// A type from a dumped assembly that is missing from the list was never exported, as with a generic
    /// constraint such as IComputeResource, so the generator keeps its name as written.
    /// </summary>
    /// <remarks>
    /// A dump cannot tell those two cases apart for a type from another assembly, so a supporting package
    /// that already documents the type decides instead. Without one, a foreign interface is assumed to be
    /// an exported handle.
    /// </remarks>
    private void MarkReferencedInterfaces(HashSet<string> referencedInterfaceIds)
    {
        var ownedAssemblies = _dump.HandleTypes
            .Select(handleType => handleType.AtsTypeId)
            .Concat(_dump.DtoTypes.Select(dto => dto.TypeId))
            .Select(GetAssemblyName)
            .OfType<string>()
            .ToHashSet(StringComparer.Ordinal);

        foreach (var typeId in referencedInterfaceIds)
        {
            if (_isInterfaceType.ContainsKey(typeId) || _knownTypes.TryGetHandle(typeId, out _))
            {
                continue;
            }

            var assemblyName = GetAssemblyName(typeId);
            if (assemblyName is not null && ownedAssemblies.Contains(assemblyName))
            {
                continue;
            }

            _isInterfaceType[typeId] = true;
        }
    }

    // Type ids look like "Aspire.Hosting/Aspire.Hosting.ApplicationModel.IResource"; the part before the
    // slash is the assembly. Ids without a slash (enums, primitives) have none.
    private static string? GetAssemblyName(string typeId)
    {
        var slash = typeId.IndexOf('/');
        return slash > 0 ? typeId[..slash] : null;
    }

    private static void CollectHandleTypeIds(HashSet<string> typeIds, HashSet<string> interfaceTypeIds, AtsDumpTypeRef? typeRef)
    {
        if (typeRef is null)
        {
            return;
        }

        if (typeRef.TypeId == ReferenceExpressionTypeId || IsCancellationTokenTypeId(typeRef.TypeId))
        {
            return;
        }

        if (typeRef.Category == AtsTypeCategories.Handle)
        {
            typeIds.Add(typeRef.TypeId);

            if (typeRef.IsInterface)
            {
                interfaceTypeIds.Add(typeRef.TypeId);
            }
        }

        CollectHandleTypeIds(typeIds, interfaceTypeIds, typeRef.ElementType);
        CollectHandleTypeIds(typeIds, interfaceTypeIds, typeRef.KeyType);
        CollectHandleTypeIds(typeIds, interfaceTypeIds, typeRef.ValueType);

        foreach (var unionType in typeRef.UnionTypes)
        {
            CollectHandleTypeIds(typeIds, interfaceTypeIds, unionType);
        }
    }

    private bool IsNameTaken(string name) => _reservedNames.Contains(name);

    private string ReserveName(string candidate, bool takenLowercase)
    {
        var name = candidate;
        var counter = 2;

        // A concrete type also reserves its lowercase implementation name, so a collision on either spelling forces a suffix.
        while (_reservedNames.Contains(name)
            || (takenLowercase && _reservedNames.Contains(ToCamelCase(name))))
        {
            name = $"{candidate}{counter}";
            counter++;
        }

        _reservedNames.Add(name);
        if (takenLowercase)
        {
            _reservedNames.Add(ToCamelCase(name));
        }

        return name;
    }

    public static bool IsCancellationToken(AtsDumpParameter parameter) => IsCancellationTokenTypeId(parameter.Type.TypeId);

    private static bool IsCancellationTokenTypeId(string? typeId) =>
        string.Equals(typeId, CancellationTokenTypeId, StringComparison.Ordinal)
        || (typeId?.EndsWith("/System.Threading.CancellationToken", StringComparison.Ordinal) ?? false);
}

/// <summary>
/// The trailing <c>options ...*T</c> argument of a Go method.
/// </summary>
/// <param name="TypeName">The Go struct passed through the variadic.</param>
/// <param name="IsDirect">True when <paramref name="TypeName"/> is an existing DTO rather than a generated wrapper.</param>
/// <param name="Parameters">The optional ATS parameters the argument carries, in capability order.</param>
internal sealed record GoOptionsInfo(string TypeName, bool IsDirect, IReadOnlyList<AtsDumpParameter> Parameters);
