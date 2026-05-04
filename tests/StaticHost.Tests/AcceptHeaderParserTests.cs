using StaticHost.AgentReadiness;

namespace StaticHost.Tests;

/// <summary>
/// Direct unit tests for <see cref="AcceptHeaderParser"/>. These cover the
/// q-value parsing edge cases without spinning up a host.
/// </summary>
public sealed class AcceptHeaderParserTests
{
    [Theory]
    [InlineData("text/markdown")]
    [InlineData("text/markdown, text/html;q=0.5")]
    [InlineData("text/markdown;q=0.9, text/html;q=0.5")]
    [InlineData("text/markdown;q=1.0, text/*;q=0.5")]
    [InlineData("text/markdown;q=0.8, */*;q=0.5")]
    public void PrefersMarkdown_returns_true_when_markdown_outranks_html(string accept)
    {
        Assert.True(AcceptHeaderParser.PrefersMarkdown(accept));
    }

    [Theory]
    [InlineData("")]
    [InlineData("text/html")]
    [InlineData("text/html, application/xhtml+xml")]
    [InlineData("text/markdown;q=0.5, text/html;q=1.0")]
    [InlineData("text/markdown;q=0.5, text/html")]
    [InlineData("*/*")]
    [InlineData("text/*")]
    [InlineData("text/markdown;q=0.0, text/html")]
    public void PrefersMarkdown_returns_false_for_browsers_and_lower_q(string accept)
    {
        Assert.False(AcceptHeaderParser.PrefersMarkdown(accept));
    }

    [Theory]
    [InlineData("text/html", true)]
    [InlineData("*/*", true)]
    [InlineData("text/*", true)]
    [InlineData("text/html, application/xhtml+xml", true)]
    [InlineData("text/markdown", false)]
    [InlineData("text/markdown;q=1.0, text/html;q=0.0", false)]
    [InlineData("application/json", false)]
    [InlineData("", true)] // empty Accept header is treated as "anything"
    public void AcceptsHtml_distinguishes_html_clients(string accept, bool expected)
    {
        Assert.Equal(expected, AcceptHeaderParser.AcceptsHtml(accept));
    }
}
