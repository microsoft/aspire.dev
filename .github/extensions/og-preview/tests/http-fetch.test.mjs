import assert from "node:assert/strict";
import { test } from "node:test";
import { EventEmitter } from "node:events";
import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import { authorizePreview, fetchUrl, normalizeUrl } from "../lib/http-fetch.mjs";

function transport(t, library = http, responses = [{}]) {
    const requests = [];
    t.mock.method(library, "request", (url, options, receive) => {
        const req = new EventEmitter();
        req.setTimeout = () => {};
        req.destroy = () => {};
        req.end = () => {
            const next = responses[requests.length - 1] || {};
            const res = new EventEmitter();
            res.statusCode = next.status || 200;
            res.headers = next.headers || {};
            res.resume = () => {};
            receive(res);
            queueMicrotask(() => {
                res.emit("data", Buffer.from("ok"));
                res.emit("end");
            });
        };
        requests.push({ url, options });
        return req;
    });
    return requests;
}

test("blocks private, mapped IPv6, transition, and loopback addresses without selection", async (t) => {
    const requests = transport(t);
    for (const host of [
        "169.254.169.254", "10.0.0.1", "127.0.0.1", "0.0.0.0", "100.64.0.1",
        "[::1]", "[fc00::1]", "[fe80::1]", "[::ffff:169.254.169.254]",
        "[0:0:0:0:0:ffff:a00:1]", "[::ffff:7f00:1]", "[2002:a00:1::]",
        "[2001::1]", "[64:ff9b::a00:1]",
    ]) {
        await assert.rejects(fetchUrl(`http://${host}/`, { allowPrivateNetwork: false }), /authorized/);
    }
    assert.equal(requests.length, 0);
});

test("environment/private opt-in alone never permits discovered private destinations", async (t) => {
    const requests = transport(t);
    await assert.rejects(fetchUrl("http://10.0.0.1/", { allowPrivateNetwork: true }), /authorized/);
    assert.equal(requests.length, 0);
});

test("explicit loopback authorization is exact host, scheme and port", async (t) => {
    const requests = transport(t);
    const policy = await authorizePreview("http://127.0.0.1:4321/", false);
    assert.equal((await fetchUrl("http://127.0.0.1:4321/page", policy)).status, 200);
    for (const url of ["http://127.0.0.1:4322/", "http://[::1]:4321/", "https://127.0.0.1:4321/"]) {
        await assert.rejects(fetchUrl(url, policy), /authorized/);
    }
    assert.equal(requests.length, 1);
});

test("private selection needs opt-in and authorizes only that origin", async (t) => {
    const requests = transport(t);
    await assert.rejects(authorizePreview("http://10.0.0.1/", false), /OG_ALLOW_PRIVATE_NETWORK/);
    const policy = await authorizePreview("http://10.0.0.1/", true);
    await fetchUrl("http://10.0.0.1/page", policy);
    await assert.rejects(fetchUrl("http://10.0.0.2/", policy), /authorized/);
    assert.equal(requests.length, 1);
});

test("public selection does not pre-authorize later DNS rebinding to loopback", async (t) => {
    const requests = transport(t);
    t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
    const policy = await authorizePreview("http://preview.example/", false);
    t.mock.method(dns, "lookup", async () => [{ address: "127.0.0.1", family: 4 }]);
    await assert.rejects(fetchUrl("http://preview.example/", policy), /authorized/);
    assert.equal(requests.length, 0);
});

test("pins validated DNS addresses while preserving the hostname for Host and TLS", async (t) => {
    const lookups = t.mock.method(dns, "lookup", async () => [{ address: "8.8.8.8", family: 4 }]);
    const requests = transport(t, https);
    await fetchUrl("https://preview.example:443/path");
    const { url, options } = requests[0];
    assert.equal(url.hostname, "preview.example");
    assert.equal(url.protocol, "https:");
    assert.equal(options.agent, false);
    assert.equal(options.rejectUnauthorized, undefined);
    t.mock.method(dns, "lookup", async () => { throw new Error("Must not resolve again"); });
    options.lookup("preview.example", { all: true }, (err, addresses) => {
        assert.ifError(err);
        assert.deepEqual(addresses, [{ address: "8.8.8.8", family: 4 }]);
    });
    options.lookup("preview.example", {}, (err, address, family) => {
        assert.ifError(err);
        assert.equal(address, "8.8.8.8");
        assert.equal(family, 4);
    });
    assert.equal(lookups.mock.callCount(), 1);
});

test("checks every DNS result including localhost names and rejects empty answers", async (t) => {
    const requests = transport(t);
    for (const answers of [
        [],
        [{ address: "8.8.8.8", family: 4 }, { address: "10.0.0.1", family: 4 }],
        [{ address: "10.0.0.1", family: 4 }],
        [{ address: "not-an-ip", family: 4 }],
    ]) {
        t.mock.method(dns, "lookup", async () => answers);
        await assert.rejects(fetchUrl("http://untrusted.localhost/"));
    }
    assert.equal(requests.length, 0);
});

test("public IPv4 and IPv6 mapped addresses remain usable", async (t) => {
    const requests = transport(t);
    for (const host of ["8.8.8.8", "[2606:4700:4700::1111]", "[::ffff:808:808]"]) {
        await fetchUrl(`http://${host}/`);
    }
    assert.equal(requests.length, 3);
});

test("revalidates redirect targets and never follows public-to-local redirects", async (t) => {
    const requests = transport(t, http, [{ status: 302, headers: { location: "http://127.0.0.1/" } }]);
    await assert.rejects(fetchUrl("http://8.8.8.8/"), /authorized/);
    assert.equal(requests.length, 1);
});

test("local redirects can remain on the selected origin but not switch ports", async (t) => {
    const requests = transport(t, http, [
        { status: 302, headers: { location: "/page" } },
        { status: 302, headers: { location: "http://127.0.0.1:2/" } },
    ]);
    await assert.rejects(fetchUrl("http://127.0.0.1:1/", await authorizePreview("http://127.0.0.1:1/")), /authorized/);
    assert.equal(requests.length, 2);
});

test("rejects unsupported schemes and embedded credentials before transport", async (t) => {
    const requests = transport(t);
    for (const url of ["file:///secret", "javascript:alert(1)", "ftp://8.8.8.8", "https://user:pass@8.8.8.8/"]) {
        await assert.rejects(fetchUrl(url), /Invalid or unsupported/);
    }
    assert.equal(requests.length, 0);
    assert.equal(normalizeUrl("localhost:4321"), "http://localhost:4321/");
    assert.equal(normalizeUrl("aspire.dev"), "https://aspire.dev/");
    assert.throws(() => normalizeUrl("file:///secret"), /Only HTTP/);
    assert.throws(() => normalizeUrl("javascript:alert(1)"), /Only HTTP/);
});

test("a public resource cannot redirect back to an otherwise authorized local origin", async (t) => {
    const requests = transport(t, http, [{ status: 302, headers: { location: "http://127.0.0.1/" } }]);
    await assert.rejects(fetchUrl("http://8.8.8.8/", await authorizePreview("http://127.0.0.1/")), /authorized/);
    assert.equal(requests.length, 1);
});
