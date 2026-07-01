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
    "mark-github":
        '<path fill="currentColor" d="M8 0c4.42 0 8 3.58 8 8a8.013 8.013 0 0 1-5.45 7.59c-.4.08-.55-.17-.55-.38 0-.27.01-1.13.01-2.2 0-.75-.25-1.23-.54-1.48 1.78-.2 3.65-.88 3.65-3.95 0-.88-.31-1.59-.82-2.15.08-.2.36-1.02-.08-2.12 0 0-.67-.22-2.2.82-.64-.18-1.32-.27-2-.27-.68 0-1.36.09-2 .27-1.53-1.03-2.2-.82-2.2-.82-.44 1.1-.16 1.92-.08 2.12-.51.56-.82 1.28-.82 2.15 0 3.06 1.86 3.75 3.64 3.95-.23.2-.44.55-.51 1.07-.46.21-1.61.55-2.33-.66-.15-.24-.6-.83-1.23-.82-.67.01-.27.38.01.53.34.19.73.9.82 1.13.16.45.68 1.31 2.69.94 0 .67.01 1.3.01 1.49 0 .21-.15.45-.55.38A8.013 8.013 0 0 1 0 8c0-4.42 3.58-8 8-8Z"/>',
    "issue-opened":
        '<path fill="currentColor" d="M8 9.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z"/><path fill="currentColor" d="M8 0a8 8 0 1 1 0 16A8 8 0 0 1 8 0ZM1.5 8a6.5 6.5 0 1 0 13 0 6.5 6.5 0 0 0-13 0Z"/>',
    copilot:
        '<path fill="currentColor" d="M7.998 15.035c-4.562 0-7.873-2.914-7.998-3.749V9.338c.085-.628.677-1.686 1.588-2.065.013-.07.024-.143.036-.218.029-.183.06-.384.126-.612-.201-.508-.254-1.084-.254-1.656 0-.87.128-1.769.693-2.484.579-.733 1.494-1.124 2.724-1.261 1.206-.134 2.262.034 2.944.765.05.053.096.108.139.165.044-.057.094-.112.143-.165.682-.731 1.738-.899 2.944-.765 1.23.137 2.145.528 2.724 1.261.566.715.693 1.614.693 2.484 0 .572-.053 1.148-.254 1.656.066.228.098.429.126.612.012.076.024.148.037.218.924.385 1.522 1.471 1.591 2.095v1.872c0 .766-3.351 3.795-8.002 3.795Zm0-1.485c2.28 0 4.584-1.11 5.002-1.433V7.862l-.023-.116c-.49.21-1.075.291-1.727.291-1.146 0-2.059-.327-2.71-.991A3.222 3.222 0 0 1 8 6.303a3.24 3.24 0 0 1-.544.743c-.65.664-1.563.991-2.71.991-.652 0-1.236-.081-1.727-.291l-.023.116v4.255c.419.323 2.722 1.433 5.002 1.433ZM6.762 2.83c-.193-.206-.637-.413-1.682-.297-1.019.113-1.479.404-1.713.7-.247.312-.369.789-.369 1.554 0 .793.129 1.171.308 1.371.162.181.519.379 1.442.379.853 0 1.339-.235 1.638-.54.315-.322.527-.827.617-1.553.117-.935-.037-1.395-.241-1.614Zm4.155-.297c-1.044-.116-1.488.091-1.681.297-.204.219-.359.679-.242 1.614.091.726.303 1.231.618 1.553.299.305.784.54 1.638.54.922 0 1.28-.198 1.442-.379.179-.2.308-.578.308-1.371 0-.765-.123-1.242-.37-1.554-.233-.296-.693-.587-1.713-.7Z"/><path fill="currentColor" d="M6.25 9.037a.75.75 0 0 1 .75.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 .75-.75Zm4.25.75v1.501a.75.75 0 0 1-1.5 0V9.787a.75.75 0 0 1 1.5 0Z"/>',
    rocket:
        '<path fill="currentColor" d="M14.064 0h.186C15.216 0 16 .784 16 1.75v.186a8.752 8.752 0 0 1-2.564 6.186l-.458.459c-.314.314-.641.616-.979.904v3.207c0 .608-.315 1.172-.833 1.49l-2.774 1.707a.749.749 0 0 1-1.11-.418l-.954-3.102a1.214 1.214 0 0 1-.145-.125L3.754 9.816a1.218 1.218 0 0 1-.124-.145L.528 8.717a.749.749 0 0 1-.418-1.11l1.71-2.774A1.748 1.748 0 0 1 3.31 4h3.204c.288-.338.59-.665.904-.979l.459-.458A8.749 8.749 0 0 1 14.064 0ZM8.938 3.623h-.002l-.458.458c-.76.76-1.437 1.598-2.02 2.5l-1.5 2.317 2.143 2.143 2.317-1.5c.902-.583 1.74-1.26 2.499-2.02l.459-.458a7.25 7.25 0 0 0 2.123-5.127V1.75a.25.25 0 0 0-.25-.25h-.186a7.249 7.249 0 0 0-5.125 2.123ZM3.56 14.56c-.732.732-2.334 1.045-3.005 1.148a.234.234 0 0 1-.201-.064.234.234 0 0 1-.064-.201c.103-.671.416-2.273 1.15-3.003a1.502 1.502 0 1 1 2.12 2.12Zm6.94-3.935c-.088.06-.177.118-.266.175l-2.35 1.521.548 1.783 1.949-1.2a.25.25 0 0 0 .119-.213ZM3.678 8.116 5.2 5.766c.058-.09.117-.178.176-.266H3.309a.25.25 0 0 0-.213.119l-1.2 1.95ZM12 5a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>',
    telescope:
        '<path fill="currentColor" d="M14.184 1.143v-.001l1.422 2.464a1.75 1.75 0 0 1-.757 2.451L3.104 11.713a1.75 1.75 0 0 1-2.275-.702l-.447-.775a1.75 1.75 0 0 1 .53-2.32L11.682.573a1.748 1.748 0 0 1 2.502.57Zm-4.709 9.32h-.001l2.644 3.863a.75.75 0 1 1-1.238.848l-1.881-2.75v2.826a.75.75 0 0 1-1.5 0v-2.826l-1.881 2.75a.75.75 0 1 1-1.238-.848l2.049-2.992a.746.746 0 0 1 .293-.253l1.809-.87a.749.749 0 0 1 .944.252ZM9.436 3.92h-.001l-4.97 3.39.942 1.63 5.42-2.61Zm3.091-2.108h.001l-1.85 1.26 1.505 2.605 2.016-.97a.247.247 0 0 0 .13-.151.247.247 0 0 0-.022-.199l-1.422-2.464a.253.253 0 0 0-.161-.119.254.254 0 0 0-.197.038ZM1.756 9.157a.25.25 0 0 0-.075.33l.447.775a.25.25 0 0 0 .325.1l1.598-.769-.83-1.436-1.465 1Z"/>',
    book:
        '<path fill="currentColor" d="M0 1.75A.75.75 0 0 1 .75 1h4.253c1.227 0 2.317.59 3 1.501A3.743 3.743 0 0 1 11.006 1h4.245a.75.75 0 0 1 .75.75v10.5a.75.75 0 0 1-.75.75h-4.507a2.25 2.25 0 0 0-1.591.659l-.622.621a.75.75 0 0 1-1.06 0l-.622-.621A2.25 2.25 0 0 0 5.258 13H.75a.75.75 0 0 1-.75-.75Zm7.251 10.324.004-5.073-.002-2.253A2.25 2.25 0 0 0 5.003 2.5H1.5v9h3.757a3.75 3.75 0 0 1 1.994.574ZM8.755 4.75l-.004 7.322a3.752 3.752 0 0 1 1.992-.572H14.5v-9h-3.495a2.25 2.25 0 0 0-2.25 2.25Z"/>',
    law:
        '<path fill="currentColor" d="M8.75.75V2h.985c.304 0 .603.08.867.231l1.29.736c.038.022.08.033.124.033h2.234a.75.75 0 0 1 0 1.5h-.427l2.111 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.006.005-.01.01-.045.04c-.21.176-.441.327-.686.45C14.556 10.78 13.88 11 13 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L12.178 4.5h-.162c-.305 0-.604-.079-.868-.231l-1.29-.736a.245.245 0 0 0-.124-.033H8.75V13h2.5a.75.75 0 0 1 0 1.5h-6.5a.75.75 0 0 1 0-1.5h2.5V3.5h-.984a.245.245 0 0 0-.124.033l-1.289.737c-.265.15-.564.23-.869.23h-.162l2.112 4.692a.75.75 0 0 1-.154.838l-.53-.53.529.531-.001.002-.002.002-.006.006-.016.015-.045.04c-.21.176-.441.327-.686.45C4.556 10.78 3.88 11 3 11a4.498 4.498 0 0 1-2.023-.454 3.544 3.544 0 0 1-.686-.45l-.045-.04-.016-.015-.006-.006-.004-.004v-.001a.75.75 0 0 1-.154-.838L2.178 4.5H1.75a.75.75 0 0 1 0-1.5h2.234a.249.249 0 0 0 .125-.033l1.288-.737c.265-.15.564-.23.869-.23h.984V.75a.75.75 0 0 1 1.5 0Zm2.945 8.477c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L13 6.327Zm-10 0c.285.135.718.273 1.305.273s1.02-.138 1.305-.273L3 6.327Z"/>',
    plug:
        '<path fill="currentColor" d="M4 8H2.5a1 1 0 0 0-1 1v5.25a.75.75 0 0 1-1.5 0V9a2.5 2.5 0 0 1 2.5-2.5H4V5.133a1.75 1.75 0 0 1 1.533-1.737l2.831-.353.76-.913c.332-.4.825-.63 1.344-.63h.782c.966 0 1.75.784 1.75 1.75V4h2.25a.75.75 0 0 1 0 1.5H13v4h2.25a.75.75 0 0 1 0 1.5H13v.75a1.75 1.75 0 0 1-1.75 1.75h-.782c-.519 0-1.012-.23-1.344-.63l-.761-.912-2.83-.354A1.75 1.75 0 0 1 4 9.867Zm6.276-4.91-.95 1.14a.753.753 0 0 1-.483.265l-3.124.39a.25.25 0 0 0-.219.248v4.734c0 .126.094.233.219.249l3.124.39a.752.752 0 0 1 .483.264l.95 1.14a.25.25 0 0 0 .192.09h.782a.25.25 0 0 0 .25-.25v-8.5a.25.25 0 0 0-.25-.25h-.782a.25.25 0 0 0-.192.09Z"/>',
    key:
        '<path fill="currentColor" d="M10.5 0a5.499 5.499 0 1 1-1.288 10.848l-.932.932a.749.749 0 0 1-.53.22H7v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22H5v.75a.749.749 0 0 1-.22.53l-.5.5a.749.749 0 0 1-.53.22h-2A1.75 1.75 0 0 1 0 14.25v-2c0-.199.079-.389.22-.53l4.932-4.932A5.5 5.5 0 0 1 10.5 0Zm-4 5.5c-.001.431.069.86.205 1.269a.75.75 0 0 1-.181.768L1.5 12.56v1.69c0 .138.112.25.25.25h1.69l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l.06-.06v-1.19a.75.75 0 0 1 .75-.75h1.19l1.023-1.025a.75.75 0 0 1 .768-.18A4 4 0 1 0 6.5 5.5ZM11 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>',
    info:
        '<path fill="currentColor" d="M0 8a8 8 0 1 1 16 0A8 8 0 0 1 0 8Zm8-6.5a6.5 6.5 0 1 0 0 13 6.5 6.5 0 0 0 0-13ZM6.5 7.75A.75.75 0 0 1 7.25 7h1a.75.75 0 0 1 .75.75v2.75h.25a.75.75 0 0 1 0 1.5h-2a.75.75 0 0 1 0-1.5h.25v-2h-.25a.75.75 0 0 1-.75-.75ZM8 6a1 1 0 1 1 0-2 1 1 0 0 1 0 2Z"/>',
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

/* ---------------- Syntax highlighting (compact, dependency-free) ----------------
   A small tokenizer that colorizes source shown in the code hovercard. It's not a
   full parser — it recognizes comments, strings, numbers, keywords, markup tags
   and the common Markdown/MDX constructs well enough to read at a glance. Every
   token is emitted as { c: className|null, v: text } and later rendered with
   textContent (never innerHTML), so fetched source can't inject markup. */

const HL_KEYWORDS = new Set([
    "abstract", "as", "async", "await", "break", "case", "catch", "class", "const", "continue",
    "debugger", "declare", "default", "delete", "do", "else", "enum", "export", "extends", "false",
    "finally", "for", "from", "function", "get", "if", "implements", "import", "in", "instanceof",
    "interface", "is", "keyof", "let", "namespace", "new", "null", "of", "override", "package",
    "private", "protected", "public", "readonly", "return", "satisfies", "set", "static", "super",
    "switch", "this", "throw", "true", "try", "type", "typeof", "undefined", "var", "void", "while",
    "with", "yield", "auto", "bool", "boolean", "byte", "char", "struct", "union", "func", "fn",
    "impl", "trait", "pub", "use", "mod", "match", "move", "ref", "where", "defer", "chan", "select",
    "map", "range", "nil", "fun", "val", "when", "object", "sealed", "open", "internal", "operator",
    "guard", "final", "throws", "using", "unsafe", "virtual", "volatile", "sizeof", "typename",
    "template", "constexpr", "nullptr", "string", "int", "long", "short", "float", "double",
    "unsigned", "signed", "decimal", "dynamic", "go",
]);

const HL_HASH_KEYWORDS = new Set([
    "def", "class", "return", "if", "elif", "else", "for", "while", "in", "not", "and", "or", "is",
    "import", "from", "as", "with", "try", "except", "finally", "raise", "pass", "break", "continue",
    "lambda", "yield", "global", "nonlocal", "async", "await", "self", "end", "do", "then", "fi",
    "done", "esac", "case", "function", "local", "export", "echo", "source", "require", "module",
    "begin", "ensure", "unless", "until", "puts", "true", "false", "True", "False", "None", "nil",
    "let", "set", "foreach", "param", "process", "switch",
]);

const HL_LITERALS = new Set([
    "true", "false", "null", "undefined", "nil", "None", "True", "False", "NaN", "Infinity",
]);

const HL_PUNCT_RE = /[{}()[\].,;:?=+\-*/%<>!&|^~]/;
const HL_ID_START = /[A-Za-z_$@]/;
const HL_ID_CHAR = /[A-Za-z0-9_$]/;
const HL_NUM_RE =
    /^(?:0[xX][0-9a-fA-F_]+|0[bB][01_]+|0[oO][0-7_]+|\d[\d_]*\.?\d*(?:[eE][+-]?\d+)?|\.\d[\d_]*(?:[eE][+-]?\d+)?)[a-zA-Z%]*/;

function hlLang(ext) {
    const l = String(ext || "").toLowerCase();
    if (["md", "markdown", "mdx"].includes(l)) return "markdown";
    if (["html", "htm", "xhtml", "xml", "rss", "atom", "svg", "vue", "svelte"].includes(l)) return "markup";
    if (["json", "json5", "jsonc"].includes(l)) return "json";
    if (l === "css") return "css";
    if (["scss", "sass", "less"].includes(l)) return "scss";
    if (["sql", "graphql", "gql"].includes(l)) return "sql";
    if (["yaml", "yml", "toml", "ini", "cfg", "conf", "env", "properties", "sh", "bash", "zsh",
        "fish", "ps1", "psm1", "py", "rb", "dockerfile", "makefile", "cmake", "lock", "gradle"].includes(l)) {
        return "hash";
    }
    if (["txt", "text", "log"].includes(l)) return "text";
    return "clike";
}

function hlTokens(text, ext) {
    switch (hlLang(ext)) {
        case "text": return [{ c: null, v: text }];
        case "markdown": return hlMarkdown(text, ext);
        case "markup": return hlMarkup(text);
        case "json": return hlGeneric(text, { line: ["//"], block: ["/*", "*/"], quotes: ['"'] });
        case "css": return hlGeneric(text, { line: [], block: ["/*", "*/"], quotes: ['"', "'"] });
        case "scss": return hlGeneric(text, { line: ["//"], block: ["/*", "*/"], quotes: ['"', "'"] });
        case "sql": return hlGeneric(text, { line: ["--"], block: ["/*", "*/"], quotes: ["'", '"'] });
        case "hash": return hlGeneric(text, { line: ["#"], quotes: ['"', "'"], keywords: HL_HASH_KEYWORDS });
        default:
            return hlGeneric(text, {
                line: ["//"], block: ["/*", "*/"], quotes: ['"', "'"], template: true, keywords: HL_KEYWORDS,
            });
    }
}

function hlGeneric(text, cfg) {
    const out = [];
    const push = (c, v) => { if (v) out.push({ c, v }); };
    const n = text.length;
    const kw = cfg.keywords || null;
    const lits = cfg.literals || HL_LITERALS;
    const lineC = cfg.line || [];
    const block = cfg.block || null;
    const quotes = cfg.quotes || ['"', "'"];
    const template = cfg.template ? "`" : null;
    let i = 0;
    while (i < n) {
        const ch = text[i];
        if (ch === "\n") { push(null, "\n"); i++; continue; }
        if (block && text.startsWith(block[0], i)) {
            let e = text.indexOf(block[1], i + block[0].length);
            e = e === -1 ? n : e + block[1].length;
            push("hl-com", text.slice(i, e)); i = e; continue;
        }
        let lc = "";
        for (const p of lineC) { if (p && text.startsWith(p, i)) { lc = p; break; } }
        if (lc) {
            let e = text.indexOf("\n", i);
            if (e === -1) e = n;
            push("hl-com", text.slice(i, e)); i = e; continue;
        }
        if (template && ch === template) {
            let j = i + 1;
            while (j < n) { if (text[j] === "\\") { j += 2; continue; } if (text[j] === template) { j++; break; } j++; }
            push("hl-str", text.slice(i, j)); i = j; continue;
        }
        if (quotes.includes(ch)) {
            let j = i + 1;
            while (j < n) {
                const c = text[j];
                if (c === "\\") { j += 2; continue; }
                if (c === "\n") break;
                if (c === ch) { j++; break; }
                j++;
            }
            push("hl-str", text.slice(i, j)); i = j; continue;
        }
        if ((ch >= "0" && ch <= "9") || (ch === "." && text[i + 1] >= "0" && text[i + 1] <= "9")) {
            const m = HL_NUM_RE.exec(text.substr(i, 48));
            const v = m ? m[0] : ch;
            push("hl-num", v); i += v.length; continue;
        }
        if (HL_ID_START.test(ch)) {
            let j = i + 1;
            while (j < n && HL_ID_CHAR.test(text[j])) j++;
            const word = text.slice(i, j);
            let cls = null;
            if (lits.has(word)) cls = "hl-lit";
            else if (kw && kw.has(word)) cls = "hl-kw";
            else if (text[j] === "(") cls = "hl-fn";
            push(cls, word); i = j; continue;
        }
        if (HL_PUNCT_RE.test(ch)) { push("hl-punct", ch); i++; continue; }
        let j = i;
        while (j < n) {
            const c = text[j];
            if (c === "\n" || HL_ID_START.test(c) || HL_PUNCT_RE.test(c) || quotes.includes(c)) break;
            if (template && c === template) break;
            if (block && text.startsWith(block[0], j)) break;
            let brk = false;
            for (const p of lineC) { if (p && text.startsWith(p, j)) { brk = true; break; } }
            if (brk) break;
            j++;
        }
        if (j === i) j = i + 1;
        push(null, text.slice(i, j)); i = j;
    }
    return out;
}

function hlMarkup(text) {
    const out = [];
    const push = (c, v) => { if (v) out.push({ c, v }); };
    const n = text.length;
    let i = 0;
    while (i < n) {
        const ch = text[i];
        if (text.startsWith("<!--", i)) {
            let e = text.indexOf("-->", i);
            e = e === -1 ? n : e + 3;
            push("hl-com", text.slice(i, e)); i = e; continue;
        }
        if (ch === "<" && /[A-Za-z/!?]/.test(text[i + 1] || "")) {
            let j = i + 1;
            let lead = "<";
            if (text[j] === "/") { lead = "</"; j++; }
            push("hl-punct", lead);
            let s = j;
            while (j < n && /[A-Za-z0-9:_.-]/.test(text[j])) j++;
            push("hl-tag", text.slice(s, j));
            while (j < n && text[j] !== ">") {
                const c = text[j];
                if (c === "\n") { push(null, "\n"); j++; continue; }
                if (/\s/.test(c)) {
                    let k = j;
                    while (k < n && /\s/.test(text[k]) && text[k] !== "\n") k++;
                    push(null, text.slice(j, k)); j = k; continue;
                }
                if (c === "/" || c === "=") { push("hl-punct", c); j++; continue; }
                if (c === '"' || c === "'") {
                    let k = j + 1;
                    while (k < n && text[k] !== c && text[k] !== "\n") k++;
                    if (text[k] === c) k++;
                    push("hl-str", text.slice(j, k)); j = k; continue;
                }
                if (c === "{") {
                    let depth = 1;
                    let k = j + 1;
                    while (k < n && depth) { if (text[k] === "{") depth++; else if (text[k] === "}") depth--; k++; }
                    push("hl-punct", "{"); push(null, text.slice(j + 1, k - 1)); push("hl-punct", "}");
                    j = k; continue;
                }
                let k = j;
                while (k < n && /[A-Za-z0-9:_.@-]/.test(text[k])) k++;
                if (k > j) { push("hl-attr", text.slice(j, k)); j = k; } else { push(null, text[j]); j++; }
            }
            if (text[j] === ">") { push("hl-punct", ">"); j++; }
            i = j; continue;
        }
        if (ch === "\n") { push(null, "\n"); i++; continue; }
        let j = i;
        while (j < n && text[j] !== "<" && text[j] !== "\n") j++;
        push(null, text.slice(i, j)); i = j;
    }
    return out;
}

function hlMdSpans(s) {
    const out = [];
    const n = s.length;
    let i = 0;
    let plainStart = 0;
    const flush = (end) => { if (end > plainStart) out.push({ c: null, v: s.slice(plainStart, end) }); };
    while (i < n) {
        const ch = s[i];
        if (ch === "`") {
            let j = i + 1;
            while (j < n && s[j] !== "`") j++;
            if (j < n) j++;
            flush(i); out.push({ c: "hl-code", v: s.slice(i, j) }); i = j; plainStart = i; continue;
        }
        if (s.startsWith("**", i) || s.startsWith("__", i)) {
            const d = s.substr(i, 2);
            let j = s.indexOf(d, i + 2);
            if (j !== -1) { j += 2; flush(i); out.push({ c: "hl-strong", v: s.slice(i, j) }); i = j; plainStart = i; continue; }
        }
        if (ch === "*" || ch === "_") {
            const j = s.indexOf(ch, i + 1);
            if (j > i + 1) { flush(i); out.push({ c: "hl-em", v: s.slice(i, j + 1) }); i = j + 1; plainStart = i; continue; }
        }
        if (ch === "[" || (ch === "!" && s[i + 1] === "[")) {
            const lb = ch === "!" ? i + 1 : i;
            const close = s.indexOf("]", lb + 1);
            if (close !== -1 && s[close + 1] === "(") {
                const paren = s.indexOf(")", close + 2);
                if (paren !== -1) {
                    flush(i);
                    out.push({ c: "hl-punct", v: s.slice(i, close + 1) });
                    out.push({ c: "hl-punct", v: "(" });
                    out.push({ c: "hl-link", v: s.slice(close + 2, paren) });
                    out.push({ c: "hl-punct", v: ")" });
                    i = paren + 1; plainStart = i; continue;
                }
            }
        }
        i++;
    }
    flush(n);
    return out;
}

function hlMdInline(line, ext) {
    let m;
    if ((m = line.match(/^(\s*)(#{1,6})(\s.*)?$/))) {
        return [{ c: null, v: m[1] }, { c: "hl-heading", v: m[2] + (m[3] || "") }];
    }
    if ((m = line.match(/^(\s*>+\s?)(.*)$/))) {
        return [{ c: "hl-punct", v: m[1] }].concat(hlMdSpans(m[2]));
    }
    if ((m = line.match(/^(\s*)([-*+]|\d+[.)])(\s+)(.*)$/))) {
        return [{ c: null, v: m[1] }, { c: "hl-punct", v: m[2] }, { c: null, v: m[3] }].concat(hlMdSpans(m[4]));
    }
    if (String(ext).toLowerCase() === "mdx" && /^(import|export)\b/.test(line)) {
        return hlTokens(line, "ts");
    }
    if (String(ext).toLowerCase() === "mdx" && /^\s*<[A-Za-z/]/.test(line)) {
        return hlMarkup(line);
    }
    return hlMdSpans(line);
}

function hlMarkdown(text, ext) {
    const out = [];
    const lines = text.split("\n");
    let inFence = false;
    let fenceLang = "";
    let buf = [];
    const nl = () => out.push({ c: null, v: "\n" });
    for (let idx = 0; idx < lines.length; idx++) {
        const line = lines[idx];
        const fm = line.match(/^(\s*)(```|~~~)([^`~]*)$/);
        if (fm) {
            if (!inFence) {
                if (idx > 0) nl();
                out.push({ c: "hl-punct", v: fm[1] + fm[2] });
                if (fm[3]) out.push({ c: "hl-kw", v: fm[3] });
                inFence = true;
                fenceLang = (fm[3] || "").trim().split(/\s+/)[0] || "";
                buf = [];
            } else {
                const inner = buf.join("\n");
                const toks = fenceLang ? hlTokens(inner, fenceLang) : [{ c: null, v: inner }];
                nl();
                for (const t of toks) out.push(t);
                nl();
                out.push({ c: "hl-punct", v: fm[1] + fm[2] });
                inFence = false; fenceLang = ""; buf = [];
            }
            continue;
        }
        if (inFence) { buf.push(line); continue; }
        if (idx > 0) nl();
        for (const t of hlMdInline(line, ext)) out.push(t);
    }
    if (inFence && buf.length) {
        const inner = buf.join("\n");
        const toks = fenceLang ? hlTokens(inner, fenceLang) : [{ c: null, v: inner }];
        nl();
        for (const t of toks) out.push(t);
    }
    return out;
}

/* ---------------- GitHub blob → raw ----------------
   A github.com "/blob/" (or "/raw/") URL serves an HTML page, not the file. Map
   it to raw.githubusercontent.com so the hovercard fetches and highlights the
   actual source. Returns the input unchanged for any non-GitHub URL. */
function isGithubCodeUrl(value) {
    try {
        const u = new URL(String(value).startsWith("//") ? "https:" + value : value);
        const h = u.hostname.toLowerCase();
        if (h === "raw.githubusercontent.com") return true;
        if ((h === "github.com" || h === "www.github.com") && /^\/[^/]+\/[^/]+\/(?:blob|raw)\//.test(u.pathname)) {
            return true;
        }
    } catch {
        /* not a URL */
    }
    return false;
}

function githubRawUrl(value) {
    const s = String(value == null ? "" : value).trim();
    try {
        const u = new URL(s.startsWith("//") ? "https:" + s : s);
        const h = u.hostname.toLowerCase();
        if (h === "github.com" || h === "www.github.com") {
            const m = u.pathname.match(/^\/([^/]+)\/([^/]+)\/(?:blob|raw)\/(.+)$/);
            if (m) return "https://raw.githubusercontent.com/" + m[1] + "/" + m[2] + "/" + m[3];
        }
    } catch {
        /* not a URL */
    }
    return s;
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
    if (isGithubCodeUrl(value)) return true;
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

function renderCodeHeader(url, payload, rawUrl) {
    const src = rawUrl || url;
    const lang = el("span", { class: "code-lang", text: codeLang(src) });
    const name = el("span", { class: "code-name", text: codeFileName(src) });
    const meta = el("span", {
        class: "code-meta muted",
        text: payload && !payload.error
            ? `${formatBytes(payload.bytes)}${payload.truncated ? " · truncated" : ""}`
            : "",
    });
    const open = el("a", {
        class: "code-open",
        href: src.startsWith("//") ? "https:" + src : src,
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

function renderCodeBody(text, truncated, ext) {
    const MAX_LINES = 600;
    const allLines = text.replace(/\n$/, "").split("\n");
    const shown = allLines.slice(0, MAX_LINES);
    const tokens = hlTokens(shown.join("\n"), ext);

    // Split tokens across line boundaries so multi-line tokens (block comments,
    // template strings, fenced code) keep their class on every line they cover.
    const lineToks = [[]];
    for (const tok of tokens) {
        const parts = tok.v.split("\n");
        for (let p = 0; p < parts.length; p++) {
            if (p > 0) lineToks.push([]);
            if (parts[p]) lineToks[lineToks.length - 1].push({ c: tok.c, v: parts[p] });
        }
    }

    const wrap = el("div", { class: "code-lines" });
    const frag = document.createDocumentFragment();
    lineToks.forEach((toks, i) => {
        const tline = el("span", { class: "cl-t" });
        if (!toks.length) {
            tline.textContent = " ";
        } else {
            for (const t of toks) {
                if (t.c) {
                    const s = el("span", { class: t.c });
                    s.textContent = t.v;
                    tline.appendChild(s);
                } else {
                    tline.appendChild(document.createTextNode(t.v));
                }
            }
        }
        frag.appendChild(
            el("div", { class: "cl" }, [el("span", { class: "cl-n", text: String(i + 1) }), tline]),
        );
    });
    wrap.appendChild(frag);
    codeBody.replaceChildren(el("div", { class: "code-scroll" }, [wrap]));
    if (truncated || allLines.length > MAX_LINES) {
        codeBody.appendChild(
            el("div", {
                class: "code-more muted",
                text: `Showing ${shown.length} of ${allLines.length}${truncated ? "+" : ""} lines — open raw to see all.`,
            }),
        );
    }
}

async function showCodeCard(url, node) {
    hideImgTip();
    const raw = githubRawUrl(url);
    const ext = urlExt(raw) || urlExt(url);
    const card = ensureCodeCard();
    const token = ++codeReqId;
    renderCodeHeader(url, null, raw);
    codeBody.replaceChildren(el("div", { class: "code-loading", text: "Loading…" }));
    card.hidden = false;
    positionCodeCard(node.getBoundingClientRect());
    requestAnimationFrame(() => card.classList.add("visible"));

    let payload = codeCache.get(raw);
    if (!payload) {
        try {
            const res = await fetch("/api/raw?u=" + encodeURIComponent(raw));
            payload = await res.json();
        } catch {
            payload = { error: "Couldn't load file." };
        }
        codeCache.set(raw, payload);
    }
    if (token !== codeReqId || card.hidden) return; // superseded or dismissed
    renderCodeHeader(url, payload, raw);
    if (payload.error) {
        codeBody.replaceChildren(el("div", { class: "code-error", text: payload.error }));
    } else {
        renderCodeBody(payload.text, payload.truncated, ext);
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
    "og:locale": {
        why: "og:locale tells platforms the language/territory of the content so they can localize the card and pick alternates. It defaults to en_US when omitted.",
        fix: "Add og:locale in language_TERRITORY form, and og:locale:alternate for any other languages the page is available in.",
        example: '<meta property="og:locale" content="en_US" />',
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
    "og:image:alt": {
        why: "og:image:alt describes the preview image for screen readers and low-bandwidth fallbacks. ogp.me states that if a page specifies og:image it should also specify og:image:alt.",
        fix: "Add og:image:alt with a short description of what's in the image (a description, not a caption).",
        example: '<meta property="og:image:alt" content="A shiny red apple with a bite taken out" />',
        docs: { href: OGP + "#structured", label: "Open Graph structured properties" },
    },
    "og:image dimensions": {
        why: "Declaring og:image:width and og:image:height lets platforms lay out and render the card immediately, before the image is fetched — avoiding layout shift and wrong cropping.",
        fix: "Add og:image:width and og:image:height (in pixels) matching your preview image — 1200×630 is the common 1.91:1 size.",
        example: '<meta property="og:image:width" content="1200" />\n<meta property="og:image:height" content="630" />',
        docs: { href: OGP + "#structured", label: "Open Graph structured properties" },
    },
    "og:image:type": {
        why: "og:image:type advertises the image's MIME type so crawlers can validate and decode it without sniffing.",
        fix: "Add og:image:type with the image's MIME type (e.g. image/png, image/jpeg).",
        example: '<meta property="og:image:type" content="image/png" />',
        docs: { href: OGP + "#structured", label: "Open Graph structured properties" },
    },
    "og:image:secure_url": {
        why: "Some platforms require an HTTPS image URL to display the preview. If og:image is HTTP, og:image:secure_url provides the HTTPS alternative.",
        fix: "Serve og:image over HTTPS, or add og:image:secure_url with the HTTPS version of the image.",
        example: '<meta property="og:image:secure_url" content="https://secure.example.com/preview.png" />',
        docs: { href: OGP + "#structured", label: "Open Graph structured properties" },
    },
    "Description length OK": {
        why: "Long descriptions get truncated mid-sentence; very short ones look empty. ~55–200 characters renders cleanly across platforms.",
        fix: "Trim or expand og:description to roughly 55–200 characters.",
        example: '<meta property="og:description" content="A concise, complete summary that fits in about 160 characters." />',
        docs: { href: OGP + "#metadata", label: "Open Graph protocol" },
    },
};

// Compose a copy-pasteable prompt a user can drop into any AI assistant to fix a
// failing diagnostic, seeded with the page URL and the specific issue/guidance.
function buildAiFixPrompt(check, help, url) {
    const lines = [];
    lines.push("Fix an OpenGraph / social-share metadata issue on my web page.");
    lines.push("");
    lines.push(`Page URL: ${url || "(unknown)"}`);
    lines.push(`Issue: ${check.id}${check.level ? ` (${check.level})` : ""}`);
    const why = (help && help.why) || check.note;
    if (why) lines.push(`Problem: ${why}`);
    if (help && help.fix) lines.push(`Goal: ${help.fix}`);
    if (help && help.example) {
        lines.push("");
        lines.push("Reference tag:");
        lines.push(help.example);
    }
    lines.push("");
    lines.push(
        "Give me the exact HTML <meta> tag(s) to add or change in the page <head>, " +
        "using real values inferred from the page above. If you can tell the site's " +
        "framework (Astro, Next.js, Hugo, plain HTML, …), show where/how to add it there; " +
        "otherwise give plain HTML. Keep it concise.",
    );
    return lines.join("\n");
}

// Prompt for the agent-readiness checks: describe the emerging standard and ask
// the coding agent to add the corresponding file/config to the site's repo.
function buildAgentFixPrompt(check, help, url) {
    const lines = [];
    lines.push("Make my website more agent-ready (AI-agent / crawler friendly).");
    lines.push("");
    lines.push(`Site: ${url || "(unknown)"}`);
    lines.push(`Standard: ${check.label || check.id}${check.level ? ` (${check.level})` : ""}`);
    if (check.detail) lines.push(`Current status: ${check.detail}`);
    if (help && help.why) lines.push(`Why it matters: ${help.why}`);
    if (help && help.fix) lines.push(`Goal: ${help.fix}`);
    if (help && help.example) {
        lines.push("");
        lines.push("Reference:");
        lines.push(help.example);
    }
    lines.push("");
    lines.push(
        "Give me the exact file(s) or server config to add to implement this on my site — " +
        "include the correct path (e.g. /.well-known/…, /robots.txt, /llms.txt) and the full " +
        "file contents, using real values inferred from the site above. If you can infer the " +
        "framework or host (Astro, Next.js, Hugo, Cloudflare, static hosting, …), show exactly " +
        "where the file/route goes; otherwise give a host-agnostic version. Keep it concise.",
    );
    return lines.join("\n");
}

function aiPromptHead(prompt, copyLabel) {
    const head = el("div", { class: "diag-ai-head" });
    const ico = el("span", { class: "diag-ai-ico", "aria-hidden": "true" });
    ico.innerHTML =
        '<svg width="14" height="14" viewBox="0 0 16 16" aria-hidden="true"><path fill="currentColor" d="M7.53 1.282a.5.5 0 0 1 .94 0l.478 1.306a7.492 7.492 0 0 0 4.464 4.464l1.305.478a.5.5 0 0 1 0 .94l-1.305.478a7.492 7.492 0 0 0-4.464 4.464l-.478 1.305a.5.5 0 0 1-.94 0l-.478-1.305a7.492 7.492 0 0 0-4.464-4.464L1.282 8.47a.5.5 0 0 1 0-.94l1.306-.478a7.492 7.492 0 0 0 4.464-4.464Z"/></svg>';
    head.append(
        ico,
        el("span", { class: "diag-ai-title", text: "AI fix prompt" }),
        copyButton(prompt, copyLabel || "Copy AI prompt"),
    );
    return head;
}

function diagAiPrompt(check, help, url, repo) {
    const prompt = buildAiFixPrompt(check, help, url);
    const children = [aiPromptHead(prompt), el("pre", { class: "diag-ai-body", text: prompt })];
    children.push(diagAiFooter(check, prompt, url, repo));
    return el("div", { class: "diag-ai" }, children);
}

// Agent-readiness variant: same layout, but the prompt asks the agent to add the
// missing agent-readiness file/config and the footer action title reflects that.
function agentAiPrompt(check, help, url, repo) {
    const prompt = buildAgentFixPrompt(check, help, url);
    const children = [aiPromptHead(prompt), el("pre", { class: "diag-ai-body", text: prompt })];
    children.push(
        diagAiFooter(check, prompt, url, repo, { title: `Improve agent readiness: ${check.label || check.id}` }),
    );
    return el("div", { class: "diag-ai" }, children);
}

// Footer under the AI prompt. When a source repo was detected in the page, it
// offers two Copilot actions: open a coding session seeded with the prompt, or
// file an issue and hand it to the Copilot agent. Both round-trip through the
// extension's loopback API, which asks the host chat session to do the work.
function diagAiFooter(check, prompt, url, repo, opts) {
    const foot = el("div", { class: "diag-ai-foot" });
    if (!repo || !repo.owner || !repo.repo) {
        foot.classList.add("diag-ai-foot-empty");
        foot.append(
            el("span", {
                class: "diag-ai-foot-note",
                text: "No source GitHub repo found in this page — copy the prompt above to use it manually.",
            }),
        );
        return foot;
    }
    const slug = `${repo.owner}/${repo.repo}`;
    const title = (opts && opts.title) || `Fix OpenGraph metadata: ${check.id}`;
    const repoTag = el("a", {
        class: "diag-ai-repo",
        href: repo.url || `https://github.com/${slug}`,
        target: "_blank",
        rel: "noreferrer",
        title: `Open ${slug} on GitHub`,
    }, [
        octicon("mark-github", 13, "diag-ai-repo-ico"),
        el("span", { class: "diag-ai-repo-slug", text: slug }),
    ]);

    const openBtn = diagActionButton("Open in Copilot", "copilot", (btn) => {
        copyText(prompt);
        postAction("/api/open-session", { repo: slug, url, prompt, title }, btn, "Opening…", "Session requested");
    });
    openBtn.title = `Copy the prompt and open a Copilot session for ${slug}`;

    const issueBtn = diagActionButton("Create issue", "issue-opened", (btn) => {
        postAction("/api/create-issue", { repo: slug, url, prompt, title }, btn, "Filing…", "Issue requested");
    });
    issueBtn.title = `Open an issue on ${slug} and assign it to Copilot`;

    foot.append(repoTag, el("span", { class: "diag-ai-foot-spacer" }), openBtn, issueBtn);
    return foot;
}

function diagActionButton(label, iconName, onClick) {
    const btn = el("button", { class: "diag-ai-btn", type: "button" });
    btn.append(
        octicon(iconName, 14, "diag-ai-btn-ico"),
        el("span", { class: "diag-ai-btn-label", text: label }),
    );
    btn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (btn.disabled) return;
        onClick(btn);
    });
    return btn;
}

async function postAction(path, payload, btn, busyLabel, doneLabel) {
    const labelEl = btn.querySelector(".diag-ai-btn-label");
    const orig = labelEl ? labelEl.textContent : "";
    const reset = (delay) =>
        setTimeout(() => {
            btn.classList.remove("busy", "done", "error");
            btn.disabled = false;
            if (labelEl) labelEl.textContent = orig;
        }, delay);
    btn.disabled = true;
    btn.classList.add("busy");
    if (labelEl && busyLabel) labelEl.textContent = busyLabel;
    try {
        const res = await fetch(path, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        let ok = res.ok;
        try {
            const data = await res.json();
            if (data && data.ok === false) ok = false;
        } catch {
            /* ignore body parse errors */
        }
        btn.classList.remove("busy");
        btn.classList.add(ok ? "done" : "error");
        if (labelEl) labelEl.textContent = ok ? doneLabel || "Done" : "Failed";
        reset(ok ? 3200 : 2600);
    } catch {
        btn.classList.remove("busy");
        btn.classList.add("error");
        if (labelEl) labelEl.textContent = "Failed";
        reset(2600);
    }
}

function diagDetail(help, ctx) {
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
    if (ctx && ctx.check) {
        detail.appendChild(diagAiPrompt(ctx.check, help, ctx.url, ctx && ctx.repo));
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

function ogDiagItem(c, data) {
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
    details.appendChild(diagDetail(help, { check: c, url: data.requestedUrl, repo: data.repository }));
    return details;
}

function secChevron() {
    return el("span", {
        class: "diag-sec-chevron",
        "aria-hidden": "true",
        html: '<svg width="14" height="14" viewBox="0 0 16 16" fill="none"><path d="M6 4l4 4-4 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    });
}

function diagSectionHead(iconName, title, badge) {
    return el("summary", { class: "diag-sec-head" }, [
        octicon(iconName, 15, "diag-sec-ico"),
        el("span", { class: "diag-sec-title", text: title }),
        badge ? el("span", { class: "diag-sec-badge", text: badge }) : null,
        secChevron(),
    ]);
}

function renderDiagnostics(data) {
    const host = $("#diagnostics");
    const ogSection = el("details", { class: "diag-section", open: "open" }, [
        diagSectionHead("checklist", "Social & OpenGraph metadata"),
        el("div", { class: "diag-list" }, data.diagnostics.map((c) => ogDiagItem(c, data))),
    ]);
    const arSection = el("details", { class: "diag-section", open: "open" }, [
        diagSectionHead("rocket", "Agent readiness", "experimental"),
        el("div", { class: "ar-intro" }, [
            document.createTextNode(
                "Emerging standards that help AI agents discover, read, and act on this site. ",
            ),
            el("a", {
                class: "ar-intro-link",
                href: "https://isitagentready.com/",
                target: "_blank",
                rel: "noreferrer",
                text: "Learn more",
            }),
        ]),
        el("div", { id: "ar-body", class: "ar-body" }, [arLoading()]),
    ]);
    host.replaceChildren(ogSection, arSection);
    refreshAgentReadiness(data);
}

/* ---------------- Agent readiness ---------------- */

const AR_CAT_ICON = {
    discoverability: "telescope",
    content: "book",
    bots: "law",
    protocols: "plug",
    auth: "key",
};

const OGP_AR = "https://isitagentready.com/";

// Client-side guidance for each agent-readiness check id (why / fix / example /
// docs). Kept here so the server probe stays a pure prober.
const AGENT_HELP = {
    robots: {
        why: "robots.txt is the first file agents and crawlers look for. It advertises what they may fetch and where to find your sitemap.",
        fix: "Publish /robots.txt at the site root with at least a default User-agent rule and a Sitemap directive.",
        example: "User-agent: *\nAllow: /\nSitemap: https://example.com/sitemap.xml",
        docs: { href: "https://www.rfc-editor.org/rfc/rfc9309.html", label: "RFC 9309 — Robots Exclusion Protocol" },
    },
    sitemap: {
        why: "An XML sitemap lets agents enumerate your pages instead of guessing links, so they index content completely and efficiently.",
        fix: "Publish a sitemap.xml (or a sitemap index) and reference it from robots.txt with a Sitemap: line.",
        example: '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <url><loc>https://example.com/</loc></url>\n</urlset>',
        docs: { href: "https://www.sitemaps.org/protocol.html", label: "sitemaps.org protocol" },
    },
    "link-headers": {
        why: "Link response headers (RFC 8288) let agents discover related resources — canonical URLs, Markdown alternates, API catalogs — without parsing HTML.",
        fix: 'Emit a Link header on key responses, e.g. an alternate Markdown representation or rel="api-catalog".',
        example: 'Link: </index.md>; rel="alternate"; type="text/markdown"',
        docs: { href: "https://www.rfc-editor.org/rfc/rfc8288.html", label: "RFC 8288 — Web Linking" },
    },
    llms: {
        why: "llms.txt is an emerging convention that gives LLMs a curated, Markdown map of your most important content and docs.",
        fix: "Add /llms.txt (and optionally /llms-full.txt) at the site root: a short H1, a blockquote summary, then curated Markdown links.",
        example: "# Example\n> One-line summary of the site.\n\n## Docs\n- [Getting started](https://example.com/start): quick intro",
        docs: { href: "https://llmstxt.org/", label: "llmstxt.org" },
    },
    markdown: {
        why: "Serving a Markdown representation when an agent sends Accept: text/markdown gives clean, token-efficient content instead of noisy HTML.",
        fix: "Content-negotiate text/markdown for your pages (many frameworks/CDNs support a .md alternate or Cloudflare's Markdown-for-agents).",
        example: "GET /page  Accept: text/markdown  →  200 Content-Type: text/markdown",
        docs: {
            href: "https://developers.cloudflare.com/fundamentals/reference/markdown-for-agents/",
            label: "Cloudflare — Markdown for agents",
        },
    },
    "ai-bots": {
        why: "Explicit rules for AI user-agents (GPTBot, ClaudeBot, Google-Extended, PerplexityBot, …) let you allow or disallow AI training and answering on your terms.",
        fix: "Add per-agent User-agent groups in robots.txt for the AI crawlers you want to allow or block.",
        example: "User-agent: GPTBot\nAllow: /\n\nUser-agent: CCBot\nDisallow: /",
        docs: { href: "https://platform.openai.com/docs/bots", label: "AI crawler user-agents" },
    },
    "content-signals": {
        why: "Cloudflare Content Signals express how your content may be used (search, AI input, AI training) as a machine-readable policy in robots.txt.",
        fix: "Add a Content-Signal policy block to robots.txt declaring your search / ai-input / ai-train preferences.",
        example: "User-agent: *\nContent-Signal: search=yes, ai-train=no\nAllow: /",
        docs: { href: "https://blog.cloudflare.com/content-signals/", label: "Cloudflare — Content Signals" },
    },
    mcp: {
        why: "A Model Context Protocol endpoint lets agents call your site's tools/resources directly instead of scraping.",
        fix: "Expose an MCP server and advertise it (e.g. at /.well-known/mcp) so agents can discover and connect to it.",
        example: '{ "mcpServers": { "example": { "url": "https://example.com/mcp" } } }',
        docs: { href: "https://modelcontextprotocol.io/", label: "modelcontextprotocol.io" },
    },
    a2a: {
        why: "An A2A Agent Card describes an agent's identity, skills, and endpoint so other agents can discover and delegate to it.",
        fix: "Publish an Agent Card JSON at /.well-known/agent-card.json (or /.well-known/agent.json).",
        example: '{ "name": "Example Agent", "url": "https://example.com/a2a", "skills": [] }',
        docs: { href: "https://a2a-protocol.org/", label: "Agent2Agent (A2A) protocol" },
    },
    "agent-skills": {
        why: "A published skills manifest lets agents load reusable, portable skills your site or product exposes.",
        fix: "Publish a skills manifest at a well-known path describing each skill and how to invoke it.",
        example: '{ "skills": [ { "name": "example", "path": "/skills/example" } ] }',
        docs: { href: "https://agentskills.io/", label: "agentskills.io" },
    },
    "ai-plugin": {
        why: "An AI plugin manifest (ai-plugin.json) is a legacy but still-recognized way to describe an API for AI tools to call.",
        fix: "Publish /.well-known/ai-plugin.json pointing to your OpenAPI spec and describing the plugin.",
        example: '{ "schema_version": "v1", "name_for_model": "example", "api": { "url": "https://example.com/openapi.json" } }',
        docs: { href: "https://platform.openai.com/docs/plugins/getting-started", label: "AI plugin manifest" },
    },
    "dns-aid": {
        why: "DNS for AI Discovery (DNS-AID) advertises an agent endpoint via a DNS TXT record, so agents can find you before ever fetching a page.",
        fix: "Add a TXT record (e.g. at _agent.<domain>) describing your agent endpoint and version.",
        example: '_agent.example.com  TXT  "v=aid1; endpoint=https://example.com/agent"',
        docs: { href: "https://datatracker.ietf.org/wg/spawn/about/", label: "IETF SPAWN — agent discovery" },
    },
    "oauth-pr": {
        why: "An OAuth Protected Resource document tells agents which authorization server guards your API and what scopes it needs.",
        fix: "Publish /.well-known/oauth-protected-resource per RFC 9728 pointing at your authorization server.",
        example: '{ "resource": "https://api.example.com", "authorization_servers": ["https://auth.example.com"] }',
        docs: { href: "https://www.rfc-editor.org/rfc/rfc9728.html", label: "RFC 9728" },
    },
    "oauth-as": {
        why: "OAuth Authorization Server metadata lets agents dynamically discover token, authorization, and registration endpoints.",
        fix: "Publish /.well-known/oauth-authorization-server per RFC 8414.",
        example: '{ "issuer": "https://auth.example.com", "token_endpoint": "https://auth.example.com/token" }',
        docs: { href: "https://www.rfc-editor.org/rfc/rfc8414.html", label: "RFC 8414" },
    },
    "api-catalog": {
        why: "An API Catalog lists the APIs you offer and links to their descriptions, so agents can find machine-usable endpoints.",
        fix: "Publish /.well-known/api-catalog (a linkset) per RFC 9727 listing your API description documents.",
        example: '{ "linkset": [ { "anchor": "https://api.example.com", "service-desc": [ { "href": "https://api.example.com/openapi.json" } ] } ] }',
        docs: { href: "https://www.rfc-editor.org/rfc/rfc9727.html", label: "RFC 9727" },
    },
};

function arLoading() {
    return el("div", { class: "ar-loading" }, [
        el("span", { class: "ar-spinner", "aria-hidden": "true" }),
        el("span", { text: "Probing agent-readiness signals…" }),
    ]);
}

function arIcon(status) {
    if (status === "info") {
        const s = el("span", { class: "diag-ico info", "aria-hidden": "true" });
        s.innerHTML = `<svg width="16" height="16" viewBox="0 0 16 16">${OCTICONS.info}</svg>`;
        return s;
    }
    return diagIcon(status === "warn" ? "warn" : "ok");
}

function arLevelText(status) {
    return status === "pass" ? "detected" : status === "warn" ? "recommended" : "emerging";
}

function arRow(c, ar, repo) {
    const kind = c.status === "pass" ? "ok" : c.status === "warn" ? "warn" : "info";
    const textCol = () =>
        el("div", { class: "diag-text" }, [
            el("span", { class: "diag-id", text: c.label }),
            el("span", { class: `diag-level ${kind}`, text: arLevelText(c.status) }),
            c.detail ? el("div", { class: "diag-note", text: c.detail }) : null,
        ]);

    // Detected signals render as plain, non-expandable rows.
    if (c.status === "pass") {
        return el("div", { class: "diag-item" }, [el("div", { class: "diag-row" }, [arIcon(c.status), textCol()])]);
    }

    // Missing / not-yet-detected signals expand to guidance + an AI fix prompt.
    const help = AGENT_HELP[c.id] || { why: c.detail || "", fix: "Add support for this standard to your site." };
    const details = el("details", { class: `diag-item diag-${kind}` });
    details.appendChild(el("summary", { class: "diag-row" }, [arIcon(c.status), textCol(), diagChevron()]));
    details.appendChild(
        arDetail(help, {
            check: { id: c.id, label: c.label, detail: c.detail, level: c.status === "warn" ? "recommended" : "emerging" },
            url: ar.url,
            repo,
        }),
    );
    return details;
}

function arDetail(help, ctx) {
    const detail = el("div", { class: "diag-detail" });
    detail.appendChild(
        el("div", { class: "diag-block" }, [
            el("div", { class: "diag-block-h", text: "Why it matters" }),
            el("p", { class: "diag-block-p", text: help.why }),
        ]),
    );
    detail.appendChild(
        el("div", { class: "diag-block" }, [
            el("div", { class: "diag-block-h", text: "How to add it" }),
            el("p", { class: "diag-block-p", text: help.fix }),
        ]),
    );
    if (help.example) {
        detail.appendChild(
            el("div", { class: "diag-snippet" }, [
                el("code", { text: help.example }),
                copyButton(help.example, "Copy snippet"),
            ]),
        );
    }
    detail.appendChild(agentAiPrompt(ctx.check, help, ctx.url, ctx.repo));
    if (help.docs) {
        const link = el("a", { class: "diag-docs", href: help.docs.href, target: "_blank", rel: "noreferrer" });
        link.append(octicon("link-external", 14, "diag-docs-ico"), document.createTextNode(help.docs.label));
        detail.appendChild(link);
    }
    return detail;
}

function renderAgentReadiness(body, ar, repo) {
    const s = ar.summary || { detected: 0, recommendedMissing: 0, total: 0 };
    const summary = el("div", { class: "ar-summary" }, [
        el("span", { class: "pill ok", text: `${s.detected} detected` }),
        s.recommendedMissing ? el("span", { class: "pill warn", text: `${s.recommendedMissing} recommended missing` }) : null,
        el("span", { class: "ar-summary-total", text: `of ${s.total} checks` }),
    ]);
    const groups = (ar.categories || []).map((cat) =>
        el("div", { class: "ar-group" }, [
            el("div", { class: "ar-group-h" }, [
                octicon(AR_CAT_ICON[cat.id] || "info", 13, "ar-group-ico"),
                el("span", { text: cat.label }),
            ]),
            el("div", { class: "diag-list" }, cat.checks.map((c) => arRow(c, ar, repo))),
        ]),
    );
    body.replaceChildren(summary, ...groups);
}

let arSeq = 0;

async function refreshAgentReadiness(data) {
    const body = $("#ar-body");
    if (!body) return;
    const seq = ++arSeq;
    const targetUrl = data.requestedUrl;
    if (!targetUrl) {
        body.replaceChildren(el("div", { class: "ar-error", text: "No URL to analyze." }));
        return;
    }
    try {
        const res = await fetch("/api/agent-readiness?u=" + encodeURIComponent(targetUrl));
        const ar = await res.json();
        if (seq !== arSeq) return; // a newer load superseded this probe
        if (!res.ok || ar.error) throw new Error(ar.error || `Request failed (${res.status})`);
        renderAgentReadiness(body, ar, data.repository);
    } catch (err) {
        if (seq !== arSeq) return;
        body.replaceChildren(
            el("div", { class: "ar-error" }, [
                el("span", { text: `Couldn't run agent-readiness checks: ${err.message}` }),
            ]),
        );
    }
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

/* Slim top trickle bar (replaces the old "Fetching…" status card). Real
   byte-progress isn't meaningful here — the server fetches the page and returns
   a small JSON blob — so we ease toward a ~90% cap while waiting and snap to
   100% on completion. Visibility (fade in/out) is driven by body.is-busy in CSS;
   this only animates the fill width. */
const progressBar = $("#progress-bar");
let progressTimer = null;
let progressResetTimer = null;
let progressValue = 0;

function setProgressWidth(pct) {
    progressValue = pct;
    progressBar.style.width = pct + "%";
}

function resetProgressWidth() {
    // Snap to 0 without animating, so the next load fills from the left edge.
    progressBar.style.transition = "none";
    setProgressWidth(0);
    void progressBar.offsetWidth; // force reflow before re-enabling transition
    progressBar.style.transition = "";
}

function startProgress() {
    clearInterval(progressTimer);
    clearTimeout(progressResetTimer);
    resetProgressWidth();
    setProgressWidth(10);
    progressTimer = setInterval(() => {
        const remaining = 90 - progressValue;
        if (remaining <= 0.5) return;
        // Decelerating trickle: bigger steps early, smaller near the cap.
        setProgressWidth(progressValue + Math.max(0.5, remaining * 0.12));
    }, 220);
}

function finishProgress() {
    clearInterval(progressTimer);
    clearTimeout(progressResetTimer);
    setProgressWidth(100);
    // After the fill completes and the container fades (body.is-busy removed),
    // snap back to 0 so a subsequent load starts clean.
    progressResetTimer = setTimeout(resetProgressWidth, 450);
}

async function load(rawUrl, opts) {
    const url = withScheme(rawUrl);
    if (!url) return;
    const silent = !!(opts && opts.silent);
    hideImgTip();
    hideCodeCard();
    input.value = url;
    document.body.classList.add("has-data", "is-busy");
    startProgress();
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
        finishProgress();
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

// "I'm feeling lucky" — a rotating set of sites with rich OG metadata. The main
// button previews the current target; the shuffle button retargets to another.
const LUCKY_SITES = [
    "https://aspire.dev",
    "https://github.com",
    "https://microsoft.com",
    "https://astro.build",
    "https://grpc.io",
    "https://www.docker.com",
    "https://www.typescriptlang.org",
    "https://vercel.com",
    "https://nextjs.org",
    "https://developer.mozilla.org",
    "https://stripe.com",
    "https://www.cloudflare.com",
    "https://www.nasa.gov",
    "https://nodejs.org",
];

function luckyHostLabel(url) {
    try {
        return new URL(url).hostname.replace(/^www\./, "");
    } catch {
        return url;
    }
}

function pickLuckySite(exclude) {
    const pool = LUCKY_SITES.filter((s) => s !== exclude);
    const list = pool.length ? pool : LUCKY_SITES;
    return list[Math.floor(Math.random() * list.length)];
}

let luckyTarget = pickLuckySite();

function setLuckyTarget(url) {
    luckyTarget = url;
    const hostEl = $("#lucky-host");
    if (hostEl) hostEl.textContent = luckyHostLabel(url);
    const go = $("#lucky-go");
    if (go) go.setAttribute("title", `Preview ${luckyHostLabel(url)}`);
}

setLuckyTarget(luckyTarget);

const luckyGo = $("#lucky-go");
if (luckyGo) {
    luckyGo.addEventListener("click", () => {
        input.value = luckyTarget;
        load(luckyTarget);
    });
}

const luckyShuffle = $("#lucky-shuffle");
if (luckyShuffle) {
    luckyShuffle.addEventListener("click", () => {
        setLuckyTarget(pickLuckySite(luckyTarget));
        luckyShuffle.classList.remove("spin");
        // reflow so the animation restarts on every click
        void luckyShuffle.offsetWidth;
        luckyShuffle.classList.add("spin");
    });
}

// Empty-state lucky button loads a fresh random site each click.
const luckyEmpty = $("#lucky-empty");
if (luckyEmpty) {
    luckyEmpty.addEventListener("click", () => {
        const url = pickLuckySite();
        input.value = url;
        load(url);
    });
}

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
