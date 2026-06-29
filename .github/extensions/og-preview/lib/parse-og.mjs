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

    // <link> tags: icons + canonical
    let canonical = "";
    const icons = [];
    for (const tag of extractTags(html, "link")) {
        const a = parseAttrs(tag);
        const rel = (a.rel || "").toLowerCase();
        if (!rel || !a.href) continue;
        if (rel.includes("canonical")) canonical = a.href;
        if (rel.includes("icon")) {
            icons.push({ rel, href: resolveUrl(a.href, baseUrl), sizes: a.sizes || "" });
        }
    }

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

    const diagnostics = [
        check("og:title", !!first("og:title"), "required", "Primary title shown in shares."),
        check("og:type", !!first("og:type"), "recommended", "e.g. website, article, video."),
        check("og:image", !!ogImageRaw, "required", "The preview image. ~1200×630 recommended."),
        check("og:url", !!first("og:url"), "recommended", "Canonical URL of the object."),
        check("og:description", !!first("og:description"), "recommended", "Short summary (<200 chars)."),
        check("og:site_name", !!resolved.siteName, "optional", "Human-readable site name."),
        check("twitter:card", !!resolved.twitterCard, "recommended", "Controls X/Twitter card layout."),
        check(
            "Absolute og:image URL",
            /^https?:\/\//i.test(image),
            "recommended",
            "Crawlers require absolute image URLs.",
        ),
        check(
            "Description length OK",
            !resolved.description || resolved.description.length <= 300,
            "optional",
            `Description is ${resolved.description.length} chars.`,
        ),
    ];

    return {
        requestedUrl: baseUrl,
        resolved,
        raw: all,
        groups,
        icons,
        diagnostics,
        htmlTitle,
        tagCount: all.length,
    };
}

function check(id, ok, level, note) {
    return { id, ok, level, note };
}
