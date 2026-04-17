# Full SEO Audit Report: terminfo.dev

**Audit Date:** 2026-04-01
**Site:** https://terminfo.dev
**Platform:** VitePress v1.6.4 (static site) on Cloudflare Pages
**Pages in sitemap:** 328 unique URLs (329 entries, 1 duplicate: `/unicode`)
**Enrichment:** @bearly/vitepress-enrich for JSON-LD, glossary linking, SEO transforms

---

## Executive Summary

Terminfo.dev is in significantly better SEO shape than silvery.dev was at audit time. The @bearly/vitepress-enrich plugin is working well for most programmatic pages -- generating unique meta descriptions, OG tags, and breadcrumb JSON-LD across ~325 of 328 pages. However, several critical issues remain that suppress rich results and social sharing effectiveness.

**Overall Score: 72/100** (weighted)

| Dimension | Weight | Score | Weighted |
|-----------|--------|-------|----------|
| Technical SEO | 22% | 78 | 17.2 |
| Content Quality | 23% | 82 | 18.9 |
| On-Page SEO | 20% | 70 | 14.0 |
| Schema / Structured Data | 10% | 48 | 4.8 |
| Performance | 10% | 68 | 6.8 |
| AI Search Readiness (GEO) | 10% | 80 | 8.0 |
| Images / Social | 5% | 35 | 1.8 |
| **Total** | **100%** | | **71.5** |

---

## 1. Technical SEO (Score: 78/100)

### robots.txt
- **Status:** Present and valid
- **Content:** `User-agent: * / Allow: / / Sitemap: https://terminfo.dev/sitemap.xml`
- **Issue:** No specific AI crawler directives (GPTBot, ClaudeBot, CCBot, etc.) -- see AI Readiness section
- **Score impact:** Neutral (permissive is fine, but explicit is better for documentation)

### Sitemap
- **Status:** Present, valid XML, referenced in robots.txt
- **URL count:** 329 entries, 328 unique (1 duplicate: `/unicode`)
- **Missing `lastmod`:** No `<lastmod>` dates on any URL. Google uses lastmod to prioritize crawl freshness.
- **Missing pages:** `/compare` (index), `/baseline` (index), `/framework` (index) return 404 but are referenced in breadcrumb JSON-LD
- **Duplicate entry:** `/unicode` appears twice with identical hreflang annotations
- **hreflang:** Only `en-US` -- appropriate for a single-language site, but the hreflang is only on the `/unicode` entry, which is odd

### Canonical Tags
- **Status:** Present on all pages checked
- **Implementation:** `<link rel="canonical" href="https://terminfo.dev/...">` -- correct absolute URLs
- **Consistency:** Canonical URLs match the actual page URLs -- no mismatches found

### Security Headers
- `referrer-policy: strict-origin-when-cross-origin` -- good
- `x-content-type-options: nosniff` -- good
- **Missing:** `Strict-Transport-Security` (HSTS) -- HTTP upgrades to HTTPS via 301, but no HSTS header
- **Missing:** `X-Frame-Options` or CSP `frame-ancestors` -- page can be framed
- **Missing:** `Content-Security-Policy` -- no CSP header
- **Missing:** `Permissions-Policy` -- no feature policy header

### URL Structure
- Clean, hierarchical URLs: `/sgr/1-bold`, `/terminals/ghostty`, `/compare/ghostty-vs-kitty`
- No query parameters, no trailing slashes, no uppercase
- Consistent kebab-case throughout
- **Excellent** URL structure

### Mobile Signals
- `<meta name="viewport" content="width=device-width,initial-scale=1">` -- present on all pages
- VitePress generates responsive layouts by default

### Redirect Chains
- `http://terminfo.dev` -> 301 -> `https://terminfo.dev/` -- clean single redirect
- `https://www.terminfo.dev` -> 200 (no redirect, serves the same content) -- **potential duplicate content issue**
- No chain redirects detected

### SSR / JS Rendering
- VitePress generates full SSR HTML -- content is in the initial HTML payload
- Homepage is 593KB of HTML (very large, see Performance section)
- Content tables are server-rendered, not client-only

---

## 2. Content Quality (Score: 82/100)

### E-E-A-T Signals
- **About page:** Identifies creator as "Bjorn Stabell, serial entrepreneur and open-source developer"
- **Methodology:** Detailed explanation of three data collection methods (community CLI, headless, multiplexer)
- **Tool chain:** Mentions Termless (automated testing tool), specific backend versions
- **Acknowledgments:** References esctest2 (Thomas Dickey), vttest, and other foundational projects
- **Missing:** No author social links, no GitHub profile link, no LinkedIn
- **Missing:** No "author" JSON-LD schema

### Content Depth by Section

| Section | Pages | Avg. Content | Assessment |
|---------|-------|-------------|------------|
| Feature pages (e.g., `/sgr/1-bold`) | 164 | Medium (support matrix + escape sequence + notes) | Good -- unique per feature |
| Terminal profiles (e.g., `/terminals/ghostty`) | 19 | High (93% score, 164 features tested, version info) | Good -- substantial data |
| Comparison pages (e.g., `/compare/ghostty-vs-kitty`) | 91 | Medium-High (side-by-side matrix, summary, diffs) | Good -- unique per pair |
| Category pages (e.g., `/sgr`) | 13 | Medium (matrix + analysis paragraph) | Good |
| Standards pages (e.g., `/ecma-48`) | ~12 | Medium-High (long unique descriptions + feature lists) | Good |
| Baseline pages | 4 | High (71+ features, compliance scorecards, guidance) | Excellent |
| Fundamentals | 5 | High (2000+ words, educational, well-structured) | Excellent |
| Framework pages | 6 | Low-Medium (250 words + compatibility data) | Adequate |
| Glossary | 1 | Very High (8000+ words, 100+ terms) | Excellent |
| Homepage | 1 | Very High (full matrix, 15K-20K words of data) | Excellent |

### Thin Content Detection
- **Framework pages** are the thinnest (~250 words of prose), but include data tables
- **No critically thin pages** detected -- even programmatic pages have unique data
- **Comparison pages with 0 differences** (e.g., Ghostty vs Kitty) are potentially thin from Google's perspective, but include the full side-by-side matrix

### Title Tags
- **Unique across all pages checked** -- good
- **Pattern:** `{PageName} — {PageType} | Terminfo.dev`
- Examples: `"Ghostty — Terminal Feature Support | Terminfo.dev"`, `"ECMA-48 Standard — Terminal Feature Standard | Terminfo.dev"`
- **Good length:** All under 60 characters where checked

### Heading Hierarchy
- Every page has exactly one H1
- H2s used for major sections
- Consistent structure across page types
- **Minor issue:** Some H2s have appended dates without spacing (e.g., "Analysis2026-03-29")

---

## 3. On-Page SEO (Score: 70/100)

### Meta Descriptions

**Major improvement over silvery.dev:** Most pages have unique, descriptive meta descriptions generated by the enrich plugin.

**Pages with default/generic description** (3 found out of 40 sampled):
1. `/` (homepage): "Can your terminal do that? Feature support tables for terminal emulators."
2. `/about`: Same default
3. `/api`: Same default

**Pages with unique descriptions** (37 of 40 sampled):
- Terminal profiles: `"Ghostty terminal emulator feature support: 93% (153/164 features)..."` -- excellent, includes score
- Comparison pages: `"Compare Ghostty (93%) vs Kitty (93%) terminal feature support. 0 features differ."` -- excellent, includes diff count
- Category pages: Long, detailed descriptions (e.g., SGR description is 500+ chars -- may be too long, Google truncates at ~155-160 chars)
- Standards pages: Very detailed descriptions (also potentially too long)
- Feature pages: Unique descriptions with support data

**Issues:**
1. Homepage, About, API use the generic site tagline as meta description
2. Some descriptions (categories, standards) exceed 160 characters -- Google will truncate
3. OG descriptions mirror meta descriptions when present -- good consistency

### OG / Twitter Tags

**Present on all pages:**
- `og:image` -- yes (but SVG -- see Images section)
- `twitter:card` -- `summary_large_image`
- `twitter:site` -- `@AskTerminfo`

**Present on pages with unique descriptions:**
- `og:title` -- yes, unique per page
- `og:description` -- yes, mirrors meta description

**Missing on pages with default description (homepage, about, api):**
- `og:title` -- **absent**
- `og:description` -- **absent**

**Missing on ALL pages:**
- `og:type` -- not set (should be `website` or `article`)
- `og:url` -- not set (should mirror canonical)
- `twitter:image` -- not set (falls back to og:image)
- `og:site_name` -- not set

### Internal Linking
- **Extensive.** Homepage has 500+ internal links (feature matrix)
- Glossary terms auto-linked across pages via the enrich plugin (hover tooltips visible in HTML)
- Terminal profile pages cross-link to comparison pages
- Category pages link to all features within that category
- **Navigation:** Consistent sidebar across all pages
- **Score:** Excellent internal linking

---

## 4. Schema / Structured Data (Score: 48/100)

### Present Schema Types

1. **WebSite** -- on every page (same global instance)
   - Only has `name`, `url`, `description`
   - Missing `potentialAction` (SearchAction for sitelinks search box)
   - Description is the generic site tagline, not page-specific

2. **BreadcrumbList** -- on all pages except homepage
   - **CRITICAL BUG:** Template variables not resolved in breadcrumb names
   - Terminal pages show: `"name": "{{ p.terminalName }}"` instead of "Ghostty"
   - Feature pages show: `"name": "{{ p.featureName }}"` instead of "Bold"
   - Category pages show: `"name": "{{ p.categoryName }}"` instead of "SGR"
   - Comparison pages show: `"name": "{{ p.termALabel }} vs {{ p.termBLabel }}"` instead of "Ghostty vs Kitty"
   - **This affects ~300+ pages** -- all programmatic page types
   - The `item` URLs are correct, only the `name` fields have unresolved templates
   - **Google will ignore these breadcrumbs** since the names are template syntax

### Missing Schema Types (Opportunities)

1. **SoftwareApplication** -- Terminal profile pages (`/terminals/ghostty`) should use this for the terminal being profiled. Could enable software rich results.

2. **Dataset** -- The homepage feature matrix and API data qualify as a Dataset. Could link to the JSON API.

3. **FAQPage** -- Fundamentals pages have Q&A-style content that could be marked up.

4. **DefinedTermSet / DefinedTerm** -- The glossary page has 100+ defined terms. This is a perfect fit for DefinedTermSet schema.

5. **TechArticle / Article** -- Fundamentals articles (TTY Architecture, Security, etc.) are educational content that could use Article schema with proper author, datePublished, dateModified.

6. **CreativeWork / WebApplication** -- For the data API itself.

7. **Organization / Person** -- No author/organization schema for E-E-A-T.

8. **SearchAction** -- Missing from WebSite schema. Would enable sitelinks search box.

---

## 5. Sitemap Analysis (Score: 72/100)

### XML Validity
- Well-formed XML
- Correct namespace declarations
- Uses sitemap, news, xhtml, image, and video namespaces

### URL Consistency
- All URLs use `https://terminfo.dev/` (correct)
- No trailing slashes
- Canonical URLs match sitemap URLs

### Missing Pages
- `/compare` (comparison index) -- 404, but referenced in breadcrumb JSON-LD
- `/baseline` (baseline index) -- 404, but referenced in breadcrumbs
- `/framework` (framework index) -- 404, but referenced in breadcrumbs
- These 404s in breadcrumb parent links are bad for both UX and SEO

### Orphaned / Duplicate URLs
- `/unicode` appears twice (duplicate entry)
- hreflang annotations only on `/unicode` -- inconsistent (either add to all or remove)

### Missing `lastmod`
- No `<lastmod>` on any URL
- Google recommends including lastmod for crawl efficiency
- Since data is auto-generated from probes, lastmod could be set to probe run date

### Page Count
- 328 unique URLs in sitemap
- Total discoverable pages appear to match (no obvious orphans found)

---

## 6. Performance (Score: 68/100)

### Page Size
- **Homepage:** 593KB HTML -- very large for a static page
  - Contains the full feature matrix (all terminals x all features) server-rendered in HTML
  - This is the primary content, not bloat, but it's heavy for initial load
- **Terminal profile pages:** ~420KB HTML
- **Comparison pages:** ~233KB HTML
- **Feature pages:** Similar range

### JavaScript Bundles (uncompressed / gzip compressed)
| Asset | Uncompressed | Gzip |
|-------|-------------|------|
| `framework.js` (Vue/VitePress) | 104KB | 41KB |
| `probes.data.js` (probe data) | 326KB | 52KB |
| `theme.js` | 53KB | 15KB |
| `app.js` | 1.4KB | small |
| Page-specific `.lean.js` | ~20KB | ~5KB |
| **Total JS** | **~505KB** | **~113KB** |

- `probes.data.js` at 326KB (52KB gzip) is the largest single asset -- contains all probe results as JSON data
- Total JS is moderate for a data-heavy site

### CSS
- Main stylesheet: `style.css` -- size not reported via content-length (likely compressed)
- Icon stylesheet: `vp-icons.css`

### Fonts
- Single font preloaded: `inter-roman-latin.woff2` with `crossorigin` -- good
- Uses `font-display: swap` implied by VitePress defaults

### CDN / Caching
- Served via Cloudflare (`server: cloudflare`)
- `cache-control: public, max-age=0, must-revalidate` for HTML pages -- no browser caching of HTML (fine for dynamic-ish content)
- Static assets have content-hash filenames (good cache busting)
- `cf-cache-status: DYNAMIC` on HTML -- Cloudflare edge caching may not be active

### Expected Core Web Vitals
- **LCP:** Likely good for text-heavy pages (SSR), potentially slow for homepage due to 593KB HTML
- **FID/INP:** Likely good -- minimal interactivity, VitePress hydration is lightweight
- **CLS:** Likely good -- SSR means content is in place before JS loads
- **Concern:** `probes.data.js` (326KB) loads on every page -- if it blocks rendering, LCP suffers

### Resource Hints
- CSS preloaded with `rel="preload stylesheet"`
- Font preloaded with `rel="preload"`
- JS modules use `rel="modulepreload"` -- good
- Cloudflare beacon loads externally (minor)

---

## 7. AI Search Readiness / GEO (Score: 80/100)

### llms.txt
- **Present and well-structured** -- 35 lines, 2.2KB
- Includes site description, key page links, feature categories, popular terminals
- Uses markdown format as specified by the llms.txt proposal
- **Good:** Links to all major sections
- **Missing:** No `llms-full.txt` for expanded content

### robots.txt AI Crawler Directives
- No explicit Allow/Disallow for AI crawlers (GPTBot, ClaudeBot, CCBot, Google-Extended, PerplexityBot)
- Current `User-agent: * / Allow: /` permits all crawlers
- **Recommendation:** Add explicit directives to signal intent (even if allowing all)

### Passage-Level Citability
- Content is well-structured with clear headings and short paragraphs
- Feature pages have discrete, citable facts: "Ghostty supports 93% (153/164) of tested features"
- Comparison pages produce natural citation passages: "Ghostty vs Kitty: 0 features differ out of 164 tested"
- Glossary terms are individually addressable
- **Good** for AI citation extraction

### Brand Signals
- Consistent branding: "Terminfo.dev" throughout
- `@AskTerminfo` Twitter handle in meta tags
- No other social profiles linked
- No Knowledge Panel signals (no Wikidata, no Wikipedia mention)

### Question-Form Content
- Fundamentals section answers "How does X work?" questions naturally
- Homepage tagline is question-form: "Can your terminal do that?"
- **Missing:** Explicit FAQ sections that would trigger FAQ rich results and AI answer extraction
- **Missing:** "Does [terminal] support [feature]?" question-answer format on feature pages

---

## 8. Images / Social Sharing (Score: 35/100)

### OG Image
- **CRITICAL:** `og-image.svg` is an SVG file (548 bytes)
- **Twitter/X, Facebook, LinkedIn, Discord, Slack do NOT render SVG for social cards**
- Social shares will show no preview image or a broken preview
- The SVG contains text "terminfo.dev" and tagline -- would look fine if rendered, but platforms reject SVG
- **Must convert to PNG** (recommended: 1200x630px)

### Twitter Card
- `twitter:card` = `summary_large_image` -- correct intent
- `twitter:site` = `@AskTerminfo` -- present
- **Missing:** `twitter:image` explicit tag (falls back to og:image, which is SVG)
- **Missing:** `twitter:image:alt` -- no alt text for the card image

### Missing OG Tags (all pages)
- `og:type` -- not present (should be `website` for homepage, `article` for content pages)
- `og:url` -- not present (should match canonical URL)
- `og:site_name` -- not present (should be "Terminfo.dev")
- `og:locale` -- not present (should be "en_US")

### Missing OG Tags (homepage, about, api)
- `og:title` -- absent (present on other pages)
- `og:description` -- absent (present on other pages)

### Logo Alt Text
- `<img class="VPImage logo" src="/logo.svg" alt data-v-8426fc1a>` -- empty `alt` attribute
- Should have `alt="Terminfo.dev"` or `alt="Terminfo.dev logo"`

### Per-Page OG Images
- All pages share the same generic `og-image.svg`
- Opportunity: Generate per-page OG images (e.g., showing the terminal score for profile pages, the diff summary for comparison pages)

---

## Source Code Assessment

### @bearly/vitepress-enrich Plugin
The plugin is working well for most programmatic pages:
- Generates unique meta descriptions for ~92% of pages (all except homepage, about, api)
- Generates og:title and og:description for pages with unique descriptions
- Generates BreadcrumbList JSON-LD (but with template variable bug)
- Generates glossary auto-linking with hover tooltips

### Template Variable Bug (BreadcrumbList)
The `{{ p.variableName }}` template syntax in BreadcrumbList JSON-LD is not being resolved at build time. This affects:
- All terminal pages: `{{ p.terminalName }}`
- All feature pages: `{{ p.featureName }}`
- All category pages: `{{ p.categoryName }}`
- All comparison pages: `{{ p.termALabel }} vs {{ p.termBLabel }}`
- All standard pages: `{{ p.categoryName }}`

**Impact:** ~300+ pages have broken breadcrumb schema. Google will ignore these breadcrumbs entirely.

**Root cause:** The JSON-LD template is likely in a VitePress layout file and uses Vue template syntax that isn't processed during SSR for JSON-LD script tags.

---

## Scoring Summary

| Dimension | Score | Key Issues |
|-----------|-------|------------|
| Technical SEO | 78 | Missing HSTS, www duplicate, sitemap has no lastmod, 3 pages 404 in breadcrumb hierarchy |
| Content Quality | 82 | Excellent depth, good E-E-A-T, minor thin content on framework pages |
| On-Page SEO | 70 | 3 pages with default description, some descriptions too long, missing og:type/og:url |
| Schema | 48 | Breadcrumb template variable bug on 300+ pages, missing SoftwareApplication/Dataset/FAQ/DefinedTermSet |
| Performance | 68 | 593KB homepage, 326KB probe data JS on every page, no HTML caching |
| AI Readiness | 80 | llms.txt present, good citability, missing FAQ content and explicit AI directives |
| Images/Social | 35 | SVG OG image won't render on any platform, missing og:type/url/site_name, empty logo alt |
