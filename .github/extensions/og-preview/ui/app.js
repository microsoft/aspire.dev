"use strict";

const TRANSPARENT =
    "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

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
}

/* ---------------- Raw ---------------- */

function valueCell(value) {
    const td = el("td", { class: "v" });
    if (/^https?:\/\//i.test(value)) {
        td.appendChild(el("a", { href: value, target: "_blank", rel: "noreferrer", text: value }));
    } else {
        td.textContent = value;
    }
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
    const url = (rawUrl || "").trim();
    if (!url) return;
    document.body.classList.add("has-data", "is-busy");
    setStatus("loading", `Fetching ${url} …`);
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
        renderPreviews(data);
        renderRaw(data);
        renderDiagnostics(data);
        setStatus(null);
    } catch (err) {
        setStatus("error", `Couldn't load metadata: ${err.message}`);
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

document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
        document.querySelectorAll(".tab").forEach((t) => t.classList.remove("active"));
        document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
        tab.classList.add("active");
        $("#panel-" + tab.dataset.tab).classList.add("active");
    });
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
    try {
        await navigator.clipboard.writeText(payload);
        const btn = $("#copy-json");
        const old = btn.textContent;
        btn.textContent = "Copied!";
        setTimeout(() => (btn.textContent = old), 1200);
    } catch {
        setStatus("error", "Clipboard blocked — JSON is also returned by the get_metadata action.");
    }
});

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
