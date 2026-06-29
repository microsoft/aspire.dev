// Extension: og-preview
// A GitHub Copilot App canvas that loads a URL (including localhost), parses its
// OpenGraph / Twitter / meta tags, and renders platform-styled previews plus a
// raw-metadata and diagnostics view.
//
// Each open canvas instance gets its own loopback HTTP server (ephemeral port)
// that serves the static UI and a small JSON API. The canvas also exposes two
// agent-callable actions: `preview_url` (drive the open canvas to a URL) and
// `get_metadata` (fetch + parse without a canvas, returning raw metadata).

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { extname } from "node:path";

import { joinSession, createCanvas, CanvasError } from "@github/copilot-sdk/extension";

import { fetchUrl, normalizeUrl } from "./lib/http-fetch.mjs";
import { parseMetadata } from "./lib/parse-og.mjs";

const UI_DIR = new URL("./ui/", import.meta.url);

const CONTENT_TYPES = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
};

// instanceId -> { instanceId, server, url, currentUrl, titleKey, clients:Set<res> }
const instances = new Map();

let sessionRef = null;
function log(message, level = "info") {
    try {
        sessionRef?.log?.(message, { level, ephemeral: true });
    } catch {
        /* logging is best-effort */
    }
}

async function serveAsset(res, name) {
    try {
        const buf = await readFile(fileURLToPath(new URL(name, UI_DIR)));
        res.setHeader("Content-Type", CONTENT_TYPES[extname(name)] || "application/octet-stream");
        res.end(buf);
    } catch {
        res.statusCode = 404;
        res.end("Not found");
    }
}

/** Fetch a target URL and parse its OpenGraph metadata. */
async function loadMetadata(rawUrl) {
    const target = normalizeUrl(rawUrl);
    const result = await fetchUrl(target);
    if (result.status >= 400) {
        throw new Error(`Target responded with HTTP ${result.status}.`);
    }
    if (result.contentType && !/html|xml|text\/plain/i.test(result.contentType)) {
        throw new Error(`Target is not an HTML page (Content-Type: ${result.contentType}).`);
    }
    const html = result.body.toString("utf8");
    const data = parseMetadata(html, result.url);
    data.requestedUrl = result.url;
    data.httpStatus = result.status;
    return data;
}

function sendJson(res, status, obj) {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.end(JSON.stringify(obj));
}

/** Human-readable panel title for the host chrome (scheme stripped for brevity). */
function displayTitle(url) {
    if (!url) return "OpenGraph Preview";
    try {
        const u = new URL(url);
        const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
        return `OG · ${u.host}${path}${u.search}`;
    } catch {
        return `OG · ${url}`;
    }
}

/** Canonical comparison key so trailing-slash / case differences don't loop. */
function titleKey(url) {
    try {
        const u = new URL(normalizeUrl(url));
        return `${u.protocol}//${u.host}${u.pathname.replace(/\/+$/, "")}${u.search}`.toLowerCase();
    } catch {
        return String(url || "").trim().toLowerCase();
    }
}

// Re-opening the same instance is the only SDK path to refresh the host panel
// title. Guard on a canonical key so it fires at most once per distinct URL and
// never feedback-loops (re-open reloads the iframe -> /api/fetch -> here again).
async function syncTitle(entry, url) {
    if (!entry || !url) return;
    const key = titleKey(url);
    if (key === entry.titleKey) return;
    entry.titleKey = key;
    entry.currentUrl = url;
    try {
        await sessionRef?.rpc?.canvas?.open({
            canvasId: "og-preview",
            instanceId: entry.instanceId,
            input: { url },
        });
    } catch (err) {
        log(`Title sync skipped: ${err && err.message ? err.message : err}`, "warning");
    }
}

function broadcast(entry, payload) {
    const data = `data: ${JSON.stringify(payload)}\n\n`;
    for (const client of entry.clients) {
        try {
            client.write(data);
        } catch {
            /* client gone */
        }
    }
}

async function handleRequest(entry, req, res) {
    const reqUrl = new URL(req.url, "http://127.0.0.1");
    const path = reqUrl.pathname;

    if (path === "/" || path === "/index.html") {
        return serveAsset(res, "index.html");
    }
    if (path === "/styles.css" || path === "/app.js") {
        return serveAsset(res, path.slice(1));
    }

    if (path === "/events") {
        res.writeHead(200, {
            "Content-Type": "text/event-stream",
            "Cache-Control": "no-cache",
            Connection: "keep-alive",
        });
        res.write(": connected\n\n");
        entry.clients.add(res);
        req.on("close", () => entry.clients.delete(res));
        return;
    }

    if (path === "/api/fetch") {
        const u = reqUrl.searchParams.get("u");
        if (!u) return sendJson(res, 400, { error: "Missing 'u' query parameter." });
        try {
            const data = await loadMetadata(u);
            entry.currentUrl = data.requestedUrl;
            sendJson(res, 200, data);
            // Refresh the host panel title to the resolved URL (fire-and-forget;
            // guarded against loops by syncTitle).
            syncTitle(entry, data.requestedUrl).catch(() => {});
            return;
        } catch (err) {
            return sendJson(res, 200, { error: err.message });
        }
    }

    if (path === "/api/img") {
        const u = reqUrl.searchParams.get("u");
        if (!u) {
            res.statusCode = 400;
            return res.end("Missing 'u'");
        }
        try {
            const img = await fetchUrl(u, { accept: "image/*,*/*;q=0.8", timeoutMs: 12000 });
            res.statusCode = img.status >= 400 ? img.status : 200;
            res.setHeader("Content-Type", img.contentType || "application/octet-stream");
            res.setHeader("Cache-Control", "public, max-age=300");
            return res.end(img.body);
        } catch {
            res.statusCode = 502;
            return res.end("Image fetch failed");
        }
    }

    res.statusCode = 404;
    res.end("Not found");
}

async function startServer(instanceId, currentUrl) {
    const entry = {
        instanceId,
        server: null,
        url: "",
        currentUrl: currentUrl || "",
        titleKey: currentUrl ? titleKey(currentUrl) : "",
        clients: new Set(),
    };
    const server = createServer((req, res) => {
        Promise.resolve(handleRequest(entry, req, res)).catch((err) => {
            if (!res.headersSent) res.statusCode = 500;
            res.end(String(err && err.message ? err.message : err));
        });
    });
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    entry.server = server;
    entry.url = `http://127.0.0.1:${port}/`;
    instances.set(instanceId, entry);
    return entry;
}

function instanceUrl(entry) {
    const base = entry.url;
    return entry.currentUrl ? `${base}?u=${encodeURIComponent(entry.currentUrl)}` : base;
}

const ogCanvas = createCanvas({
    id: "og-preview",
    displayName: "OpenGraph Preview",
    description:
        "Preview how a URL unfurls on Facebook, X, LinkedIn, Slack, and Discord, with a raw OpenGraph metadata and diagnostics view. Supports localhost.",
    inputSchema: {
        type: "object",
        properties: {
            url: {
                type: "string",
                description: "Optional URL to load immediately (supports http://localhost).",
            },
        },
        additionalProperties: false,
    },
    actions: [
        {
            name: "preview_url",
            description:
                "Load a URL into the open OpenGraph Preview canvas and return its parsed metadata.",
            inputSchema: {
                type: "object",
                properties: { url: { type: "string", description: "URL to preview." } },
                required: ["url"],
                additionalProperties: false,
            },
            handler: async (ctx) => {
                const entry = instances.get(ctx.instanceId);
                if (!entry) {
                    throw new CanvasError("canvas_not_open", "Open the OpenGraph Preview canvas first.");
                }
                const url = ctx.input?.url;
                if (!url) throw new CanvasError("invalid_input", "An 'url' value is required.");
                const data = await loadMetadata(url);
                entry.currentUrl = data.requestedUrl;
                broadcast(entry, { type: "load", url: data.requestedUrl });
                syncTitle(entry, data.requestedUrl).catch(() => {});
                return { requestedUrl: data.requestedUrl, resolved: data.resolved };
            },
        },
        {
            name: "get_metadata",
            description:
                "Fetch a URL and return all parsed OpenGraph / Twitter / meta tags as raw JSON, without requiring the canvas to be open. Supports localhost.",
            inputSchema: {
                type: "object",
                properties: { url: { type: "string", description: "URL to inspect." } },
                required: ["url"],
                additionalProperties: false,
            },
            handler: async (ctx) => {
                const url = ctx.input?.url;
                if (!url) throw new CanvasError("invalid_input", "An 'url' value is required.");
                const data = await loadMetadata(url);
                return {
                    requestedUrl: data.requestedUrl,
                    resolved: data.resolved,
                    raw: data.raw,
                    diagnostics: data.diagnostics,
                };
            },
        },
    ],
    open: async (ctx) => {
        let entry = instances.get(ctx.instanceId);
        const inputUrl = ctx.input?.url;
        if (!entry) {
            entry = await startServer(ctx.instanceId, inputUrl);
        } else if (inputUrl) {
            entry.currentUrl = inputUrl;
            broadcast(entry, { type: "load", url: inputUrl });
        }
        if (inputUrl) entry.titleKey = titleKey(inputUrl);
        log(`OpenGraph Preview canvas opened (${ctx.instanceId}).`);
        return {
            title: displayTitle(entry.currentUrl),
            status: entry.currentUrl ? "Loaded" : "Ready",
            url: instanceUrl(entry),
        };
    },
    onClose: async (ctx) => {
        const entry = instances.get(ctx.instanceId);
        if (!entry) return;
        instances.delete(ctx.instanceId);
        for (const client of entry.clients) {
            try {
                client.end();
            } catch {
                /* ignore */
            }
        }
        await new Promise((resolve) => entry.server.close(() => resolve()));
    },
});

sessionRef = await joinSession({ canvases: [ogCanvas] });
