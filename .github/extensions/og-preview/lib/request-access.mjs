import { randomBytes } from "node:crypto";

export function createAccess() {
    return {
        uiToken: randomBytes(32).toString("hex"),
        browseToken: randomBytes(32).toString("hex"),
        policy: {},
    };
}

/** Browse content can fetch resources, but cannot select origins or use tools. */
export function requestAccess(entry, req, url) {
    if (req.headers.host !== new URL(entry.url).host) return null;
    const prefix = `/browse/${entry.browseToken}`;
    if (url.pathname.startsWith(prefix + "/api/proxy")) {
        const path = url.pathname.slice(prefix.length);
        if (path === "/api/proxy" || path.startsWith("/api/proxy/")) {
            return req.method === "GET" ? { path, privileged: false } : null;
        }
    }
    if (url.searchParams.get("key") === entry.uiToken) {
        return { path: url.pathname, privileged: true };
    }
    return null;
}
