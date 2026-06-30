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

/* ---------------- Iconography (Octicons, MIT-licensed) ---------------- */

const OCTICONS = {
    image:
        '<path fill="currentColor" d="M16 13.25A1.75 1.75 0 0 1 14.25 15H1.75A1.75 1.75 0 0 1 0 13.25V2.75C0 1.784.784 1 1.75 1h12.5c.966 0 1.75.784 1.75 1.75ZM1.75 2.5a.25.25 0 0 0-.25.25v10.5c0 .138.112.25.25.25h.94l.03-.03 6.077-6.078a1.75 1.75 0 0 1 2.412-.06L14.5 10.31V2.75a.25.25 0 0 0-.25-.25Zm12.5 11a.25.25 0 0 0 .25-.25v-.917l-4.298-3.889a.25.25 0 0 0-.344.009L4.81 13.5ZM7 5.5a1.5 1.5 0 1 1-3 0 1.5 1.5 0 0 1 3 0Z"/>',
    code:
        '<path fill="currentColor" d="m11.28 3.22 4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.749.749 0 0 1-1.275-.326.749.749 0 0 1 .215-.734L13.94 8l-3.72-3.72a.749.749 0 0 1 .326-1.275.749.749 0 0 1 .734.215Zm-6.56 0a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L2.06 8l3.72 3.72a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L.47 8.53a.75.75 0 0 1 0-1.06Z"/>',
    checklist:
        '<path fill="currentColor" d="M2.5 1.75v11.5c0 .138.112.25.25.25h3.17a.75.75 0 0 1 0 1.5H2.75A1.75 1.75 0 0 1 1 13.25V1.75C1 .784 1.784 0 2.75 0h8.5C12.216 0 13 .784 13 1.75v7.736a.75.75 0 0 1-1.5 0V1.75a.25.25 0 0 0-.25-.25h-8.5a.25.25 0 0 0-.25.25Zm13.274 9.537-4.557 4.45a.75.75 0 0 1-1.055-.008l-1.943-1.95a.75.75 0 0 1 1.062-1.058l1.419 1.425 4.026-3.932a.75.75 0 1 1 1.048 1.073ZM4.75 4h4.5a.75.75 0 0 1 0 1.5h-4.5a.75.75 0 0 1 0-1.5ZM4 7.75A.75.75 0 0 1 4.75 7h2a.75.75 0 0 1 0 1.5h-2A.75.75 0 0 1 4 7.75Z"/>',
    globe:
        '<path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM5.78 8.75a9.64 9.64 0 0 0 1.363 4.177c.255.426.542.832.857 1.215.245-.296.551-.705.857-1.215A9.64 9.64 0 0 0 10.22 8.75Zm4.44-1.5a9.64 9.64 0 0 0-1.363-4.177c-.307-.51-.612-.919-.857-1.215a9.927 9.927 0 0 0-.857 1.215A9.64 9.64 0 0 0 5.78 7.25Zm-5.944 1.5H1.543a6.507 6.507 0 0 0 4.666 5.5c-.123-.181-.24-.365-.352-.552-.715-1.192-1.437-2.874-1.581-4.948Zm-2.733-1.5h2.733c.144-2.074.866-3.756 1.58-4.948.12-.197.237-.381.353-.552a6.507 6.507 0 0 0-4.666 5.5Zm10.181 1.5c-.144 2.074-.866 3.756-1.58 4.948-.12.197-.237.381-.353.552a6.507 6.507 0 0 0 4.666-5.5Zm2.733-1.5a6.507 6.507 0 0 0-4.666-5.5c.123.181.24.365.353.552.714 1.192 1.436 2.874 1.58 4.948Z"/>',
    mention:
        '<path fill="currentColor" d="M8 .25a8 8 0 1 0 4.034 14.907.75.75 0 0 0-.756-1.295A6.5 6.5 0 1 1 14.5 8v.5a1.25 1.25 0 0 1-2.5 0V4.75a.75.75 0 0 0-1.5 0v.06A4 4 0 1 0 11 11.197 2.75 2.75 0 0 0 16 8.5V8A8 8 0 0 0 8 .25Zm0 5.25a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5Z"/>',
    tag:
        '<path fill="currentColor" d="M1 7.775V2.75C1 1.784 1.784 1 2.75 1h5.025c.464 0 .91.184 1.238.513l6.25 6.25a1.75 1.75 0 0 1 0 2.474l-5.026 5.026a1.75 1.75 0 0 1-2.474 0l-6.25-6.25A1.752 1.752 0 0 1 1 7.775Zm1.5 0c0 .066.026.13.073.177l6.25 6.25a.25.25 0 0 0 .354 0l5.025-5.025a.25.25 0 0 0 0-.354l-6.25-6.25a.25.25 0 0 0-.177-.073H2.75a.25.25 0 0 0-.25.25ZM6 5a1 1 0 1 1 0 2 1 1 0 0 1 0-2Z"/>',
    link:
        '<path fill="currentColor" d="m7.775 3.275 1.25-1.25a3.5 3.5 0 1 1 4.95 4.95l-2.5 2.5a3.5 3.5 0 0 1-4.95 0 .751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018 2 2 0 0 0 2.83 0l2.5-2.5a2.002 2.002 0 0 0-2.83-2.83l-1.25 1.25a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042Zm-4.69 9.64a2 2 0 0 0 2.83 0l1.25-1.25a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042l-1.25 1.25a3.5 3.5 0 1 1-4.95-4.95l2.5-2.5a3.5 3.5 0 0 1 4.95 0 .751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018 2 2 0 0 0-2.83 0l-2.5 2.5a2 2 0 0 0 0 2.83Z"/>',
    "link-external":
        '<path fill="currentColor" d="M3.75 2A1.75 1.75 0 0 0 2 3.75v8.5C2 13.22 2.78 14 3.75 14h8.5A1.75 1.75 0 0 0 14 12.25v-3a.75.75 0 0 0-1.5 0v3a.25.25 0 0 1-.25.25h-8.5a.25.25 0 0 1-.25-.25v-8.5a.25.25 0 0 1 .25-.25h3a.75.75 0 0 0 0-1.5h-3Z"/><path fill="currentColor" d="M8.5 1.75A.75.75 0 0 1 9.25 1h5a.75.75 0 0 1 .75.75v5a.75.75 0 0 1-1.5 0V3.56L8.78 8.28a.75.75 0 1 1-1.06-1.06l4.72-4.72H9.25a.75.75 0 0 1-.75-.75Z"/>',
    "list-unordered":
        '<path fill="currentColor" d="M5.75 2.5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5Zm0 5h8.5a.75.75 0 0 1 0 1.5h-8.5a.75.75 0 0 1 0-1.5ZM2 14a1 1 0 1 1 0-2 1 1 0 0 1 0 2Zm1-6a1 1 0 1 1-2 0 1 1 0 0 1 2 0ZM2 4a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>',
    grid:
        '<rect x="1.75" y="1.75" width="5.25" height="5.25" rx="1.4" fill="currentColor"/><rect x="9" y="1.75" width="5.25" height="5.25" rx="1.4" fill="currentColor"/><rect x="1.75" y="9" width="5.25" height="5.25" rx="1.4" fill="currentColor"/><rect x="9" y="9" width="5.25" height="5.25" rx="1.4" fill="currentColor"/>',
};

function octicon(name, size, cls) {
    const span = el("span", { class: "octicon" + (cls ? " " + cls : ""), "aria-hidden": "true" });
    span.innerHTML = `<svg width="${size || 16}" height="${size || 16}" viewBox="0 0 16 16">${
        OCTICONS[name] || ""
    }</svg>`;
    return span;
}

// Platform brand marks (simple-icons, CC0). 24×24 viewBox, single path.
const BRAND_ICONS = {
    facebook:
        "M9.101 23.691v-7.98H6.627v-3.667h2.474v-1.58c0-4.085 1.848-5.978 5.858-5.978.401 0 .955.042 1.468.103a8.68 8.68 0 0 1 1.141.195v3.325a8.623 8.623 0 0 0-.653-.036 26.805 26.805 0 0 0-.733-.009c-.707 0-1.259.096-1.675.309a1.686 1.686 0 0 0-.679.622c-.258.42-.374.995-.374 1.752v1.297h3.919l-.386 2.103-.287 1.564h-3.246v8.245C19.396 23.238 24 18.179 24 12.044c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.628 3.874 10.35 9.101 11.647Z",
    x:
        "M14.234 10.162 22.977 0h-2.072l-7.591 8.824L7.251 0H.258l9.168 13.343L.258 24H2.33l8.016-9.318L16.749 24h6.993zm-2.837 3.299-.929-1.329L3.076 1.56h3.182l5.965 8.532.929 1.329 7.754 11.09h-3.182z",
    linkedin:
        "M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z",
    slack:
        "M5.042 15.165a2.528 2.528 0 0 1-2.52 2.523A2.528 2.528 0 0 1 0 15.165a2.527 2.527 0 0 1 2.522-2.52h2.52v2.52zM6.313 15.165a2.527 2.527 0 0 1 2.521-2.52 2.527 2.527 0 0 1 2.521 2.52v6.313A2.528 2.528 0 0 1 8.834 24a2.528 2.528 0 0 1-2.521-2.522v-6.313zM8.834 5.042a2.528 2.528 0 0 1-2.521-2.52A2.528 2.528 0 0 1 8.834 0a2.528 2.528 0 0 1 2.521 2.522v2.52H8.834zM8.834 6.313a2.528 2.528 0 0 1 2.521 2.521 2.528 2.528 0 0 1-2.521 2.521H2.522A2.528 2.528 0 0 1 0 8.834a2.528 2.528 0 0 1 2.522-2.521h6.312zM18.956 8.834a2.528 2.528 0 0 1 2.522-2.521A2.528 2.528 0 0 1 24 8.834a2.528 2.528 0 0 1-2.522 2.521h-2.522V8.834zM17.688 8.834a2.528 2.528 0 0 1-2.523 2.521 2.527 2.527 0 0 1-2.52-2.521V2.522A2.527 2.527 0 0 1 15.165 0a2.528 2.528 0 0 1 2.523 2.522v6.312zM15.165 18.956a2.528 2.528 0 0 1 2.523 2.522A2.528 2.528 0 0 1 15.165 24a2.527 2.527 0 0 1-2.52-2.522v-2.522h2.52zM15.165 17.688a2.527 2.527 0 0 1-2.52-2.523 2.526 2.526 0 0 1 2.52-2.52h6.313A2.527 2.527 0 0 1 24 15.165a2.528 2.528 0 0 1-2.522 2.523h-6.313z",
    discord:
        "M20.317 4.3698a19.7913 19.7913 0 00-4.8851-1.5152.0741.0741 0 00-.0785.0371c-.211.3753-.4447.8648-.6083 1.2495-1.8447-.2762-3.68-.2762-5.4868 0-.1636-.3933-.4058-.8742-.6177-1.2495a.077.077 0 00-.0785-.037 19.7363 19.7363 0 00-4.8852 1.515.0699.0699 0 00-.0321.0277C.5334 9.0458-.319 13.5799.0992 18.0578a.0824.0824 0 00.0312.0561c2.0528 1.5076 4.0413 2.4228 5.9929 3.0294a.0777.0777 0 00.0842-.0276c.4616-.6304.8731-1.2952 1.226-1.9942a.076.076 0 00-.0416-.1057c-.6528-.2476-1.2743-.5495-1.8722-.8923a.077.077 0 01-.0076-.1277c.1258-.0943.2517-.1923.3718-.2914a.0743.0743 0 01.0776-.0105c3.9278 1.7933 8.18 1.7933 12.0614 0a.0739.0739 0 01.0785.0095c.1202.099.246.1981.3728.2924a.077.077 0 01-.0066.1276 12.2986 12.2986 0 01-1.873.8914.0766.0766 0 00-.0407.1067c.3604.698.7719 1.3628 1.225 1.9932a.076.076 0 00.0842.0286c1.961-.6067 3.9495-1.5219 6.0023-3.0294a.077.077 0 00.0313-.0552c.5004-5.177-.8382-9.6739-3.5485-13.6604a.061.061 0 00-.0312-.0286zM8.02 15.3312c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9555-2.4189 2.157-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.9555 2.4189-2.1569 2.4189zm7.9748 0c-1.1825 0-2.1569-1.0857-2.1569-2.419 0-1.3332.9554-2.4189 2.1569-2.4189 1.2108 0 2.1757 1.0952 2.1568 2.419 0 1.3332-.946 2.4189-2.1568 2.4189Z",
    bluesky:
        "M5.202 2.857C7.954 4.922 10.913 9.11 12 11.358c1.087-2.247 4.046-6.436 6.798-8.501C20.783 1.366 24 .213 24 3.883c0 .732-.42 6.156-.667 7.037-.856 3.061-3.978 3.842-6.755 3.37 4.854.826 6.089 3.562 3.422 6.299-5.065 5.196-7.28-1.304-7.847-2.97-.104-.305-.152-.448-.153-.327 0-.121-.05.022-.153.327-.568 1.666-2.782 8.166-7.847 2.97-2.667-2.737-1.432-5.473 3.422-6.3-2.777.473-5.899-.308-6.755-3.369C.42 10.04 0 4.615 0 3.883c0-3.67 3.217-2.517 5.202-1.026",
    teams:
        "M20.625 8.127q-.55 0-1.025-.205-.475-.205-.832-.563-.358-.357-.563-.832Q18 6.053 18 5.502q0-.54.205-1.02t.563-.837q.357-.358.832-.563.474-.205 1.025-.205.54 0 1.02.205t.837.563q.358.357.563.837.205.48.205 1.02 0 .55-.205 1.025-.205.475-.563.832-.357.358-.837.563-.48.205-1.02.205zm0-3.75q-.469 0-.797.328-.328.328-.328.797 0 .469.328.797.328.328.797.328.469 0 .797-.328.328-.328.328-.797 0-.469-.328-.797-.328-.328-.797-.328zM24 10.002v5.578q0 .774-.293 1.46-.293.685-.803 1.194-.51.51-1.195.803-.686.293-1.459.293-.445 0-.908-.105-.463-.106-.85-.329-.293.95-.855 1.729-.563.78-1.319 1.336-.756.557-1.67.861-.914.305-1.898.305-1.148 0-2.162-.398-1.014-.399-1.805-1.102-.79-.703-1.312-1.664t-.674-2.086h-5.8q-.411 0-.704-.293T0 16.881V6.873q0-.41.293-.703t.703-.293h8.59q-.34-.715-.34-1.5 0-.727.275-1.365.276-.639.75-1.114.475-.474 1.114-.75.638-.275 1.365-.275t1.365.275q.639.276 1.114.75.474.475.75 1.114.275.638.275 1.365t-.275 1.365q-.276.639-.75 1.113-.475.475-1.114.75-.638.276-1.365.276-.188 0-.375-.024-.188-.023-.375-.058v1.078h10.875q.469 0 .797.328.328.328.328.797zM12.75 2.373q-.41 0-.78.158-.368.158-.638.434-.27.275-.428.639-.158.363-.158.773 0 .41.158.78.159.368.428.638.27.27.639.428.369.158.779.158.41 0 .773-.158.364-.159.64-.428.274-.27.433-.639.158-.369.158-.779 0-.41-.158-.773-.159-.364-.434-.64-.275-.275-.639-.433-.363-.158-.773-.158zM6.937 9.814h2.25V7.94H2.814v1.875h2.25v6h1.875zm10.313 7.313v-6.75H12v6.504q0 .41-.293.703t-.703.293H8.309q.152.809.556 1.5.405.691.985 1.19.58.497 1.318.779.738.281 1.582.281.926 0 1.746-.352.82-.351 1.436-.966.615-.616.966-1.43.352-.815.352-1.752zm5.25-1.547v-5.203h-3.75v6.855q.305.305.691.452.387.146.809.146.469 0 .879-.176.41-.175.715-.48.304-.305.48-.715t.176-.879Z",
    reddit:
        "M12 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0zm5.01 4.744c.688 0 1.25.561 1.25 1.249a1.25 1.25 0 0 1-2.498.056l-2.597-.547-.8 3.747c1.824.07 3.48.632 4.674 1.488.308-.309.73-.491 1.207-.491.968 0 1.754.786 1.754 1.754 0 .716-.435 1.333-1.01 1.614a3.111 3.111 0 0 1 .042.52c0 2.694-3.13 4.87-7.004 4.87-3.874 0-7.004-2.176-7.004-4.87 0-.183.015-.366.043-.534A1.748 1.748 0 0 1 4.028 12c0-.968.786-1.754 1.754-1.754.463 0 .898.196 1.207.49 1.207-.883 2.878-1.43 4.744-1.487l.885-4.182a.342.342 0 0 1 .14-.197.35.35 0 0 1 .238-.042l2.906.617a1.214 1.214 0 0 1 1.108-.701zM9.25 12C8.561 12 8 12.562 8 13.25c0 .687.561 1.248 1.25 1.248.687 0 1.248-.561 1.248-1.249 0-.688-.561-1.249-1.249-1.249zm5.5 0c-.687 0-1.248.561-1.248 1.25 0 .687.561 1.248 1.249 1.248.688 0 1.249-.561 1.249-1.249 0-.687-.562-1.249-1.25-1.249zm-5.466 3.99a.327.327 0 0 0-.231.094.33.33 0 0 0 0 .463c.842.842 2.484.913 2.961.913.477 0 2.105-.056 2.961-.913a.361.361 0 0 0 .029-.463.33.33 0 0 0-.464 0c-.547.533-1.684.73-2.512.73-.828 0-1.979-.196-2.512-.73a.326.326 0 0 0-.232-.095z",
    mastodon:
        "M23.268 5.313c-.35-2.578-2.617-4.61-5.304-5.004C17.51.242 15.792 0 11.813 0h-.03c-3.98 0-4.835.242-5.288.309C3.882.692 1.496 2.518.917 5.127.64 6.412.61 7.837.661 9.143c.073 1.874.087 3.745.257 5.61.118 1.24.323 2.47.616 3.68.55 2.237 2.777 4.098 4.96 4.857 2.336.792 4.849.923 7.256.38.265-.061.527-.132.786-.213.585-.184 1.27-.39 1.774-.753a.057.057 0 0 0 .023-.043v-1.809a.052.052 0 0 0-.02-.041.053.053 0 0 0-.046-.01 20.282 20.282 0 0 1-4.709.545c-2.73 0-3.463-1.284-3.674-1.818a5.593 5.593 0 0 1-.319-1.433.053.053 0 0 1 .066-.054c1.517.363 3.072.546 4.632.546.376 0 .75 0 1.125-.01 1.57-.044 3.224-.124 4.768-.422.038-.008.077-.015.11-.024 2.435-.464 4.753-1.92 4.989-5.604.008-.145.03-1.52.03-1.67.002-.512.167-3.63-.024-5.545zm-3.748 9.195h-2.561V8.29c0-1.309-.55-1.976-1.67-1.976-1.23 0-1.846.79-1.846 2.35v3.403h-2.546V8.663c0-1.56-.617-2.35-1.848-2.35-1.112 0-1.668.668-1.67 1.977v6.218H4.822V8.102c0-1.31.337-2.35 1.011-3.12.696-.77 1.608-1.164 2.74-1.164 1.311 0 2.302.5 2.962 1.498l.638 1.06.638-1.06c.66-.999 1.65-1.498 2.96-1.498 1.13 0 2.043.395 2.74 1.164.675.77 1.012 1.81 1.012 3.12z",
};

function brandIcon(name) {
    const span = el("span", { class: `brand-ico brand-${name}`, "aria-hidden": "true" });
    span.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24"><path fill="currentColor" d="${
        BRAND_ICONS[name] || ""
    }"/></svg>`;
    return span;
}

function previewChevron() {
    return el("span", {
        class: "preview-chevron",
        "aria-hidden": "true",
        html: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });
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

function labeledCard(brand, name, card) {
    const details = el("details", { class: "preview", open: "" });
    details.appendChild(
        el("summary", { class: "preview-label" }, [
            brandIcon(brand),
            el("span", { class: "preview-name", text: name }),
            previewChevron(),
        ]),
    );
    details.appendChild(el("div", { class: "preview-body" }, [card]));
    return details;
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
    // Without an image X always falls back to the small (square-thumb) summary card.
    if (isSmall || !d.image) {
        return el("div", { class: "x small" }, [
            makeImage(d.image, "card-img"),
            el("div", { class: "meta" }, [
                el("div", { class: "title", text: d.title || "(no title)" }),
                d.description ? el("div", { class: "desc", text: d.description }) : null,
                el("div", { class: "domain", text: domain }),
            ]),
        ]);
    }
    // summary_large_image: X renders just the image with the domain overlaid at
    // the bottom-left — it strips the headline and description text entirely.
    return el("div", { class: "x large" }, [
        el("div", { class: "x-media" }, [
            makeImage(d.image, "card-img"),
            el("span", { class: "domain-pill", text: domain }),
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

function blueskyCard(d, domain) {
    return el("div", { class: "bsky" }, [
        makeImage(d.image, "card-img"),
        el("div", { class: "meta" }, [
            el("div", { class: "title", text: d.title || "(no title)" }),
            d.description ? el("div", { class: "desc", text: d.description }) : null,
            el("div", { class: "domain" }, [octicon("globe", 13, "bsky-globe"), domain]),
        ]),
    ]);
}

function teamsCard(d, domain) {
    return el("div", { class: "teams" }, [
        el("div", { class: "site" }, [d.favicon ? makeImage(d.favicon, "") : null, d.siteName || domain]),
        d.image ? makeImage(d.image, "card-img") : null,
        el("div", { class: "meta" }, [
            el("div", { class: "title", text: d.title || "(no title)" }),
            d.description ? el("div", { class: "desc", text: d.description }) : null,
        ]),
    ]);
}

// Reddit link post: a compact card with the title + domain on the left and a
// small square thumbnail of the og:image on the right (the classic feed look).
function redditCard(d, domain) {
    return el("div", { class: "reddit" }, [
        el("div", { class: "meta" }, [
            el("div", { class: "title", text: d.title || "(no title)" }),
            el("div", { class: "domain" }, [
                el("span", { text: domain }),
                octicon("link-external", 12, "rd-ext"),
            ]),
        ]),
        d.image ? el("div", { class: "reddit-thumb" }, [makeImage(d.image, "card-img")]) : null,
    ]);
}

// Mastodon status card: a vertical card (image on top, then provider/title/desc),
// mirroring Mastodon's .status-card rendering for a large preview image.
function mastodonCard(d, domain) {
    return el("div", { class: "mastodon" }, [
        d.image ? makeImage(d.image, "card-img") : null,
        el("div", { class: "meta" }, [
            el("div", { class: "provider", text: d.siteName || domain }),
            el("div", { class: "title", text: d.title || "(no title)" }),
            d.description ? el("div", { class: "desc", text: d.description }) : null,
        ]),
    ]);
}

function renderPreviews(data) {
    const d = data.resolved;
    const domain = prettyDomain(d.hostname);
    const grid = $("#previews");
    grid.replaceChildren(
        labeledCard("facebook", "OpenGraph · Facebook", facebookCard(d, domain)),
        labeledCard("x", "X · Twitter", twitterCard(d, domain)),
        labeledCard("bluesky", "Bluesky", blueskyCard(d, domain)),
        labeledCard("mastodon", "Mastodon", mastodonCard(d, domain)),
        labeledCard("linkedin", "LinkedIn", linkedinCard(d, domain)),
        labeledCard("reddit", "Reddit", redditCard(d, domain)),
        labeledCard("slack", "Slack", slackCard(d, domain)),
        labeledCard("teams", "Microsoft Teams", teamsCard(d, domain)),
        labeledCard("discord", "Discord", discordCard(d, domain)),
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
        html: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none" aria-hidden="true"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });
}

function rawGroup(title, rows, icon) {
    if (!rows || rows.length === 0) return null;
    const details = el("details", { class: "raw-group", open: "" });
    details.appendChild(
        el("summary", null, [
            rawChevron(),
            icon ? octicon(icon, 16, "raw-ico") : null,
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
        rawGroup("OpenGraph", data.groups.openGraph, "globe"),
        rawGroup("Twitter / X", data.groups.twitter, "mention"),
        rawGroup("Other meta", data.groups.other, "tag"),
        rawGroup("Icons & links", iconRows, "link"),
    );
    if (!host.childElementCount) {
        host.appendChild(el("p", { class: "muted", text: "No metadata tags found." }));
    }
    $("#raw-summary").textContent = `${data.tagCount} meta tag${data.tagCount === 1 ? "" : "s"} · ${data.requestedUrl}`;
}

/* ---------------- Diagnostics ---------------- */

// Two-tone semantic status icon: outer shape in the semantic color
// (via currentColor) + inner mark forced white so it reads in dark mode.
const DIAG_SHAPES = {
    circle: "M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0Z",
    check:
        "M11.78 5.97a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06 0L4.22 9.03a.75.75 0 1 1 1.06-1.06l1.72 1.72 3.72-3.72a.75.75 0 0 1 1.06 0Z",
    x:
        "M5.72 5.72a.75.75 0 0 1 1.06 0L8 6.94l1.22-1.22a.751.751 0 0 1 1.042.018.751.751 0 0 1 .018 1.042L9.06 8l1.22 1.22a.751.751 0 0 1-.018 1.042.751.751 0 0 1-1.042.018L8 9.06 6.78 10.28a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 5.72 6.78a.75.75 0 0 1 0-1.06Z",
    triangle:
        "M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Z",
    bang:
        "M9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Zm-.25-5.25a.75.75 0 0 0-1.5 0v2.5a.75.75 0 0 0 1.5 0Z",
};

function diagIcon(kind) {
    const span = el("span", { class: `diag-ico ${kind}`, "aria-hidden": "true" });
    const outer = kind === "warn" ? DIAG_SHAPES.triangle : DIAG_SHAPES.circle;
    const inner = kind === "warn" ? DIAG_SHAPES.bang : kind === "req" ? DIAG_SHAPES.x : DIAG_SHAPES.check;
    span.innerHTML =
        `<svg width="16" height="16" viewBox="0 0 16 16">` +
        `<path fill="currentColor" d="${outer}"/>` +
        `<path fill="var(--color-white,#fff)" d="${inner}"/></svg>`;
    return span;
}

function diagChevron() {
    return el("span", {
        class: "diag-chevron",
        "aria-hidden": "true",
        html: '<svg width="12" height="12" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });
}

const OGP = "https://ogp.me/";
const XCARDS = "https://developer.x.com/en/docs/twitter-for-websites/cards";

// Client-side guidance keyed by diagnostic id. Kept here (not in the wire
// payload) so parse-og.mjs stays a pure parser.
const DIAG_HELP = {
    "og:title": {
        why: "Platforms use og:title as the bold headline of the link card. Without it they fall back to the page <title> or show nothing.",
        fix: "Add an og:title in the document <head> with a concise, descriptive headline (~40–60 characters).",
        example: '<meta property="og:title" content="Your headline" />',
        docs: { href: OGP + "#metadata", label: "Open Graph protocol" },
    },
    "og:type": {
        why: "og:type tells platforms what kind of object the page is (website, article, video…), which controls how the card is rendered.",
        fix: 'Add og:type — most pages should use "website"; use "article" for posts and news.',
        example: '<meta property="og:type" content="website" />',
        docs: { href: OGP + "#types", label: "Open Graph object types" },
    },
    "og:image": {
        why: "The preview image is the most eye-catching part of a shared link. Without og:image the card renders as plain text.",
        fix: "Add og:image pointing to an absolute https URL. Recommended size is 1200×630 (1.91:1).",
        example: '<meta property="og:image" content="https://example.com/preview.png" />',
        docs: { href: OGP + "#metadata", label: "Open Graph protocol" },
    },
    "og:url": {
        why: "og:url is the canonical URL platforms attribute the share to, deduplicating tracking params and URL variants.",
        fix: "Add og:url with the clean, canonical absolute URL of the page.",
        example: '<meta property="og:url" content="https://example.com/page" />',
        docs: { href: OGP + "#metadata", label: "Open Graph protocol" },
    },
    "og:description": {
        why: "The description is the supporting copy shown under the title on most platforms.",
        fix: "Add og:description with a 1–2 sentence summary (~55–200 characters).",
        example: '<meta property="og:description" content="A short summary of the page." />',
        docs: { href: OGP + "#metadata", label: "Open Graph protocol" },
    },
    "og:site_name": {
        why: "og:site_name labels which site the content belongs to — shown as a small eyebrow on several platforms.",
        fix: "Add og:site_name with your site or brand name.",
        example: '<meta property="og:site_name" content="Your Site" />',
        docs: { href: OGP + "#optional", label: "Open Graph optional metadata" },
    },
    "twitter:card": {
        why: "twitter:card selects the X / Twitter card layout. Without it X uses a minimal fallback.",
        fix: 'Add twitter:card — use "summary_large_image" when you have a wide preview image, otherwise "summary".',
        example: '<meta name="twitter:card" content="summary_large_image" />',
        docs: { href: XCARDS, label: "X Cards documentation" },
    },
    "Absolute og:image URL": {
        why: "Relative image paths can't be resolved by external crawlers, so the preview image silently fails on most platforms.",
        fix: "Use a fully-qualified absolute URL (https://…) for og:image, not a relative path.",
        example: '<meta property="og:image" content="https://example.com/preview.png" />',
        docs: { href: OGP + "#metadata", label: "Open Graph protocol" },
    },
    "Description length OK": {
        why: "Long descriptions get truncated mid-sentence; very short ones look empty. ~55–200 characters renders cleanly across platforms.",
        fix: "Trim or expand og:description to roughly 55–200 characters.",
        example: '<meta property="og:description" content="A concise, complete summary that fits in about 160 characters." />',
        docs: { href: OGP + "#metadata", label: "Open Graph protocol" },
    },
};

function diagDetail(help) {
    const detail = el("div", { class: "diag-detail" });
    detail.appendChild(
        el("div", { class: "diag-block" }, [
            el("div", { class: "diag-block-h", text: "Why it matters" }),
            el("p", { class: "diag-block-p", text: help.why }),
        ]),
    );
    detail.appendChild(
        el("div", { class: "diag-block" }, [
            el("div", { class: "diag-block-h", text: "How to fix it" }),
            el("p", { class: "diag-block-p", text: help.fix }),
        ]),
    );
    if (help.example) {
        const snippet = el("div", { class: "diag-snippet" }, [
            el("code", { text: help.example }),
            copyButton(help.example, "Copy snippet"),
        ]);
        detail.appendChild(snippet);
    }
    if (help.docs) {
        const link = el("a", {
            class: "diag-docs",
            href: help.docs.href,
            target: "_blank",
            rel: "noreferrer",
        });
        link.append(octicon("link-external", 14, "diag-docs-ico"), document.createTextNode(help.docs.label));
        detail.appendChild(link);
    }
    return detail;
}

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
            const kind = c.ok ? "ok" : c.level === "required" ? "req" : "warn";
            const levelText = c.ok ? "passed" : c.level;

            // Passing checks render as plain, non-expandable rows.
            if (c.ok) {
                return el("div", { class: "diag-item" }, [
                    el("div", { class: "diag-row" }, [
                        diagIcon(kind),
                        el("div", { class: "diag-text" }, [
                            el("span", { class: "diag-id", text: c.id }),
                            el("span", { class: `diag-level ${kind}`, text: levelText }),
                            c.note ? el("div", { class: "diag-note", text: c.note }) : null,
                        ]),
                    ]),
                ]);
            }

            // Failing checks expand to show what's wrong and how to fix it.
            const help =
                DIAG_HELP[c.id] || {
                    why: c.note || "This recommended metadata is missing or invalid.",
                    fix: "Add or correct this metadata tag in the document <head>.",
                };
            const details = el("details", { class: `diag-item diag-${kind}` });
            details.appendChild(
                el("summary", { class: "diag-row" }, [
                    diagIcon(kind),
                    el("div", { class: "diag-text" }, [
                        el("span", { class: "diag-id", text: c.id }),
                        el("span", { class: `diag-level ${kind}`, text: levelText }),
                        c.note ? el("div", { class: "diag-note", text: c.note }) : null,
                    ]),
                    diagChevron(),
                ]),
            );
            details.appendChild(diagDetail(help));
            return details;
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

async function load(rawUrl, opts) {
    const url = withScheme(rawUrl);
    if (!url) return;
    const silent = !!(opts && opts.silent);
    hideImgTip();
    hideCodeCard();
    input.value = url;
    document.body.classList.add("has-data", "is-busy");
    setStatus("loading", `Fetching ${url} …`);
    $("#footer-summary").textContent = `Loading ${url} …`;
    // Show realistic shaped skeletons immediately so the layout is stable.
    renderSkeleton();
    try {
        const res = await fetch(
            "/api/fetch?u=" + encodeURIComponent(url) + (silent ? "&silent=1" : ""),
        );
        const data = await res.json();
        if (!res.ok || data.error) {
            throw new Error(data.error || `Request failed (${res.status})`);
        }
        lastData = data;
        if (data.resolved.url || data.requestedUrl) {
            input.value = data.requestedUrl || url;
        }
        pendingBrowseUrl = data.requestedUrl || url;
        if (!(opts && opts.skipBrowse)) syncBrowseFrame(pendingBrowseUrl);
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
$("#refresh").addEventListener("click", () => {
    if (browseActive()) {
        // Force the embedded frame to re-fetch (syncBrowseFrame would skip an
        // unchanged URL), then refresh the previews without re-driving the frame.
        const u = withScheme(input.value || pendingBrowseUrl);
        if (u) navBrowseFrame(u);
        load(input.value, { skipBrowse: true });
    } else {
        load(input.value);
    }
});

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

const TAB_KEY = "og-preview:tab";
const TAB_ICONS = { previews: "image", raw: "code", diagnostics: "checklist", browse: "globe" };

function activateTab(name) {
    const tab = document.querySelector(`.tab[data-tab="${name}"]`);
    const panel = $("#panel-" + name);
    if (!tab || !panel) return;
    document.querySelectorAll(".tab").forEach((t) => {
        const on = t === tab;
        t.classList.toggle("active", on);
        t.setAttribute("aria-selected", on ? "true" : "false");
        t.tabIndex = on ? 0 : -1;
    });
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    panel.classList.add("active");
    document.body.classList.toggle("browse-active", name === "browse");
    try {
        sessionStorage.setItem(TAB_KEY, name);
    } catch {
        /* storage unavailable */
    }
    if (name === "browse") syncBrowseFrame(pendingBrowseUrl || input.value);
}

const TAB_ORDER = ["browse", "previews", "raw", "diagnostics"];

document.querySelectorAll(".tab").forEach((tab) => {
    const iconName = TAB_ICONS[tab.dataset.tab];
    if (iconName && !tab.querySelector(".octicon")) {
        tab.insertBefore(octicon(iconName, 16, "tab-ico"), tab.firstChild);
    }
    tab.addEventListener("click", () => {
        if (tab.classList.contains("active")) return;
        withTransition(() => activateTab(tab.dataset.tab));
    });
    tab.addEventListener("keydown", (e) => {
        const i = TAB_ORDER.indexOf(tab.dataset.tab);
        if (i < 0) return;
        let next = null;
        if (e.key === "ArrowRight" || e.key === "ArrowDown") {
            next = TAB_ORDER[(i + 1) % TAB_ORDER.length];
        } else if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
            next = TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length];
        } else if (e.key === "Home") {
            next = TAB_ORDER[0];
        } else if (e.key === "End") {
            next = TAB_ORDER[TAB_ORDER.length - 1];
        } else {
            return;
        }
        e.preventDefault();
        const nextTab = document.querySelector(`.tab[data-tab="${next}"]`);
        if (nextTab) nextTab.focus();
        withTransition(() => activateTab(next));
    });
});

/* ---------------- Previews layout toggle (List default / Grid compact) ----
   The #previews element is persistent (renderPreviews only swaps its children),
   so a layout-* class set here survives re-renders. */
const LAYOUT_KEY = "og-preview:layout";

function setPreviewsLayout(mode) {
    const m = mode === "grid" ? "grid" : "list";
    const grid = $("#previews");
    if (grid) {
        grid.classList.toggle("layout-grid", m === "grid");
        grid.classList.toggle("layout-list", m === "list");
    }
    const lb = $("#layout-list");
    const gb = $("#layout-grid");
    if (lb && gb) {
        lb.classList.toggle("active", m === "list");
        gb.classList.toggle("active", m === "grid");
        lb.setAttribute("aria-pressed", String(m === "list"));
        gb.setAttribute("aria-pressed", String(m === "grid"));
    }
    try {
        localStorage.setItem(LAYOUT_KEY, m);
    } catch {
        /* storage unavailable */
    }
}

(function initPreviewsLayout() {
    const lb = $("#layout-list");
    const gb = $("#layout-grid");
    if (lb && !lb.querySelector(".octicon")) lb.appendChild(octicon("list-unordered", 16));
    if (gb && !gb.querySelector(".octicon")) gb.appendChild(octicon("grid", 16));
    if (lb) lb.addEventListener("click", () => setPreviewsLayout("list"));
    if (gb) gb.addEventListener("click", () => setPreviewsLayout("grid"));
    let saved = "list";
    try {
        saved = localStorage.getItem(LAYOUT_KEY) || "list";
    } catch {
        /* storage unavailable */
    }
    setPreviewsLayout(saved);
})();

/* ---------------- Browse tab (live page + route mirroring) ----------------
   A sandboxed iframe renders the live page through the same-origin /api/proxy
   (so any site embeds and its in-page navigation can flow back here). Editing
   the route or clicking links updates the previews live, and toolbar loads are
   mirrored into the frame. */

const browseFrame = $("#browse-frame");
const browsePanel = $("#panel-browse");
let browseFrameUrl = ""; // canonical URL the frame currently points at
let pendingBrowseUrl = ""; // latest loaded URL the frame should show
let browseLoadTimer = null;
let browseNavToken = 0; // guards against out-of-order srcdoc fetches

function canonUrl(u) {
    try {
        const x = new URL(withScheme(u));
        return (x.protocol + "//" + x.host + x.pathname.replace(/\/+$/, "") + x.search).toLowerCase();
    } catch {
        return String(u || "").trim().toLowerCase();
    }
}

function browseActive() {
    return browsePanel.classList.contains("active");
}

// Render a URL inside the embedded frame by fetching the proxied HTML and
// inlining it via srcdoc. We deliberately DON'T point the iframe at the loopback
// /api/proxy URL: the canvas host blocks the nested frame from connecting to
// 127.0.0.1 ("refused to connect"). Inlining the already-proxied HTML sidesteps
// that entirely — the fetch runs from our own document (which works), and the
// frame just renders a string. Relative assets resolve via the injected <base>.
async function navBrowseFrame(rawUrl) {
    const u = withScheme(rawUrl);
    if (!u) return;
    browseFrameUrl = canonUrl(u);
    browsePanel.classList.add("has-browse");
    const token = ++browseNavToken;
    try {
        const res = await fetch("/api/proxy?u=" + encodeURIComponent(u));
        const html = await res.text();
        if (token !== browseNavToken) return; // a newer navigation superseded us
        browseFrame.srcdoc = html;
    } catch {
        if (token !== browseNavToken) return;
        browseFrame.srcdoc =
            '<!doctype html><meta charset="utf-8"><body style="margin:0;font:14px/1.5 system-ui;padding:28px;color:#8b949e">Couldn\u2019t load this page in the browse view.</body>';
    }
}

// Mirror the currently-loaded URL into the frame when it's worth doing (Browse
// tab visible or already initialised), skipping a redundant reload.
function syncBrowseFrame(rawUrl) {
    const u = withScheme(rawUrl);
    if (u) pendingBrowseUrl = u;
    if (!pendingBrowseUrl) return;
    if (!browseActive() && !browsePanel.classList.contains("has-browse")) return;
    if (canonUrl(pendingBrowseUrl) === browseFrameUrl) return;
    navBrowseFrame(pendingBrowseUrl);
}

// Debounced preview refresh driven by genuine in-frame navigation. Silent (never
// re-opens the canvas) and skipBrowse (the message handler already advanced the
// frame, so we don't want load() to re-fetch it).
function scheduleBrowsePreview(url) {
    clearTimeout(browseLoadTimer);
    browseLoadTimer = setTimeout(() => {
        load(url, { silent: true, skipBrowse: true });
    }, 300);
}

$("#browse-open").addEventListener("click", () => {
    const u = withScheme(input.value || pendingBrowseUrl);
    if (!u) return;
    try {
        window.open(u, "_blank", "noopener");
    } catch {
        /* host may block popups */
    }
});

// Navigation reported from inside the sandboxed proxy frame. Browsing is the
// primary driver: we bind the landed route to BOTH the route bar and the
// top-level URL input, advance the embedded frame to the new page, and refresh
// every preview from it.
window.addEventListener("message", (e) => {
    const m = e && e.data;
    if (!m || m.source !== "og-browse" || m.type !== "nav" || !m.url) return;
    if (!/^https?:\/\//i.test(m.url)) return; // ignore non-http targets (e.g. about:srcdoc)
    if (canonUrl(m.url) === browseFrameUrl) return; // echo from our own render
    browseFrameUrl = canonUrl(m.url); // genuine in-frame route change
    input.value = m.url; // bind the top-level URL to the browsed route
    if (m.mode === "soft") {
        // SPA history change (pushState/replaceState): the frame already updated
        // its own DOM in place. Re-rendering it via /api/proxy would wipe that
        // client-side state (e.g. aspire.dev's selected language tab snapping back
        // to the default), so only refresh the previews — never reload the frame.
        scheduleBrowsePreview(m.url);
        return;
    }
    navBrowseFrame(m.url); // hard nav (link click) / initial: advance the frame
    scheduleBrowsePreview(m.url); // refresh the previews (skipBrowse)
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

// Default to the Browse tab — it's the primary driver for the previews.
// Restore a different tab only if the user explicitly switched away this session.
try {
    const savedTab = sessionStorage.getItem(TAB_KEY);
    const startTab = savedTab && $("#panel-" + savedTab) ? savedTab : "browse";
    activateTab(startTab);
} catch {
    activateTab("browse");
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
