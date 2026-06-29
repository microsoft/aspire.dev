// Dependency-free HTTP(S) fetch with redirect following, timeout, and a size
// cap. Uses Node's built-in http/https so it works regardless of whether the
// host Node has global fetch, and reliably reaches localhost / 127.0.0.1.

import http from "node:http";
import https from "node:https";

const USER_AGENT =
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 CopilotOGPreview/1.0";

const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|::1|.*\.localhost)(:|\/|$)/i;

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
    } = options;

    return new Promise((resolve, reject) => {
        let redirects = 0;

        const visit = (urlStr) => {
            let parsed;
            try {
                parsed = new URL(urlStr);
            } catch {
                return reject(new Error(`Invalid URL: ${urlStr}`));
            }
            if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
                return reject(new Error(`Unsupported protocol: ${parsed.protocol}`));
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
                        return visit(next);
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
                            return;
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

        visit(rawUrl);
    });
}
