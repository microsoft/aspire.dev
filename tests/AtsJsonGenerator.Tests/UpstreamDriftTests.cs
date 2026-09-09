using System.Security.Cryptography;
using System.Text;
using System.Text.Json;

namespace AtsJsonGenerator.Tests;

public sealed class UpstreamDriftTests
{
    [Fact]
    public void UpstreamLock_MatchesPinnedGeneratorAndCliBlobs()
    {
        var lockPath = Path.Combine(AppContext.BaseDirectory, "upstream-sources.lock.json");
        using var document = JsonDocument.Parse(File.ReadAllText(lockPath));
        var root = document.RootElement;

        Assert.Equal("microsoft/aspire", root.GetProperty("repository").GetString());
        Assert.Equal("62028348b5d02dfc8f8baf03a4472946537b0d16", root.GetProperty("commit").GetString());
        var aggregateSha256 = root.GetProperty("aggregateSha256").GetString();
        Assert.Equal(
            "cbf8fbf1459cb22e56dab6f56b1f1af626c716c56db8397c2b9b5454bd11e0c1",
            aggregateSha256);

        var expected = new Dictionary<string, string>(StringComparer.Ordinal)
        {
            ["src/Shared/CodeGeneration/AtsOptionsFlattening.cs"] = "b93548dead50e2d8d673bca235ae3f2004193add",
            ["src/Aspire.Hosting.CodeGeneration.TypeScript/AtsTypeScriptCodeGenerator.cs"] = "98d634b60ad8f04c8fb64d442d6244908d43cbb1",
            ["src/Aspire.Hosting.CodeGeneration.TypeScript/TypeScriptApiProjector.cs"] = "075e60d08b9ada5d41725ac00e686ba6475e700a",
            ["tests/Aspire.Hosting.CodeGeneration.TypeScript.Tests/AtsTypeScriptCodeGeneratorTests.cs"] = "447d19744402146270e425da3e046db5fb94fba1",
            ["src/Aspire.Hosting.CodeGeneration.Python/AtsPythonCodeGenerator.cs"] = "18fc2696e3ed6dda14dbba2b3f0c25c5c5a617ba",
            ["src/Aspire.Hosting.CodeGeneration.Python/PythonModuleBuilder.cs"] = "ec1e37facc62e3b950dc55f974d0f292994e8b66",
            ["tests/Aspire.Hosting.CodeGeneration.Python.Tests/AtsPythonCodeGeneratorTests.cs"] = "7d0be4da96c02e61e8af737f0aa002ce7ccdfea1",
            ["tests/Aspire.Hosting.CodeGeneration.Python.Tests/Snapshots/AtsGeneratedAspire.verified.py"] = "58710bef30ead66e4f739b8dbc73fe02f1dee49f",
            ["src/Aspire.Hosting.CodeGeneration.Go/AtsGoCodeGenerator.cs"] = "77b20a264218676b4c372dfb6349aad7bcf7a240",
            ["src/Aspire.Hosting.CodeGeneration.Go/Resources/base.go"] = "f4e7b8d22dc00ac73005ac5e5e850c27330b5dc7",
            ["tests/Aspire.Hosting.CodeGeneration.Go.Tests/AtsGoCodeGeneratorTests.cs"] = "c141efecce60c77299f7cf050a6570f09c7b85fa",
            ["tests/Aspire.Hosting.CodeGeneration.Go.Tests/Snapshots/AtsGeneratedAspire.verified.go"] = "dbcf2b90e31990d2c0e595a2b75e7439bc00e743",
            ["src/Aspire.Hosting.CodeGeneration.Java/AtsJavaCodeGenerator.cs"] = "485f1336a53a1fb7e56c080a2b74fe1f27317460",
            ["src/Aspire.Hosting.CodeGeneration.Java/Resources/Transport.java"] = "608bb2c878ce7bb537a343089c80147ffb49bae0",
            ["tests/Aspire.Hosting.CodeGeneration.Java.Tests/AtsJavaCodeGeneratorTests.cs"] = "c8313998fd0fd167a14e246610ecee2ac72db228",
            ["tests/Aspire.Hosting.CodeGeneration.Java.Tests/Snapshots/AtsGeneratedAspire.verified.java"] = "9079b1d84aedec46605c5a7ecf80c69c64044e77",
            ["src/Aspire.Hosting.CodeGeneration.Rust/AtsRustCodeGenerator.cs"] = "2c219bf4f69c64569e27abbf576d53f5c6b2e9cd",
            ["tests/Aspire.Hosting.CodeGeneration.Rust.Tests/AtsRustCodeGeneratorTests.cs"] = "0a2725bcc53c1e8de80da08282cc63ecedb829bd",
            ["tests/Aspire.Hosting.CodeGeneration.Rust.Tests/Snapshots/AtsGeneratedAspire.verified.rs"] = "25d0bcf6ed03b370114770e48de95ced89f88d00",
            ["src/Aspire.Cli/Commands/Sdk/SdkDumpCommand.cs"] = "c61accb20133302f91ffeb6f8576a4130f12d7ea",
        };

        var actual = root.GetProperty("sources")
            .EnumerateArray()
            .ToDictionary(
                source => source.GetProperty("path").GetString()!,
                source => source.GetProperty("blob").GetString()!,
                StringComparer.Ordinal);

        Assert.Equal(expected.OrderBy(pair => pair.Key), actual.OrderBy(pair => pair.Key));
        Assert.All(actual.Values, blob =>
            Assert.Matches("^[0-9a-f]{40}$", blob));

        var canonicalEntries = string.Join(
            "\n",
            actual.OrderBy(pair => pair.Key, StringComparer.Ordinal)
                .Select(pair => $"{pair.Key}\t{pair.Value}"));
        var computedAggregate = Convert.ToHexString(
            SHA256.HashData(Encoding.UTF8.GetBytes(canonicalEntries)))
            .ToLowerInvariant();

        Assert.Equal(aggregateSha256, computedAggregate);
    }
}
