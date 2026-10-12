using System.Text.RegularExpressions;

namespace AtsJsonGenerator.Helpers;

/// <summary>
/// Recognizes ATS scanner error diagnostics caused by known scanner defects.
/// </summary>
/// <remarks>
/// The Aspire CLI scanner exports a method inherited by several proxy types once per
/// derived type, all under the base type's capability ID. The scanner keeps the first
/// definition and reports each collision as an error. Remove this tolerance once the
/// shipped Aspire CLI includes the fix (https://github.com/microsoft/aspire/pull/20443).
/// </remarks>
internal static partial class KnownScannerDiagnostics
{
    /// <summary>
    /// Prefix of the line written for each tolerated diagnostic. generate-ts-api-json.ps1 parses this prefix.
    /// </summary>
    public const string ToleratedOutputPrefix = "Tolerated known ATS scanner diagnostic:";

    /// <summary>
    /// Returns whether <paramref name="message"/> reports the inherited duplicate capability defect.
    /// </summary>
    /// <remarks>
    /// Both definitions must be handle types in <paramref name="dump"/> that are, or derive from, the
    /// type that owns the capability ID. Unrelated types that share a capability ID are a genuine collision.
    /// </remarks>
    public static bool IsInheritedDuplicateCapability(string message, AtsDumpRoot dump)
    {
        var match = InheritedDuplicateCapabilityPattern().Match(message);
        if (!match.Success)
        {
            return false;
        }

        var capabilityNamespace = match.Groups["namespace"].Value;
        var capabilityTypeName = $"{capabilityNamespace}.{match.Groups["type"].Value}";
        var first = SplitQualifiedMember(match.Groups["first"].Value);
        var second = SplitQualifiedMember(match.Groups["second"].Value);

        return first.Namespace.Equals(capabilityNamespace, StringComparison.Ordinal)
            && second.Namespace.Equals(capabilityNamespace, StringComparison.Ordinal)
            && !first.TypeName.Equals(second.TypeName, StringComparison.Ordinal)
            && first.Member.Equals(second.Member, StringComparison.Ordinal)
            && first.Member.Equals(match.Groups["method"].Value, StringComparison.OrdinalIgnoreCase)
            && IsSameOrDerivedHandleType(dump, first.TypeName, capabilityTypeName)
            && IsSameOrDerivedHandleType(dump, second.TypeName, capabilityTypeName);
    }

    /// <summary>
    /// Returns the error diagnostics in <paramref name="dump"/> that match a known scanner defect.
    /// </summary>
    public static IReadOnlyList<string> GetToleratedErrors(AtsDumpRoot dump) =>
        AtsTransformer.GetErrorDiagnostics(dump)
            .Where(message => IsInheritedDuplicateCapability(message, dump))
            .ToArray();

    private static bool IsSameOrDerivedHandleType(AtsDumpRoot dump, string typeName, string baseTypeName)
    {
        var handleType = dump.HandleTypes.FirstOrDefault(handle =>
            AtsTransformer.StripAssemblyPrefix(handle.AtsTypeId).Equals(typeName, StringComparison.Ordinal));

        return handleType is not null
            && (typeName.Equals(baseTypeName, StringComparison.Ordinal)
                || handleType.BaseTypeHierarchy.Any(baseType =>
                    AtsTransformer.StripAssemblyPrefix(baseType.TypeId).Equals(baseTypeName, StringComparison.Ordinal)));
    }

    private static (string Namespace, string TypeName, string Member) SplitQualifiedMember(string qualifiedMember)
    {
        // The pattern guarantees at least three non-empty dot-separated segments.
        var memberSeparator = qualifiedMember.LastIndexOf('.');
        var typeName = qualifiedMember[..memberSeparator];

        return (typeName[..typeName.LastIndexOf('.')], typeName, qualifiedMember[(memberSeparator + 1)..]);
    }

    [GeneratedRegex(
        @"^Duplicate capability '(?<namespace>\w+(?:\.\w+)*)/(?<type>\w+)\.(?<method>\w+)': defined at '(?<first>\w+(?:\.\w+){2,})' and '(?<second>\w+(?:\.\w+){2,})'\. Remove \[AspireExport\] from one of them or use different capability IDs\.\z",
        RegexOptions.CultureInvariant)]
    private static partial Regex InheritedDuplicateCapabilityPattern();
}
