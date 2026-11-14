// Ported from src/frontend/src/components/api-reference/MemberOverviewList.astro (plain ES module, loaded unbundled by scripts/client/api/index.js).
// The member name is the real, focusable link (see the member-overview-list partial). This makes the rest of the row
// clickable too, without putting an ARIA "row" role on an <a> or nesting the return-type link inside another link.

/** Installs the document click handler once (called by index.js). */
export function initializeMemberOverviewRows() {
    document.addEventListener('click', (e) => {
        const target = e.target;
        if (target.closest('a, button'))
            return;
        const row = target.closest('[data-member-href]');
        if (!row)
            return;
        const href = row.dataset.memberHref;
        if (href)
            window.location.href = href;
    });
}
