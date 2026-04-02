# Sitemap Audit: silvery.dev

Audit date: 2026-04-01
Sitemap: https://silvery.dev/sitemap.xml
robots.txt reference: confirmed

---

## Summary

- Total URLs in sitemap: 145 (not 128 as previously noted — recount the source)
- All 145 URLs return HTTP 200
- No deprecated tags (priority, changefreq) — clean
- No HTTP-only URLs, no www-prefixed URLs
- 2 linked pages missing from sitemap
- 9 pages with questionable sitemap inclusion (internal docs, README files)
- 2 structural namespace problems: guide/ vs guides/ collision, reference/theme.html vs reference/theming.html duplicate
- lastmod: real variation across 11 dates — legitimate, not fabricated
- 4 extra namespaces declared but unused

---

## Validation Checks

| Check | Result | Notes |
|-------|--------|-------|
| XML declaration present | PASS | `<?xml version="1.0" encoding="UTF-8"?>` |
| Standard sitemap namespace | PASS | `xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"` |
| Unused extra namespaces | INFO | 4 extra: news, xhtml, image, video — none used |
| URL count under 50k limit | PASS | 145 URLs |
| All URLs return HTTP 200 | PASS | All 145 checked, no 4xx/5xx/301 |
| All URLs use HTTPS | PASS | No http:// found |
| All URLs use non-www | PASS | No www. found |
| changefreq tags present | PASS | None — correct, Google ignores these |
| priority tags present | PASS | None — correct, Google ignores these |
| lastmod present on all URLs | PASS | 145/145 have lastmod |
| lastmod dates look real | PASS | 11 distinct dates, range Mar 10 – Apr 1 |
| Sitemap split/index needed | PASS | 145 URLs, single file is appropriate |

---

## URL Count Discrepancy

The sitemap contains **145 `<url>` entries**, not 128. Verify whether the sitemap generator has been updated since the 128 figure was recorded, or whether the source used a different method to count (e.g. excluding section indexes).

---

## Missing Pages: Linked But Not in Sitemap

These pages return HTTP 200 and are linked from the homepage/navigation but absent from the sitemap. Googlebot can reach them via links, but they receive no crawl signal boost from the sitemap.

```
https://silvery.dev/llms.txt
https://silvery.dev/llms-full.txt
```

Note: `.txt` files are not standard sitemap inclusions (sitemaps conventionally list HTML pages), but if these are meaningful landing destinations for LLM crawlers or users, excluding them is a deliberate choice that is fine to keep.

---

## Extra Pages: Questionable Sitemap Inclusions

These pages are in the sitemap but may not be appropriate for Google indexing. All return 200 — the question is intentionality.

**README page**

```
https://silvery.dev/components/README.html
```

A rendered GitHub-style README auto-published by VitePress. Likely thin (730 words of navigation boilerplate). Consider adding `noindex` or removing from sitemap if it is just a table of contents that duplicates the `/components/` section listing.

**Internal design documents (`/design/*`)**

These 5 pages describe architecture and implementation decisions. They are substantive (961–2892 words), but their audience is contributors and library authors, not end users searching for a TUI framework. They are currently undiscoverable via site navigation (no `getting-started/`, `guide/`, or `design/` index pages exist — all 404). They are effectively orphaned.

```
https://silvery.dev/design/app-composition.html        (2443 words)
https://silvery.dev/design/dynamic-scrollback.html     (2892 words)
https://silvery.dev/design/plugin-architecture.html    (961 words)
https://silvery.dev/design/terminal-support-strategy.html (2036 words)
https://silvery.dev/design/xterm-unification.html      (1527 words)
```

Recommendation: either add a `/design/` index page and link these from navigation, or add `noindex` and remove from sitemap. Orphaned pages with no inbound internal links provide weak crawl signals regardless.

**Potentially internal guide**

```
https://silvery.dev/guide/textarea-design.html         (3359 words)
```

The name suggests an internal design note rather than a user guide. If it is user-facing documentation, rename the slug to something like `/guide/text-input-internals.html` or move it to `/design/`. If it is internal only, add `noindex`.

**Showcase inventory**

```
https://silvery.dev/showcase-inventory.html            (2299 words)
```

Sounds like a staging or administrative page. Verify whether this is intended to be indexed. If it is a public showcase directory, rename the slug to `/showcase/` or `/showcase/index.html` and add it to the navigation.

**Reference internal page**

```
https://silvery.dev/reference/robust-ops.html
```

The slug `robust-ops` is opaque. Check whether this is draft documentation or an intentional user-facing reference page.

---

## Structural Issues

### guide/ vs guides/ namespace collision

The sitemap contains two parallel namespaces for guides:

- `/guide/*` — 27 pages (the primary namespace)
- `/guides/*` — 4 pages

The 4 `/guides/*` pages:
```
https://silvery.dev/guides/components.html
https://silvery.dev/guides/state-management.html
https://silvery.dev/guides/terminal-apps.html
https://silvery.dev/guides/theming.html
```

Both `/guide/theming.html` and `/guides/theming.html` return HTTP 200. This creates a duplicate content risk for `theming`. Googlebot will choose one canonical URL — without an explicit canonical tag, the choice is unpredictable.

Recommendation: consolidate to `/guide/*`. Redirect the 4 `/guides/*` URLs to their `/guide/*` equivalents (or to the closest existing page if no 1:1 match exists). Add canonical tags if redirects are not immediately possible.

### reference/theme.html vs reference/theming.html

Both pages return HTTP 200:
```
https://silvery.dev/reference/theme.html
https://silvery.dev/reference/theming.html
```

Without inspecting content, these may cover different scopes (one may be the theme data structure, one the API for applying themes). If there is meaningful content separation, the slugs are fine but the page titles should make the distinction clear. If they substantially overlap, consolidate and redirect.

### Missing section index pages

These section directories return 404, meaning there is no browsable entry point for these sections:
```
404 https://silvery.dev/getting-started/
404 https://silvery.dev/guide/
404 https://silvery.dev/guides/
404 https://silvery.dev/reference/
404 https://silvery.dev/design/
404 https://silvery.dev/components/
```

Only `/api/` and `/examples/` have index pages in the sitemap. This is a VitePress behavior (no auto-generated index pages for sections without an `index.md`). Not a crawl blocker, but adding index pages for at least the primary sections (`/guide/`, `/reference/`, `/getting-started/`) would improve site structure and provide better crawl entry points.

---

## lastmod Analysis

lastmod dates are real and varied — this is correct behavior.

- 11 distinct calendar dates across 145 URLs
- Date range: 2026-03-10 to 2026-04-01
- Largest cluster: 57 URLs all stamped 2026-03-25 (likely a bulk edit or site restructure day)

The 2026-03-25 cluster (57 URLs) warrants a check: if those pages were not actually all modified on the same day, the dates may reflect a git commit or deploy event rather than per-file modification times. VitePress derives lastmod from git commit timestamps — if 57 files were touched in a single reorganization commit, this is accurate. If they were untouched files swept up in a rebase or merge, the dates are inflated. Not critical, but worth verifying.

---

## Unused XML Namespaces

The sitemap declares 4 extra namespaces that have no corresponding tags:

```xml
xmlns:news="http://www.google.com/schemas/sitemap-news/0.9"
xmlns:xhtml="http://www.w3.org/1999/xhtml"
xmlns:image="http://www.google.com/schemas/sitemap-image/1.1"
xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"
```

These are harmless — Google ignores unknown namespaces with no corresponding tags. They are likely injected by the VitePress sitemap plugin's default template. No action required, but they can be removed to reduce file size and clutter.

---

## Recommended Priority Actions

High priority:

1. Resolve the `/guide/` vs `/guides/` namespace collision. Redirect the 4 `/guides/*` pages to `/guide/*` equivalents and remove the `/guides/*` entries from the sitemap.
2. Decide on the 5 `/design/*` orphan pages: either add a `/design/` index and wire them into navigation, or add `noindex` meta tags and remove them from the sitemap.
3. Investigate `/guide/theming.html` vs `/guides/theming.html` — these are the same topic under two URLs and create a duplicate content signal.

Medium priority:

4. Add `noindex` or remove from sitemap: `/components/README.html` (730-word boilerplate) and `/showcase-inventory.html` (verify whether this is user-facing).
5. Clarify `/reference/theme.html` vs `/reference/theming.html` — ensure distinct content or consolidate.
6. Add `llms.txt` and `llms-full.txt` to sitemap if they are intended to be discovered (optional, non-standard).

Low priority:

7. Remove unused namespace declarations from sitemap XML.
8. Add section index pages for `/guide/`, `/reference/`, and `/getting-started/` to improve internal link structure.
9. Investigate `/reference/robust-ops.html` — confirm it is intentional user-facing content.
