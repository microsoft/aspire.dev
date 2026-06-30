"use strict";

const TRANSPARENT =
    "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

const FOOTER_KEY = "og-preview:footer-open";

const $ = (sel) => document.querySelector(sel);
const input = $("#url-input");
const statusEl = $("#status");
let lastData = null;

function el(tag, props, children) {
    const node = document.createElement(tag);
    if (props) {
        for (const [k, v] of Object.entries(props)) {
            if (v == null) continue;
            if (k === "class") node.className = v;
            else if (k === "text") node.textContent = v;
            else if (k === "html") node.innerHTML = v;
            else node.setAttribute(k, v);
        }
    }
    for (const c of [].concat(children || [])) {
        if (c == null) continue;
        node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    }
    return node;
}

function prettyDomain(host) {
    return String(host || "").replace(/^www\./i, "");
}

/* ---------------- Motion / view transitions ---------------- */

const reduceMotion = window.matchMedia
    ? window.matchMedia("(prefers-reduced-motion: reduce)")
    : { matches: false };

/** Run a DOM mutation inside a View Transition when supported (and motion is
 *  allowed), otherwise apply it synchronously. */
function withTransition(mutate) {
    if (document.startViewTransition && !reduceMotion.matches) {
        document.startViewTransition(() => mutate());
    } else {
        mutate();
    }
}

/* ---------------- Skeletons ----------------
   Mirror the real happy-path shapes so the layout doesn't jump when data lands. */

function sk(cls, extra) {
    return el("div", { class: `skeleton ${cls}`, style: extra });
}

function skMeta(lines) {
    return el(
        "div",
        { class: "sk-meta" },
        lines.map((w, i) =>
            sk(`sk-line${i === 0 ? " lg" : ""}`, `width:${w}`),
        ),
    );
}

function skPreviewCard(opts) {
    const card = el("div", { class: `sk-card${opts && opts.compact ? " compact" : ""}` }, [
        sk("sk-img"),
        skMeta(opts && opts.lines ? opts.lines : ["40%", "85%", "60%"]),
    ]);
    return card;
}

function skLabeled(name) {
    return el("div", { class: "preview" }, [
        el("div", { class: "preview-label" }, [sk("sk-dot"), name]),
        skPreviewCard(name === "X · Twitter" ? { lines: ["50%", "80%"] } : {}),
    ]);
}

function skeletonPreviews() {
    const grid = $("#previews");
    grid.classList.remove("enter");
    grid.replaceChildren(
        skLabeled("OpenGraph · Facebook"),
        skLabeled("X · Twitter"),
        skLabeled("LinkedIn"),
        skLabeled("Slack"),
        skLabeled("Discord"),
    );
}

function skRawGroup(rows) {
    const list = [el("div", { class: "sk-rawhead" }, [sk("sk-line sm", "width:120px")])];
    for (let i = 0; i < rows; i += 1) {
        list.push(
            el("div", { class: "sk-rawrow" }, [
                sk("sk-line", `width:${60 + ((i * 13) % 30)}%`),
                sk("sk-line", `width:${70 + ((i * 17) % 25)}%`),
            ]),
        );
    }
    return el("div", { class: "sk-rawgroup" }, list);
}

function skeletonRaw() {
    $("#raw-summary").textContent = "Reading meta tags…";
    $("#raw").replaceChildren(skRawGroup(5), skRawGroup(4));
}

function skeletonDiagnostics() {
    const rows = [];
    for (let i = 0; i < 6; i += 1) {
        rows.push(
            el("div", { class: "sk-diagrow" }, [
                sk("sk-circle"),
                el("div", { class: "sk-lines" }, [
                    sk("sk-line", "width:30%"),
                    sk("sk-line sm", `width:${60 + ((i * 11) % 30)}%`),
                ]),
            ]),
        );
    }
    $("#diagnostics").replaceChildren(el("div", { class: "sk-diaglist" }, rows));
}

function renderSkeleton() {
    skeletonPreviews();
    skeletonRaw();
    skeletonDiagnostics();
}

/** Auto-include a scheme: http:// for localhost/loopback, https:// otherwise. */
function withScheme(raw) {
    let v = (raw || "").trim();
    if (!v || v === "https://" || v === "http://") return "";
    if (/^https?:\/\//i.test(v)) return v;
    v = v.replace(/^\/+/, "");
    const isLocal = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]|[^/]+\.local)(:|\/|$)/i.test(v);
    return (isLocal ? "http://" : "https://") + v;
}

/* ---------------- Clipboard ---------------- */

async function copyText(text, btn) {
    try {
        await navigator.clipboard.writeText(text);
        if (btn) {
            btn.classList.add("copied");
            const prev = btn.getAttribute("aria-label") || "Copy";
            btn.setAttribute("aria-label", "Copied");
            setTimeout(() => {
                btn.classList.remove("copied");
                btn.setAttribute("aria-label", prev);
            }, 1100);
        }
        return true;
    } catch {
        return false;
    }
}

function copyButton(text, label) {
    const btn = el("button", {
        class: "copy-btn",
        type: "button",
        title: label || "Copy value",
        "aria-label": label || "Copy value",
    });
    btn.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.75A1.75 1.75 0 0 1 5.75 1h5.5A1.75 1.75 0 0 1 13 2.75v7.5A1.75 1.75 0 0 1 11.25 12h-5.5A1.75 1.75 0 0 1 4 10.25v-7.5Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .14.11.25.25.25h5.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-5.5ZM2 5.75A.75.75 0 0 1 2.75 5H3v1.5h-.25v6.75c0 .14.11.25.25.25h6.75V13H3.75A1.75 1.75 0 0 1 2 11.25v-5.5Z"/></svg>';
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        copyText(text, btn);
    });
    return btn;
}

/** Image element with direct -> proxy -> placeholder fallback chain. */
function makeImage(url, className) {
    if (!url) return el("div", { class: className });
    const img = el("img", { class: className, src: url, alt: "", referrerpolicy: "no-referrer" });
    img.dataset.stage = "direct";
    img.addEventListener("error", () => {
        if (img.dataset.stage === "direct") {
            img.dataset.stage = "proxy";
            img.src = "/api/img?u=" + encodeURIComponent(url);
        } else if (img.dataset.stage === "proxy") {
            img.dataset.stage = "placeholder";
            img.src = TRANSPARENT;
        }
    });
    return img;
}

/* ---------------- Image hover preview ----------------
   A single floating tooltip that previews an image asset and follows the
   cursor while hovering an image-like value. Stylized with theme tokens. */

let imgTip = null;
let imgTipImg = null;
let imgTipMeta = null;

function ensureImgTip() {
    if (imgTip) return imgTip;
    imgTipImg = el("img", { alt: "" });
    imgTipImg.referrerPolicy = "no-referrer";
    imgTipMeta = el("div", { class: "img-tip-meta" });
    imgTip = el("div", { class: "img-tip", hidden: "" }, [imgTipImg, imgTipMeta]);
    document.body.appendChild(imgTip);
    return imgTip;
}

function positionImgTip(x, y) {
    if (!imgTip || imgTip.hidden) return;
    const pad = 16;
    const w = imgTip.offsetWidth || 272;
    const h = imgTip.offsetHeight || 200;
    let left = x + pad;
    let top = y + pad;
    if (left + w + 8 > window.innerWidth) left = x - w - pad;
    if (top + h + 8 > window.innerHeight) top = y - h - pad;
    imgTip.style.left = Math.max(8, left) + "px";
    imgTip.style.top = Math.max(8, top) + "px";
}

function showImgTip(url, x, y) {
    const real = url.startsWith("//") ? "https:" + url : url;
    const tip = ensureImgTip();
    imgTipMeta.textContent = "Loading…";
    imgTipImg.dataset.stage = "direct";
    imgTipImg.onload = () => {
        const { naturalWidth: nw, naturalHeight: nh } = imgTipImg;
        imgTipMeta.textContent = nw && nh ? `${nw} × ${nh}` : "";
    };
    imgTipImg.onerror = () => {
        if (imgTipImg.dataset.stage === "direct") {
            imgTipImg.dataset.stage = "proxy";
            imgTipImg.src = "/api/img?u=" + encodeURIComponent(real);
        } else {
            imgTipMeta.textContent = "Preview unavailable";
        }
    };
    imgTipImg.src = real;
    tip.hidden = false;
    positionImgTip(x, y);
    requestAnimationFrame(() => tip.classList.add("visible"));
}

function hideImgTip() {
    if (!imgTip) return;
    imgTip.classList.remove("visible");
    imgTip.hidden = true;
    imgTipImg.removeAttribute("src");
}

function bindImageHover(node, url) {
    node.addEventListener("mouseenter", (e) => showImgTip(url, e.clientX, e.clientY));
    node.addEventListener("mousemove", (e) => positionImgTip(e.clientX, e.clientY));
    node.addEventListener("mouseleave", hideImgTip);
}

/* ---------------- Code / .mdx hover preview ----------------
   Anchored, interactive (scrollable) hovercard that fetches and renders the
   source of a code/markdown file referenced by a value, so it can be explored
   without leaving the canvas. Unlike the image tooltip it accepts pointer
   events, so the user can move into it and scroll. */

const CODE_EXT_RE =
    /\.(mdx?|markdown|jsx?|mjs|cjs|tsx?|json5?|jsonc|ya?ml|toml|ini|cfg|conf|env|css|scss|sass|less|html?|xml|rss|atom|sh|bash|zsh|fish|ps1|psm1|py|rb|go|rs|java|kt|kts|swift|c|h|hpp|cc|cpp|cxx|cs|php|sql|graphql|gql|proto|vue|svelte|astro|txt|text|log|lock|gradle|dockerfile|makefile|cmake)(\?|#|$)/i;

const LANG_LABELS = {
    mdx: "MDX", md: "Markdown", markdown: "Markdown", js: "JavaScript", mjs: "JavaScript",
    cjs: "JavaScript", jsx: "JSX", ts: "TypeScript", tsx: "TSX", json: "JSON", json5: "JSON5",
    jsonc: "JSON", yaml: "YAML", yml: "YAML", toml: "TOML", ini: "INI", cfg: "Config",
    conf: "Config", env: "Env", css: "CSS", scss: "SCSS", sass: "Sass", less: "Less",
    html: "HTML", htm: "HTML", xml: "XML", rss: "RSS", atom: "Atom", sh: "Shell", bash: "Shell",
    zsh: "Shell", fish: "Shell", ps1: "PowerShell", psm1: "PowerShell", py: "Python", rb: "Ruby",
    go: "Go", rs: "Rust", java: "Java", kt: "Kotlin", kts: "Kotlin", swift: "Swift", c: "C",
    h: "C", hpp: "C++", cc: "C++", cpp: "C++", cxx: "C++", cs: "C#", php: "PHP", sql: "SQL",
    graphql: "GraphQL", gql: "GraphQL", proto: "Protobuf", vue: "Vue", svelte: "Svelte",
    astro: "Astro", txt: "Text", text: "Text", log: "Log", lock: "Lockfile", gradle: "Gradle",
    dockerfile: "Dockerfile", makefile: "Makefile", cmake: "CMake",
};

function urlExt(url) {
    const m = String(url || "").toLowerCase().match(/\.([a-z0-9]+)(?:[?#]|$)/);
    return m ? m[1] : "";
}

function looksLikeCode(value) {
    if (!/^(https?:)?\/\//i.test(value || "")) return false;
    if (/\.svg(\?|#|$)/i.test(value)) return false; // SVG is previewed as an image
    return CODE_EXT_RE.test(value);
}

function codeLang(url) {
    const ext = urlExt(url);
    return LANG_LABELS[ext] || (ext ? ext.toUpperCase() : "Code");
}

function codeFileName(url) {
    try {
        const u = new URL(url.startsWith("//") ? "https:" + url : url);
        return u.pathname.split("/").filter(Boolean).pop() || u.host;
    } catch {
        return url;
    }
}

function formatBytes(n) {
    if (n == null) return "";
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(n < 10240 ? 1 : 0)} KB`;
    return `${(n / 1048576).toFixed(1)} MB`;
}

const codeCache = new Map(); // url -> payload | { error }
let codeCard = null;
let codeHead = null;
let codeBody = null;
let codeHideTimer = null;
let codeShowTimer = null;
let codeReqId = 0;

function ensureCodeCard() {
    if (codeCard) return codeCard;
    codeHead = el("div", { class: "code-card-head" });
    codeBody = el("div", { class: "code-card-body" });
    codeCard = el("div", { class: "code-card", hidden: "" }, [codeHead, codeBody]);
    codeCard.addEventListener("mouseenter", () => clearTimeout(codeHideTimer));
    codeCard.addEventListener("mouseleave", scheduleHideCode);
    document.body.appendChild(codeCard);
    return codeCard;
}

function positionCodeCard(rect) {
    if (!codeCard || codeCard.hidden) return;
    const m = 8;
    const w = codeCard.offsetWidth || 520;
    const h = codeCard.offsetHeight || 320;
    let left = rect.left;
    if (left + w + m > window.innerWidth) left = window.innerWidth - w - m;
    left = Math.max(m, left);
    let top = rect.bottom + 6;
    if (top + h + m > window.innerHeight) {
        const above = rect.top - 6 - h;
        top = above > m ? above : Math.max(m, window.innerHeight - h - m);
    }
    codeCard.style.left = left + "px";
    codeCard.style.top = top + "px";
}

function codeIconButton(cls, label, svg) {
    const b = el("button", { class: cls, type: "button", title: label, "aria-label": label });
    b.innerHTML = svg;
    return b;
}

function renderCodeHeader(url, payload) {
    const lang = el("span", { class: "code-lang", text: codeLang(url) });
    const name = el("span", { class: "code-name", text: codeFileName(url) });
    const meta = el("span", {
        class: "code-meta muted",
        text: payload && !payload.error
            ? `${formatBytes(payload.bytes)}${payload.truncated ? " · truncated" : ""}`
            : "",
    });
    const open = el("a", {
        class: "code-open",
        href: url.startsWith("//") ? "https:" + url : url,
        target: "_blank",
        rel: "noreferrer",
        title: "Open raw",
        "aria-label": "Open raw",
    });
    open.innerHTML =
        '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M3.75 2A1.75 1.75 0 0 0 2 3.75v8.5C2 13.22 2.78 14 3.75 14h8.5A1.75 1.75 0 0 0 14 12.25v-3a.75.75 0 0 0-1.5 0v3a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-8.5a.25.25 0 0 1 .25-.25h3a.75.75 0 0 0 0-1.5h-3Z"/><path fill="currentColor" d="M8.5 1.75A.75.75 0 0 1 9.25 1h5a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0V3.56L8.78 8.28a.75.75 0 1 1-1.06-1.06l4.72-4.72H9.25a.75.75 0 0 1-.75-.75Z"/></svg>';
    const copy = codeIconButton(
        "code-copy",
        "Copy file",
        '<svg width="13" height="13" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M4 2.75A1.75 1.75 0 0 1 5.75 1h5.5A1.75 1.75 0 0 1 13 2.75v7.5A1.75 1.75 0 0 1 11.25 12h-5.5A1.75 1.75 0 0 1 4 10.25v-7.5Zm1.75-.25a.25.25 0 0 0-.25.25v7.5c0 .14.11.25.25.25h5.5a.25.25 0 0 0 .25-.25v-7.5a.25.25 0 0 0-.25-.25h-5.5ZM2 5.75A.75.75 0 0 1 2.75 5H3v1.5h-.25v6.75c0 .14.11.25.25.25h6.75V13H3.75A1.75 1.75 0 0 1 2 11.25v-5.5Z"/></svg>',
    );
    if (payload && !payload.error) {
        copy.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            copyText(payload.text, copy);
        });
    } else {
        copy.disabled = true;
    }
    codeHead.replaceChildren(lang, name, meta, open, copy);
}

function renderCodeBody(text, truncated) {
    const MAX_LINES = 600;
    const allLines = text.replace(/\n$/, "").split("\n");
    const lines = allLines.slice(0, MAX_LINES);
    const wrap = el("div", { class: "code-lines" });
    const frag = document.createDocumentFragment();
    lines.forEach((ln, i) => {
        frag.appendChild(
            el("div", { class: "cl" }, [
                el("span", { class: "cl-n", text: String(i + 1) }),
                el("span", { class: "cl-t", text: ln.length ? ln : " " }),
            ]),
        );
    });
    wrap.appendChild(frag);
    codeBody.replaceChildren(el("div", { class: "code-scroll" }, [wrap]));
    if (truncated || allLines.length > MAX_LINES) {
        codeBody.appendChild(
            el("div", {
                class: "code-more muted",
                text: `Showing ${lines.length} of ${allLines.length}${truncated ? "+" : ""} lines — open raw to see all.`,
            }),
        );
    }
}

async function showCodeCard(url, node) {
    hideImgTip();
    const card = ensureCodeCard();
    const token = ++codeReqId;
    renderCodeHeader(url, null);
    codeBody.replaceChildren(el("div", { class: "code-loading", text: "Loading…" }));
    card.hidden = false;
    positionCodeCard(node.getBoundingClientRect());
    requestAnimationFrame(() => card.classList.add("visible"));

    let payload = codeCache.get(url);
    if (!payload) {
        try {
            const res = await fetch("/api/raw?u=" + encodeURIComponent(url));
            payload = await res.json();
        } catch {
            payload = { error: "Couldn't load file." };
        }
        codeCache.set(url, payload);
    }
    if (token !== codeReqId || card.hidden) return; // superseded or dismissed
    renderCodeHeader(url, payload);
    if (payload.error) {
        codeBody.replaceChildren(el("div", { class: "code-error", text: payload.error }));
    } else {
        renderCodeBody(payload.text, payload.truncated);
    }
    positionCodeCard(node.getBoundingClientRect());
}

function scheduleHideCode() {
    clearTimeout(codeHideTimer);
    codeHideTimer = setTimeout(hideCodeCard, 180);
}

function hideCodeCard() {
    codeReqId += 1; // invalidate any in-flight fill
    if (!codeCard) return;
    codeCard.classList.remove("visible");
    codeCard.hidden = true;
}

function bindCodeHover(node, url) {
    node.addEventListener("mouseenter", () => {
        clearTimeout(codeHideTimer);
        clearTimeout(codeShowTimer);
        codeShowTimer = setTimeout(() => showCodeCard(url, node), 200);
    });
    node.addEventListener("mouseleave", () => {
        clearTimeout(codeShowTimer);
        scheduleHideCode();
    });
}

/* ---------------- Previews ---------------- */

function labeledCard(name, color, card) {
    return el("div", { class: "preview" }, [
        el("div", { class: "preview-label" }, [
            el("span", { class: "dot", style: `background:${color}` }),
            name,
        ]),
        card,
    ]);
}

function facebookCard(d, domain) {
    return el("div", { class: "fb" }, [
        makeImage(d.image, "card-img"),
        el("div", { class: "meta" }, [
            el("div", { class: "domain", text: domain }),
            el("div", { class: "title", text: d.title || "(no title)" }),
            d.description ? el("div", { class: "desc", text: d.description }) : null,
        ]),
    ]);
}

function twitterCard(d, domain) {
    const isSmall = (d.twitterCard || "").toLowerCase() === "summary";
    if (isSmall) {
        return el("div", { class: "x small" }, [
            makeImage(d.image, "card-img"),
            el("div", { class: "meta" }, [
                el("div", { class: "domain", text: domain }),
                el("div", { class: "title", text: d.title || "(no title)" }),
                d.description ? el("div", { class: "desc", text: d.description }) : null,
            ]),
        ]);
    }
    return el("div", { class: "x" }, [
        makeImage(d.image, "card-img"),
        d.image ? el("span", { class: "domain-pill", text: domain }) : null,
        el("div", { class: "meta" }, [
            el("div", { class: "title", text: d.title || "(no title)" }),
            d.description ? el("div", { class: "desc", text: d.description }) : null,
        ]),
    ]);
}

function linkedinCard(d, domain) {
    return el("div", { class: "li" }, [
        makeImage(d.image, "card-img"),
        el("div", { class: "meta" }, [
            el("div", { class: "title", text: d.title || "(no title)" }),
            el("div", { class: "domain", text: domain }),
        ]),
    ]);
}

function slackCard(d, domain) {
    const accent = d.themeColor || "#e8e8e8";
    const card = el("div", { class: "slack", style: `border-left-color:${accent}` }, [
        el("div", { class: "site" }, [
            d.favicon ? makeImage(d.favicon, "") : null,
            d.siteName || domain,
        ]),
        el("div", { class: "title", text: d.title || "(no title)" }),
        d.description ? el("div", { class: "desc", text: d.description }) : null,
        d.image ? makeImage(d.image, "card-img") : null,
    ]);
    return card;
}

function discordCard(d, domain) {
    const accent = d.themeColor || "#5865f2";
    return el("div", { class: "discord", style: `border-left-color:${accent}` }, [
        el("div", { class: "site", text: d.siteName || domain }),
        el("div", { class: "title", text: d.title || "(no title)" }),
        d.description ? el("div", { class: "desc", text: d.description }) : null,
        d.image ? makeImage(d.image, "card-img") : null,
    ]);
}

function renderPreviews(data) {
    const d = data.resolved;
    const domain = prettyDomain(d.hostname);
    const grid = $("#previews");
    grid.replaceChildren(
        labeledCard("OpenGraph · Facebook", "#1877f2", facebookCard(d, domain)),
        labeledCard("X · Twitter", "#000000", twitterCard(d, domain)),
        labeledCard("LinkedIn", "#0a66c2", linkedinCard(d, domain)),
        labeledCard("Slack", "#4a154b", slackCard(d, domain)),
        labeledCard("Discord", "#5865f2", discordCard(d, domain)),
    );
    // Retrigger the staggered entrance animation.
    grid.classList.remove("enter");
    void grid.offsetWidth;
    grid.classList.add("enter");
}

/* ---------------- Raw ---------------- */

/* ---------------- Rich value formatting ----------------
   Emphasize well-known structured bits (colors, dimensions, booleans, locales,
   types, handles, dates, links) so the raw table reads at a glance. */

const HEX_COLOR_RE = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
const FN_COLOR_RE = /^(?:rgb|rgba|hsl|hsla)\([^)]*\)$/i;
const MIME_RE = /^[a-z]+\/[a-z0-9.+-]+$/i;
const LOCALE_RE = /^[a-z]{2,3}(?:[_-][A-Za-z]{2,4})?$/;
const ISO_DT_RE =
    /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;

function vtext(children, extraCls) {
    return el("span", { class: "v-text" + (extraCls ? " " + extraCls : "") }, children);
}

/** Resolve "owner/repo" from a github.com URL, or null. */
function nwoFromUrl(u) {
    if (!u) return null;
    try {
        const url = new URL(/^https?:\/\//i.test(u) ? u : "https://" + u);
        if (!/(^|\.)github\.com$/i.test(url.hostname)) return null;
        const parts = url.pathname.split("/").filter(Boolean);
        const reserved = ["orgs", "sponsors", "features", "about", "marketplace", "topics", "collections"];
        if (parts.length >= 2 && !reserved.includes(parts[0].toLowerCase())) {
            return `${parts[0]}/${parts[1]}`.replace(/\.git$/i, "");
        }
    } catch {
        /* not a URL */
    }
    return null;
}

/** Best-effort GitHub repo (owner/repo) for the currently loaded page. */
function githubRepoNwo() {
    const d = lastData;
    if (!d) return null;
    const groups = d.groups || {};
    const metas = [...(groups.other || []), ...(groups.openGraph || []), ...(groups.twitter || [])];
    const nwoMeta = metas.find(
        (m) => /repository[_-]nwo|github:repo/i.test(m.key) && /^[\w.-]+\/[\w.-]+$/.test(m.value),
    );
    if (nwoMeta) return nwoMeta.value;
    for (const u of [d.resolved && d.resolved.url, d.requestedUrl, d.resolved && d.resolved.hostname]) {
        const nwo = nwoFromUrl(u);
        if (nwo) return nwo;
    }
    return null;
}

function formatValue(key, value) {
    const raw = String(value);
    const v = raw.trim();
    const lk = String(key).toLowerCase();

    // Links
    if (/^https?:\/\//i.test(v) || /^\/\//.test(v)) {
        return vtext([
            el("a", {
                href: v.startsWith("//") ? "https:" + v : v,
                target: "_blank",
                rel: "noreferrer",
                text: v,
            }),
        ]);
    }

    // Colors (hex / rgb / hsl, or color-named keys CSS can parse)
    const colorish =
        HEX_COLOR_RE.test(v) ||
        FN_COLOR_RE.test(v) ||
        (/color/.test(lk) && typeof CSS !== "undefined" && CSS.supports && CSS.supports("color", v));
    if (colorish) {
        return vtext(
            [
                el("span", { class: "color-swatch", style: `background:${v}` }),
                el("code", { class: "vt-mono", text: v }),
            ],
            "vt-color",
        );
    }

    // Numbers (dimensions, counts)
    if (/^-?\d+(?:\.\d+)?$/.test(v)) {
        const parts = [el("span", { class: "vt-num", text: v })];
        if (/(width|height)/.test(lk)) parts.push(el("span", { class: "vt-unit", text: "px" }));
        return vtext(parts);
    }

    // Booleans
    if (/^(true|false|yes|no)$/i.test(v)) {
        const on = /^(true|yes)$/i.test(v);
        return vtext([el("span", { class: `vt-bool ${on ? "on" : "off"}`, text: v })]);
    }

    // Twitter/X handles -> link to the profile on x.com
    const isHandleKey = /twitter/.test(lk) && /(?:^|[:._-])(site|creator)$/i.test(lk);
    if (/^@[A-Za-z0-9_]{1,30}$/.test(v) || (isHandleKey && /^@?[A-Za-z0-9_]{1,30}$/.test(v))) {
        const handle = v.replace(/^@/, "");
        return vtext([
            el("a", {
                class: "vt-handle",
                href: "https://x.com/" + handle,
                target: "_blank",
                rel: "noreferrer",
                text: "@" + handle,
            }),
        ]);
    }

    // Git commit SHAs -> link to the GitHub commit when a repo is resolvable.
    if (/^[0-9a-f]{7,40}$/i.test(v)) {
        const shaKey = /(commit|sha|revision|changeset|\bgit\b|\brev\b)/i.test(lk);
        const nwo = shaKey || v.length >= 20 ? githubRepoNwo() : null;
        if (shaKey || nwo) {
            const short = v.length > 12 ? v.slice(0, 10) : v;
            if (nwo) {
                return vtext([
                    el("a", {
                        class: "vt-commit",
                        href: `https://github.com/${nwo}/commit/${v}`,
                        target: "_blank",
                        rel: "noreferrer",
                        title: `${nwo}@${v}`,
                        text: short,
                    }),
                ]);
            }
            return vtext([el("code", { class: "vt-mono", title: v, text: short })]);
        }
    }

    // ISO date / time -> friendly, with the raw value preserved for copy/hover
    if (ISO_DT_RE.test(v)) {
        const d = new Date(v);
        if (!Number.isNaN(d.getTime())) {
            const nice = d.toLocaleString(undefined, {
                year: "numeric",
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
            });
            return vtext([el("time", { class: "vt-time", datetime: v, title: v, text: nice })]);
        }
    }

    // MIME types
    if (MIME_RE.test(v)) {
        return vtext([el("span", { class: "vt-token mono", text: v })]);
    }

    // Enumerated tokens on known structured keys
    if (/(?:^|[:._-])(type|card|determiner)$/i.test(lk) && /^[a-z][\w.-]{0,40}$/i.test(v)) {
        return vtext([el("span", { class: "vt-token accent", text: v })]);
    }
    if (/(?:^|[:._-])locale(?::alternate)?$/i.test(lk) && LOCALE_RE.test(v)) {
        return vtext([el("span", { class: "vt-token mono", text: v })]);
    }
    if (/(?:^|[:._-])(charset|encoding|robots|googlebot|referrer|rating)$/i.test(lk)) {
        return vtext([el("span", { class: "vt-token", text: v })]);
    }

    // Default
    return vtext([raw]);
}

function valueCell(key, value) {
    const td = el("td", { class: "v" });
    const content = formatValue(key, value);
    const row = el("div", { class: "v-row" }, [content, copyButton(value, "Copy value")]);
    if (looksLikeImage(key, value) && /^(https?:)?\/\//i.test(value)) {
        row.classList.add("has-img");
        bindImageHover(content, value);
    } else if (looksLikeCode(value)) {
        row.classList.add("has-code");
        bindCodeHover(content, value);
    }
    td.appendChild(row);
    return td;
}

/** Heuristic: does this key/value name an image asset we can preview? */
function looksLikeImage(key, value) {
    if (/(image|icon|favicon|logo|thumbnail|banner|photo|avatar|apple-touch)/i.test(key || "")) {
        return true;
    }
    return /\.(png|jpe?g|gif|webp|svg|avif|bmp|ico|tiff?)(\?|#|$)/i.test(value || "");
}

function kvTable(rows) {
    const table = el("table", { class: "kv" });
    for (const { key, value } of rows) {
        table.appendChild(
            el("tr", null, [
                el("td", { class: "k", text: key }),
                valueCell(key, value),
            ]),
        );
    }
    return table;
}

function rawChevron() {
    return el("span", {
        class: "raw-chevron",
        html: '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M6 4l4 4-4 4V4z"/></svg>',
    });
}

function rawGroup(title, rows) {
    if (!rows || rows.length === 0) return null;
    const details = el("details", { class: "raw-group", open: "" });
    details.appendChild(
        el("summary", null, [
            rawChevron(),
            el("span", { class: "raw-title", text: title }),
            el("span", { class: "count", text: String(rows.length) }),
        ]),
    );
    details.appendChild(kvTable(rows));
    return details;
}

function renderRaw(data) {
    const host = $("#raw");
    const iconRows = (data.icons || []).map((i) => ({
        key: i.rel + (i.sizes ? ` ${i.sizes}` : ""),
        value: i.href,
    }));
    host.replaceChildren(
        rawGroup("OpenGraph", data.groups.openGraph),
        rawGroup("Twitter / X", data.groups.twitter),
        rawGroup("Other meta", data.groups.other),
        rawGroup("Icons & links", iconRows),
    );
    if (!host.childElementCount) {
        host.appendChild(el("p", { class: "muted", text: "No metadata tags found." }));
    }
    $("#raw-summary").textContent = `${data.tagCount} meta tag${data.tagCount === 1 ? "" : "s"} · ${data.requestedUrl}`;
}

/* ---------------- Diagnostics ---------------- */

function diagnosticCounts(diagnostics) {
    const counts = { ok: 0, warn: 0, req: 0 };
    for (const c of diagnostics || []) {
        if (c.ok) counts.ok += 1;
        else if (c.level === "required") counts.req += 1;
        else counts.warn += 1;
    }
    return counts;
}

function renderDiagnostics(data) {
    const host = $("#diagnostics");
    host.replaceChildren(
        ...data.diagnostics.map((c) => {
            let cls = "ok";
            let glyph = "\u2713";
            if (!c.ok) {
                if (c.level === "required") {
                    cls = "req";
                    glyph = "\u2715";
                } else {
                    cls = "warn";
                    glyph = "!";
                }
            }
            return el("div", { class: "diag-item" }, [
                el("div", { class: `diag-mark ${cls}`, text: glyph }),
                el("div", null, [
                    el("span", { class: "diag-id", text: c.id }),
                    el("span", { class: "diag-level", text: c.level }),
                    el("div", { class: "muted", text: c.note || "" }),
                ]),
            ]);
        }),
    );
}

/* ---------------- Footer (page info) ---------------- */

function statusPill(httpStatus) {
    const cls = !httpStatus ? "warn" : httpStatus < 300 ? "ok" : httpStatus < 400 ? "warn" : "req";
    return el("span", { class: `pill ${cls}`, text: httpStatus ? String(httpStatus) : "—" });
}

function renderFooter(data) {
    const counts = diagnosticCounts(data.diagnostics);
    const summary = $("#footer-summary");
    summary.textContent = `${data.requestedUrl}  ·  HTTP ${data.httpStatus || "?"}  ·  ${
        data.tagCount
    } tags`;

    // Compact stat strip: HTTP status, tag count, and diagnostics roll-up.
    const stats = el("div", { class: "footer-stats" }, [
        statusPill(data.httpStatus),
        el("span", { class: "stat-chip" }, [
            el("span", { class: "stat-num", text: String(data.tagCount) }),
            el("span", { class: "stat-lbl", text: data.tagCount === 1 ? "tag" : "tags" }),
        ]),
        el("span", { class: "stat-sep" }),
        el("span", { class: "pill ok", text: `${counts.ok} ok` }),
        counts.warn ? el("span", { class: "pill warn", text: `${counts.warn} warn` }) : null,
        counts.req ? el("span", { class: "pill req", text: `${counts.req} missing` }) : null,
    ]);

    const rows = [stats];

    rows.push(
        el("div", { class: "footer-line" }, [
            el("span", { class: "footer-line-label", text: "URL" }),
            el("a", {
                class: "footer-line-val",
                href: data.requestedUrl,
                target: "_blank",
                rel: "noreferrer",
                text: data.requestedUrl,
            }),
            copyButton(data.requestedUrl, "Copy URL"),
        ]),
    );

    // Only surface a canonical line when it actually differs from the request.
    const canon = data.resolved && data.resolved.url;
    if (canon && canon !== data.requestedUrl) {
        rows.push(
            el("div", { class: "footer-line" }, [
                el("span", { class: "footer-line-label", text: "Canonical" }),
                el("a", {
                    class: "footer-line-val",
                    href: canon,
                    target: "_blank",
                    rel: "noreferrer",
                    text: canon,
                }),
                copyButton(canon, "Copy canonical URL"),
            ]),
        );
    }

    $("#footer-body").replaceChildren(...rows);
}

function setFooterOpen(open) {
    const footer = $("#footer");
    const toggle = $("#footer-toggle");
    const body = $("#footer-body");
    footer.dataset.collapsed = open ? "false" : "true";
    toggle.setAttribute("aria-expanded", open ? "true" : "false");
    body.hidden = !open;
    try {
        localStorage.setItem(FOOTER_KEY, open ? "1" : "0");
    } catch {
        /* storage unavailable */
    }
}

/* ---------------- Status + load ---------------- */

function setStatus(kind, message) {
    if (!kind) {
        statusEl.hidden = true;
        return;
    }
    statusEl.hidden = false;
    statusEl.className = `status ${kind}`;
    statusEl.textContent = message;
}

async function load(rawUrl) {
    const url = withScheme(rawUrl);
    if (!url) return;
    hideImgTip();
    hideCodeCard();
    input.value = url;
    document.body.classList.add("has-data", "is-busy");
    setStatus("loading", `Fetching ${url} …`);
    $("#footer-summary").textContent = `Loading ${url} …`;
    // Show realistic shaped skeletons immediately so the layout is stable.
    renderSkeleton();
    try {
        const res = await fetch("/api/fetch?u=" + encodeURIComponent(url));
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || `Request failed (${res.status})`);
        }
        lastData = data;
        if (data.resolved.url || data.requestedUrl) {
            input.value = data.requestedUrl || url;
        }
        document.title = data.requestedUrl
            ? `OG · ${(data.resolved && data.resolved.hostname) || data.requestedUrl}`
            : "OpenGraph Preview";
        // Cross-fade skeletons -> content with a View Transition.
        withTransition(() => {
            renderPreviews(data);
            renderRaw(data);
            renderDiagnostics(data);
            renderFooter(data);
        });
        setStatus(null);
    } catch (err) {
        setStatus("error", `Couldn't load metadata: ${err.message}`);
        $("#footer-summary").textContent = `Failed to load ${url}`;
    } finally {
        document.body.classList.remove("is-busy");
    }
}

/* ---------------- Wiring ---------------- */

$("#url-form").addEventListener("submit", (e) => {
    e.preventDefault();
    load(input.value);
});
$("#refresh").addEventListener("click", () => load(input.value));

// Keep a scheme prefilled so the user never has to type it.
input.addEventListener("focus", () => {
    if (!input.value.trim()) input.value = "https://";
});
input.addEventListener("blur", () => {
    if (input.value.trim() === "https://" || input.value.trim() === "http://") input.value = "https://";
});

document.querySelectorAll("[data-example]").forEach((btn) => {
    btn.addEventListener("click", () => {
        const url = btn.getAttribute("data-example");
        input.value = url;
        load(url);
    });
});

document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        if (tab.classList.contains("active")) return;
        withTransition(() => {
            document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
            document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
            tab.classList.add("active");
            $("#panel-" + tab.dataset.tab).classList.add("active");
        });
    });
});

$("#footer-toggle").addEventListener("click", () => {
    setFooterOpen($("#footer").dataset.collapsed === "true");
});

// Dismiss floating hover surfaces (image tip + code card) when context shifts.
function dismissHovers() {
    hideImgTip();
    hideCodeCard();
}
$(".content").addEventListener("scroll", dismissHovers, { passive: true });
window.addEventListener("blur", dismissHovers);
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") dismissHovers();
});

$("#copy-json").addEventListener("click", async () => {
    if (!lastData) return;
    const payload = JSON.stringify(
        {
            requestedUrl: lastData.requestedUrl,
            resolved: lastData.resolved,
            raw: lastData.raw,
            diagnostics: lastData.diagnostics,
        },
        null,
        2,
    );
    const btn = $("#copy-json");
    const ok = await copyText(payload);
    if (ok) {
        const old = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = old), 1200);
    } else {
        setStatus("error", "Clipboard blocked — JSON is also returned by the get_metadata action.");
    }
});

// Restore footer open/closed preference.
try {
    if (localStorage.getItem(FOOTER_KEY) === "1") setFooterOpen(true);
} catch {
    /* storage unavailable */
}

// Server-pushed loads (agent invoking the preview_url action).
try {
    const es = new EventSource("/events");
    es.addEventListener("message", (e) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg && msg.type === "load" && msg.url) {
                input.value = msg.url;
                load(msg.url);
            }
        } catch {
            /* ignore */
        }
    });
} catch {
    /* SSE unavailable */
}

// Auto-load from ?u= on first render.
const initial = new URLSearchParams(location.search).get("u");
if (initial) {
    input.value = initial;
    load(initial);
}

/* ---------------- Theme awareness for preview cards ----------------
   The brand cards mimic each platform, but should still read like that
   platform's DARK UI when the app is in dark mode (instead of glaring white).
   We can't trust data-color-mode (it may be "auto"), so derive the effective
   mode from the actual computed background luminance and expose it as
   body[data-mode]; CSS supplies brand dark variants under that selector. */
function channelLuminance(rgb) {
    const m = String(rgb).match(/[\d.]+/g);
    if (!m || m.length < 3) return 1;
    const [r, g, b] = m.slice(0, 3).map(Number);
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

function applyPreviewMode() {
    try {
        const bg = getComputedStyle(document.body).backgroundColor;
        document.body.dataset.mode = channelLuminance(bg) < 0.5 ? "dark" : "light";
    } catch {
        /* getComputedStyle unavailable */
    }
}

applyPreviewMode();
try {
    const themeObserver = new MutationObserver(applyPreviewMode);
    const opts = {
        attributes: true,
        attributeFilter: [
            "data-color-mode",
            "data-visual-mode",
            "data-dark-theme",
            "data-light-theme",
            "class",
            "style",
        ],
    };
    themeObserver.observe(document.documentElement, opts);
    themeObserver.observe(document.body, opts);
} catch {
    /* MutationObserver unavailable */
}
