import assert from "node:assert/strict";
import { test, before, after } from "node:test";
import { registerHooks } from "node:module";
import { createServer } from "node:http";
import { once } from "node:events";
import { registration, messages } from "./fixtures/sdk.mjs";

const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
        if (specifier === "@github/copilot-sdk/extension") {
            return { url: new URL("./fixtures/sdk.mjs", import.meta.url).href, shortCircuit: true };
        }
        return nextResolve(specifier, context);
    },
});
await import("../extension.mjs");
hooks.deregister();

let target;
let targetUrl;
let canvas;
let canvasUrl;
let key;
let hits = 0;
before(async () => {
    target = createServer((req, res) => {
        hits++;
        res.setHeader("Content-Type", "text/html");
        if (req.url === "/bad-type") {
            res.setHeader("Content-Type", "application/private-path-sentinel");
        }
        if (req.url === "/redirect") {
            res.writeHead(302, { Location: "http://127.0.0.1:1/" });
            res.end();
            return;
        }
        res.end(`<!doctype html><head><title>Local preview</title>
<SCRIPT data-note=">" TYPE="module">import "/module.js";</SCRIPT >
<script type="module">import "/end-attributes.js";</script\t\n bar=">">
<script type="module">import "/end-slash.js";</script/>
<script src="/external.js">leave classic alone</script>
<script>const classic = "/plain.js";</script></head><body>Hello</body>`);
    });
    target.listen(0, "127.0.0.1");
    await once(target, "listening");
    targetUrl = `http://127.0.0.1:${target.address().port}`;
    canvas = registration.canvases[0];
    const opened = await canvas.open({ instanceId: "test", input: { url: targetUrl } });
    canvasUrl = new URL(opened.url);
    key = new URLSearchParams(canvasUrl.hash.slice(1)).get("key");
});
after(async () => {
    await canvas.onClose({ instanceId: "test" });
    await new Promise((resolve) => target.close(resolve));
});
function api(path) {
    const url = new URL(path, canvasUrl);
    url.searchParams.set("key", key);
    return url;
}
async function browse() {
    const res = await fetch(api("/api/proxy?u=" + encodeURIComponent(targetUrl)));
    return res.text();
}
function resourceUrl(html) {
    const value = html.match(/http:\/\/127\.0\.0\.1:\d+\/browse\/[a-f0-9]+\/api\/proxy\/http\/[^" ]+\/external\.js/);
    assert.ok(value, "resource URL has a browse-only capability");
    return new URL(value[0]);
}

test("requires the private outer-UI capability on API routes and SSE", async () => {
    const beforeHits = hits;
    for (const path of ["/api/fetch?select=1&u=" + encodeURIComponent(targetUrl), "/events", "/api/proxy?u=" + encodeURIComponent(targetUrl)]) {
        const response = await fetch(new URL(path, canvasUrl));
        assert.equal(response.status, 403);
    }
    assert.equal(hits, beforeHits);
});

test("allows explicitly selected localhost metadata and same-origin resources", async () => {
    const res = await fetch(api("/api/fetch?u=" + encodeURIComponent(targetUrl)));
    assert.equal(res.status, 200);
    assert.equal((await res.json()).resolved.title, "Local preview");
    const html = await browse();
    const resource = resourceUrl(html);
    assert.equal((await fetch(resource)).status, 200);
    assert.ok(!html.includes(key), "privileged token never enters fetched HTML");
});

test("rewrites mixed-case inline modules with quoted delimiters and closing whitespace", async () => {
    const html = await browse();
    assert.match(html, /import "http:\/\/127\.0\.0\.1:\d+\/browse\/[a-f0-9]+\/api\/proxy\/http\/127\.0\.0\.1:\d+\/module\.js"/);
    assert.match(html, /const classic = "\/plain\.js"/);
    assert.match(html, /import "http:\/\/127\.0\.0\.1:\d+\/browse\/[a-f0-9]+\/api\/proxy\/http\/127\.0\.0\.1:\d+\/end-attributes\.js"/);
    assert.match(html, /import "http:\/\/127\.0\.0\.1:\d+\/browse\/[a-f0-9]+\/api\/proxy\/http\/127\.0\.0\.1:\d+\/end-slash\.js"/);
});

test("browse capability cannot authorize origins, send actions, or read events", async () => {
    const resource = resourceUrl(await browse());
    const prefix = resource.pathname.slice(0, resource.pathname.indexOf("/api/proxy"));
    const beforeMessages = messages.length;
    for (const path of ["/api/fetch?select=1&u=http://127.0.0.1:1", "/api/open-session", "/events"]) {
        const res = await fetch(new URL(prefix + path, canvasUrl));
        assert.equal(res.status, 403);
    }
    const res = await fetch(api("/api/create-issue"), {
        method: "POST",
        body: '{"repo":"microsoft/aspire.dev","prompt":"test"}',
    });
    assert.equal(res.status, 200);
    assert.equal(messages.length, beforeMessages + 1);
});

test("revokes old browse capabilities when the outer UI explicitly selects a target", async () => {
    const oldResource = resourceUrl(await browse());
    const res = await fetch(api("/api/fetch?select=1&silent=1&u=" + encodeURIComponent(targetUrl)));
    assert.equal((await res.json()).resolved.title, "Local preview");
    assert.equal((await fetch(oldResource)).status, 403);
    assert.equal((await fetch(resourceUrl(await browse()))).status, 200);
});

for (const route of ["document", "resource"]) {
    test(`in-flight ${route} responses retain their revoked browse capability`, async () => {
        const html = '<!doctype html><title>Delayed preview</title><script src="/external.js"></script>';
        const started = Promise.withResolvers();
        let heldResponse;
        let pending;
        const delayedTarget = createServer((req, res) => {
            res.setHeader("Content-Type", "text/html");
            if (req.url === "/delayed") {
                heldResponse = res;
                started.resolve();
                return;
            }
            res.end(html);
        });
        delayedTarget.listen(0, "127.0.0.1");
        await once(delayedTarget, "listening");
        const origin = `http://127.0.0.1:${delayedTarget.address().port}`;
        try {
            const selection = await fetch(api("/api/fetch?select=1&silent=1&u=" + encodeURIComponent(origin)));
            assert.equal((await selection.json()).resolved.title, "Delayed preview");
            const initial = await fetch(api("/api/proxy?u=" + encodeURIComponent(origin)));
            const oldResource = resourceUrl(await initial.text());
            const delayedUrl = route === "document"
                ? api("/api/proxy?u=" + encodeURIComponent(origin + "/delayed"))
                : new URL(oldResource.href.replace("/external.js", "/delayed"));
            pending = fetch(delayedUrl, { signal: AbortSignal.timeout(5000) }).then((res) => res.text());
            await Promise.race([
                started.promise,
                pending.then(() => assert.fail("The upstream response must remain in flight.")),
            ]);

            const reselection = await fetch(api("/api/fetch?select=1&silent=1&u=" + encodeURIComponent(targetUrl)));
            assert.equal((await reselection.json()).resolved.title, "Local preview");
            const currentResource = resourceUrl(await browse());
            heldResponse.end(html);
            const delayedHtml = await pending;
            assert.equal(resourceUrl(delayedHtml).href, oldResource.href);
            const currentPrefix = currentResource.pathname.split("/api/proxy")[0];
            assert.ok(!delayedHtml.includes(currentPrefix), "old content never receives the new capability");
            assert.equal((await fetch(oldResource)).status, 403);
            assert.equal((await fetch(currentResource)).status, 200);
        } finally {
            heldResponse?.end();
            if (pending) await Promise.allSettled([pending]);
            delayedTarget.closeAllConnections();
            await new Promise((resolve) => delayedTarget.close(resolve));
        }
    });
}

test("returns fixed errors without paths, exception messages, or stack details", async () => {
    const secret = "stack-path-sentinel";
    for (const path of ["/api/fetch", "/api/raw", "/api/agent-readiness"]) {
        const res = await fetch(api(`${path}?u=${encodeURIComponent("file:///" + secret)}`));
        const body = await res.text();
        assert.ok(!body.includes(secret));
        assert.match(body, /error/);
    }
    const res = await fetch(api("/api/proxy?u=" + encodeURIComponent(targetUrl + "/redirect")));
    const html = await res.text();
    assert.match(html, /selected-origin access/);
    assert.ok(!html.includes("Error:") && !html.includes(" at "));
    const badType = await fetch(api("/api/fetch?u=" + encodeURIComponent(targetUrl + "/bad-type")));
    const error = await badType.json();
    assert.ok(error.error);
    assert.ok(!error.error.includes("private-path-sentinel"));
});

test("rejects unrelated loopback origins for all fetch surfaces", async () => {
    const url = encodeURIComponent("http://127.0.0.1:1/");
    for (const path of ["/api/fetch", "/api/raw", "/api/img"]) {
        const res = await fetch(api(`${path}?u=${url}`));
        if (path === "/api/img") assert.equal(res.status, 502);
        else assert.match(await res.text(), /error/);
    }
    const resource = resourceUrl(await browse());
    resource.pathname = resource.pathname.replace(/\/http\/.*$/, "/http/127.0.0.1:1/");
    assert.equal((await fetch(resource)).status, 502);
});

test("an oversized HTML page still loads metadata and the browse document", async () => {
    const oversized = 7 * 1024 * 1024; // over the 6 MiB metadata and resource cap
    const beyondBrowse = 17 * 1024 * 1024; // over the 16 MiB browse document cap
    const head =
        '<!doctype html><head><title>Huge page</title><meta property="og:image" content="/huge.png">' +
        '<script src="/external.js"></script></head><body>';
    const page = (size) =>
        Buffer.concat([Buffer.from(head), Buffer.alloc(size, "<p>filler</p>"), Buffer.from('<footer id="tail">end</footer></body>')]);
    const document = page(oversized);
    const unbounded = page(beyondBrowse);
    const hugeTarget = createServer((req, res) => {
        const isHtml = req.url === "/" || req.url === "/unbounded";
        res.setHeader("Content-Type", isHtml ? "text/html" : req.url === "/big.pdf" ? "application/pdf" : "text/javascript");
        if (req.url === "/") return res.end(document);
        if (req.url === "/unbounded") return res.end(unbounded);
        res.end(Buffer.alloc(req.url === "/big.pdf" ? beyondBrowse : oversized, "x"));
    });
    hugeTarget.listen(0, "127.0.0.1");
    await once(hugeTarget, "listening");
    const origin = `http://127.0.0.1:${hugeTarget.address().port}`;
    try {
        const selection = await fetch(api("/api/fetch?select=1&silent=1&u=" + encodeURIComponent(origin)));
        const metadata = await selection.json();
        assert.equal(metadata.resolved.title, "Huge page");
        assert.equal(metadata.resolved.image, `${origin}/huge.png`);
        assert.equal(metadata.truncated, true);

        const html = await (await fetch(api("/api/proxy?u=" + encodeURIComponent(origin)))).text();
        assert.match(html, /<title>Huge page<\/title>/);
        assert.match(html, /<footer id="tail">/, "a document under the browse cap is served whole");
        assert.doesNotMatch(html, /Couldn't load this page/);

        const cut = await (await fetch(api("/api/proxy?u=" + encodeURIComponent(`${origin}/unbounded`)))).text();
        assert.match(cut, /<title>Huge page<\/title>/);
        assert.doesNotMatch(cut, /<footer id="tail">/, "a document over the browse cap is cut, not rejected");
        assert.doesNotMatch(cut, /Couldn't load this page/);

        const script = new URL(resourceUrl(html).href.replace("/external.js", "/big.js"));
        assert.equal((await fetch(script)).status, 502, "oversized subresources are rejected, not truncated");
        const pdf = await fetch(api("/api/proxy?u=" + encodeURIComponent(`${origin}/big.pdf`)));
        assert.match(await pdf.text(), /Couldn't load this page/, "an oversized non-HTML document is not served cut off");
    } finally {
        await fetch(api("/api/fetch?select=1&silent=1&u=" + encodeURIComponent(targetUrl)));
        hugeTarget.closeAllConnections();
        await new Promise((resolve) => hugeTarget.close(resolve));
    }
});

test("standalone get_metadata action explicitly authorizes localhost", async () => {
    const action = canvas.actions.find((action) => action.name === "get_metadata");
    const result = await action.handler({ input: { url: targetUrl } });
    assert.equal(result.resolved.title, "Local preview");
    const named = await action.handler({ input: { url: targetUrl.replace("127.0.0.1", "localhost") } });
    assert.equal(named.resolved.title, "Local preview");
});

test("/api/fetch reports the HTTP details and SEO signals the prompt payload needs", async () => {
    const res = await fetch(api("/api/fetch?u=" + encodeURIComponent(targetUrl)));
    const data = await res.json();
    assert.equal(data.http.inputUrl, `${targetUrl}/`);
    assert.equal(data.http.status, 200);
    assert.match(data.http.contentType, /^text\/html/);
    assert.deepEqual(data.http.headers, {});
    assert.deepEqual([data.canonical, data.lang, data.h1, data.alternates, data.structuredData, data.capped], ["", "", [], [], [], []]);
});

test("serves the shared prompt builder to the UI without the private key", async () => {
    const res = await fetch(new URL("/build-prompt.mjs", canvasUrl));
    assert.equal(res.status, 200);
    assert.match(res.headers.get("content-type"), /^text\/javascript/);
    const body = await res.text();
    assert.match(body, /export function composePrompt/);
    assert.ok(!/^import /m.test(body), "no Node imports, so a browser can load it");
});

async function withSeoPage(run) {
    const server = createServer((req, res) => {
        if (req.url === "/old") {
            res.writeHead(301, { Location: "/landed" });
            return res.end();
        }
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("X-Robots-Tag", "noindex");
        res.setHeader("Content-Language", "en");
        res.end(`<!doctype html><html lang="en"><head><title>SEO page</title>
<meta name="description" content="A page about SEO"><link rel="canonical" href="/canonical">
</head><body><h1>Heading</h1></body></html>`);
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
        await run(`http://127.0.0.1:${server.address().port}`);
    } finally {
        server.closeAllConnections();
        await new Promise((resolve) => server.close(resolve));
    }
}

test("get_prompt returns a composed prompt and the full JSON payload", async () => {
    const action = canvas.actions.find((action) => action.name === "get_prompt");
    await withSeoPage(async (origin) => {
        const result = await action.handler({ input: { url: origin, includeAgentReadiness: false } });
        assert.equal(result.url, `${origin}/`);
        assert.deepEqual(result.modules, ["audit", "fix-tags"]);
        const { payload } = result;
        assert.equal(payload.url.canonical, `${origin}/canonical`);
        assert.equal(payload.http.status, 200);
        assert.equal(payload.http.headers["x-robots-tag"], "noindex");
        assert.equal(payload.http.headers["content-language"], "en");
        assert.equal(payload.seo.robots.xRobotsTag, "noindex");
        assert.equal(payload.seo.title.value, "SEO page");
        assert.equal(payload.seo.description.value, "A page about SEO");
        assert.equal(payload.seo.lang, "en");
        assert.deepEqual(payload.seo.h1, ["Heading"]);
        assert.equal(payload.agentReadiness, null);
        assert.ok(result.prompt.includes(`Page: ${origin}/`));
        assert.ok(result.prompt.includes("## Page data"));
    });
});

test("get_prompt names a redirect target only inside the page data", async () => {
    const action = canvas.actions.find((action) => action.name === "get_prompt");
    await withSeoPage(async (origin) => {
        const result = await action.handler({ input: { url: `${origin}/old`, includeAgentReadiness: false } });
        assert.equal(result.url, `${origin}/landed`);
        assert.equal(result.payload.url.final, `${origin}/landed`);
        assert.equal(result.payload.url.redirected, true);
        const instructions = result.prompt.slice(0, result.prompt.indexOf("## Page data"));
        assert.ok(instructions.includes(`Page: ${origin}/old\n`));
        assert.ok(!instructions.includes("/landed"));
    });
});

test("get_prompt composes only the requested modules and instructions", async () => {
    const action = canvas.actions.find((action) => action.name === "get_prompt");
    await withSeoPage(async (origin) => {
        const result = await action.handler({
            input: { url: origin, modules: ["verify", "copy"], instructions: "Be terse.", includeAgentReadiness: false },
        });
        assert.deepEqual(result.modules, ["copy", "verify"]);
        assert.match(
            result.prompt,
            /1\. \*\*Rewrite the title and description\.\*\*[\s\S]*2\. \*\*Verify the result\.\*\*/,
        );
        assert.ok(result.prompt.includes("## Additional instructions from the user\nBe terse."));
        assert.ok(!result.prompt.includes("Audit"));
    });
});

test("get_prompt rejects bad input before fetching anything", async () => {
    const action = canvas.actions.find((action) => action.name === "get_prompt");
    const beforeHits = hits;
    const inputs = [
        {},
        { url: targetUrl, modules: ["nope"] },
        { url: targetUrl, modules: "audit" },
        { url: targetUrl, instructions: "x".repeat(8001) },
        { url: targetUrl, instructions: 5 },
    ];
    for (const input of inputs) {
        await assert.rejects(action.handler({ input }), (error) => error.code === "invalid_input");
    }
    await assert.rejects(
        action.handler({ input: { url: targetUrl, modules: ["nope"] } }),
        /Unknown prompt module\(s\): nope\. Valid modules: audit,/,
    );
    assert.equal(hits, beforeHits);
});
