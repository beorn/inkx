# SEO Action Plan: termless.dev

**Current Score:** 63/100
**Target Score:** 85/100
**Priority:** Items ordered by impact-to-effort ratio

---

## P0: Critical (Do First -- Highest Impact)

### 1. Fix OG image: Replace SVG with PNG (Impact: Social Sharing)
**Problem:** `og-image.svg` won't render on Twitter, LinkedIn, Facebook, Slack, Discord.
**Fix:**
- Generate a 1200x630 PNG version of the OG image
- Update VitePress config to reference the PNG
- Change `twitter:card` from `summary` to `summary_large_image`
- Add `og:image:width`, `og:image:height`, `og:image:type` meta tags

**Effort:** Small (design + config change)
**Impact:** Social shares currently show no image -- fixing this is the single biggest visibility win.

### 2. Add unique meta descriptions to all 21 generic pages (Impact: CTR)
**Problem:** 21 pages share the site-level description. Google may auto-generate snippets or show the same text for every result.
**Fix:** Add `description` to each page's frontmatter in the VitePress source:
```yaml
---
description: "Step-by-step guide to installing Termless and writing your first terminal test with Vitest."
---
```

Pages needing unique descriptions:
- `/guide/getting-started.html` -- installation and first test
- `/guide/writing-tests.html` -- selectors, matchers, assertions
- `/guide/best-practices.html` -- test organization, flake prevention
- `/guide/backends.html` -- backend capability comparison
- `/guide/multi-backend.html` -- running tests across backends
- `/guide/terminal-model.html` -- screen, scrollback, buffer concepts
- `/guide/recipes.html` -- common testing patterns
- `/guide/screenshots.html` -- SVG/PNG screenshot generation
- `/guide/comparison.html` -- Termless vs alternatives
- `/guide/faq.html` -- frequently asked questions
- `/guide/cli.html` -- CLI and MCP server usage
- `/api/terminal.html` -- Terminal class API reference
- `/api/backend.html` -- TerminalBackend interface
- `/api/cell.html` -- Cell, Cursor, Colors types
- `/api/matchers.html` -- Vitest matcher API overview
- `/advanced/compat-matrix.html` -- cross-backend conformance testing
- `/advanced/silvery-integration.html` -- Silvery test leverage
- `/census.html` -- terminal emulator market share data
- `/emulator-differences.html` -- where terminals disagree
- `/why.html` -- motivation and design philosophy
- `/CONTRIBUTING.html` -- how to contribute

**Effort:** Medium (21 descriptions to write)
**Impact:** High -- unique descriptions improve CTR from search results and fix generic OG descriptions simultaneously.

### 3. Fix 10 matcher pages with bare "Termless" title (Impact: Search Visibility)
**Problem:** These pages appear as just "Termless" in search results, making them invisible.
**Fix:** Add `title` to each page's frontmatter, or fix the VitePress config/enrich plugin that should be generating titles from h1.

Affected pages: `toBeBold`, `toBeItalic`, `toContainText`, `toHaveBg`, `toHaveCursorAt`, `toHaveFg`, `toHaveText`, `toHaveTitle`, `toMatchLines`, `toMatchTerminalSnapshot`

**Effort:** Small (10 frontmatter additions)
**Impact:** High -- these pages are currently invisible in search.

---

## P1: Important (High Impact, Medium Effort)

### 4. Enrich TechArticle schema (Impact: Rich Results)
**Fix in @bearly/vitepress-enrich:**
- Add `datePublished` (use git first-commit date or frontmatter)
- Add `image` property (use the OG image URL)
- Add `author.url` (e.g., `https://github.com/beorn`)
- Add `author.sameAs` array (GitHub, npm, terminfo.dev)
- Use page-specific `description` instead of site description

**Effort:** Medium (plugin change, affects all @bearly/vitepress-enrich sites)
**Impact:** High -- richer schema improves Google's understanding and eligibility for rich results.

### 5. Add FAQPage schema to FAQ page (Impact: Rich Results)
**Problem:** `/guide/faq.html` has 809 words of Q&A content but no `FAQPage` schema.
**Fix:** Add FAQPage JSON-LD with Question/Answer pairs extracted from the page content. This enables Google's FAQ rich results (expandable answers in search).

**Effort:** Small (can be automated in vitepress-enrich or done manually in frontmatter)
**Impact:** Medium-High -- FAQ rich results significantly increase SERP real estate.

### 6. Add SoftwareSourceCode schema to homepage (Impact: Knowledge Panel)
**Fix:** Add JSON-LD:
```json
{
  "@type": "SoftwareSourceCode",
  "name": "Termless",
  "description": "Headless terminal testing framework for terminal apps",
  "codeRepository": "https://github.com/beorn/termless",
  "programmingLanguage": "TypeScript",
  "runtimePlatform": ["Node.js", "Bun"],
  "license": "https://opensource.org/licenses/MIT",
  "author": {
    "@type": "Person",
    "name": "Bjorn Stabell",
    "url": "https://github.com/beorn"
  }
}
```

**Effort:** Small
**Impact:** Medium -- helps Google build a knowledge panel for the project.

### 7. Improve homepage title (Impact: Branded Search)
**Current:** `<title>Termless</title>`
**Better:** `<title>Termless -- Headless Terminal Testing Framework</title>`

**Effort:** Tiny (one line in VitePress config)
**Impact:** Medium -- helps search engines and users understand what the site is about from the title alone.

---

## P2: Moderate (Solid Improvements)

### 8. Fix BreadcrumbList URL consistency
**Problem:** 89 BreadcrumbList items use URLs without `.html` extension (e.g., `/api/backend` instead of `/api/backend.html`). These don't match the canonical URLs.
**Fix in @bearly/vitepress-enrich:** Append `.html` to all non-directory breadcrumb item URLs.

**Effort:** Small (plugin fix)
**Impact:** Medium -- inconsistent URLs in structured data may cause Google to flag issues.

### 9. Add explicit Twitter meta tags
**Fix:** In VitePress head config, add:
- `twitter:title` (match og:title)
- `twitter:description` (match og:description)
- `twitter:image` (PNG version)
- `twitter:site` (if a Twitter/X handle exists)

Or configure @bearly/vitepress-enrich to emit these from OG tags.

**Effort:** Small
**Impact:** Medium -- ensures correct rendering on Twitter/X.

### 10. Set `og:type` to "article" for content pages
**Problem:** All 48 pages use `og:type="website"`. Only the homepage should be "website"; content pages should be "article".
**Fix:** In vitepress-enrich, set `og:type` to `article` for all non-homepage pages.

**Effort:** Small (plugin change)
**Impact:** Low-Medium -- helps social platforms render content pages correctly.

### 11. Improve sitemap `lastmod` accuracy
**Problem:** All pages share the same build timestamp.
**Fix:** Use git commit dates per file, or add `lastUpdated` frontmatter. VitePress has a `lastUpdated` feature that can be enabled in config -- it reads git history.

**Effort:** Small (VitePress config: `lastUpdated: true`)
**Impact:** Medium -- accurate `lastmod` helps Google prioritize crawling of recently changed pages.

---

## P3: Nice to Have (Polish)

### 12. Enrich thin matcher pages
Add to each matcher reference page:
- "See also" section linking to related matchers (e.g., `toBeBold` links to `toBeItalic`, `toBeDim`, `toHaveAttrs`)
- A real-world usage example beyond the basic API call
- "When to use this vs X" comparison where relevant

**Effort:** Large (26 pages to enrich)
**Impact:** Low-Medium per page, but improves long-tail search coverage.

### 13. Add AI crawler directives to robots.txt
```
User-agent: GPTBot
Allow: /

User-agent: Google-Extended
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: PerplexityBot
Allow: /
```

**Effort:** Tiny
**Impact:** Low -- currently `Allow: /` covers all bots, but explicit directives signal intent.

### 14. Add `potentialAction` to WebSite schema (sitelinks searchbox)
```json
{
  "@type": "WebSite",
  "potentialAction": {
    "@type": "SearchAction",
    "target": "https://termless.dev/?search={search_term_string}",
    "query-input": "required name=search_term_string"
  }
}
```

**Effort:** Small
**Impact:** Low -- VitePress has local search. This enables the Google sitelinks searchbox if the site gains enough authority.

### 15. Convert llms.txt to use absolute URLs
**Current:** `/guide/getting-started.md`
**Better:** `https://termless.dev/guide/getting-started`

**Effort:** Small
**Impact:** Low -- improves compatibility with AI systems that don't resolve relative URLs.

---

## Implementation Order

### Sprint 1 (Quick Wins -- 1-2 hours)
1. Fix OG image (SVG to PNG) + add `summary_large_image`
2. Fix 10 bare matcher titles (frontmatter)
3. Improve homepage title
4. Enable `lastUpdated` in VitePress config

### Sprint 2 (Content -- 2-3 hours)
5. Write 21 unique meta descriptions
6. Add FAQPage schema to FAQ page
7. Add SoftwareSourceCode schema to homepage

### Sprint 3 (Infrastructure -- vitepress-enrich plugin)
8. Fix TechArticle schema (datePublished, image, author URL/sameAs)
9. Fix BreadcrumbList URL consistency (.html extension)
10. Set og:type to "article" for content pages
11. Emit twitter:title, twitter:description, twitter:image

### Sprint 4 (Content Enrichment)
12. Enrich thin matcher pages with cross-references
13. Add AI crawler directives to robots.txt
14. Add potentialAction to WebSite schema
15. Convert llms.txt to absolute URLs

---

## Expected Score After Full Implementation

| Dimension | Current | Target |
|---|---|---|
| Technical SEO | 78 | 88 |
| Content Quality | 52 | 78 |
| On-Page SEO | 45 | 85 |
| Schema / Structured Data | 65 | 90 |
| Performance | 90 | 92 |
| AI Search Readiness | 82 | 90 |
| Images / Social | 30 | 85 |
| **Weighted Total** | **63** | **86** |
