# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Project overview

This repository contains an unofficial Google Chrome Manifest V3 extension that downloads rendered Home Depot Purchase History order-detail pages as individual HTML files. It runs in the user's existing authenticated Chrome session and presents controls and progress in a side panel. No build system is required.

Key files:
- `manifest.json` — extension metadata, version, permissions, and entry points.
- `sidepanel.html` — side-panel interface, instructions, and disclaimer dialogs.
- `sidepanel.css` — layout and styling.
- `sidepanel.js` — order discovery, pagination, filtering, downloads, and UI state.
- `background.js` — extension background/service-worker behavior.
- `README.md` — user-facing documentation.

## Versioning and release dates

1. **Bump the version whenever you make a change to a substantive extension file** (JavaScript, HTML, CSS, manifest, or another file affecting functionality or UI). Use the project's existing version-numbering convention; do not silently reset or skip versions.
2. **Set the release date whenever you bump the version**, using the actual date of the change. Display it beside the version in `YYYY.MM.DD` format.
3. **Keep all occurrences of the version and release date synchronized.** In particular, update:
   - `manifest.json` (`version`; Chrome requires numeric, dot-separated components, e.g. `1.0.0`).
   - The visible version and clickable date in `sidepanel.html` (e.g. `v1.0 2026.10.10`).
   - The date expressed in the **Website compatibility** disclaimer, including its long-form date (e.g. `October 10, 2026`).
   - Any other release-version or release-date references in code, documentation, and release artifacts that are intended to identify the current release.
4. Keep the version number's *display* form consistent with the project's convention even if the manifest uses an additional patch component. Do not change unrelated historical dates, such as individual order dates.
5. Before completing a release, search the repository for the previous version and previous release date to catch stale references.

## Functional invariants

- **Never manufacture Home Depot order-detail URLs.** Extract complete links from the user's Purchase History page and preserve every original query parameter, including `encryptedOrderNumbers` and its encoding.
- **Scan all result pages** in the user's selected date range; don't assume 20 orders per page or a fixed total. Detect successful page transitions and avoid duplicate orders.
- **Capture the rendered DOM**, not the initial `fetch()` response. Home Depot loads order details dynamically.
- Receipt-ready detection must accept either `ORDER #` or `RECEIPT #` for **any order-number format**, verify the displayed order number against the target order, and ensure the expected totals have rendered before saving. Do not reintroduce a special case based on an order-number prefix.
- Preserve the filename convention: `YYYY-MM-DD_homedepot_order_NUMBER.html`, based on the date and order number provided by the original URL.
- Download destinations are **relative to Chrome's configured Downloads directory**. Optional grouping subfolders sanitize characters outside `[a-zA-Z0-9._-]` to `_` and handle missing or placeholder grouping values intentionally.
- Filtering uses case-insensitive substring matching; multiple enabled filters are combined with **AND**. Filters and grouping rely on the relevant columns being available in Purchase History; report missing fields instead of silently producing incorrect results.
- User preferences (including filters, destination, grouping, and collapsed sections) should persist through `chrome.storage.local`.
- Keep meaningful progress, errors, and cancellation behavior visible in the side panel. Do not report success before a receipt is actually saved.

## Development and verification

- Keep the implementation dependency-free unless a new dependency is clearly justified; this is an unpacked extension, not a Playwright automation.
- Keep permissions and host access limited to what the extension needs. Do not introduce external data transmission, analytics, or collection of Home Depot credentials.
- Never commit real order URLs, encrypted query parameters, receipts, customer details, payment information, or authentication data. Use fabricated examples in tests and documentation.
- After edits, validate `manifest.json` as JSON and check JavaScript syntax. Reload the extension at `chrome://extensions` for manual browser testing.
- Test the important user flows when relevant: missing Purchase History tab; pagination with more than one page; active filters; grouping folders; standard receipt and `WB`/online-style orders; download progress and failures; saved preferences; dialog controls.
- Home Depot's site can change without notice. Do not claim a selector or workflow works on the live site unless actually verified; document untested assumptions and limitations.
- Update `README.md` whenever user-visible behavior, required permissions, installation steps, or known limitations change.

## Repository conventions

- Use clear, minimal changes and preserve established labels and layout unless the requested work calls for a UI change.
- Keep the project explicitly **unofficial** and unaffiliated with Home Depot.
- The repository uses the MIT License; preserve its copyright and license notice.
