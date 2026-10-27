using PackageJsonGenerator.Helpers;

namespace PackageJsonGenerator.Tests;

public sealed class DocumentationSanitizerTests
{
    [Fact]
    public void RedactConnectionStringPasswords_RedactsSqlServerConnectionString()
    {
        var input = "A connection string for the SQL Server in the form \"Server=host,port;User ID=sa;Password=password;TrustServerCertificate=true\".";

        var result = DocumentationSanitizer.RedactConnectionStringPasswords(input);

        Assert.Equal(
            "A connection string for the SQL Server in the form \"Server=host,port;User ID=sa;Password=Placeholder;TrustServerCertificate=true\".",
            result);
    }

    [Theory]
    // Password at the end of the example (no trailing ';').
    [InlineData(
        "Host=host;Port=port;Username=postgres;Password=password",
        "Host=host;Port=port;Username=postgres;Password=Placeholder")]
    // Keyword casing is preserved and the 'Pwd' alias is handled.
    [InlineData("Server=s;Pwd=hunter2;Uid=admin", "Server=s;Pwd=Placeholder;Uid=admin")]
    [InlineData("server=s;PASSWORD=S0meThing!;uid=a", "server=s;PASSWORD=Placeholder;uid=a")]
    public void RedactConnectionStringPasswords_RedactsVariousFormats(string input, string expected)
    {
        Assert.Equal(expected, DocumentationSanitizer.RedactConnectionStringPasswords(input));
    }

    [Fact]
    public void RedactConnectionStringPasswords_IsIdempotent()
    {
        var alreadyRedacted = "Server=host,port;User ID=sa;Password=Placeholder;TrustServerCertificate=true";

        var result = DocumentationSanitizer.RedactConnectionStringPasswords(alreadyRedacted);

        Assert.Equal(alreadyRedacted, result);
    }

    [Fact]
    public void RedactConnectionStringPasswords_UsesMarkdownSafePlaceholder()
    {
        // The placeholder must not contain angle brackets, which would be
        // dropped as raw HTML when doc nodes are rendered to Markdown.
        var result = DocumentationSanitizer.RedactConnectionStringPasswords("Password=password");

        Assert.Equal("Password=Placeholder", result);
        Assert.DoesNotContain('<', result!);
        Assert.DoesNotContain('>', result!);
    }

    [Theory]
    // C# default parameter values use spaces around '=' and must not be touched.
    [InlineData("public static IResourceBuilder<T> WithPassword<T>(this IResourceBuilder<T> b, string? password = null)")]
    [InlineData("The password used to authenticate. Defaults to a generated value.")]
    [InlineData("Gets the connection string for the resource.")]
    public void RedactConnectionStringPasswords_LeavesNonConnectionStringTextUntouched(string input)
    {
        Assert.Equal(input, DocumentationSanitizer.RedactConnectionStringPasswords(input));
    }

    [Theory]
    [InlineData("")]
    [InlineData(null)]
    public void RedactConnectionStringPasswords_HandlesEmptyAndNull(string? input)
    {
        Assert.Equal(input, DocumentationSanitizer.RedactConnectionStringPasswords(input));
    }

    [Theory]
    // A following inline-code fence, link paren, table pipe, or bracket must not
    // be swallowed into the redacted value; they delimit the value's end.
    [InlineData("Use `Password=secret` in config.", "Use `Password=Placeholder` in config.")]
    [InlineData("[docs](https://h/api?password=secret)", "[docs](https://h/api?password=Placeholder)")]
    [InlineData("https://h/api?password=secret&uid=sa", "https://h/api?password=Placeholder&uid=sa")]
    [InlineData("|Password=secret|Uid=sa|", "|Password=Placeholder|Uid=sa|")]
    [InlineData("[Password=secret]", "[Password=Placeholder]")]
    // A trailing sentence period is preserved, not consumed into the value.
    [InlineData("The default is Password=secret.", "The default is Password=Placeholder.")]
    public void RedactConnectionStringPasswords_StopsAtMarkdownAndUriDelimiters(string input, string expected)
    {
        Assert.Equal(expected, DocumentationSanitizer.RedactConnectionStringPasswords(input));
    }
}
