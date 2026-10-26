// Regex-based OpenGraph / Twitter / meta-tag parser. No external deps.
// Produces resolved preview fields, ordered + grouped raw tags, and diagnostics.

function decodeEntities(input) {
    if (!input) return input;
    return String(input)
        .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => codePoint(parseInt(hex, 16)))
        .replace(/&#(\d+);/g, (_, dec) => codePoint(parseInt(dec, 10)))
        .replace(/&quot;/gi, '"')
        .replace(/&apos;/gi, "'")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&nbsp;/gi, " ")
        .replace(/&amp;/gi, "&");
}

function codePoint(cp) {
    if (!Number.isFinite(cp) || cp < 0 || cp > 0x10ffff) return "";
    try {
        return String.fromCodePoint(cp);
    } catch {
        return "";
    }
}

function extractTags(html, tagName) {
    const re = new RegExp(`<${tagName}\\b[^>]*?/?>`, "gi");
    const out = [];
    let m;
    while ((m = re.exec(html)) !== null) out.push(m[0]);
    return out;
}

function parseAttrs(tagStr) {
    const attrs = {};
    const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/g;
    let m;
    while ((m = re.exec(tagStr)) !== null) {
        const key = m[1].toLowerCase();
        const val = m[3] ?? m[4] ?? m[5] ?? "";
        attrs[key] = decodeEntities(val);
    }
    return attrs;
}

function resolveUrl(value, baseUrl) {
    if (!value) return "";
    try {
        return new URL(value, baseUrl).toString();
    } catch {
        return value;
    }
}

// Caps keep the parse result (and the prompt payload built from it) bounded on
// pathological pages. Whichever list was cut is named in the result's `capped`.
const MAX_ALTERNATES = 50;
const MAX_H1 = 5;
const MAX_H1_SCAN = 50;
const MAX_H1_CHARS = 200;
const MAX_JSON_LD_BLOCKS = 10;
const MAX_JSON_LD_CHARS = 6000;
const MAX_JSON_LD_TOTAL_CHARS = 20000;
const MAX_JSON_LD_DEPTH = 8;
const MAX_JSON_LD_TYPES = 20;

const hasToken = (value, token) => new RegExp(`(?:^|\\s)${token}(?:\\s|$)`).test(value);

// Plain text of an HTML fragment: tags dropped, entities decoded, whitespace collapsed.
function fragmentText(fragment) {
    return decodeEntities(fragment.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim();
}

// Closing tags are located with a forward-only scan from the opener, so an
// unclosed element costs one pass instead of a backtracking search per opener.
function extractH1(html, capped) {
    const out = [];
    const open = /<h1\b[^>]*>/gi;
    const close = /<\/h1\s*>/gi;
    for (let scanned = 0; scanned < MAX_H1_SCAN; scanned += 1) {
        const m = open.exec(html);
        if (!m) break;
        close.lastIndex = open.lastIndex;
        const end = close.exec(html);
        if (!end) break;
        if (out.length >= MAX_H1) {
            capped.add("h1");
            break;
        }
        const text = fragmentText(html.slice(open.lastIndex, Math.min(end.index, open.lastIndex + 4000)));
        out.push(text.length > MAX_H1_CHARS ? `${text.slice(0, MAX_H1_CHARS)}…` : text);
    }
    return out;
}

function jsonLdTypes(node, depth = 0) {
    if (!node || typeof node !== "object" || depth > 4) return [];
    if (Array.isArray(node)) return node.flatMap((child) => jsonLdTypes(child, depth + 1));
    const own = [].concat(node["@type"] ?? []).filter((t) => typeof t === "string");
    return own.concat(jsonLdTypes(node["@graph"], depth + 1));
}

// True when a parsed value nests deeper than `limit`. An explicit stack that
// stops at the first violation keeps a hostile document from costing more than
// one pass, and pretty-printing nested data grows with the square of its depth,
// so deep blocks must never reach a stringify.
function nestsDeeperThan(value, limit) {
    const stack = [[value, 1]];
    while (stack.length) {
        const [node, depth] = stack.pop();
        if (!node || typeof node !== "object") continue;
        if (depth > limit) return true;
        for (const child of Object.values(node)) stack.push([child, depth + 1]);
    }
    return false;
}

// JSON-LD blocks with their schema.org types. `data` is attached only to valid
// blocks that are small, shallow, and fit the total budget; any other valid block
// is flagged `dataOmitted` and named in `capped`. Invalid JSON never echoes a
// snippet back.
function extractJsonLd(html, capped) {
    const out = [];
    let budget = MAX_JSON_LD_TOTAL_CHARS;
    const open = /<script\b[^>]*?\stype\s*=\s*["']?application\/ld\+json[^>]*>/gi;
    const close = /<\/script\s*>/gi;
    for (;;) {
        const m = open.exec(html);
        if (!m) break;
        close.lastIndex = open.lastIndex;
        const end = close.exec(html);
        if (!end) break;
        if (out.length >= MAX_JSON_LD_BLOCKS) {
            capped.add("structuredData");
            break;
        }
        const text = html.slice(open.lastIndex, end.index).trim();
        let node;
        let valid = true;
        try {
            node = JSON.parse(text);
        } catch {
            valid = false;
        }
        const entry = {
            types: valid ? [...new Set(jsonLdTypes(node))].slice(0, MAX_JSON_LD_TYPES) : [],
            valid,
            size: text.length,
        };
        if (valid) {
            if (text.length <= Math.min(MAX_JSON_LD_CHARS, budget) && !nestsDeeperThan(node, MAX_JSON_LD_DEPTH)) {
                entry.data = node;
                budget -= text.length;
            } else {
                entry.dataOmitted = true;
                capped.add("structuredData");
            }
        }
        out.push(entry);
    }
    return out;
}

// GitHub path segments that are never a real "owner" (site pages, product
// areas, etc.). Used to filter false positives when sniffing a repo link.
const GH_RESERVED_OWNERS = new Set([
    "about", "account", "admin", "apps", "assets", "blog", "business", "careers",
    "cdn", "collections", "contact", "customer-stories", "dashboard", "enterprise",
    "events", "explore", "features", "fluidicon", "github", "home", "join", "login",
    "logout", "marketplace", "mobile", "new", "notifications", "open-source", "orgs",
    "personal", "pricing", "pulls", "readme", "search", "security", "sessions",
    "settings", "showcases", "signup", "site", "sponsors", "stars", "team", "teams",
    "topics", "trending", "user", "users", "watching", "wiki", "codespaces", "copilot",
]);

function scoreRepoPath(rest) {
    // "Edit this page" links are the strongest signal that a repo builds THIS
    // page; blob/tree/raw and commit links are next; issue/release links weakest.
    if (/^\/edit\//i.test(rest)) return 100;
    if (/^\/(?:blob|tree|raw|blame)\//i.test(rest)) return 60;
    if (/^\/(?:commit|commits)\b/i.test(rest)) return 40;
    if (/^\/(?:releases|tags|issues|pull|pulls|wiki|actions|discussions|graphs|network)\b/i.test(rest)) return 8;
    return 4; // bare repo link
}

function addRepoCandidate(scores, owner, repo, score) {
    if (!owner || !repo) return;
    owner = owner.trim();
    repo = repo.replace(/\.git$/i, "").replace(/[.\-_]+$/, "").trim();
    if (!owner || !repo) return;
    if (GH_RESERVED_OWNERS.has(owner.toLowerCase())) return;
    if (/^(?:sponsors|apps|orgs|followers|following)$/i.test(repo)) return;
    const key = `${owner}/${repo}`;
    const cur = scores.get(key) || { owner, repo, score: 0, hits: 0 };
    cur.score += score;
    cur.hits += 1;
    scores.set(key, cur);
}

/**
 * Best-effort detection of the GitHub source repository for a page by scanning
 * its full HTML for repo links (not just OpenGraph tags). "Edit this page",
 * blob/tree, and commit links are the strongest signals for the repo that
 * actually builds the page.
 * @param {string} html
 * @returns {{ owner: string, repo: string, slug: string, url: string } | null}
 */
export function detectRepository(html) {
    if (!html) return null;
    const scores = new Map();
    const ghRe = /\bgithub\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+)((?:\/[^\s"'<>)]*)?)/gi;
    let m;
    while ((m = ghRe.exec(html)) !== null) {
        addRepoCandidate(scores, m[1], m[2], scoreRepoPath(m[3] || ""));
    }
    // raw.githubusercontent.com/<owner>/<repo>/<ref>/... — treat like a blob link.
    const rawRe = /\braw\.githubusercontent\.com\/([A-Za-z0-9][A-Za-z0-9-]{0,38})\/([A-Za-z0-9._-]+)\//gi;
    while ((m = rawRe.exec(html)) !== null) {
        addRepoCandidate(scores, m[1], m[2], 60);
    }
    if (scores.size === 0) return null;
    let best = null;
    for (const v of scores.values()) {
        if (!best || v.score > best.score || (v.score === best.score && v.hits > best.hits)) {
            best = v;
        }
    }
    if (!best) return null;
    const slug = `${best.owner}/${best.repo}`;
    return { owner: best.owner, repo: best.repo, slug, url: `https://github.com/${slug}` };
}

/**
 * Parse OpenGraph and related metadata out of an HTML document.
 * @param {string} html
 * @param {string} baseUrl - the (final) URL the HTML was fetched from
 */
export function parseMetadata(html, baseUrl) {
    const all = []; // ordered { key, value }

    for (const tag of extractTags(html, "meta")) {
        const a = parseAttrs(tag);
        if (a.charset) {
            all.push({ key: "charset", value: a.charset });
            continue;
        }
        const key = a.property || a.name || a.itemprop;
        if (!key || typeof a.content !== "string") continue;
        all.push({ key: key.toLowerCase().trim(), value: a.content });
    }

    // <title>
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const htmlTitle = titleMatch ? decodeEntities(titleMatch[1]).trim() : "";

    // <link> tags: icons, canonical + alternates (hreflang, feeds)
    let canonical = "";
    const icons = [];
    const alternates = [];
    const capped = new Set();
    for (const tag of extractTags(html, "link")) {
        const a = parseAttrs(tag);
        const rel = (a.rel || "").toLowerCase();
        if (!rel || !a.href) continue;
        if (rel.includes("canonical")) canonical = resolveUrl(a.href, baseUrl);
        if (rel.includes("icon")) {
            icons.push({ rel, href: resolveUrl(a.href, baseUrl), sizes: a.sizes || "" });
        }
        if (hasToken(rel, "alternate") && !hasToken(rel, "stylesheet")) {
            if (alternates.length < MAX_ALTERNATES) {
                alternates.push({
                    hreflang: a.hreflang || "",
                    type: a.type || "",
                    href: resolveUrl(a.href, baseUrl),
                });
            } else {
                capped.add("alternates");
            }
        }
    }

    const htmlTag = html.match(/<html\b[^>]*>/i);
    const htmlAttrs = htmlTag ? parseAttrs(htmlTag[0]) : {};
    const lang = (htmlAttrs.lang || htmlAttrs["xml:lang"] || "").trim();
    const h1 = extractH1(html, capped);
    const structuredData = extractJsonLd(html, capped);

    const first = (k) => {
        const f = all.find((x) => x.key === k.toLowerCase());
        return f ? f.value : "";
    };

    const ogImageRaw =
        first("og:image:secure_url") || first("og:image:url") || first("og:image");
    const twImageRaw = first("twitter:image") || first("twitter:image:src");

    let hostname = "";
    try {
        hostname = new URL(baseUrl).hostname;
    } catch {
        hostname = baseUrl;
    }

    const image = resolveUrl(ogImageRaw || twImageRaw, baseUrl);
    const favicon =
        icons.find((i) => i.rel.includes("apple-touch"))?.href ||
        icons.find((i) => i.rel === "icon" || i.rel.includes("shortcut"))?.href ||
        icons[0]?.href ||
        resolveUrl("/favicon.ico", baseUrl);

    const resolved = {
        title: first("og:title") || first("twitter:title") || htmlTitle,
        description:
            first("og:description") ||
            first("twitter:description") ||
            first("description"),
        image,
        imageAlt: first("og:image:alt") || first("twitter:image:alt"),
        siteName: first("og:site_name"),
        hostname,
        url: first("og:url") || canonical || baseUrl,
        type: first("og:type"),
        locale: first("og:locale"),
        themeColor: first("theme-color"),
        favicon,
        twitterCard: first("twitter:card"),
        twitterSite: first("twitter:site"),
        twitterCreator: first("twitter:creator"),
    };

    // Grouped raw view
    const groups = { openGraph: [], twitter: [], other: [] };
    for (const item of all) {
        if (item.key.startsWith("og:")) groups.openGraph.push(item);
        else if (item.key.startsWith("twitter:")) groups.twitter.push(item);
        else groups.other.push(item);
    }

    const hasImage = !!ogImageRaw;
    const imgAlt = first("og:image:alt");
    const imgWidth = first("og:image:width");
    const imgHeight = first("og:image:height");
    const imgType = first("og:image:type");
    const imgSecure = first("og:image:secure_url");
    const isHttpsImage = /^https:\/\//i.test(image);

    const diagnostics = [
        check("og:title", !!first("og:title"), "required", "Primary title shown in shares."),
        check("og:type", !!first("og:type"), "recommended", "e.g. website, article, video."),
        check("og:image", !!ogImageRaw, "required", "The preview image. ~1200×630 recommended."),
        check("og:url", !!first("og:url"), "recommended", "Canonical URL of the object."),
        check("og:description", !!first("og:description"), "recommended", "Short summary (<200 chars)."),
        check("og:site_name", !!resolved.siteName, "optional", "Human-readable site name."),
        check("og:locale", !!resolved.locale, "optional", "Content locale, e.g. en_US (defaults to en_US)."),
        check("twitter:card", !!resolved.twitterCard, "recommended", "Controls X/Twitter card layout."),
        check(
            "Absolute og:image URL",
            /^https?:\/\//i.test(image),
            "recommended",
            "Crawlers require absolute image URLs.",
        ),
    ];

    // Structured og:image sub-properties only matter when an og:image exists —
    // otherwise the required og:image failure already covers it.
    if (hasImage) {
        diagnostics.push(
            check(
                "og:image:alt",
                !!imgAlt,
                "recommended",
                "Alt text describing the image — ogp.me recommends it whenever og:image is set.",
            ),
            check(
                "og:image dimensions",
                !!imgWidth && !!imgHeight,
                "recommended",
                imgWidth && imgHeight
                    ? `Declared ${imgWidth}×${imgHeight} — lets platforms render the card before fetching the image.`
                    : "Add og:image:width and og:image:height so platforms size the card instantly.",
            ),
            check(
                "og:image:type",
                !!imgType,
                "optional",
                imgType ? `MIME type ${imgType}.` : "MIME type of the image, e.g. image/png.",
            ),
            check(
                "og:image:secure_url",
                isHttpsImage || !!imgSecure,
                "optional",
                isHttpsImage
                    ? "Preview image is served over HTTPS."
                    : "og:image is HTTP — add an HTTPS og:image:secure_url.",
            ),
        );
    }

    diagnostics.push(
        check(
            "Description length OK",
            !resolved.description || resolved.description.length <= 300,
            "optional",
            `Description is ${resolved.description.length} chars.`,
        ),
    );

    return {
        requestedUrl: baseUrl,
        resolved,
        raw: all,
        groups,
        icons,
        diagnostics,
        htmlTitle,
        tagCount: all.length,
        repository: detectRepository(html),
        canonical,
        lang,
        h1,
        alternates,
        structuredData,
        capped: [...capped],
    };
}

function check(id, ok, level, note) {
    return { id, ok, level, note };
}
