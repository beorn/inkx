# Full SEO Audit Report: beorn.codes

**Audit Date:** 2026-04-02
**Auditor:** Claude (Automated)
**Tracking Bead:** km-market.beorn-seo

## Site Overview

| Property | Value |
|----------|-------|
| Domain | beorn.codes |
| Host | GitHub Pages (via Fastly CDN) |
| Protocol | HTTPS |
| Root page | Static HTML portfolio |
| Subpaths | /flexily/ (VitePress), /loggily/ (VitePress), /mdspec/ (VitePress) |
| Sitemap | Sitemap index at /sitemap.xml referencing 3 child sitemaps |
| Total indexable URLs | ~45 (1 root + 14 flexily + 21 loggily + 10 mdspec) |

---

## 1. Technical SEO — Score: 52/100

### 1.1 robots.txt
- **Present:** Yes
- **Content:** `User-agent: * / Allow: / / Sitemap: https://beorn.codes/sitemap.xml`
- **Issues:** None. Simple and correct.

### 1.2 Sitemap

**CRITICAL BUG: All three sub-sitemaps have broken URLs.**

The sitemap index at `/sitemap.xml` correctly references:
- `https://beorn.codes/flexily/sitemap.xml`
- `https://beorn.codes/loggily/sitemap.xml`
- `https://beorn.codes/mdspec/sitemap.xml`

However, each child sitemap lists URLs **without the subpath prefix**. For example, the flexily sitemap contains:
- `https://beorn.codes/guide/getting-started.html` (404)
- `https://beorn.codes/api/reference.html` (404)
- `https://beorn.codes/CONTRIBUTING.html` (404)

The correct URLs should be:
- `https://beorn.codes/flexily/guide/getting-started.html` (200)
- `https://beorn.codes/flexily/api/reference.html` (200)
- `https://beorn.codes/flexily/CONTRIBUTING.html` (200)

The same issue affects all three sitemaps. **Every single URL in all three sitemaps is a 404.** This means search engines that rely on sitemaps for discovery are being sent to dead URLs for all ~45 documentation pages.

Only the home page entry for each subpath is approximately correct (e.g., `https://beorn.codes/flexily` without trailing slash resolves, though canonicals use trailing slash).

Additionally, the **root homepage (beorn.codes/)** is not included in any sitemap.

### 1.3 Canonical Tags
- **Root page:** No canonical tag present
- **Flexily pages:** Present and correct (e.g., `https://beorn.codes/flexily/guide/getting-started.html`)
- **Loggily pages:** Present and correct
- **mdspec pages:** Present and correct

### 1.4 URL Structure
- Clean, hierarchical URLs: `/flexily/guide/getting-started.html`
- `.html` extensions present (VitePress default with `cleanUrls: false`)
- Consistent use of lowercase

### 1.5 HTTPS
- Full HTTPS via GitHub Pages. No mixed content issues.

### 1.6 Mobile Signals
- Viewport meta tag present on all pages
- VitePress pages include responsive design
- Root page has responsive CSS with `@media (max-width: 640px)` breakpoint

### 1.7 Page Speed Headers
- GitHub Pages serves with `cache-control: max-age=600` (10 minutes)
- Fastly CDN caching in front
- No `X-Robots-Tag` headers (fine for GitHub Pages)

---

## 2. Content Quality & E-E-A-T — Score: 58/100

### 2.1 Title Tags

**Root page:**
- Title: "Bjorn Stabell" -- minimal, no keywords

**Flexily pages:**
- Home: "Flexily" -- unique but generic
- Inner: "Getting Started with Flexily | Flexily", "Flexily Performance | Flexily" -- good pattern with page-specific prefix

**Loggily pages:**
- Home: "Loggily" -- unique but generic
- Inner: "The Guide | Loggily", "API Reference | Loggily" -- good pattern

**mdspec pages:**
- Home: "mdspec" -- unique but generic
- Inner: "Getting Started | mdspec", "CLI | mdspec" -- good pattern

**Issues:**
- Subpath home titles lack descriptive keywords (e.g., "Flexily" should be "Flexily - Pure JavaScript Flexbox Layout Engine")
- Root title lacks professional context

### 2.2 Meta Descriptions

**ISSUE: Generic/duplicate meta descriptions across all pages within each subpath.**

| Subpath | Description (same on ALL pages) |
|---------|------|
| Root | "Bjorn Stabell - serial entrepreneur and technologist..." (unique, good) |
| Flexily | "Pure JavaScript Flexbox Layout Engine -- Yoga-compatible API, faster, smaller, no WASM" (same on all 14 pages) |
| Loggily | "Clarity without the clutter. Ergonomic unified logs, spans, and debugs for modern TypeScript." (same on all 21 pages) |
| mdspec | "Write tests in markdown. Run them as code." (same on all 10 pages) |

This is the standard VitePress behavior when `description` is set globally but not overridden per-page via frontmatter.

### 2.3 E-E-A-T Signals

**Experience/Expertise:**
- Root page establishes strong E-E-A-T: co-founder of App Annie (data.ai), Happylatte, Exoweb
- Links to GitHub, LinkedIn, X profiles
- Projects section demonstrates deep technical expertise

**Authoritativeness:**
- Missing author attribution on VitePress documentation pages
- No structured Person/Organization schema connecting the root to subpaths
- Footer attribution exists on loggily and mdspec ("Built by Bjorn Stabell") but not prominently

**Trustworthiness:**
- GitHub Pages origin is visible (professional, standard for OSS)
- Cloudflare analytics beacon present (not an issue)

### 2.4 Content Depth
- Root page: Good depth -- comprehensive portfolio with about section, companies, projects
- Flexily: 14 pages covering getting started, algorithm, performance, migration, API reference -- excellent depth
- Loggily: 21 pages covering guide, API, migration from debug/pino/winston -- excellent depth
- mdspec: 10 pages covering guide, reference, pattern matching -- good depth

### 2.5 Heading Hierarchy
- Root: Single `<h1>` ("Bjorn Stabell"), no `<h2>` headings -- flat structure
- VitePress pages: Proper `<h1>` with `<h2>` subheadings via markdown

---

## 3. On-Page SEO — Score: 48/100

### 3.1 OG Tags

**Root page:** No OG tags at all. Missing:
- `og:title`
- `og:description`
- `og:image`
- `og:url`
- `og:type`
- `og:site_name`
- `twitter:card`

**Flexily:** Has OG tags including og:image pointing to `/flexily/og-image.svg` (200 OK). However:
- og:description is generic across all pages ("High-performance flexbox layout engine")
- og:type is "website" on all pages (inner pages should be "article")
- og:image is an SVG -- many social platforms don't render SVG previews

**Loggily:** Has basic OG tags but:
- No og:image on any page
- og:description is generic across all pages ("Structured logging for TypeScript")
- og:type is "website" on all pages

**mdspec:** Has basic OG tags but:
- No og:image on any page
- og:site_name says "mdtest" (wrong -- should be "mdspec")
- og:description is generic across all pages ("Markdown-driven test runner")
- og:type is "website" on all pages

### 3.2 Twitter Card Tags

All VitePress subpaths have `twitter:card: summary`. None have:
- `twitter:site`
- `twitter:creator`
- `twitter:image`

Root page has no Twitter card tags at all.

### 3.3 Internal Linking
- Root page links to all subpath homepages and external project pages -- good
- VitePress sidebar navigation provides strong internal linking within each subpath
- No cross-linking between subpaths (e.g., Flexily docs don't link to Loggily or vice versa)
- No breadcrumb navigation on Loggily or mdspec pages (Flexily has breadcrumb schema)

---

## 4. Schema / Structured Data — Score: 42/100

### 4.1 Current Schema

**Root page:** No structured data at all.

**Flexily homepage:**
```json
{"@type": "WebSite", "name": "Flexily", "url": "https://beorn.codes/flexily", "description": "High-performance flexbox layout engine"}
```

**Flexily inner pages:** WebSite schema (same as homepage) + BreadcrumbList schema. Good.

**Loggily homepage:**
```json
{"@type": "WebSite", "name": "Loggily", "url": "https://beorn.codes/loggily", "description": "Structured logging for TypeScript"}
```

**Loggily inner pages:** WebSite schema only. No BreadcrumbList.

**mdspec homepage:**
```json
{"@type": "WebSite", "name": "mdtest", "url": "https://beorn.codes/mdspec", "description": "Markdown-driven test runner"}
```
**BUG:** Name says "mdtest" instead of "mdspec".

**mdspec inner pages:** WebSite schema only (with same "mdtest" bug). No BreadcrumbList.

### 4.2 Missing Schema Opportunities

- **Root page:** Should have `Person` or `ProfilePage` schema with `sameAs` links to GitHub/LinkedIn/X
- **All subpaths:** Should have `SoftwareApplication` schema (name, version, programmingLanguage, operatingSystem, applicationCategory, offers: {price: "0"})
- **Inner documentation pages:** Should use `TechArticle` instead of repeating `WebSite` schema
- **No author information** in any schema (`author` with URL linking back to root page)

---

## 5. Performance — Score: 78/100

### 5.1 Expected Core Web Vitals

**Root page:**
- Single static HTML file, ~22KB total
- Inlines all CSS (no external stylesheet)
- Single external resource: Google Fonts + Cloudflare beacon
- Expected LCP: Excellent (<1s)
- Expected CLS: 0 (no dynamic content)
- Expected INP: N/A (minimal interactivity)

**VitePress pages:**
- SSG-rendered HTML with JS hydration
- Font preloading (Inter, WOFF2)
- Module preloads for theme and framework chunks
- Expected LCP: Good (<2s with CDN)
- Expected CLS: Near 0 (SSG content in place before hydration)
- Expected INP: Good (search is only interactive element)

### 5.2 Resource Optimization
- Google Fonts loaded with `display=swap` -- good
- Font preconnect hints present on root page
- VitePress uses modulepreload for critical JS -- good
- No image optimization needed (minimal images)

### 5.3 Concerns
- GitHub Pages max-age of 600s is low for static assets
- No service worker or offline capability
- Cloudflare beacon is render-blocking on root (uses `defer` on VitePress pages)

---

## 6. AI Search Readiness (GEO) — Score: 25/100

### 6.1 llms.txt
- **Root:** 404 -- no llms.txt
- **Flexily:** 200 -- has llms.txt
- **Loggily:** 404 -- no llms.txt
- **mdspec:** 404 -- no llms.txt

### 6.2 AI Crawler Access
- robots.txt allows all crawlers (no specific AI crawler blocks)
- No `X-Robots-Tag` blocking AI bots
- Good: content is accessible

### 6.3 Citability
- No FAQ schema that AI systems commonly extract
- No "about" or "author" structured data for attribution
- Content is well-structured with clear headings -- good for extraction
- Code examples are in proper code blocks -- good for AI citation

### 6.4 Content Structure for AI
- Documentation is well-organized by topic
- Clear API references with function signatures
- Comparison/migration guides are highly citable content
- Missing: FAQ pages, glossary pages, "how it works" summary pages

---

## 7. Images & Social Sharing — Score: 30/100

### 7.1 OG Images
- **Root:** No OG image
- **Flexily:** og:image set to `/flexily/og-image.svg` -- SVG format is problematic (many platforms don't render SVG previews; recommended: PNG 1200x630)
- **Loggily:** No OG image
- **mdspec:** No OG image

### 7.2 Favicon
- Root: No favicon tag
- Flexily: `<link rel="icon" type="image/svg+xml" href="/flexily/logo.svg">`
- Loggily: `<link rel="icon" type="image/svg+xml" href="/loggily/logo.svg">`
- mdspec: `<link rel="icon" type="image/svg+xml" href="/mdspec/favicon.svg">`

### 7.3 Logo Images
- VitePress navbar logos have empty `alt` attributes (`alt=""`)
- Should have meaningful alt text for accessibility and SEO

---

## Scoring Summary

| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Technical SEO | 22% | 52 | 11.4 |
| Content Quality & E-E-A-T | 23% | 58 | 13.3 |
| On-Page SEO | 20% | 48 | 9.6 |
| Schema / Structured Data | 10% | 42 | 4.2 |
| Performance | 10% | 78 | 7.8 |
| AI Search Readiness | 10% | 25 | 2.5 |
| Images & Social Sharing | 5% | 30 | 1.5 |
| **Overall** | **100%** | | **50.3** |

---

## Critical Issues (Blocking)

1. **All sitemap URLs are 404s** -- VitePress base path not applied to sitemap generation. All ~45 documentation page URLs in all 3 sitemaps return 404. Search engines following the sitemap find nothing.

2. **Root page has zero SEO metadata** -- no canonical, no OG tags, no Twitter cards, no structured data, no favicon. The root page is invisible to social sharing and has no schema for search engines.

3. **mdspec schema/OG uses wrong name "mdtest"** -- the package was presumably renamed from mdtest to mdspec, but the VitePress config still references the old name in `site_name`, WebSite schema `name`, and OG descriptions.

## High-Impact Issues

4. **Duplicate meta descriptions** -- every page within each subpath shares the same description. VitePress frontmatter `description` overrides are needed per page.

5. **No OG images on loggily or mdspec** -- shared links to these docs will have no visual preview on social platforms.

6. **Flexily OG image is SVG** -- Twitter, Slack, Discord, and many other platforms don't render SVG. Should be PNG 1200x630.

7. **No schema on root page** -- missing Person/ProfilePage schema with sameAs links.

8. **No llms.txt on root, loggily, or mdspec** -- AI search engines can't discover a machine-readable summary.

9. **Loggily and mdspec lack breadcrumb schema** -- Flexily has it but the other two don't.
