// Agent-readiness probe. Given a page URL, checks a curated set of emerging
// "is this site ready for AI agents" standards — discoverability (robots.txt,
// sitemap, Link headers), content-for-agents (llms.txt, Markdown negotiation),
// bot access control (AI crawler rules, Content Signals), protocol/agent
// discovery (MCP, A2A agent card, Agent Skills, AI plugin, DNS-AID) and auth
// (OAuth Protected Resource / Authorization Server, API Catalog).
//
// Everything is best-effort and read-only: we GET well-known paths and inspect
// response status/headers/bodies. Uncertain or bleeding-edge standards are
// reported as "emerging" (info) rather than a hard failure, so the section
// nudges without nagging. Inspired by the categories on isitagentready.com.

import dns from "node:dns/promises";
import { fetchUrl } from "./http-fetch.mjs";

// Known AI crawler / agent user-agents to look for in robots.txt.
const AI_BOTS = [
    "GPTBot", "OAI-SearchBot", "ChatGPT-User", "ClaudeBot", "Claude-Web", "Claude-User",
    "anthropic-ai", "PerplexityBot", "Perplexity-User", "Google-Extended", "GoogleOther",
    "Applebot-Extended", "CCBot", "Bytespider", "Amazonbot", "Meta-ExternalAgent",
    "Meta-ExternalFetcher", "FacebookBot", "cohere-ai", "Diffbot", "ImagesiftBot",
    "Omgilibot", "Omgili", "Timpibot", "YouBot", "DuckAssistBot", "PetalBot", "AI2Bot",
    "MistralAI-User", "DeepSeek", "Scrapy", "Kangaroo",
];

function escapeRe(s) {
    return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function probe(url, opts = {}) {
    try {
        const r = await fetchUrl(url, {
            timeoutMs: 7000,
            maxRedirects: 4,
            maxBytes: 256 * 1024,
            ...opts,
        });
        return {
            ok: true,
            status: r.status,
            headers: r.headers || {},
            contentType: r.contentType || "",
            body: r.body,
            bytes: r.body ? r.body.length : 0,
            finalUrl: r.url,
        };
    } catch (err) {
        return { ok: false, status: 0, error: String((err && err.message) || err) };
    }
}

function bodyText(r, max = 4096) {
    if (!r || !r.body) return "";
    return r.body.toString("utf8", 0, Math.min(r.body.length, max));
}

function looksLikeHtml(r) {
    if (/text\/html/i.test(r.contentType || "")) return true;
    const head = bodyText(r, 512).trimStart().toLowerCase();
    return head.startsWith("<!doctype html") || head.startsWith("<html") || head.includes("<head");
}

function isJsonish(r) {
    if (r.status !== 200 || !r.bytes) return false;
    if (/json/i.test(r.contentType || "")) return true;
    const head = bodyText(r, 256).trimStart();
    return head.startsWith("{") || head.startsWith("[");
}

function fmtBytes(n) {
    if (!n) return "0 B";
    if (n < 1024) return `${n} B`;
    return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
}

function missDetail(r) {
    if (r && r.ok && r.status) return `Not found (HTTP ${r.status})`;
    return "Not found";
}

async function dnsAid(host) {
    const names = [`_agent.${host}`, `_aid.${host}`, `_aid-discovery.${host}`, host];
    for (const name of names) {
        try {
            const recs = await dns.resolveTxt(name);
            const flat = recs
                .map((chunks) => chunks.join(""))
                .find((v) => /(^|;|\s)v=aid/i.test(v) || /\b(agent|endpoint)=/i.test(v));
            if (flat) return { ok: true, name, value: flat.slice(0, 240) };
        } catch {
            /* NXDOMAIN / no TXT — keep trying the next candidate */
        }
    }
    return { ok: false };
}

export async function checkAgentReadiness(rawUrl) {
    const u = new URL(rawUrl);
    const origin = u.origin;
    const host = u.hostname;
    const W = (p) => origin + p;

    const [
        robots, sitemapXml, llms, llmsFull, mdNeg, page,
        mcp1, mcp2, a2a1, a2a2, aiPlugin, skills1, skills2,
        oauthPr, oauthAs, apiCatalog, aid,
    ] = await Promise.all([
        probe(W("/robots.txt"), { accept: "text/plain,*/*;q=0.8" }),
        probe(W("/sitemap.xml"), { accept: "application/xml,text/xml,*/*;q=0.8" }),
        probe(W("/llms.txt"), { accept: "text/markdown,text/plain,*/*;q=0.8" }),
        probe(W("/llms-full.txt"), { accept: "text/markdown,text/plain,*/*;q=0.8" }),
        probe(rawUrl, { accept: "text/markdown; q=1.0, text/x-markdown; q=0.9, text/plain; q=0.5" }),
        probe(rawUrl, { accept: "text/html,application/xhtml+xml" }),
        probe(W("/.well-known/mcp"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/mcp.json"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/agent.json"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/agent-card.json"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/ai-plugin.json"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/agent-skills.json"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/skills.json"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/oauth-protected-resource"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/oauth-authorization-server"), { accept: "application/json,*/*;q=0.8" }),
        probe(W("/.well-known/api-catalog"), { accept: "application/linkset+json,application/json,*/*;q=0.8" }),
        dnsAid(host),
    ]);

    // --- robots.txt driven signals ---
    const robotsText = robots.ok && robots.status < 400 ? robots.body.toString("utf8") : "";
    const hasRobots = robots.ok && robots.status === 200 && robotsText.trim().length > 0;
    const sitemapInRobots = /^\s*sitemap:\s*\S+/im.test(robotsText);
    const sitemapFileOk =
        sitemapXml.status === 200 && !looksLikeHtml(sitemapXml) &&
        /<(urlset|sitemapindex)\b/i.test(bodyText(sitemapXml, 2048));
    const hasSitemap = sitemapInRobots || sitemapFileOk;
    const aiBotsFound = AI_BOTS.filter((b) =>
        new RegExp(`user-agent:\\s*${escapeRe(b)}\\b`, "i").test(robotsText),
    );
    const contentSignals = /content-signal\s*:/i.test(robotsText) || /content-usage\s*:/i.test(robotsText);

    // --- content-for-agents ---
    const hasLlms = llms.status === 200 && llms.bytes > 0 && !looksLikeHtml(llms);
    const hasLlmsFull = llmsFull.status === 200 && llmsFull.bytes > 0 && !looksLikeHtml(llmsFull);
    const mdOk = mdNeg.status === 200 && /text\/(x-)?markdown/i.test(mdNeg.contentType || "");

    // --- Link headers (RFC 8288) on the main document ---
    const linkHeader = page.ok ? page.headers.link || page.headers.Link : "";
    const linkRels = linkHeader
        ? Array.from(String(linkHeader).matchAll(/rel="?([^",;]+)"?/gi)).map((m) => m[1].trim())
        : [];
    const hasLink = linkRels.length > 0;
    const apiCatalogLink = linkRels.some((r) => /api-catalog/i.test(r));

    // --- protocol / agent discovery ---
    const hasMcp = isJsonish(mcp1) || isJsonish(mcp2) || (mcp1.status === 200 && !looksLikeHtml(mcp1));
    const hasA2a = isJsonish(a2a1) || isJsonish(a2a2);
    const hasAiPlugin = isJsonish(aiPlugin);
    const hasSkills = isJsonish(skills1) || isJsonish(skills2);
    const hasOauthPr = isJsonish(oauthPr);
    const hasOauthAs = isJsonish(oauthAs);
    const hasApiCatalog = apiCatalog.status === 200 && (isJsonish(apiCatalog) || apiCatalogLink);

    const scored = (ok, warnIfMissing) => (ok ? "pass" : warnIfMissing ? "warn" : "info");

    const categories = [
        {
            id: "discoverability",
            label: "Discoverability",
            checks: [
                {
                    id: "robots",
                    label: "robots.txt",
                    status: scored(hasRobots, true),
                    detail: hasRobots
                        ? `Found · ${fmtBytes(robots.bytes)}${sitemapInRobots ? " · declares Sitemap" : ""}`
                        : missDetail(robots),
                },
                {
                    id: "sitemap",
                    label: "XML sitemap",
                    status: scored(hasSitemap, true),
                    detail: hasSitemap
                        ? sitemapInRobots
                            ? "Declared in robots.txt"
                            : "Found at /sitemap.xml"
                        : missDetail(sitemapXml),
                },
                {
                    id: "link-headers",
                    label: "Response Link headers",
                    status: scored(hasLink, false),
                    detail: hasLink ? `Present · rel: ${linkRels.slice(0, 4).join(", ")}` : "No Link response header",
                },
            ],
        },
        {
            id: "content",
            label: "Content for agents",
            checks: [
                {
                    id: "llms",
                    label: "llms.txt",
                    status: scored(hasLlms, true),
                    detail: hasLlms
                        ? `Found · ${fmtBytes(llms.bytes)}${hasLlmsFull ? " · llms-full.txt too" : ""}`
                        : missDetail(llms),
                },
                {
                    id: "markdown",
                    label: "Markdown content negotiation",
                    status: scored(mdOk, true),
                    detail: mdOk
                        ? `Serves ${mdNeg.contentType.split(";")[0]} for Accept: text/markdown`
                        : "No Markdown returned for Accept: text/markdown",
                },
            ],
        },
        {
            id: "bots",
            label: "Bot access control",
            checks: [
                {
                    id: "ai-bots",
                    label: "AI crawler rules",
                    status: scored(aiBotsFound.length > 0, true),
                    detail: aiBotsFound.length
                        ? `robots.txt names ${aiBotsFound.length} AI agent(s): ${aiBotsFound.slice(0, 4).join(", ")}${
                              aiBotsFound.length > 4 ? "…" : ""
                          }`
                        : "No AI-specific user-agent rules in robots.txt",
                },
                {
                    id: "content-signals",
                    label: "Content Signals",
                    status: scored(contentSignals, false),
                    detail: contentSignals ? "Content-Signal directives present" : "No Content-Signal policy in robots.txt",
                },
            ],
        },
        {
            id: "protocols",
            label: "Agent & protocol discovery",
            checks: [
                {
                    id: "mcp",
                    label: "MCP server discovery",
                    status: scored(hasMcp, false),
                    detail: hasMcp ? "Found /.well-known/mcp" : missDetail(mcp2.status ? mcp2 : mcp1),
                },
                {
                    id: "a2a",
                    label: "A2A agent card",
                    status: scored(hasA2a, false),
                    detail: hasA2a ? "Found /.well-known/agent(-card).json" : missDetail(a2a1),
                },
                {
                    id: "agent-skills",
                    label: "Agent Skills manifest",
                    status: scored(hasSkills, false),
                    detail: hasSkills ? "Found a well-known skills manifest" : "No skills manifest",
                },
                {
                    id: "ai-plugin",
                    label: "AI plugin manifest",
                    status: scored(hasAiPlugin, false),
                    detail: hasAiPlugin ? "Found /.well-known/ai-plugin.json" : missDetail(aiPlugin),
                },
                {
                    id: "dns-aid",
                    label: "DNS for AI Discovery",
                    status: scored(aid.ok, false),
                    detail: aid.ok ? `TXT ${aid.name}` : "No agent-discovery TXT record",
                },
            ],
        },
        {
            id: "auth",
            label: "Auth for agents",
            checks: [
                {
                    id: "oauth-pr",
                    label: "OAuth Protected Resource",
                    status: scored(hasOauthPr, false),
                    detail: hasOauthPr ? "Found (RFC 9728)" : missDetail(oauthPr),
                },
                {
                    id: "oauth-as",
                    label: "OAuth Authorization Server",
                    status: scored(hasOauthAs, false),
                    detail: hasOauthAs ? "Found (RFC 8414)" : missDetail(oauthAs),
                },
                {
                    id: "api-catalog",
                    label: "API Catalog",
                    status: scored(hasApiCatalog, false),
                    detail: hasApiCatalog ? "Found (RFC 9727)" : missDetail(apiCatalog),
                },
            ],
        },
    ];

    let detected = 0;
    let recommendedMissing = 0;
    let total = 0;
    for (const cat of categories) {
        for (const c of cat.checks) {
            total += 1;
            if (c.status === "pass") detected += 1;
            else if (c.status === "warn") recommendedMissing += 1;
        }
    }

    return {
        url: rawUrl,
        origin,
        summary: { detected, recommendedMissing, total },
        categories,
    };
}
