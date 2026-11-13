using System.Diagnostics.CodeAnalysis;

namespace AtsJsonGenerator.Helpers;

/// <summary>
/// The types that supporting packages (the core package, for example) already document. The Go SDK is one
/// flat package, so the name a supporting package gave a type is the name that every package built on it uses.
/// </summary>
/// <remarks>
/// A package dump lists only the handles, DTOs and enums that its own assemblies define, so it cannot tell
/// whether a type from another assembly is exported (<c>ILogger</c> becomes <c>Logger</c>) or only a generic
/// constraint (<c>IComputeResource</c> keeps its prefix). The supporting package knows.
/// </remarks>
internal sealed class GoKnownTypes
{
    private readonly Dictionary<string, GoKnownHandle> _handles = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _dtos = new(StringComparer.Ordinal);
    private readonly Dictionary<string, string> _enums = new(StringComparer.Ordinal);

    /// <summary>
    /// A package that has no supporting packages, such as the core package.
    /// </summary>
    public static GoKnownTypes None { get; } = new([]);

    /// <param name="supportingModels">The supporting packages in priority order. The first to declare a type wins.</param>
    public GoKnownTypes(IEnumerable<GoPackageModel> supportingModels)
    {
        foreach (var model in supportingModels)
        {
            foreach (var handle in model.HandleTypes)
            {
                _handles.TryAdd(handle.FullName, new GoKnownHandle(handle.Name, handle.IsInterface, HasImplementation: !handle.IsMarker));
            }

            foreach (var dto in model.DtoTypes)
            {
                _dtos.TryAdd(dto.FullName, dto.Name);
            }

            foreach (var enumType in model.EnumTypes)
            {
                _enums.TryAdd(enumType.FullName, enumType.Name);
            }
        }
    }

    public IEnumerable<GoKnownHandle> Handles => _handles.Values;

    public IEnumerable<string> DtoNames => _dtos.Values;

    public IEnumerable<string> EnumNames => _enums.Values;

    public bool TryGetHandle(string typeId, [NotNullWhen(true)] out GoKnownHandle? handle) =>
        _handles.TryGetValue(AtsTransformer.StripAssemblyPrefix(typeId), out handle);

    public string? GetDtoName(string typeId) =>
        _dtos.GetValueOrDefault(AtsTransformer.StripAssemblyPrefix(typeId));

    // A dump identifies an enum as "enum:Full.Name", while a supporting package records the bare full name.
    public string? GetEnumName(string typeId) =>
        _enums.GetValueOrDefault(AtsTransformer.StripAssemblyPrefix(GoNaming.StripEnumPrefix(typeId)));
}

/// <param name="Name">The Go interface name the supporting package gave the type.</param>
/// <param name="IsInterface">True when the type is an exported interface, whose name lost its "I" prefix.</param>
/// <param name="HasImplementation">True when the type has a concrete implementation, which reserves its unexported name too.</param>
internal sealed record GoKnownHandle(string Name, bool IsInterface, bool HasImplementation);
