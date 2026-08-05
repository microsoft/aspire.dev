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
    // values ("string? password = null") are never matched. The value (capture
    // group 2) stops at connection-string / JSON delimiters (';', quotes, comma,
    // backslash), at markdown / URI delimiters ('`', ')', ']', '&', '|') so a
    // trailing token or inline-code fence is not swallowed, and at the '{'/'}'
    // (and legacy '<'/'>') markers. A trailing '.' is trimmed off the value in
    // the replacement callback (sentence terminators) rather than excluded from
    // the class, which would truncate dotted values. Re-running over
    // already-redacted text reproduces identical output, so replacement is
    // idempotent.
    private static readonly Regex ConnectionStringPasswordRegex = new(
        "\\b(password|pwd)=([^;\"'{}<>\\s\\\\,`)\\]&|]+)",
        RegexOptions.IgnoreCase | RegexOptions.CultureInvariant | RegexOptions.Compiled);

    /// <summary>
    /// Replaces literal password values inside connection-string style
    /// "key=value" pairs with a <c>Placeholder</c> token.
    /// </summary>
    /// <remarks>
    /// Documentation is copied verbatim from package XML docs and often contains
    /// example connection strings, such as the text returned by SqlServer's
    /// <c>GetConnectionString</c>. Literal credential tokens in those examples
    /// are not real secrets, but they trip
    /// push-time secret scanners such as CredScan <c>SqlLegacyCredentials</c>
    /// (SEC101/037) when the generated JSON is mirrored to a protected remote.
    /// The <c>Placeholder</c> token contains no markup or brace characters, so the
    /// example still renders correctly when doc nodes are emitted as Markdown; it
    /// is the redaction value recommended by 1ES for scrubbed credential examples.
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
            static match =>
            {
                // Preserve a trailing sentence period that the value class
                // intentionally consumes (dots are valid inside values, so they
                // are trimmed here rather than excluded from the character class).
                var value = match.Groups[2].Value;
                var redacted = value.TrimEnd('.');
                var trailingDots = value[redacted.Length..];
                return $"{match.Groups[1].Value}={PasswordPlaceholder}{trailingDots}";
            });
    }
}
