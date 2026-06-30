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

function valueCell(value) {
    const td = el("td", { class: "v" });
    const text = el("span", { class: "v-text" });
    if (/^https?:\/\//i.test(value)) {
        text.appendChild(el("a", { href: value, target: "_blank", rel: "noreferrer", text: value }));
    } else {
        text.textContent = value;
    }
    td.appendChild(el("div", { class: "v-row" }, [text, copyButton(value, "Copy value")]));
    return td;
}

function kvTable(rows) {
    const table = el("table", { class: "kv" });
    for (const { key, value } of rows) {
        table.appendChild(
            el("tr", null, [el("td", { class: "k", text: key }), valueCell(value)]),
        );
    }
    return table;
}

function rawGroup(title, rows) {
    if (!rows || rows.length === 0) return null;
    return el("div", { class: "raw-group" }, [
        el("h3", null, [title, el("span", { class: "count muted", text: `(${rows.length})` })]),
        kvTable(rows),
    ]);
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

function fact(label, valueNode) {
    return el("div", { class: "fact" }, [
        el("div", { class: "fact-label", text: label }),
        el("div", { class: "fact-value" }, [valueNode]),
    ]);
}

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

    const urlNode = el("a", {
        href: data.requestedUrl,
        target: "_blank",
        rel: "noreferrer",
        text: data.requestedUrl,
    });

    const diagNode = el("span", null, [
        el("span", { class: "pill ok", text: `${counts.ok} ok` }),
        " ",
        counts.warn ? el("span", { class: "pill warn", text: `${counts.warn} warn` }) : null,
        counts.warn ? " " : null,
        counts.req ? el("span", { class: "pill req", text: `${counts.req} missing` }) : null,
    ]);

    const body = $("#footer-body");
    body.replaceChildren(
        fact("Final URL", el("span", { class: "v-row" }, [urlNode, copyButton(data.requestedUrl, "Copy URL")])),
        fact("HTTP status", statusPill(data.httpStatus)),
        fact("Meta tags", el("span", { text: String(data.tagCount) })),
        fact("Diagnostics", diagNode),
    );
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
