import assert from "node:assert/strict";
import { test } from "node:test";
import { parseMetadata } from "../lib/parse-og.mjs";

const BASE = "https://example.com/docs/";

test("extracts canonical, language, and alternates", () => {
    const data = parseMetadata(
        `<!doctype html><html lang=" en-US "><head><title>T</title>
<link rel="canonical" href="/docs/">
<link rel="alternate" hreflang="fr" href="/fr/docs/">
<link rel="Alternate" type="application/rss+xml" href="/feed.xml">
<link rel="alternate stylesheet" href="/alt.css">
</head>`,
        BASE,
    );
    assert.equal(data.canonical, "https://example.com/docs/");
    assert.equal(data.lang, "en-US");
    assert.deepEqual(data.alternates, [
        { hreflang: "fr", type: "", href: "https://example.com/fr/docs/" },
        { hreflang: "", type: "application/rss+xml", href: "https://example.com/feed.xml" },
    ]);
    assert.deepEqual(data.capped, []);
});

test("reports empty values when the page has none of the new signals", () => {
    const data = parseMetadata("<title>Bare</title>", BASE);
    assert.equal(data.canonical, "");
    assert.equal(data.lang, "");
    assert.deepEqual([data.h1, data.alternates, data.structuredData, data.capped], [[], [], [], []]);
});

test("captures h1 text with tags stripped and entities decoded", () => {
    const data = parseMetadata(
        `<h1 class="x"> Hello <em>big</em> &amp;\n bold </h1><h1><img alt="logo"></h1><h10>nope</h10>`,
        BASE,
    );
    assert.deepEqual(data.h1, ["Hello big & bold", ""]);
});

test("summarizes JSON-LD blocks and keeps only small valid data", () => {
    const productJson = '{"@type":"Product"}';
    const invalidJson = '{"@type":"Article",}';
    const big = JSON.stringify({ "@type": "Article", body: "x".repeat(7000) });
    const data = parseMetadata(
        `<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":["Organization","Brand"]},{"@type":"WebSite"}]}</script>
<SCRIPT data-x="1" TYPE="Application/LD+JSON">${productJson}</SCRIPT >
<script type="application/ld+json">${invalidJson}</script>
<script type="application/ld+json">${big}</script>
<script data-type="application/ld+json">{"@type":"Ignored"}</script>
<script type="module">import "/app.js";</script>`,
        BASE,
    );
    assert.equal(data.structuredData.length, 4);
    const [graph, product, invalid, oversized] = data.structuredData;
    assert.deepEqual(graph.types, ["WebSite", "Organization", "Brand"]);
    assert.equal(graph.valid, true);
    assert.equal(graph.data["@context"], "https://schema.org");
    assert.deepEqual(product, {
        types: ["Product"],
        valid: true,
        size: productJson.length,
        data: { "@type": "Product" },
    });
    assert.deepEqual(invalid, { types: [], valid: false, size: invalidJson.length });
    assert.deepEqual(oversized.types, ["Article"]);
    assert.equal(oversized.valid, true);
    assert.equal(oversized.size, big.length);
    assert.ok(!("data" in oversized), "large blocks are summarized, not echoed");
    assert.equal(oversized.dataOmitted, true, "a block that was left out says so");
    assert.ok(![graph, product, invalid].some((entry) => "dataOmitted" in entry));
    assert.deepEqual(data.capped, ["structuredData"]);
});

// A valid JSON-LD block whose arrays nest `levels` deep.
const nestedBlock = (levels) =>
    `<script type="application/ld+json">${"[".repeat(levels)}1${"]".repeat(levels)}</script>`;

// A valid JSON-LD block of exactly `size` characters.
const paddedBlock = (size) => {
    const empty = JSON.stringify({ "@type": "Thing", pad: "" }).length;
    const json = JSON.stringify({ "@type": "Thing", pad: "x".repeat(size - empty) });
    return `<script type="application/ld+json">${json}</script>`;
};

test("keeps JSON-LD up to 8 levels deep and omits anything deeper", () => {
    const data = parseMetadata(`${nestedBlock(8)}${nestedBlock(9)}`, BASE);
    const [shallow, deep] = data.structuredData;
    assert.deepEqual([shallow.valid, "data" in shallow, "dataOmitted" in shallow], [true, true, false]);
    assert.deepEqual([deep.valid, "data" in deep, deep.dataOmitted], [true, false, true]);
    assert.deepEqual(data.capped, ["structuredData"]);
});

test("omits a hostile, thousands-of-levels JSON-LD block without recursing into it", () => {
    const data = parseMetadata(nestedBlock(2900), BASE);
    const [entry] = data.structuredData;
    assert.equal(entry.valid, true);
    assert.ok(entry.size < 6000, "small enough that only the depth gate stops it");
    assert.equal(entry.dataOmitted, true);
    assert.ok(!("data" in entry));
    assert.deepEqual(data.capped, ["structuredData"]);
});

test("stops attaching JSON-LD data once 20,000 characters are in use", () => {
    const fits = parseMetadata(paddedBlock(5000).repeat(4), BASE);
    assert.ok(fits.structuredData.every((entry) => entry.size === 5000 && "data" in entry));
    assert.deepEqual(fits.capped, []);

    const over = parseMetadata(paddedBlock(5000).repeat(5), BASE);
    assert.deepEqual(
        over.structuredData.map((entry) => "data" in entry),
        [true, true, true, true, false],
    );
    assert.equal(over.structuredData[4].dataOmitted, true);
    assert.deepEqual(over.capped, ["structuredData"]);
});

test("names every list that had to be capped", () => {
    const links = Array.from({ length: 51 }, (_, i) => `<link rel="alternate" hreflang="x${i}" href="/x${i}">`).join("");
    const headings = Array.from({ length: 6 }, (_, i) => `<h1>Heading ${i}</h1>`).join("");
    const blocks = Array.from({ length: 11 }, () => `<script type="application/ld+json">{"@type":"Thing"}</script>`).join("");
    const data = parseMetadata(`<html>${links}${headings}${blocks}`, BASE);
    assert.equal(data.alternates.length, 50);
    assert.equal(data.h1.length, 5);
    assert.equal(data.structuredData.length, 10);
    assert.deepEqual([...data.capped].sort(), ["alternates", "h1", "structuredData"]);
});

test("exactly-at-the-cap lists are not reported as capped", () => {
    const headings = Array.from({ length: 5 }, (_, i) => `<h1>Heading ${i}</h1>`).join("");
    const data = parseMetadata(headings, BASE);
    assert.equal(data.h1.length, 5);
    assert.deepEqual(data.capped, []);
});

test("tolerates unclosed headings and scripts", () => {
    const data = parseMetadata(
        `<h1>never closed ${"<h1>".repeat(2000)}<script type="application/ld+json">{"@type":"Thing"}`,
        BASE,
    );
    assert.deepEqual(data.h1, []);
    assert.deepEqual(data.structuredData, []);
});
