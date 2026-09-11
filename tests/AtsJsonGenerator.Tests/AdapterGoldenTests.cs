using System.Text;
using AtsJsonGenerator.Helpers;

namespace AtsJsonGenerator.Tests;

public sealed class AdapterGoldenTests
{
    [Theory]
    [InlineData("typescript")]
    [InlineData("python")]
    [InlineData("go")]
    [InlineData("java")]
    [InlineData("rust")]
    public void AdapterProjection_MatchesGolden(string language)
    {
        var model = AtsTransformer.Transform(
            AtsJsonGeneratorTests.LoadFixture(),
            "Contoso.Hosting.Widgets");
        var actual = BuildGolden(model, language);
        var expectedPath = Path.Combine(AppContext.BaseDirectory, "Golden", language + ".golden");
        var expected = File.ReadAllText(expectedPath).Replace("\r\n", "\n", StringComparison.Ordinal);

        Assert.Equal(expected, actual);
    }

    private static string BuildGolden(AppHostModuleModel model, string language)
    {
        var builder = new StringBuilder();
        foreach (var item in model.Items)
        {
            var projection = item.Projections[language];
            builder.Append(item.Id).Append('\t')
                .Append(projection.Status).Append('\t')
                .Append(Escape(projection.Identifier)).Append('\t')
                .Append(Escape(projection.Signature)).Append('\t')
                .Append(Escape(projection.Declaration)).Append('\t')
                .Append(string.Join(",", projection.Parameters.Select(parameter =>
                    $"{parameter.Name}:{parameter.Type}:{(parameter.IsOptional ? "optional" : "required")}:{parameter.DefaultValue ?? "-"}")))
                .Append('\t')
                .Append(projection.Return is null
                    ? ""
                    : $"{projection.Return.Type}:{projection.Return.ErrorModel}")
                .Append('\t')
                .Append(string.Join(",", projection.Fields.Select(field =>
                    $"{field.Name}:{field.Type}:{(field.IsOptional ? "optional" : "required")}")))
                .Append('\t')
                .Append(string.Join(",", projection.Members.Select(member =>
                    $"{member.Name}={member.Value}")))
                .Append('\t')
                .Append(Escape(projection.ValueExpression)).Append('\t')
                .Append(Escape(projection.Reason))
                .Append('\n');
        }

        return builder.ToString();
    }

    private static string Escape(string? value)
        => value?.Replace("\\", "\\\\", StringComparison.Ordinal)
            .Replace("\t", "\\t", StringComparison.Ordinal)
            .Replace("\r", "\\r", StringComparison.Ordinal)
            .Replace("\n", "\\n", StringComparison.Ordinal)
            ?? "";
}
