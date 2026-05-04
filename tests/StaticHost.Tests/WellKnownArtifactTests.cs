using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.FileProviders;

namespace StaticHost.Tests;

/// <summary>
/// Validates the static well-known artifacts that ship via the frontend's
/// <c>public/</c> directory. We read them off disk from the worktree because
/// they are static fixtures shared with the live deployment.
/// </summary>
public sealed class WellKnownArtifactTests
{
    private static string FrontendPublicDir
    {
        get
        {
            // The test binary lives under tests/StaticHost.Tests/bin/<config>/<tfm>/
            // Walk up to repo root, then descend to src/frontend/public.
            var dir = new DirectoryInfo(AppContext.BaseDirectory);
            while (dir is not null && !File.Exists(Path.Combine(dir.FullName, "Aspire.Dev.slnx")))
            {
                dir = dir.Parent;
            }
            Assert.NotNull(dir);
            return Path.Combine(dir.FullName, "src", "frontend", "public");
        }
    }

    [Fact]
    public void RobotsTxt_declares_content_signal_inside_user_agent_star_block()
    {
        var path = Path.Combine(FrontendPublicDir, "robots.txt");
        var text = File.ReadAllText(path);

        // Locate the User-agent: * group and verify Content-Signal appears
        // before the next User-agent: directive (i.e. within the same group).
        var lines = text.Split('\n').Select(l => l.Trim()).ToArray();
        var inStarGroup = false;
        var sawContentSignal = false;
        foreach (var line in lines)
        {
            if (line.StartsWith("User-agent:", StringComparison.OrdinalIgnoreCase))
            {
                inStarGroup = string.Equals(
                    line[("User-agent:".Length)..].Trim(),
                    "*",
                    StringComparison.Ordinal);
            }
            else if (inStarGroup &&
                     line.StartsWith("Content-Signal:", StringComparison.OrdinalIgnoreCase))
            {
                sawContentSignal = true;
                Assert.Contains("ai-train=yes", line);
                Assert.Contains("search=yes", line);
                Assert.Contains("ai-input=yes", line);
            }
        }

        Assert.True(sawContentSignal,
            "robots.txt must contain a `Content-Signal:` directive inside the `User-agent: *` group.");
    }

    [Fact]
    public void AgentSkills_index_matches_RFC_v0_2_0_shape_and_digests()
    {
        var indexPath = Path.Combine(FrontendPublicDir, ".well-known", "agent-skills", "index.json");
        Assert.True(File.Exists(indexPath), $"Missing {indexPath}");

        using var doc = JsonDocument.Parse(File.ReadAllText(indexPath));
        var root = doc.RootElement;

        Assert.True(root.TryGetProperty("$schema", out _),
            "Agent Skills Discovery v0.2.0 requires a $schema property.");
        Assert.True(root.TryGetProperty("version", out _));
        Assert.True(root.TryGetProperty("skills", out var skills));
        Assert.Equal(JsonValueKind.Array, skills.ValueKind);
        Assert.True(skills.GetArrayLength() >= 1, "Expected at least one skill entry.");

        foreach (var skill in skills.EnumerateArray())
        {
            Assert.True(skill.TryGetProperty("name", out var name) && name.ValueKind == JsonValueKind.String);
            Assert.True(skill.TryGetProperty("type", out var type));
            Assert.Equal("skill-md", type.GetString());
            Assert.True(skill.TryGetProperty("description", out _));
            Assert.True(skill.TryGetProperty("url", out var urlEl));
            Assert.True(skill.TryGetProperty("digest", out var digestEl));

            var digest = digestEl.GetString()!;
            Assert.StartsWith("sha256:", digest, StringComparison.Ordinal);

            // Verify digest matches the actual file content.
            var url = urlEl.GetString()!;
            // url is server-relative, e.g. /.well-known/agent-skills/getting-started-with-aspire/SKILL.md
            var localPath = Path.Combine(
                FrontendPublicDir,
                url.TrimStart('/').Replace('/', Path.DirectorySeparatorChar));

            Assert.True(File.Exists(localPath), $"Missing skill file referenced by index.json: {localPath}");

            var bytes = File.ReadAllBytes(localPath);
            var actual = "sha256:" + Convert.ToHexStringLower(SHA256.HashData(bytes));
            Assert.Equal(digest, actual);
        }
    }

    [Fact]
    public void AgentSkills_files_are_LF_only()
    {
        // Digests are byte-stable only when the working tree honors `eol=lf`.
        // Anyone editing the file with CRLF in their editor would invalidate
        // the digest in CI; this test catches that locally.
        var skillsRoot = Path.Combine(FrontendPublicDir, ".well-known", "agent-skills");
        var files = Directory.EnumerateFiles(skillsRoot, "*", SearchOption.AllDirectories)
            .Where(f => f.EndsWith(".md", StringComparison.OrdinalIgnoreCase) ||
                        f.EndsWith("index.json", StringComparison.OrdinalIgnoreCase));

        foreach (var file in files)
        {
            var bytes = File.ReadAllBytes(file);
            var crIndex = Array.IndexOf(bytes, (byte)'\r');
            Assert.True(crIndex < 0,
                $"{file} contains a CR byte at offset {crIndex}; agent-skills artifacts must be LF-only " +
                "(see .gitattributes). This breaks the SHA-256 digest published in index.json.");
        }
    }
}
