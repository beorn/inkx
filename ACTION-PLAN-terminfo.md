# Action Plan: terminfo.dev SEO Improvements

**Based on:** Full SEO Audit 2026-04-01
**Current Score:** 72/100
**Target Score:** 88/100

---

## Critical Priority (Fix immediately -- blocking rich results and social sharing)

### 1. Fix BreadcrumbList template variable bug (~300 pages)

**Impact:** Schema, all page types
**Effort:** Small (fix in enrich plugin or VitePress config)
**Score lift:** +12 on Schema dimension

The `{{ p.terminalName }}`, `{{ p.featureName }}`, `{{ p.categoryName }}`, and `{{ p.termALabel }} vs {{ p.termBLabel }}` template variables in BreadcrumbList JSON-LD are not being resolved during SSR. Google ignores breadcrumbs with template syntax in the `name` field.

**Fix:** The JSON-LD generation in `@bearly/vitepress-enrich` needs to resolve these variables at build time. The `transformPageData` hook has access to the page's frontmatter params -- ensure the BreadcrumbList template uses the resolved values, not Vue template syntax.

**Verify:** After fix, `curl -sL https://terminfo.dev/terminals/ghostty | grep -o '"name":"[^"]*"'` should show `"name":"Ghostty"`, not `"name":"{{ p.terminalName }}"`.

### 2. Replace SVG OG image with PNG

**Impact:** Social sharing on ALL platforms
**Effort:** Small
**Score lift:** +30 on Images dimension

`og-image.svg` is 548 bytes but **no major social platform renders SVG** for card previews. Twitter/X, Facebook, LinkedIn, Discord, Slack all require raster formats (PNG, JPG).

**Fix:**
1. Convert `og-image.svg` to PNG at 1200x630px: `rsvg-convert og-image.svg -w 1200 -h 630 -o og-image.png`
2. Update all `og:image` references from `.svg` to `.png`
3. Add `og:image:width`, `og:image:height`, `og:image:type` meta tags
4. Add `twitter:image` meta tag (explicit, not relying on og:image fallback)
5. Add `twitter:image:alt` with descriptive text

**Bonus:** Generate per-page OG images for high-value pages (terminal profiles with score, comparison pages with diff count).

### 3. Add missing OG meta tags to all pages

**Impact:** Social sharing appearance
**Effort:** Small (add to VitePress head config)
**Score lift:** +8 on On-Page SEO

Missing on ALL pages:
- `og:type` -- set to `"website"` for index pages, `"article"` for content pages
- `og:url` -- set to match canonical URL
- `og:site_name` -- set to `"Terminfo.dev"`
- `og:locale` -- set to `"en_US"`

Missing on homepage, about, api:
- `og:title` -- needs to be generated (fix in enrich plugin's fallback)
- `og:description` -- needs to be generated

---

## High Priority (Fix soon -- significant SEO value)

### 4. Add unique meta descriptions to homepage, about, and API pages

**Impact:** On-Page SEO, CTR
**Effort:** Small (3 pages, manual frontmatter)

These 3 pages still use the generic tagline "Can your terminal do that? Feature support tables for terminal emulators." as their meta description.

**Suggested descriptions:**
- **Homepage:** "Compare 164 terminal features across 14+ emulators. Support matrices for SGR, cursor, modes, extensions, Unicode, and more. Data from automated headless probing."
- **About:** "How terminfo.dev tests terminal emulator compatibility. Three data sources, 153 features, 13 categories, automated headless probing with Termless."
- **API:** "Free JSON API for terminal emulator feature support data. Programmatic access to 164 feature tests across 14 terminals. Badges, schemas, and usage examples."

### 5. Create missing index pages (/compare, /baseline, /framework)

**Impact:** Technical SEO, link equity, breadcrumb validity
**Effort:** Medium
**Score lift:** +5 on Technical SEO

These pages are referenced in BreadcrumbList JSON-LD as parent nodes but return 404:
- `/compare` -- should list all 91 comparison pages
- `/baseline` -- should introduce the 4 baseline tiers
- `/framework` -- should list all 6 framework pages

The 404 parent in breadcrumbs is bad for Google's interpretation and wastes link equity.

### 6. Add `lastmod` dates to sitemap

**Impact:** Crawl efficiency
**Effort:** Small (generate from build date or probe run date)

No `<lastmod>` on any of the 328 URLs. Google uses lastmod to prioritize which pages to recrawl. Since probe data updates periodically, set lastmod to the most recent probe run date.

### 7. Add SoftwareApplication schema to terminal profile pages

**Impact:** Rich results eligibility for 19 terminal pages
**Effort:** Medium (add to enrich plugin)

Terminal profile pages (`/terminals/ghostty`, `/terminals/kitty`, etc.) describe software applications and should use `SoftwareApplication` schema:
```json
{
  "@type": "SoftwareApplication",
  "name": "Ghostty",
  "applicationCategory": "TerminalEmulator",
  "operatingSystem": "macOS, Linux",
  "description": "GPU-accelerated terminal by Mitchell Hashimoto...",
  "url": "https://ghostty.org"
}
```

### 8. Truncate overly long meta descriptions

**Impact:** SERP appearance
**Effort:** Small

Category and standards pages have descriptions exceeding 300-500 characters. Google truncates at ~155-160 characters, showing "..." which looks unpolished.

**Fix:** Cap programmatic meta descriptions at 155 characters in the enrich plugin. The full text can stay in og:description (which isn't truncated in social previews).

---

## Medium Priority (Improve over time)

### 9. Add DefinedTermSet schema to glossary page

**Impact:** Rich results for glossary terms
**Effort:** Medium

The glossary has 100+ defined terms. Each could be marked up as:
```json
{
  "@type": "DefinedTermSet",
  "name": "Terminal Glossary",
  "hasDefinedTerm": [
    {"@type": "DefinedTerm", "name": "CSI", "description": "Control Sequence Introducer..."}
  ]
}
```

### 10. Add Dataset schema to homepage / API page

**Impact:** Dataset rich results, academic citations
**Effort:** Small

The terminal compatibility data is a structured dataset with an API. Mark it up:
```json
{
  "@type": "Dataset",
  "name": "Terminal Feature Compatibility Database",
  "description": "Feature support data for 14+ terminal emulators across 164 features",
  "url": "https://terminfo.dev/api",
  "license": "https://creativecommons.org/licenses/by/4.0/",
  "distribution": {
    "@type": "DataDownload",
    "encodingFormat": "application/json",
    "contentUrl": "https://terminfo.dev/api/v1/data.json"
  }
}
```

### 11. Add SearchAction to WebSite schema

**Impact:** Sitelinks search box in Google SERP
**Effort:** Small

```json
{
  "@type": "WebSite",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://terminfo.dev/?q={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

(Only if the site has a search function -- VitePress has built-in search.)

### 12. Add FAQ content to feature and fundamentals pages

**Impact:** FAQ rich results, AI answer extraction
**Effort:** Medium-High

Feature pages would benefit from FAQ sections:
- "Does Ghostty support bold text?" -> "Yes, Ghostty has supported bold (SGR 1) since version 1.0."
- "Which terminals don't support curly underline?" -> "Terminal.app and GNU Screen lack curly underline support."

Mark up with FAQPage schema for rich results.

### 13. Add HSTS header

**Impact:** Security, minor SEO trust signal
**Effort:** Small (Cloudflare setting)

Enable `Strict-Transport-Security` in Cloudflare dashboard or via `_headers` file:
```
Strict-Transport-Security: max-age=31536000; includeSubDomains; preload
```

### 14. Fix www duplicate content

**Impact:** Potential duplicate content
**Effort:** Small (Cloudflare redirect rule)

`https://www.terminfo.dev` serves the same content as `https://terminfo.dev` without redirecting. Add a 301 redirect from www to non-www in Cloudflare Page Rules.

### 15. Remove duplicate `/unicode` entry from sitemap

**Impact:** Crawl budget
**Effort:** Trivial

The `/unicode` URL appears twice in the sitemap with identical hreflang annotations. Remove the duplicate.

### 16. Add explicit AI crawler directives to robots.txt

**Impact:** AI search documentation
**Effort:** Trivial

```
# AI crawlers - explicitly allowed
User-agent: GPTBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: Google-Extended
Allow: /
```

### 17. Fix empty logo alt text

**Impact:** Accessibility, minor SEO
**Effort:** Trivial

Change `<img ... alt>` to `<img ... alt="Terminfo.dev logo">` in VitePress config.

---

## Low Priority (Nice to have)

### 18. Add llms-full.txt

**Impact:** AI search depth
**Effort:** Medium

Generate an expanded `llms-full.txt` with more detailed descriptions of each section and key pages.

### 19. Add Article schema to fundamentals pages

**Impact:** Article rich results
**Effort:** Medium

Fundamentals articles (TTY Architecture, Security, etc.) qualify for TechArticle/Article schema with author, datePublished, and dateModified.

### 20. Optimize homepage size

**Impact:** LCP, page load
**Effort:** High

The 593KB homepage HTML contains the full feature matrix. Options:
- Lazy-load below-the-fold matrix sections
- Use virtual scrolling for the matrix
- Generate a summary view with expandable sections
- Move the full matrix to a separate `/matrix` page and show a summary on homepage

### 21. Consider per-page OG images

**Impact:** Social sharing engagement
**Effort:** High (build-time image generation)

Generate unique OG images for high-traffic page types:
- Terminal profiles: Show terminal name + score percentage
- Comparison pages: Show "A vs B" with scores
- Category pages: Show category name + feature count

### 22. Add Organization/Person schema

**Impact:** E-E-A-T, Knowledge Panel
**Effort:** Small

Add Person schema for the author with `sameAs` links to GitHub, Twitter, etc.

---

## Implementation Priority Matrix

| # | Item | Impact | Effort | Priority |
|---|------|--------|--------|----------|
| 1 | Fix breadcrumb template vars | Very High | Small | **P0** |
| 2 | PNG OG image | Very High | Small | **P0** |
| 3 | Add missing OG tags | High | Small | **P0** |
| 4 | Unique descriptions for 3 pages | High | Small | **P1** |
| 5 | Create /compare, /baseline, /framework index pages | High | Medium | **P1** |
| 6 | Add sitemap lastmod | Medium | Small | **P1** |
| 7 | SoftwareApplication schema | Medium | Medium | **P1** |
| 8 | Truncate long descriptions | Medium | Small | **P1** |
| 9 | DefinedTermSet schema | Medium | Medium | **P2** |
| 10 | Dataset schema | Medium | Small | **P2** |
| 11 | SearchAction schema | Medium | Small | **P2** |
| 12 | FAQ content + schema | Medium | High | **P2** |
| 13 | HSTS header | Low | Small | **P2** |
| 14 | www redirect | Low | Small | **P2** |
| 15 | Fix sitemap duplicate | Low | Trivial | **P2** |
| 16 | AI crawler directives | Low | Trivial | **P2** |
| 17 | Logo alt text | Low | Trivial | **P2** |
| 18 | llms-full.txt | Low | Medium | **P3** |
| 19 | Article schema for fundamentals | Low | Medium | **P3** |
| 20 | Optimize homepage size | Medium | High | **P3** |
| 21 | Per-page OG images | Medium | High | **P3** |
| 22 | Organization/Person schema | Low | Small | **P3** |

---

## Expected Score After P0+P1 Fixes

| Dimension | Current | After P0+P1 | Change |
|-----------|---------|-------------|--------|
| Technical SEO | 78 | 85 | +7 |
| Content Quality | 82 | 84 | +2 |
| On-Page SEO | 70 | 85 | +15 |
| Schema | 48 | 72 | +24 |
| Performance | 68 | 70 | +2 |
| AI Readiness | 80 | 82 | +2 |
| Images/Social | 35 | 70 | +35 |
| **Weighted Total** | **72** | **82** | **+10** |
