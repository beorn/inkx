# Schema.org Structured Data Audit — silvery.dev

**Audited:** 2026-04-01
**Site:** https://silvery.dev
**Generator:** VitePress v1.6.4
**Pages fetched:** 10 (homepage, quick-start, the-silvery-way, api/box, about, components/SelectList, examples/ai-chat, guide/why-silvery, getting-started/migrate-from-ink, reference/packages)

---

## 1. Detection Results

### Schema formats in use

- JSON-LD: present on all pages
- Microdata: none detected
- RDFa: none detected

JSON-LD is the correct format. No migration needed.

### Blocks found per page type

**Homepage (`/`)**

- 1 block: `WebSite`

**All inner pages** (guides, API docs, components, examples, reference — 9/10 pages checked)

- 3 blocks per page: `WebSite` + `BreadcrumbList` + `TechArticle`
- Exception: `/api/box.html` has 4 blocks — adds `SoftwareSourceCode` for the Box component

### Full inventory of block types

| @type | Pages | Notes |
|---|---|---|
| `WebSite` | All pages (10/10) | Repeated on every page — intentional site-wide block |
| `BreadcrumbList` | All inner pages (9/9) | Correctly scoped, not on homepage |
| `TechArticle` | All inner pages (9/9) | Used for all content pages: guides, API, components, examples |
| `SoftwareSourceCode` | `/api/box.html` only | Present on one API page, not on others |

---

## 2. Validation Results

### WebSite block (all pages)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Silvery",
  "url": "https://silvery.dev",
  "description": "React TUI framework for modern terminal apps"
}
```

- `@context` uses `https://schema.org` — PASS
- `@type` valid — PASS
- `url` is absolute — PASS
- Missing `potentialAction` (SearchAction) — INFO (see opportunities)
- Missing `publisher` — INFO

### BreadcrumbList block (inner pages)

Example from `/getting-started/quick-start.html`:

```json
{
  "@context": "https://schema.org",
  "@type": "BreadcrumbList",
  "itemListElement": [
    {"@type": "ListItem", "position": 1, "name": "Home", "item": "https://silvery.dev/"},
    {"@type": "ListItem", "position": 2, "name": "Getting Started", "item": "https://silvery.dev/getting-started"},
    {"@type": "ListItem", "position": 3, "name": "Quick Start", "item": "https://silvery.dev/getting-started/quick-start"}
  ]
}
```

- `@context` uses `https://schema.org` — PASS
- `@type` valid — PASS
- `position` integers present — PASS
- `name` strings present — PASS
- `item` URLs are absolute — PASS
- NOTE: `item` URLs lack `.html` suffix (e.g. `.../quick-start` not `.../quick-start.html`) — this is fine; canonical URLs without extensions are preferred
- BreadcrumbList is absent on the homepage — PASS (correct; homepage is position 1, no breadcrumb needed)

### TechArticle block (inner pages)

Example from `/guide/the-silvery-way.html`:

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "The Silvery Way",
  "description": "React TUI framework for modern terminal apps",
  "url": "https://silvery.dev/guide/the-silvery-way.html",
  "dateModified": "2026-04-01T21:59:20.000Z",
  "author": {"@type": "Person", "name": "Bjørn Stabell"}
}
```

- `@context` uses `https://schema.org` — PASS
- `@type` is valid — PASS
- `headline` present — PASS
- `url` is absolute — PASS
- `dateModified` is ISO 8601 — PASS
- `author` present — PASS
- **FAIL: `description` is the generic site tagline on all pages** — "React TUI framework for modern terminal apps". This should be the per-page description. Only the `/examples/ai-chat.html` and `/about.html` pages have correct page-specific descriptions. The remaining 7 checked pages all carry the same generic description.
- Missing `datePublished` — INFO
- Missing `image` — INFO (affects Article rich result eligibility)
- Missing `publisher` — INFO
- Missing `author.url` or `author.sameAs` — INFO

### SoftwareSourceCode block (`/api/box.html` only)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  "name": "Box",
  "programmingLanguage": "TypeScript",
  "runtimePlatform": "Bun",
  "codeRepository": "https://github.com/beorn/silvery"
}
```

- `@context` uses `https://schema.org` — PASS
- `@type` valid — PASS
- `codeRepository` absolute URL — PASS
- Only present on one of many API reference pages — INCONSISTENCY (see opportunities)
- `programmingLanguage` should ideally be `{"@type": "ComputerLanguage", "name": "TypeScript"}` but the string form is also accepted — PASS

---

## 3. Issues by Priority

### Critical

None.

### High

**H1 — TechArticle `description` is not page-specific on most pages**

All guide, API, component, and reference pages carry the same `description`: "React TUI framework for modern terminal apps". This is the site's meta description, not the page's content description. It undermines the value of TechArticle for indexers and LLMs.

Only `/examples/ai-chat.html` and `/about.html` have correct per-page descriptions. The meta `<description>` tag also carries the generic tagline on most pages (except the two above).

Fix: populate `TechArticle.description` from the page's own first paragraph or lead sentence.

**H2 — No `SoftwareApplication` on the homepage**

The homepage describes a software library with a name, version, license, runtime support, and npm install command. The `SoftwareApplication` type is the correct schema for this and is eligible for rich results in Google Search. None exists.

### Medium

**M1 — `SoftwareSourceCode` only on `/api/box.html`**

The block was added to Box's API page but not to any other API or component pages. Either apply it consistently across all API reference pages or remove it from Box — partial coverage signals an incomplete implementation.

**M2 — `WebSite` missing `potentialAction` (SearchAction)**

The site has a `K` keyboard shortcut for search. A `SearchAction` within `WebSite` would enable a Google sitelinks searchbox for the domain. Silvery's search is client-side (VitePress), but the `SearchAction` target can point to `https://silvery.dev/?search={search_term_string}` and still qualify.

**M3 — `author` block missing identifier**

`author: {"@type": "Person", "name": "Bjørn Stabell"}` has no `url` or `sameAs`. Adding a `sameAs` pointing to GitHub (`https://github.com/beorn`) or a personal site strengthens the entity link for Knowledge Graph association.

**M4 — `TechArticle` missing `datePublished`**

`dateModified` is present but `datePublished` is absent. Both are recommended by Google's Article structured data documentation. They can be equal when the publish date is unknown.

**M5 — Homepage missing `BreadcrumbList`**

The homepage correctly omits breadcrumbs (it is position 1). However, it also has no `WebPage` block. For completeness and LLM discoverability, a `WebPage` or `WebSite` with `mainEntity` pointing to the software would strengthen the homepage's semantic signal.

### Info

**I1 — No `Organization` block**

The site has no `Organization` schema. Adding one on the homepage (or about page) establishes the publisher entity that can be referenced from `TechArticle.publisher`.

**I2 — `og:title` on inner pages uses page-specific titles but `og:description` is generic**

Consistent with the TechArticle issue above — OG metadata suffers the same generic description problem. Not a schema.org issue, but worth fixing alongside H1.

**I3 — `image` missing from `TechArticle`**

Article rich results in Google require an `image` property with specific minimum dimensions (1200×630 px recommended). Without it, the pages are ineligible for the article rich result panel. The og-image.svg (`https://silvery.dev/og-image.svg`) exists but is not referenced in schema blocks.

**I4 — No `FAQPage`**

The about page and why-silvery page contain Q&A-style content that could qualify as FAQ. However: Google restricts FAQ rich results to government and healthcare sites (August 2023). Adding `FAQPage` would not produce rich results on a developer tool site. It is still beneficial for AI/LLM citations (GEO). Not recommended unless GEO is a priority.

---

## 4. Missing Schema Opportunities

### Priority 1 — SoftwareApplication on homepage

**Rationale:** The homepage describes a software product (silvery npm package, v0.10.0, MIT license, runs on Node/Bun/Deno). `SoftwareApplication` is a supported Google rich result type. This is the highest-value missing block.

**Rich result eligibility:** Yes — Google supports SoftwareApplication for app/library listings.

### Priority 2 — Organization block

**Rationale:** Establishes the publisher entity. Referenced by `TechArticle.publisher` and `SoftwareApplication.author`. Needed for complete entity disambiguation.

### Priority 3 — SearchAction on WebSite

**Rationale:** Enables Google sitelinks searchbox. Low implementation cost, direct Google SERP benefit.

### Priority 4 — Consistent per-page TechArticle descriptions

**Rationale:** Not a new schema type — a fix to existing schema. High impact on LLM and search indexer comprehension of individual pages.

### Priority 5 — Consistent SoftwareSourceCode across API pages

**Rationale:** Either apply to all API/component reference pages or remove from Box. Inconsistency is worse than absence.

---

## 5. Recommended JSON-LD Snippets

### Snippet A — SoftwareApplication (add to homepage only)

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Silvery",
  "url": "https://silvery.dev",
  "description": "React renderer for terminal UIs with responsive layouts, scrollable containers, incremental rendering, and 30+ components. Pure TypeScript, runs on Node, Bun, and Deno.",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "macOS, Linux, Windows",
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  },
  "license": "https://opensource.org/licenses/MIT",
  "softwareVersion": "0.10.0",
  "programmingLanguage": "TypeScript",
  "downloadUrl": "https://www.npmjs.com/package/silvery",
  "codeRepository": "https://github.com/beorn/silvery",
  "keywords": "terminal, TUI, React, TypeScript, CLI, flexbox, rendering",
  "author": {
    "@type": "Person",
    "name": "Bjørn Stabell",
    "url": "https://github.com/beorn"
  }
}
```

### Snippet B — Organization (add to homepage and about page)

```json
{
  "@context": "https://schema.org",
  "@type": "Organization",
  "name": "Silvery",
  "url": "https://silvery.dev",
  "logo": "https://silvery.dev/logo.svg",
  "description": "Open-source React TUI framework for building polished terminal applications.",
  "sameAs": [
    "https://github.com/beorn/silvery",
    "https://www.npmjs.com/package/silvery"
  ]
}
```

### Snippet C — SearchAction on WebSite (replace existing WebSite block on homepage)

```json
{
  "@context": "https://schema.org",
  "@type": "WebSite",
  "name": "Silvery",
  "url": "https://silvery.dev",
  "description": "React TUI framework for modern terminal apps",
  "potentialAction": {
    "@type": "SearchAction",
    "target": {
      "@type": "EntryPoint",
      "urlTemplate": "https://silvery.dev/?search={search_term_string}"
    },
    "query-input": "required name=search_term_string"
  }
}
```

### Snippet D — Corrected TechArticle with per-page description and image (template for inner pages)

Replace the existing TechArticle block on each page. The `description`, `url`, `dateModified`, and `headline` values are already page-specific; only `description` needs to be drawn from page content rather than the global tagline.

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Quick Start",
  "description": "Silvery is a React renderer for terminal applications — install with one package and start building with Box, Text, and useInput. Includes responsive layout, native scrolling, and incremental rendering.",
  "url": "https://silvery.dev/getting-started/quick-start.html",
  "datePublished": "2026-03-26T18:25:16.000Z",
  "dateModified": "2026-03-26T18:25:16.000Z",
  "image": "https://silvery.dev/og-image.svg",
  "author": {
    "@type": "Person",
    "name": "Bjørn Stabell",
    "url": "https://github.com/beorn",
    "sameAs": "https://github.com/beorn"
  },
  "publisher": {
    "@type": "Organization",
    "name": "Silvery",
    "url": "https://silvery.dev",
    "logo": {
      "@type": "ImageObject",
      "url": "https://silvery.dev/logo.svg"
    }
  }
}
```

### Snippet E — SoftwareSourceCode template for API/component pages (if applied consistently)

For pages like `/api/box.html`, `/components/SelectList.html`, etc.:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareSourceCode",
  "name": "Box",
  "description": "Core layout primitive for Silvery terminal UIs. Supports flexbox layout, borders, padding, scrolling, and focus scopes.",
  "programmingLanguage": {
    "@type": "ComputerLanguage",
    "name": "TypeScript"
  },
  "runtimePlatform": "Node.js, Bun, Deno",
  "codeRepository": "https://github.com/beorn/silvery",
  "url": "https://silvery.dev/api/box.html",
  "isPartOf": {
    "@type": "SoftwareApplication",
    "name": "Silvery",
    "url": "https://silvery.dev"
  }
}
```

---

## 6. Rich Result Eligibility Summary

| Schema Type | Currently Present | Eligible for Rich Result | Status |
|---|---|---|---|
| WebSite | Yes | Sitelinks search — no, needs SearchAction | Missing SearchAction |
| BreadcrumbList | Yes (inner pages) | Yes — breadcrumbs in SERPs | PASS |
| TechArticle / Article | Yes (inner pages) | Yes — Article rich result (needs image) | Missing image |
| SoftwareApplication | No | Yes — App listing rich result | Not implemented |
| SoftwareSourceCode | Partial (1 page) | No dedicated rich result; aids LLM/entity | Inconsistent |
| Organization | No | No rich result; entity disambiguation | Not implemented |
| FAQPage | No | Restricted to gov/health sites | Not recommended |

### HowTo

HowTo rich results were removed by Google in September 2023. The quick-start and guide pages have step-by-step content that would previously have qualified. Do not add `HowTo` schema — it will not produce rich results and adds dead markup.

---

## 7. Implementation Notes for VitePress

The existing schema is generated via a VitePress theme customization (likely in `.vitepress/theme/` or via a `transformHead` hook). The following changes can be made within that system:

- **H1 fix** (per-page TechArticle description): Pass the page's frontmatter `description` or extract the first paragraph via `transformPageData`. VitePress exposes `pageData.description` in `transformHead`.
- **Snippets A, B, C** (homepage additions): Add conditionally in `transformHead` when `pageData.relativePath === 'index.md'`.
- **Snippet D** (TechArticle publisher + image + datePublished): Extend the existing TechArticle generation in the theme's head transform.
- **Snippet E** (SoftwareSourceCode consistency): Apply to all pages under `/api/` and `/components/` using path prefix checks, or remove from Box to eliminate inconsistency.
