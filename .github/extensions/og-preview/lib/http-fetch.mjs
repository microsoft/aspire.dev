// Dependency-free HTTP(S) fetch with redirect following, timeout, and a size
// cap. Uses Node's built-in http/https so it works regardless of whether the
// host Node has global fetch, and reliably reaches localhost / 127.0.0.1.

import http from "node:http";
import https from "node:https";
import dns from "node:dns/promises";
import net from "node:net";

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CopilotOGPreview/1.0";

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1|.*\.localhost)(:|\/|$)/i;

// SSRF guard. The tool intentionally supports localhost, but every other
// private / link-local / unique-local / carrier-grade-NAT range is denied by
// default so the agent-callable actions and the loopback proxy can't be turned
// into a request-forgery primitive against the developer's machine/network
// (e.g. the 169.254.169.254 cloud metadata endpoint). Set
// OG_ALLOW_PRIVATE_NETWORK=1 to opt in to private destinations beyond localhost.
const ALLOW_PRIVATE_NETWORK = /^(1|true|yes|on)$/i.test(
    String(process.env.OG_ALLOW_PRIVATE_NETWORK || ""),
);

function ipv4Allowed(ip, allowPrivate) {
    const o = ip.split(".").map((n) => Number(n));
    if (o.length !== 4 || o.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) {
        return false;
    }
    const [a, b] = o;
    if (a === 127) return true; // loopback (localhost) — always allowed
    if (allowPrivate) return true;
    if (a === 0) return false; // "this" network
    if (a === 10) return false; // private
    if (a === 172 && b >= 16 && b <= 31) return false; // private
    if (a === 192 && b === 168) return false; // private
    if (a === 169 && b === 254) return false; // link-local + cloud metadata
    if (a === 100 && b >= 64 && b <= 127) return false; // carrier-grade NAT
    return true;
}

function ipv6Allowed(ip, allowPrivate) {
    const s = ip.toLowerCase();
    const mapped = s.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return ipv4Allowed(mapped[1], allowPrivate);
    if (s === "::1") return true; // loopback
    if (allowPrivate) return true;
    if (s === "::") return false; // unspecified
    if (/^fe[89ab]/.test(s)) return false; // fe80::/10 link-local
    if (/^f[cd]/.test(s)) return false; // fc00::/7 unique-local
    return true;
}

function addressAllowed(ip, allowPrivate) {
    const v = net.isIP(ip);
    if (v === 4) return ipv4Allowed(ip, allowPrivate);
    if (v === 6) return ipv6Allowed(ip, allowPrivate);
    return false;
}

// Resolve a hostname to its addresses and confirm none land in a denied range.
// Literal IPs are checked directly; explicit localhost names are always allowed.
async function assertHostAllowed(hostname, allowPrivate) {
    const host = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    if (LOCAL_HOST_RE.test(host)) return; // localhost / *.localhost / 127.* / ::1
    if (net.isIP(host)) {
        if (!addressAllowed(host, allowPrivate)) {
            throw new Error(`Blocked non-public address: ${host}`);
        }
        return;
    }
    let addrs;
    try {
        addrs = await dns.lookup(host, { all: true });
    } catch {
        throw new Error(`Could not resolve host: ${host}`);
    }
    for (const a of addrs) {
        if (!addressAllowed(a.address, allowPrivate)) {
            throw new Error(`Blocked non-public address for ${host}: ${a.address}`);
        }
    }
}

/**
 * Normalize user input into an absolute URL. Bare localhost-ish hosts default
 * to http://, everything else defaults to https://.
 */
export function normalizeUrl(input) {
    const trimmed = String(input ?? "").trim();
    if (!trimmed) throw new Error("No URL provided.");
    if (/^https?:\/\//i.test(trimmed)) return trimmed;
    const scheme = LOCAL_HOST_RE.test(trimmed) ? "http://" : "https://";
    return scheme + trimmed;
}

const MAX_BYTES = 6 * 1024 * 1024; // 6 MB safety cap

/**
 * Fetch a URL, following redirects. Resolves with
 * { url, status, headers, contentType, body: Buffer }.
 */
export function fetchUrl(rawUrl, options = {}) {
    const {
        maxRedirects = 6,
        timeoutMs = 15000,
        accept = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        maxBytes = MAX_BYTES,
        allowPrivateNetwork = ALLOW_PRIVATE_NETWORK,
    } = options;

    return new Promise((resolve, reject) => {
        let redirects = 0;

        const visit = async (urlStr) => {
            let parsed;
            try {
                parsed = new URL(urlStr);
            } catch {
                return reject(new Error(`Invalid URL: ${urlStr}`));
            }
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
            }
            try {
                await assertHostAllowed(parsed.hostname, allowPrivateNetwork);
            } catch (err) {
                return reject(err);
            }

            const lib = parsed.protocol === "https:" ? https : http;
            const req = lib.request(
                parsed,
                {
                    method: "GET",
                    headers: {
                        "User-Agent": USER_AGENT,
                        Accept: accept,
                        "Accept-Language": "en-US,en;q=0.9",
                    },
                },
                (res) => {
                    const status = res.statusCode || 0;
                    const location = res.headers.location;

                    if (status >= 300 && status < 400 && location) {
                        res.resume();
                        if (redirects >= maxRedirects) {
                            return reject(new Error("Too many redirects."));
                        }
                        redirects += 1;
                        let next;
                        try {
                            next = new URL(location, parsed).toString();
                        } catch {
                            return reject(new Error(`Bad redirect target: ${location}`));
                        }
                        visit(next).catch(reject);
                        return;
                    }

                    const chunks = [];
                    let total = 0;
                    let aborted = false;
                    res.on("data", (chunk) => {
                        total += chunk.length;
                        if (total > maxBytes) {
                            aborted = true;
                            req.destroy();
                            res.destroy();
                            return reject(
                                new Error(`Response exceeded the ${maxBytes}-byte limit.`),
                            );
                        }
                        chunks.push(chunk);
                    });
                    res.on("end", () => {
                        if (aborted) return;
                        resolve({
                            url: parsed.toString(),
                            status,
                            headers: res.headers,
                            contentType: String(res.headers["content-type"] || ""),
                            body: Buffer.concat(chunks),
                        });
                    });
                    res.on("error", (err) => {
                        if (!aborted) reject(err);
                    });
                },
            );

            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`Request timed out after ${timeoutMs}ms.`));
            });
            req.on("error", (err) => reject(err));
            req.end();
        };

        visit(rawUrl).catch(reject);
    });
}
