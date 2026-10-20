using System.Text;

namespace AtsJsonGenerator.Helpers;

/// <summary>
/// Go identifier rules used by the Go SDK generator (<c>AtsGoCodeGenerator</c> in microsoft/aspire).
/// The documented names must match the generated SDK exactly, so these helpers reproduce the
/// generator's behavior character for character instead of applying general Go conventions.
/// </summary>
internal static class GoNaming
{
    private const string EnumPrefix = "enum:";

    private static readonly HashSet<string> s_goKeywords = new(StringComparer.Ordinal)
    {
        "break", "case", "chan", "const", "continue", "default", "defer", "else", "fallthrough",
        "for", "func", "go", "goto", "if", "import", "interface", "map", "package", "range",
        "return", "select", "struct", "switch", "type", "var",
        // Predeclared identifiers the generator also treats as reserved.
        "any", "true", "false", "nil", "iota"
    };

    /// <summary>
    /// Extracts the simple type name from an ATS type id such as
    /// <c>Aspire.Hosting/Aspire.Hosting.ApplicationModel.ContainerResource</c>. Nested types use
    /// <c>+</c> as the delimiter, for example <c>Outer+Inner</c>.
    /// </summary>
    public static string ExtractTypeName(string typeId)
    {
        var slashIndex = typeId.IndexOf('/', StringComparison.Ordinal);
        var typeName = slashIndex >= 0 ? typeId[(slashIndex + 1)..] : typeId;
        var lastDot = typeName.LastIndexOf('.');
        var plusIndex = typeName.LastIndexOf('+');
        var delimiterIndex = Math.Max(lastDot, plusIndex);
        return delimiterIndex >= 0 ? typeName[(delimiterIndex + 1)..] : typeName;
    }

    /// <summary>
    /// Removes the <c>enum:</c> marker from an enum type id (<c>enum:Aspire.Hosting.ApplicationModel.ContainerLifetime</c>),
    /// which leaves the full type name that the documented models record for the enum.
    /// </summary>
    public static string StripEnumPrefix(string typeId) =>
        typeId.StartsWith(EnumPrefix, StringComparison.Ordinal) ? typeId[EnumPrefix.Length..] : typeId;

    public static string SanitizeIdentifier(string name)
    {
        if (string.IsNullOrWhiteSpace(name))
        {
            return "_";
        }

        var builder = new StringBuilder(name.Length);
        foreach (var ch in name)
        {
            builder.Append(char.IsLetterOrDigit(ch) || ch == '_' ? ch : '_');
        }

        if (!char.IsLetter(builder[0]) && builder[0] != '_')
        {
            builder.Insert(0, '_');
        }

        var sanitized = builder.ToString();
        return s_goKeywords.Contains(sanitized) ? sanitized + "_" : sanitized;
    }

    /// <summary>
    /// The identifier used for a parameter or local variable.
    /// </summary>
    public static string GetLocalIdentifier(string name) => SanitizeIdentifier(ToCamelCase(name));

    public static string ToPascalCase(string name)
    {
        if (string.IsNullOrEmpty(name) || char.IsUpper(name[0]))
        {
            return name;
        }

        return char.ToUpperInvariant(name[0]) + name[1..];
    }

    public static string ToCamelCase(string name)
    {
        if (string.IsNullOrEmpty(name) || char.IsLower(name[0]))
        {
            return name;
        }

        return char.ToLowerInvariant(name[0]) + name[1..];
    }

    /// <summary>
    /// Drops the .NET <c>I</c> prefix from interface names, for example <c>IResource</c> becomes
    /// <c>Resource</c>. Names such as <c>Item</c> or <c>IO</c> are left alone.
    /// </summary>
    public static string StripInterfacePrefix(string name, bool isInterface)
    {
        if (!isInterface || name.Length < 2 || name[0] != 'I' || !char.IsUpper(name[1]))
        {
            return name;
        }

        return name[1..];
    }
}
