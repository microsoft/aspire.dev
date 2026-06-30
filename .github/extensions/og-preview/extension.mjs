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

// Default panel handle used when the agent opens the canvas via the
// `open_og_preview` tool without specifying one.
const DEFAULT_INSTANCE = "og-main";

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

function escapeHtmlAttr(s) {
    return String(s)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
}

// Small in-frame bridge injected into proxied pages. Runs in a sandboxed
// (opaque-origin) iframe, so it can't touch the host canvas document but can
// postMessage navigation events to the parent. It also keeps link clicks and
// SPA history changes flowing back through /api/proxy so the browse frame stays
// embeddable and the parent can mirror the live route into the preview.
function browseBridgeScript(finalUrl, proxyBase) {
    const real = JSON.stringify(finalUrl).replace(/</g, "\\u003c");
    const base = JSON.stringify(proxyBase).replace(/</g, "\\u003c");
    return `<script>(function(){
var REAL=${real};
var PROXY=${base};
/* This frame is sandboxed without allow-same-origin (so it can't escape to the
   host canvas), which gives it an opaque origin. On an opaque origin, touching
   localStorage / sessionStorage / document.cookie throws SecurityError, which
   crashes most frameworks during boot and stops hydration. Shim them with
   in-memory stores so JS-driven content can render. */
function memStore(){var m={};var api={getItem:function(k){return Object.prototype.hasOwnProperty.call(m,k)?m[k]:null;},setItem:function(k,v){m[String(k)]=String(v);},removeItem:function(k){delete m[String(k)];},clear:function(){for(var k in m){if(Object.prototype.hasOwnProperty.call(m,k))delete m[k];}},key:function(i){return Object.keys(m)[i]||null;}};try{Object.defineProperty(api,"length",{get:function(){return Object.keys(m).length;}});}catch(_){}return api;}
function shimStore(name){try{window[name].getItem("__og_probe__");return;}catch(e){}try{Object.defineProperty(window,name,{value:memStore(),configurable:true});}catch(_){}}
shimStore("localStorage");shimStore("sessionStorage");
try{document.cookie;}catch(ce){var _ck="";try{Object.defineProperty(document,"cookie",{configurable:true,get:function(){return _ck;},set:function(v){var p=String(v).split(";")[0];if(p)_ck=_ck?_ck+"; "+p:p;}});}catch(_){}}
function post(u,mode){try{parent.postMessage({source:"og-browse",type:"nav",url:u,mode:mode||"hard"},"*");}catch(e){}}
function px(a){return PROXY+"?u="+encodeURIComponent(a);}
/* Map a navigation target to a real http(s) URL. SPAs often build URLs from
   window.location (which is about:srcdoc in this frame), yielding values like
   "about:srcdoc?aspire-lang=csharp". Re-apply such a URL's query/hash onto the
   real page URL so navigation points at a real page, not about:srcdoc. */
function resolveNav(u){
 var x;try{x=new URL(String(u),REAL);}catch(_){return null;}
 if(/^https?:$/i.test(x.protocol))return x.toString();
 if(x.protocol==="about:"){try{var b=new URL(REAL);b.search=x.search||"";b.hash=x.hash||"";return b.toString();}catch(_){return null;}}
 return null;
}
document.addEventListener("click",function(e){
 if(e.defaultPrevented||e.button!==0||e.metaKey||e.ctrlKey||e.shiftKey||e.altKey)return;
 var a=e.target&&e.target.closest?e.target.closest("a[href]"):null;
 if(!a)return;
 var href=a.getAttribute("href");
 if(!href||href.charAt(0)==="#")return;
 if(/^(mailto:|tel:|javascript:|data:)/i.test(href))return;
 if(a.target&&a.target!==""&&a.target!=="_self")return;
 var abs=resolveNav(a.href);if(!abs)return;
 e.preventDefault();post(abs,"hard");
},true);
function wrap(n){var o=history[n];if(typeof o!=="function")return;history[n]=function(){var r=o.apply(this,arguments);try{var u=arguments[2];if(u!=null){var nav=resolveNav(u);if(nav)post(nav,"soft");}}catch(_){}return r;};}
wrap("pushState");wrap("replaceState");
if(document.readyState==="loading")document.addEventListener("DOMContentLoaded",function(){post(REAL,"init");});else post(REAL,"init");
})();<\/script>`;
}

// --- Browse proxy URL rewriting --------------------------------------------
// To make a framed page interactive, its scripts/styles must load from OUR
// loopback origin (same-origin-secure: we add Access-Control-Allow-Origin so the
// sandboxed opaque-origin frame can fetch them — no allow-same-origin needed, so
// the page still can't reach the host canvas). We use a PATH-style proxy URL,
// /api/proxy/<scheme>/<host>/<path>, instead of ?u=<encoded>, specifically so a
// bundled module's RELATIVE imports (./chunk.js) resolve against the proxied URL
// and transparently route back through us — no JS import rewriting required for
// the common case.

/** Build a path-style proxy URL for an absolute http(s) URL (others pass through). */
function proxyEncode(absUrl, appOrigin) {
    let u;
    try {
        u = new URL(absUrl);
    } catch {
        return absUrl;
    }
    if (!/^https?:$/i.test(u.protocol)) return absUrl; // data:, mailto:, blob: …
    const scheme = u.protocol.replace(/:$/, "");
    return `${appOrigin}/api/proxy/${scheme}/${u.host}${u.pathname}${u.search}${u.hash}`;
}

/** Resolve a (possibly relative) spec against baseUrl and proxy it, or null. */
function proxyResolve(spec, baseUrl, appOrigin) {
    const s = String(spec || "").trim();
    if (!s || s.charAt(0) === "#") return null;
    if (/^(data:|blob:|mailto:|tel:|javascript:|about:|#)/i.test(s)) return null;
    let abs;
    try {
        abs = new URL(s, baseUrl).toString();
    } catch {
        return null;
    }
    if (!/^https?:/i.test(abs)) return null;
    return proxyEncode(abs, appOrigin);
}

/** Decode a path-style proxy path back to the real target URL (or null). */
function proxyDecodePath(pathname, search) {
    const rest = pathname.slice("/api/proxy/".length);
    const i1 = rest.indexOf("/");
    if (i1 < 0) return null;
    const scheme = rest.slice(0, i1);
    if (!/^https?$/i.test(scheme)) return null;
    const after = rest.slice(i1 + 1);
    const i2 = after.indexOf("/");
    const host = i2 < 0 ? after : after.slice(0, i2);
    const realPath = i2 < 0 ? "/" : after.slice(i2);
    if (!host) return null;
    return `${scheme}://${host}${realPath}${search || ""}`;
}

/** Rewrite root-relative / absolute ES-module import specifiers in JS to proxied
 *  URLs. Relative (./, ../) specifiers are left alone — they resolve correctly
 *  against the proxied module URL on their own. Conservative by design. */
function rewriteJs(code, baseUrl, appOrigin) {
    let out = code.replace(
        /(\bfrom\s*|\bimport\s*|\bexport\s*(?:\*|\{[^}]*\})\s*from\s*)(["'])((?:\/|https?:\/\/)[^"']+)\2/g,
        (m, pre, q, spec) => {
            const px = proxyResolve(spec, baseUrl, appOrigin);
            return px ? `${pre}${q}${px}${q}` : m;
        }
    );
    out = out.replace(
        /\bimport\(\s*(["'])((?:\/|https?:\/\/)[^"']+)\1\s*\)/g,
        (m, q, spec) => {
            const px = proxyResolve(spec, baseUrl, appOrigin);
            return px ? `import(${q}${px}${q})` : m;
        }
    );
    return out;
}

/** Rewrite url(...) and @import targets in CSS to proxied URLs (fixes web fonts,
 *  which are CORS-fetched and otherwise blocked from the opaque-origin frame). */
function rewriteCss(css, baseUrl, appOrigin) {
    let out = css.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/gi, (m, q, spec) => {
        if (/^data:/i.test(spec)) return m;
        const px = proxyResolve(spec, baseUrl, appOrigin);
        return px ? `url(${q}${px}${q})` : m;
    });
    out = out.replace(/@import\s+(["'])([^"']+)\1/gi, (m, q, spec) => {
        const px = proxyResolve(spec, baseUrl, appOrigin);
        return px ? `@import ${q}${px}${q}` : m;
    });
    return out;
}

// Rewrite a fetched HTML document so it renders AND runs inside the browse frame:
// drop the page's own <base>/CSP, route scripts + stylesheets + fonts through our
// ACAO proxy, rewrite inline module imports and inline-style urls, then inject our
// <base href> (for un-rewritten relative links/images) and the nav bridge.
function rewriteBrowseDoc(html, finalUrl, appOrigin) {
    let out = html
        .replace(/<base\b[^>]*>/gi, "")
        .replace(/<meta[^>]+http-equiv\s*=\s*["']?content-security-policy["']?[^>]*>/gi, "");

    // <script src="…"> (classic + module) → proxied
    out = out.replace(
        /<script\b([^>]*?)\ssrc\s*=\s*("([^"]*)"|'([^']*)')([^>]*)>/gi,
        (m, pre, _raw, dq, sq, post) => {
            const spec = dq !== undefined ? dq : sq;
            const px = proxyResolve(spec, finalUrl, appOrigin);
            return px ? `<script${pre} src="${escapeHtmlAttr(px)}"${post}>` : m;
        }
    );

    // <link rel="stylesheet|preload|modulepreload" href="…"> → proxied
    out = out.replace(/<link\b[^>]*>/gi, (tag) => {
        if (!/\brel\s*=\s*["']?\s*(?:stylesheet|preload|modulepreload)/i.test(tag)) return tag;
        return tag.replace(/\shref\s*=\s*("([^"]*)"|'([^']*)')/i, (hm, _raw, dq, sq) => {
            const spec = dq !== undefined ? dq : sq;
            const px = proxyResolve(spec, finalUrl, appOrigin);
            return px ? ` href="${escapeHtmlAttr(px)}"` : hm;
        });
    });

    // Inline <style>…</style> → rewrite url()/@import (web fonts)
    out = out.replace(
        /<style\b([^>]*)>([\s\S]*?)<\/style>/gi,
        (m, attrs, body) => `<style${attrs}>${rewriteCss(body, finalUrl, appOrigin)}</style>`
    );

    // Inline <script type="module">…</script> (no src) → rewrite import specifiers
    out = out.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
        if (/\ssrc\s*=/i.test(attrs)) return m; // external handled above
        if (!/type\s*=\s*["']?module/i.test(attrs)) return m; // classic scripts unaffected
        return `<script${attrs}>${rewriteJs(body, finalUrl, appOrigin)}</script>`;
    });

    const inject =
        `<base href="${escapeHtmlAttr(finalUrl)}">` +
        browseBridgeScript(finalUrl, appOrigin + "/api/proxy");
    if (/<head[^>]*>/i.test(out)) {
        out = out.replace(/<head[^>]*>/i, (m) => m + inject);
    } else if (/<html[^>]*>/i.test(out)) {
        out = out.replace(/<html[^>]*>/i, (m) => m + "<head>" + inject + "</head>");
    } else {
        out = "<head>" + inject + "</head>" + out;
    }
    return out;
}

function browseErrorPage(rawUrl, message) {
    return (
        `<!doctype html><html><head><meta charset="utf-8"><style>` +
        `body{margin:0;font:14px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;` +
        `color:#59636e;background:#fff;display:flex;align-items:center;justify-content:center;` +
        `height:100vh;text-align:center;padding:24px}.b{max-width:360px}b{color:#1f2328}` +
        `code{word-break:break-all}</style></head><body><div class="b">` +
        `<p><b>Couldn't load this page</b></p><p>${escapeHtmlAttr(message)}</p>` +
        `<p><code>${escapeHtmlAttr(rawUrl)}</code></p></div></body></html>`
    );
}

/** Human-readable panel title for the host chrome (scheme stripped for brevity). */
function displayTitle(url) {
    if (!url) return "OpenGraph Preview";
    try {
        const u = new URL(url);
        const path = u.pathname === "/" ? "" : u.pathname.replace(/\/+$/, "");
        return `OG Viewer - ${u.host}${path}${u.search}`;
    } catch {
        return `OG Viewer - ${url}`;
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
        // `silent` loads (e.g. driven by in-canvas browsing) update the metadata
        // but DON'T re-open the canvas to refresh the host title — re-opening
        // focuses the panel and reloads the whole iframe, which would yank the
        // user out of the Browse tab on every in-page navigation.
        const silent = reqUrl.searchParams.get("silent") === "1";
        try {
            const data = await loadMetadata(u);
            entry.currentUrl = data.requestedUrl;
            sendJson(res, 200, data);
            // Refresh the host panel title to the resolved URL (fire-and-forget;
            // guarded against loops by syncTitle).
            if (!silent) syncTitle(entry, data.requestedUrl).catch(() => {});
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

    if (path === "/api/raw") {
        const u = reqUrl.searchParams.get("u");
        if (!u) return sendJson(res, 400, { error: "Missing 'u' query parameter." });
        try {
            const r = await fetchUrl(u, {
                accept: "text/plain,text/markdown,application/json,text/*;q=0.9,*/*;q=0.5",
                timeoutMs: 12000,
                maxBytes: 1024 * 1024,
            });
            const ct = r.contentType || "";
            if (/^(image|video|audio|font)\//i.test(ct)) {
                return sendJson(res, 200, { error: `Not a text file (Content-Type: ${ct}).` });
            }
            const MAX_CHARS = 200000;
            let text = r.body.toString("utf8");
            // Surface upstream errors and HTML fallback/error pages instead of
            // dumping a rendered web page into the code preview. A code/markdown
            // value (e.g. a .mdx path) that resolves to an HTML document is almost
            // always a 404/redirect or SPA shell, not the raw file.
            if (r.status >= 400) {
                return sendJson(res, 200, {
                    error: `The server returned HTTP ${r.status} for this file.`,
                });
            }
            const rawExt = (
                (r.url.split(/[?#]/)[0].match(/\.([a-z0-9]+)$/i) || [])[1] || ""
            ).toLowerCase();
            const looksHtml =
                /text\/html|application\/xhtml\+xml/i.test(ct) ||
                /^\s*(?:<!doctype\s+html|<html[\s>])/i.test(text.slice(0, 256));
            if (looksHtml && !["html", "htm", "xhtml"].includes(rawExt)) {
                return sendJson(res, 200, {
                    error: "The server returned an HTML page, not the raw file (likely an error or redirect).",
                });
            }
            // Reject content that is clearly binary (NUL byte in the sample).
            if (text.slice(0, 4096).includes("\u0000")) {
                return sendJson(res, 200, { error: "File appears to be binary." });
            }
            let truncated = false;
            if (text.length > MAX_CHARS) {
                text = text.slice(0, MAX_CHARS);
                truncated = true;
            }
            return sendJson(res, 200, {
                url: r.url,
                status: r.status,
                contentType: ct,
                bytes: r.body.length,
                truncated,
                text,
            });
        } catch (err) {
            return sendJson(res, 200, { error: err.message || "Couldn't load file preview." });
        }
    }

    // Path-style proxy for browse subresources: /api/proxy/<scheme>/<host>/<path>.
    // Used for scripts, stylesheets, fonts, images referenced by a proxied page.
    // Serves with Access-Control-Allow-Origin so the opaque-origin frame can load
    // them, and rewrites JS imports / CSS urls so the dependency graph stays inside
    // the proxy. The path layout makes relative module imports resolve correctly.
    if (path.startsWith("/api/proxy/")) {
        const target = proxyDecodePath(path, reqUrl.search);
        if (!target) {
            res.statusCode = 400;
            return res.end("Bad proxy path");
        }
        const appOrigin = "http://" + (req.headers.host || "127.0.0.1");
        try {
            const r = await fetchUrl(target, { accept: "*/*", timeoutMs: 15000 });
            const ct = r.contentType || "";
            res.setHeader("Access-Control-Allow-Origin", "*");
            res.setHeader("Cache-Control", "public, max-age=300");
            const realPath = (() => {
                try {
                    return new URL(r.url).pathname;
                } catch {
                    return "";
                }
            })();
            const isJs =
                /javascript|ecmascript/i.test(ct) || /\.m?js($|\?)/i.test(realPath);
            const isCss = /text\/css/i.test(ct) || /\.css($|\?)/i.test(realPath);
            const isHtml =
                /text\/html|application\/xhtml\+xml/i.test(ct) ||
                (!ct && /<!doctype|<html/i.test(r.body.slice(0, 256).toString("utf8")));
            if (isJs) {
                res.statusCode = r.status >= 400 ? r.status : 200;
                res.setHeader("Content-Type", "text/javascript; charset=utf-8");
                return res.end(rewriteJs(r.body.toString("utf8"), r.url, appOrigin));
            }
            if (isCss) {
                res.statusCode = r.status >= 400 ? r.status : 200;
                res.setHeader("Content-Type", "text/css; charset=utf-8");
                return res.end(rewriteCss(r.body.toString("utf8"), r.url, appOrigin));
            }
            if (isHtml) {
                res.statusCode = 200;
                res.setHeader("Content-Type", "text/html; charset=utf-8");
                return res.end(rewriteBrowseDoc(r.body.toString("utf8"), r.url, appOrigin));
            }
            res.statusCode = r.status >= 400 ? r.status : 200;
            res.setHeader("Content-Type", ct || "application/octet-stream");
            return res.end(r.body);
        } catch (err) {
            res.statusCode = 502;
            res.setHeader("Access-Control-Allow-Origin", "*");
            return res.end(String(err && err.message ? err.message : err));
        }
    }

    if (path === "/api/proxy") {
        const u = reqUrl.searchParams.get("u");
        if (!u) {
            res.statusCode = 400;
            return res.end("Missing 'u'");
        }
        try {
            const r = await fetchUrl(normalizeUrl(u), {
                accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                timeoutMs: 15000,
            });
            const ct = r.contentType || "";
            const isHtml = !ct || /text\/html|application\/xhtml\+xml|\/xml|text\/plain/i.test(ct);
            res.setHeader("Cache-Control", "no-store");
            res.setHeader("Access-Control-Allow-Origin", "*");
            const appOrigin = "http://" + (req.headers.host || "127.0.0.1");
            if (!isHtml) {
                // Serve non-HTML targets (images, PDFs, …) verbatim so links to
                // them still render inside the browse frame.
                res.statusCode = r.status >= 400 ? r.status : 200;
                res.setHeader("Content-Type", ct || "application/octet-stream");
                return res.end(r.body);
            }
            // Build our own response and intentionally DO NOT forward
            // X-Frame-Options / CSP, so the page is embeddable in the canvas.
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            return res.end(rewriteBrowseDoc(r.body.toString("utf8"), r.url, appOrigin));
        } catch (err) {
            res.statusCode = 200;
            res.setHeader("Content-Type", "text/html; charset=utf-8");
            res.setHeader("Cache-Control", "no-store");
            return res.end(browseErrorPage(u, err && err.message ? err.message : String(err)));
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
    displayName: "OG Viewer",
    description:
        "Preview how a URL unfurls on Facebook, X, Bluesky, LinkedIn, Slack, Teams, and Discord, with a raw OpenGraph metadata and diagnostics view. Supports localhost.",
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

// Agent-facing tool so the canvas can be opened "on command" (e.g. the user
// says "open the OG preview" or "show how aspire.dev unfurls"). Tool names must
// be globally unique across loaded extensions.
const agentTools = [
    {
        name: "open_og_preview",
        description:
            "Open (or focus) the OpenGraph Preview canvas in the side panel, optionally loading a URL immediately. Supports localhost. Use whenever the user asks to open/show/add the OpenGraph (OG) preview, or to preview how a URL unfurls on social platforms.",
        parameters: {
            type: "object",
            properties: {
                url: {
                    type: "string",
                    description:
                        "Optional URL to load immediately. Scheme is optional — https:// is assumed (http:// for localhost).",
                },
                instanceId: {
                    type: "string",
                    description:
                        "Optional panel handle (defaults to 'og-main'). Reuse the same value to refocus the same panel; pass a new value to open an additional panel.",
                },
            },
            additionalProperties: false,
        },
        handler: async (args) => {
            const instanceId =
                (args && typeof args.instanceId === "string" && args.instanceId.trim()) ||
                DEFAULT_INSTANCE;
            const url = args && typeof args.url === "string" ? args.url.trim() : "";
            try {
                await sessionRef?.rpc?.canvas?.open({
                    canvasId: "og-preview",
                    instanceId,
                    input: url ? { url } : {},
                });
            } catch (err) {
                return {
                    textResultForLlm: `Failed to open the OpenGraph Preview canvas: ${
                        err && err.message ? err.message : err
                    }`,
                    resultType: "failure",
                };
            }
            return url
                ? `Opened the OpenGraph Preview canvas (panel "${instanceId}") and started loading ${url}.`
                : `Opened the OpenGraph Preview canvas (panel "${instanceId}"). Enter a URL in the panel to preview it.`;
        },
    },
];

sessionRef = await joinSession({ canvases: [ogCanvas], tools: agentTools });
