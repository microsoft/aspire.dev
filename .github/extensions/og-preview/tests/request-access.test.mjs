import assert from "node:assert/strict";
import { test } from "node:test";
import { createAccess, requestAccess } from "../lib/request-access.mjs";

test("requires the UI key and literal server host for privileged routes", () => {
    const entry = { ...createAccess(), url: "http://127.0.0.1:4321/" };
    const req = { method: "GET", headers: { host: "127.0.0.1:4321" } };
    const url = new URL(`/api/fetch?key=${entry.uiToken}`, entry.url);
    assert.deepEqual(requestAccess(entry, req, url), { path: "/api/fetch", privileged: true });
    assert.equal(requestAccess(entry, { ...req, headers: { host: "rebound.example:4321" } }, url), null);
    assert.equal(requestAccess(entry, req, new URL("/api/fetch", entry.url)), null);
});

test("browse keys only grant GET access to exact proxy routes", () => {
    const entry = { ...createAccess(), url: "http://127.0.0.1:4321/" };
    const req = { method: "GET", headers: { host: "127.0.0.1:4321" } };
    const prefix = `/browse/${entry.browseToken}`;
    for (const path of ["/api/proxy", "/api/proxy/http/example.com/path"]) {
        const url = new URL(prefix + path, entry.url);
        assert.deepEqual(requestAccess(entry, req, url), { path, privileged: false });
        assert.equal(requestAccess(entry, { ...req, method: "POST" }, url), null);
    }
    for (const path of ["/api/proxyevil", "/api/fetch", "/events", "/api/create-issue"]) {
        assert.equal(requestAccess(entry, req, new URL(prefix + path, entry.url)), null);
    }
});

test("capabilities are distinct across roles and canvas instances", () => {
    const first = createAccess();
    const second = createAccess();
    assert.equal(new Set([first.uiToken, first.browseToken, second.uiToken, second.browseToken]).size, 4);
    assert.equal(first.uiToken.length, 64);
    const entry = { ...first, url: "http://127.0.0.1:4321/" };
    const req = { method: "GET", headers: { host: "127.0.0.1:4321" } };
    assert.equal(requestAccess(entry, req, new URL(`/api/fetch?key=${first.browseToken}`, entry.url)), null);
    assert.equal(requestAccess(entry, req, new URL(`/api/fetch?key=${second.uiToken}`, entry.url)), null);
});
