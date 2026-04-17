# SEO Audit Report: termless.dev

**Date:** 2026-04-02
**Site:** https://termless.dev
**Generator:** VitePress v1.6.4 + @bearly/vitepress-enrich
**Hosting:** GitHub Pages (via Fastly CDN)
**Pages audited:** 48 (47 in sitemap + homepage)

---

## Overall Score: 62/100

| Dimension | Weight | Score | Weighted |
|---|---|---|---|
| Technical SEO | 22% | 78 | 17.2 |
| Content Quality | 23% | 52 | 12.0 |
| On-Page SEO | 20% | 45 | 9.0 |
| Schema / Structured Data | 10% | 65 | 6.5 |
| Performance | 10% | 90 | 9.0 |
| AI Search Readiness | 10% | 82 | 8.2 |
| Images / Social | 5% | 30 | 1.5 |
| **Total** | **100%** | | **63.4** |

---

## 1. Technical SEO (78/100)

### Strengths
- **robots.txt**: Present and correct. `Allow: /` with sitemap reference.
- **Sitemap**: Valid XML sitemap at `/sitemap.xml` with all 47 pages. All URLs return 200.
- **Canonical tags**: Present on every page, all matching the current URL correctly.
- **HTTPS**: Enforced. Both `http://` and `http://www.` redirect to `https://termless.dev/` with 301.
- **URL structure**: Clean, human-readable paths. Logical hierarchy (`/guide/`, `/api/`, `/matchers/`, `/advanced/`).
- **Mobile signals**: Viewport meta tag present on all pages. Responsive VitePress layout.
- **Language**: `lang="en-US"` declared on `<html>`.
- **JS rendering**: VitePress generates SSR HTML (content is in the source), so search engines get full content without JS execution.

### Issues
- **No security headers**: GitHub Pages provides none of the recommended headers:
  - Missing: `X-Content-Type-Options`, `X-Frame-Options`, `Content-Security-Policy`, `Strict-Transport-Security`, `Referrer-Policy`, `Permissions-Policy`
  - Note: This is a GitHub Pages limitation. Headers can only be added via Cloudflare or a different host.
- **Sitemap `lastmod` dates**: All 47 pages share the exact same `lastmod` (2026-04-01T18:08:05.000Z). This is the build timestamp, not the actual content modification date. Google ignores uniform `lastmod` values.
- **No `changefreq` or `priority`** in sitemap (minor -- Google ignores these anyway).

---

## 2. Content Quality (52/100)

### Strengths
- **Homepage**: Strong hero copy with clear value proposition ("Like Playwright, but for terminals"). 6 feature cards with substantive descriptions (~1,409 words total with code examples).
- **Guide pages**: Solid depth. Writing Tests (1,563 words), Backends (1,763 words), Best Practices (1,087 words), Recipes (1,203 words).
- **API reference**: Terminal API page is comprehensive (2,278 words). Backend API (707 words) and Cell API (486 words) are adequate.
- **Comparison page**: 694 words comparing Termless to alternatives -- good for search intent.
- **FAQ page**: 809 words covering common questions.
- **Contributing guide**: Detailed (2,518 words) -- signals healthy open-source project.

### Issues
- **10 pages have bare "Termless" title** (no page-specific title):
  - `toBeBold`, `toBeItalic`, `toContainText`, `toHaveBg`, `toHaveCursorAt`, `toHaveFg`, `toHaveText`, `toHaveTitle`, `toMatchLines`, `toMatchTerminalSnapshot`
  - These appear as just "Termless" in Google results instead of e.g. "toBeBold | Termless"
- **21 pages share the identical meta description**: "Headless terminal testing -- like Playwright, but for terminal apps. Write tests once, run against any backend." All guide, API, advanced, and why pages use this generic description instead of page-specific ones.
- **26 matcher pages are thin content** (119-330 words each). While individually valid as reference pages, they lack:
  - Cross-references to related matchers
  - "See also" sections
  - Real-world usage context beyond the API signature
- **Heading hierarchy is clean**: Every page has exactly one `<h1>` with proper content. The sidebar `<h2>` elements are navigation, not content headings (acceptable in VitePress).

### E-E-A-T Signals
- **Experience**: Code examples demonstrate deep terminal knowledge.
- **Expertise**: Author (Bjorn Stabell) is named but no bio, credentials, or links.
- **Authoritativeness**: GitHub link present. npm link present. No external testimonials, adoption numbers, or community signals on the site.
- **Trust**: Open-source, CONTRIBUTING guide, clear documentation. Missing: no privacy policy, no license page (though likely in repo).

---

## 3. On-Page SEO (45/100)

### Title Tags
- **37 of 48 pages have unique, descriptive titles** -- good.
- **10 matcher pages have bare "Termless" title** -- critical for those pages' search visibility.
- **Homepage title is just "Termless"** -- should include tagline for search context (e.g., "Termless -- Headless Terminal Testing Framework").
- All non-bare titles follow the pattern "Page Title | Termless" -- consistent and good.

### Meta Descriptions
- **Only 27 of 48 pages have unique meta descriptions** (the matcher pages each have their own, the matchers index has its own).
- **21 pages share the same generic description** -- this means Google will likely auto-generate snippets for those pages, which may or may not be better.

### OG Descriptions
- **Same problem**: 21 pages use "Headless terminal testing for every backend" as OG description. The matcher pages use their specific assertion descriptions.

### Internal Linking
- **Strong**: Every page has 60-88 internal links (sidebar navigation provides consistent cross-linking).
- **Homepage has 20 internal links** -- the hero and feature cards could link to more guide pages.
- Missing opportunities: No "related matchers" links between matcher pages. No "next/previous" navigation within the guide.

---

## 4. Schema / Structured Data (65/100)

### Present Schemas
Every page has 3 JSON-LD blocks (generated by @bearly/vitepress-enrich):

1. **WebSite** (all pages): Name, URL, description. Correct but minimal -- missing `potentialAction` for sitelinks searchbox.
2. **BreadcrumbList** (all non-homepage pages): Proper hierarchy (Home > Section > Page). However:
   - **89 BreadcrumbList item URLs lack `.html` extension** (e.g., `https://termless.dev/api/backend` instead of `https://termless.dev/api/backend.html`). These intermediate URLs return 301 redirects, not the canonical URL. Google may flag this as inconsistent.
3. **TechArticle** (all non-homepage pages): Headline, description, URL, dateModified, author.

### Homepage-only Schema
- **WebSite only** -- no `SoftwareSourceCode` or `SoftwareApplication` schema despite being a software product page. This is a missed opportunity for rich results.

### Issues Found Across All TechArticle Schemas

| Issue | Affected Pages | Severity |
|---|---|---|
| Missing `datePublished` | All 47 | Medium |
| Missing `image` property | All 47 | Medium |
| Missing author `url` | All 47 | High |
| Missing author `sameAs` | All 47 | Medium |
| Generic `description` (not page-specific) | 21 of 47 | High |
| `og:type` is "website" for all pages | All 48 | Low (should be "article" for non-homepage) |

### Missing Schema Opportunities
- **FAQPage** on `/guide/faq.html` -- would enable FAQ rich results in Google.
- **SoftwareSourceCode** on homepage -- would help Google understand this is a software project.
- **HowTo** on Getting Started / Writing Tests pages -- step-by-step content that qualifies.
- **ItemList** on Matcher Reference index page -- the index of all matchers.

---

## 5. Performance (90/100)

### Expected Core Web Vitals (Static VitePress on GitHub Pages/Fastly CDN)

| Metric | Expected | Assessment |
|---|---|---|
| **LCP** | < 1.5s | Excellent. Pre-loaded CSS, font preloading (Inter woff2), SSR HTML |
| **INP** | < 100ms | Excellent. Minimal JavaScript interaction (search, theme toggle) |
| **CLS** | < 0.05 | Good. Font preloading prevents layout shift. VitePress hydration is stable |

### Strengths
- **Font preloading**: `<link rel="preload" href="...inter-roman-latin...woff2" as="font">` -- prevents FOIT/FOUT.
- **CSS preload**: Both main style and icon CSS preloaded.
- **Module preloading**: Theme and framework JS chunks pre-loaded.
- **Fastly CDN**: GitHub Pages uses Fastly with `cache-control: max-age=600`. Good caching.
- **Cloudflare Analytics**: Lightweight beacon script (`beacon.min.js`), deferred loading.
- **No heavy dependencies**: No images (except SVG logo), no video, no iframes.

### Minor Issues
- **No explicit `fetchpriority="high"`** on the logo/hero elements.
- **`max-age=600` (10 min)** is short for static assets. VitePress uses content-hashed filenames for JS/CSS, so longer cache would be safe for those.

---

## 6. AI Search Readiness / GEO (82/100)

### Strengths
- **llms.txt**: Present and well-structured. Table of contents with descriptions for all pages. Follows the llms.txt specification.
- **llms-full.txt**: Present (219KB, 5,925 lines). Contains full documentation bundle with all page content concatenated. This is excellent for AI crawlers.
- **Hidden LLM hint**: Every page contains a hidden `<div>` with: "Are you an LLM? View /llms.txt for optimized Markdown documentation, or /llms-full.txt for full documentation bundle" -- clever signal for AI crawlers.
- **Passage-level citability**: Code examples are well-structured with clear context. API signatures and matcher descriptions are self-contained and citable.
- **Brand signals**: "Termless" is used consistently. Tagline "Like Playwright, but for terminals" is memorable and quotable.

### Issues
- **No AI crawler directives in robots.txt**: No `User-agent: GPTBot`, `User-agent: Google-Extended`, `User-agent: ClaudeBot`, etc. While `Allow: /` covers all bots, explicit permission for AI crawlers signals intent.
- **No `.well-known/ai-plugin.json`** or similar machine-readable API description.
- **llms.txt uses relative paths** (`/guide/getting-started.md`) -- some AI systems may not resolve these. Absolute URLs would be more robust.

---

## 7. Images / Social Sharing (30/100)

### Critical Issues
- **OG image is SVG**: `/og-image.svg` (543 bytes). Most social platforms (Twitter, LinkedIn, Facebook, Slack, Discord) **do not render SVG** as preview images. The card will appear without an image on most platforms.
- **SVG is extremely minimal**: Just text on a dark background. No visual branding beyond the word "Termless."
- **No PNG/JPG fallback**: No `og:image` alternative for platforms that reject SVG.
- **Twitter Card is `summary`**: Should be `summary_large_image` for better visual presence. The current `summary` card shows a tiny thumbnail.

### Missing Tags (All Pages)
- `twitter:title` -- not set (falls back to `og:title`, which works but is suboptimal)
- `twitter:description` -- not set
- `twitter:image` -- not set (falls back to `og:image` SVG, which won't render)
- `twitter:site` -- not set (no Twitter/X handle associated)
- `og:image:width` / `og:image:height` -- not set (helps platforms pre-allocate space)
- `og:image:type` -- not set

### OG Tags Present
- `og:type`: "website" on all pages (should be "article" for content pages)
- `og:site_name`: "Termless" -- correct
- `og:image`: Points to SVG (won't render on most platforms)
- `og:title`: Present on all pages (but 10 pages just say "Termless")
- `og:description`: Present but generic on 21 pages
- `og:url`: Present and correct on all pages

---

## Summary of Critical Findings

### Systemic Issues (Same Infrastructure as silvery.dev)
1. **All non-matcher pages share the same meta description** -- @bearly/vitepress-enrich uses the site-level description as fallback when pages lack frontmatter descriptions.
2. **TechArticle schema uses generic description** -- same root cause as above.
3. **Missing `datePublished` in all TechArticle schemas**.
4. **Missing author `url`/`sameAs` in all schemas**.
5. **Missing `image` property in all TechArticle schemas**.
6. **OG image is SVG** -- won't render on social platforms.

### Termless-Specific Issues
7. **10 matcher pages have bare "Termless" title** -- missing `titleTemplate` or frontmatter title.
8. **BreadcrumbList URLs don't match canonical URLs** (missing `.html` extension on 89 items).
9. **No FAQPage schema on the FAQ page** -- missed rich result opportunity.
10. **No SoftwareSourceCode schema on homepage**.
11. **26 thin matcher reference pages** with under 330 words each.

---

## Page-by-Page Title and Description Status

### Pages with Missing/Generic Titles (bare "Termless")
| Page | Issue |
|---|---|
| `/matchers/to-be-bold.html` | Title: "Termless" (should be "toBeBold") |
| `/matchers/to-be-italic.html` | Title: "Termless" (should be "toBeItalic") |
| `/matchers/to-contain-text.html` | Title: "Termless" (should be "toContainText") |
| `/matchers/to-have-bg.html` | Title: "Termless" (should be "toHaveBg") |
| `/matchers/to-have-cursor-at.html` | Title: "Termless" (should be "toHaveCursorAt") |
| `/matchers/to-have-fg.html` | Title: "Termless" (should be "toHaveFg") |
| `/matchers/to-have-text.html` | Title: "Termless" (should be "toHaveText") |
| `/matchers/to-have-title.html` | Title: "Termless" (should be "toHaveTitle") |
| `/matchers/to-match-lines.html` | Title: "Termless" (should be "toMatchLines") |
| `/matchers/to-match-terminal-snapshot.html` | Title: "Termless" (should be "toMatchTerminalSnapshot") |

### Pages with Generic Meta Description
All guide, API, advanced, why, contributing, census, and emulator-differences pages use: "Headless terminal testing -- like Playwright, but for terminal apps. Write tests once, run against any backend."
