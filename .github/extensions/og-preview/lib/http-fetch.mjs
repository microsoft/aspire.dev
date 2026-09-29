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

// Local destinations require explicit origin authorization. The environment
// opt-in permits selecting private origins; it never authorizes discovered URLs.
const ALLOW_PRIVATE_NETWORK = /^(1|true|yes|on)$/i.test(
    String(process.env.OG_ALLOW_PRIVATE_NETWORK || ""),
);

function addressKind(ip) {
    if (net.isIP(ip) === 6) {
        const canonical = new URL(`http://[${ip}]/`).hostname.slice(1, -1);
        const mapped = canonical.match(/^::ffff:([a-f0-9]+):([a-f0-9]+)$/);
        if (mapped) {
            const high = parseInt(mapped[1], 16);
            const low = parseInt(mapped[2], 16);
            return addressKind(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
        }
        if (canonical === "::1") return "loopback";
        // Global unicast only; exclude transition and documentation ranges.
        const [first, second = "0"] = canonical.split(":");
        if (/^[23]/.test(canonical) &&
            !(first === "2001" && (parseInt(second || "0", 16) < 512 || second === "db8")) &&
            first !== "2002" && first !== "3fff") return "public";
        return "private";
    }
    if (net.isIP(ip) !== 4) throw new Error("Invalid resolved address.");
    const o = ip.split(".").map((n) => Number(n));
    const [a, b, c] = o;
    if (a === 127) return "loopback";
    if (a === 0 || a === 10 || a >= 224 ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && (b === 168 || (b === 0 && (c === 0 || c === 2)))) ||
        (a === 169 && b === 254) ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
        (a === 203 && b === 0 && c === 113)) return "private";
    return "public";
}

function parseTarget(rawUrl) {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Only HTTP and HTTPS URLs are supported.");
    }
    if (parsed.username || parsed.password) throw new Error("URL credentials are not supported.");
    return parsed;
}

async function resolveAddresses(hostname) {
    const host = hostname.startsWith("[") ? hostname.slice(1, -1) : hostname;
    if (net.isIP(host)) {
        return [{ address: host, family: net.isIP(host) }];
    }
    const addresses = await dns.lookup(host, { all: true });
    if (!addresses.length) throw new Error("Host resolved to no addresses.");
    for (const record of addresses) {
        if (!net.isIP(record.address) || net.isIP(record.address) !== record.family) {
            throw new Error("Invalid DNS result.");
        }
    }
    return addresses;
}

/** Only trusted user/agent selection may call this, never discovered content. */
export async function authorizePreview(rawUrl, allowPrivateNetwork = ALLOW_PRIVATE_NETWORK) {
    const parsed = parseTarget(normalizeUrl(rawUrl));
    const addresses = await resolveAddresses(parsed.hostname);
    const kinds = new Set(addresses.map((a) => addressKind(a.address)));
    if (kinds.size !== 1) throw new Error("Host resolves to mixed network scopes.");
    const kind = kinds.values().next().value;
    if (kind === "private" && !allowPrivateNetwork) {
        throw new Error("Private-network previews require OG_ALLOW_PRIVATE_NETWORK.");
    }
    return {
        authorizedOrigin: kind === "public" ? null : parsed.origin,
        allowPrivateNetwork,
    };
}

/**
 * Normalize user input into an absolute URL. Bare localhost-ish hosts default
 * to http://, everything else defaults to https://.
 */
export function normalizeUrl(input) {
    const trimmed = String(input ?? "").trim();
    if (!trimmed) throw new Error("No URL provided.");
    if (/^https?:\/\//i.test(trimmed)) return parseTarget(trimmed).href;
    if (/^[a-z][a-z\d+.-]*:/i.test(trimmed) && !/^[^:/]+:\d+(?:[/?#]|$)/.test(trimmed)) {
        throw new Error("Only HTTP and HTTPS URLs are supported.");
    }
    const scheme = LOCAL_HOST_RE.test(trimmed) ? "http://" : "https://";
    return parseTarget(scheme + trimmed).href;
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
        authorizedOrigin = null,
    } = options;

    return new Promise((resolve, reject) => {
        let redirects = 0;
        let localOrigin = authorizedOrigin;

        const visit = async (urlStr) => {
            let parsed;
            try {
                parsed = parseTarget(urlStr);
            } catch {
                return reject(new Error("Invalid or unsupported URL."));
            }
            let addresses;
            try {
                if (parsed.origin !== localOrigin) localOrigin = null;
                addresses = await resolveAddresses(parsed.hostname);
                for (const { address } of addresses) {
                    const kind = addressKind(address);
                    if (kind !== "public" &&
                        (parsed.origin !== localOrigin ||
                         (kind === "private" && !allowPrivateNetwork))) {
                        throw new Error("Destination is outside the authorized preview origin.");
                    }
                }
            } catch (err) {
                return reject(err);
            }

            const lib = parsed.protocol === "https:" ? https : http;
            const req = lib.request(
                parsed,
                {
                    method: "GET",
                    // Do not resolve again or reuse a connection validated for a
                    // different request. Keep the URL hostname for Host and TLS.
                    agent: false,
                    lookup: (_hostname, opts, callback) => {
                        const candidates = opts.family
                            ? addresses.filter((a) => a.family === opts.family)
                            : addresses;
                        if (!candidates.length) return callback(new Error("No validated address."));
                        if (opts.all) return callback(null, candidates);
                        callback(null, candidates[0].address, candidates[0].family);
                    },
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
