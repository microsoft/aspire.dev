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
            "A connection string for the SQL Server in the form \"Server=host,port;User ID=sa;Password=<password>;TrustServerCertificate=true\".",
            result);
    }

    [Theory]
    // Password at the end of the example (no trailing ';').
    [InlineData(
        "Host=host;Port=port;Username=postgres;Password=password",
        "Host=host;Port=port;Username=postgres;Password=<password>")]
    // Keyword casing is preserved and the 'Pwd' alias is handled.
    [InlineData("Server=s;Pwd=hunter2;Uid=admin", "Server=s;Pwd=<password>;Uid=admin")]
    [InlineData("server=s;PASSWORD=S0meThing!;uid=a", "server=s;PASSWORD=<password>;uid=a")]
    public void RedactConnectionStringPasswords_RedactsVariousFormats(string input, string expected)
    {
        Assert.Equal(expected, DocumentationSanitizer.RedactConnectionStringPasswords(input));
    }

    [Fact]
    public void RedactConnectionStringPasswords_IsIdempotent()
    {
        var alreadyRedacted = "Server=host,port;User ID=sa;Password=<password>;TrustServerCertificate=true";

        var result = DocumentationSanitizer.RedactConnectionStringPasswords(alreadyRedacted);

        Assert.Equal(alreadyRedacted, result);
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
        Assert.Equal(input, DocumentationSanitizer.RedactConnectionStringPasswords(input!));
    }
}
