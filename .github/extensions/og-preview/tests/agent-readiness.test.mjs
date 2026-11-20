import assert from "node:assert/strict";
import { test } from "node:test";
import { once } from "node:events";
import { createServer } from "node:http";
import dns from "node:dns/promises";
import { authorizePreview } from "../lib/http-fetch.mjs";
import { checkAgentReadiness } from "../lib/agent-readiness.mjs";

// Probes read at most 256 KiB, so these responses are all larger than that.
const oversized = 300 * 1024;

test("probe responses over the size cap are still detected, not reported missing", async (t) => {
    t.mock.method(dns, "resolveTxt", async () => {
        throw new Error("ENOTFOUND");
    });
    const robots = "User-agent: GPTBot\nDisallow: /\nSitemap: /sitemap.xml\n".padEnd(oversized, "#");
    const server = createServer((req, res) => {
        const send = (type, body, headers = {}) => {
            res.writeHead(200, { "Content-Type": type, ...headers });
            res.end(body);
        };
        if (req.url === "/robots.txt") return send("text/plain", robots);
        if (req.url === "/llms.txt") return send("text/markdown", "# Example\n> Docs for agents.\n");
        if (req.url === "/llms-full.txt") return send("text/markdown", "# Example\n".padEnd(oversized, "x"));
        if (req.url === "/") {
            if (/markdown/i.test(req.headers.accept || "")) return send("text/markdown", "# Home\n".padEnd(oversized, "x"));
            return send("text/html", "<!doctype html><title>Home</title>".padEnd(oversized, " "), {
                Link: '</.well-known/api-catalog>; rel="api-catalog"',
            });
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    const url = `http://127.0.0.1:${server.address().port}/`;
    try {
        const report = await checkAgentReadiness(url, await authorizePreview(url, false));
        const checks = Object.fromEntries(report.categories.flatMap((c) => c.checks).map((c) => [c.id, c]));

        assert.equal(checks.robots.status, "pass");
        assert.match(checks.robots.detail, /Found · 256 KB\+ · declares Sitemap/, "a cut-off size is not shown as the full size");
        assert.equal(checks["ai-bots"].status, "pass");
        assert.equal(checks.llms.status, "pass");
        assert.match(checks.llms.detail, /llms-full\.txt too/);
        assert.equal(checks.markdown.status, "pass");
        assert.equal(checks["link-headers"].status, "pass");
        assert.match(checks["link-headers"].detail, /api-catalog/);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
});
