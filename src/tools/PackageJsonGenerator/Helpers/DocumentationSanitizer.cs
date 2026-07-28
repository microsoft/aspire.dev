// Licensed to the .NET Foundation under one or more agreements.
// The .NET Foundation licenses this file to you under the MIT license.

using System.Text.RegularExpressions;

namespace PackageJsonGenerator.Helpers;

/// <summary>
/// Sanitizes documentation text copied verbatim from package XML docs before it
/// is emitted into the generated JSON data files.
/// </summary>
public static class DocumentationSanitizer
{
    private const string PasswordPlaceholder = "Placeholder";

    // Matches connection-string style "key=value" credential pairs such as
    // "User ID=sa;Password=password" or "Pwd=hunter2". The '=' is intentionally
    // required with no surrounding whitespace so that C# default parameter
    // values ("string? password = null") are never matched. The value class
    // stops at connection-string / JSON delimiters (';', quotes, backslash) and
    // at the '{'/'}' (and legacy '<'/'>') placeholder markers, which keeps the
    // replacement idempotent (an already-redacted "Password={password}" is left
    // untouched).
    private static readonly Regex ConnectionStringPasswordRegex = new(
        "\\b(password|pwd)=[^;\"'{}<>\\s\\\\,]+",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>
    /// Replaces literal password values inside connection-string style
    /// "key=value" pairs with a <c>{password}</c> placeholder.
    /// </summary>
    /// <remarks>
    /// Documentation is copied verbatim from package XML docs and often contains
    /// example connection strings (for example the SqlServer
    /// <c>GetConnectionString</c> returns text
    /// <c>"Server=host,port;User ID=sa;Password=password;TrustServerCertificate=true"</c>).
    /// Those literal credential tokens are not real secrets, but they trip
    /// push-time secret scanners such as CredScan <c>SqlLegacyCredentials</c>
    /// (SEC101/037) when the generated JSON is mirrored to a protected remote.
    /// A brace-delimited placeholder is used (rather than angle brackets) so the
    /// example still renders correctly when doc nodes are emitted as Markdown.
    /// </remarks>
    /// <param name="text">The documentation text to sanitize.</param>
    /// <returns>The text with connection-string password values redacted.</returns>
    public static string? RedactConnectionStringPasswords(string? text)
    {
        if (string.IsNullOrEmpty(text) || !text.Contains('='))
        {
            return text;
        }

        return ConnectionStringPasswordRegex.Replace(
            text,
            static match => $"{match.Groups[1].Value}={PasswordPlaceholder}");
    }
}
