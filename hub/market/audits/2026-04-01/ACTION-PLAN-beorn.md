# SEO Action Plan: beorn.codes

**Based on:** Full SEO Audit (2026-04-02)
**Current Score:** 50/100
**Target Score:** 80+/100

---

## Priority 1: Critical (Do First)

### 1.1 Fix All Sitemap URLs (Impact: +15 points)

**Problem:** All ~45 URLs in the three child sitemaps return 404. The VitePress `base` path (`/flexily/`, `/loggily/`, `/mdspec/`) is not being prepended to sitemap URLs.

**Root Cause:** VitePress sitemap plugin likely not configured to respect the `base` option, or the sitemap is being generated before the base path is applied.

**Fix:** In each VitePress config (flexily, loggily, mdspec), ensure the sitemap configuration includes the base path. Check `vitepress-plugin-sitemap` or VitePress built-in sitemap config:

```ts
// .vitepress/config.ts
export default defineConfig({
  base: '/flexily/',
  sitemap: {
    hostname: 'https://beorn.codes'
    // VitePress should prepend base automatically, but verify
  }
})
```

If VitePress built-in sitemap doesn't handle base correctly, use a post-build script to prefix all URLs, or switch to `vitepress-plugin-sitemap` which handles it.

**Also:** Add the root homepage URL to one of the sitemaps (or create a root sitemap):
```xml
<url><loc>https://beorn.codes/</loc></url>
```

### 1.2 Fix mdspec "mdtest" Naming Bug (Impact: +3 points)

**Problem:** Schema, og:site_name, and og:description all say "mdtest" instead of "mdspec".

**Fix:** In mdspec's VitePress config:
```ts
export default defineConfig({
  title: 'mdspec',
  description: 'Write tests in markdown. Run them as code.',
  themeConfig: {
    // ...
  },
  head: [
    // Update any hardcoded references
  ]
})
```

Search for "mdtest" across the mdspec VitePress config and replace with "mdspec".

---

## Priority 2: High Impact (Do Next)

### 2.1 Add SEO Metadata to Root Page (Impact: +8 points)

Add to `<head>` of the root `index.html`:

```html
<!-- Canonical -->
<link rel="canonical" href="https://beorn.codes/">

<!-- Favicon -->
<link rel="icon" type="image/svg+xml" href="/favicon.svg">

<!-- OG Tags -->
<meta property="og:title" content="Bjorn Stabell - Entrepreneur & Developer">
<meta property="og:description" content="Serial entrepreneur and technologist. Co-founder of App Annie (data.ai). Building AI products and open-source developer tools.">
<meta property="og:url" content="https://beorn.codes/">
<meta property="og:type" content="profile">
<meta property="og:image" content="https://beorn.codes/og-image.png">
<meta property="og:site_name" content="Bjorn Stabell">

<!-- Twitter Card -->
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@beorn">
<meta name="twitter:title" content="Bjorn Stabell - Entrepreneur & Developer">
<meta name="twitter:description" content="Serial entrepreneur and technologist. Building AI products and open-source developer tools.">
<meta name="twitter:image" content="https://beorn.codes/og-image.png">

<!-- Structured Data -->
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "ProfilePage",
  "mainEntity": {
    "@type": "Person",
    "name": "Bjorn Stabell",
    "url": "https://beorn.codes",
    "jobTitle": "Entrepreneur & Technologist",
    "description": "Serial entrepreneur and technologist. Co-founder of App Annie (data.ai), Happylatte, and Exoweb.",
    "sameAs": [
      "https://github.com/beorn",
      "https://linkedin.com/in/beorn",
      "https://x.com/beorn"
    ],
    "knowsAbout": ["TypeScript", "React", "Terminal UIs", "AI", "Developer Tools"]
  }
}
</script>
```

**Also needed:** Create an `og-image.png` (1200x630) for the root page. A simple design with name, tagline, and brand colors.

### 2.2 Create Per-Page Meta Descriptions (Impact: +6 points)

Add unique `description` frontmatter to every markdown page across all three subpaths. Examples:

**Flexily:**
```yaml
---
# guide/getting-started.md
description: "Install Flexily and create your first flexbox layout in under 5 minutes. Drop-in Yoga replacement with zero WASM."

# guide/performance.md
description: "Flexily benchmarks: 1.5-2.5x faster initial layout and 5.5x faster re-layout vs Yoga. Detailed methodology and results."

# api/reference.md
description: "Complete Flexily API reference: createFlexily(), Node methods, layout constants, and plugin system."
```

**Loggily:**
```yaml
---
# guide/journey.md
description: "Learn loggily from zero: debug logging, structured JSON output, tracing spans, and the optional chaining pattern."

# guide/comparison.md
description: "Loggily vs debug, pino, and winston: feature comparison, bundle size, API ergonomics, and migration paths."

# api/index.md
description: "Complete loggily API reference: createLogger(), log levels, spans, writers, and configuration options."
```

**mdspec:**
```yaml
---
# guide/getting-started.md
description: "Install mdspec and write your first executable markdown test. Turn CLI documentation into runnable test cases."

# guide/pattern-matching.md
description: "mdspec pattern matching: ellipsis wildcards, regex, and named captures for matching dynamic command output."
```

### 2.3 Create OG Images for Loggily and mdspec (Impact: +4 points)

Create PNG OG images (1200x630) for loggily and mdspec. Add to VitePress config:

```ts
// loggily/.vitepress/config.ts
head: [
  ['meta', { property: 'og:image', content: 'https://beorn.codes/loggily/og-image.png' }]
]
```

**Also:** Convert Flexily's SVG OG image to PNG format. Most social platforms (Twitter/X, Slack, Discord, iMessage) don't render SVG previews.

### 2.4 Add llms.txt to Root, Loggily, and mdspec (Impact: +5 points)

Flexily already has llms.txt. Create equivalent files:

**Root (`/llms.txt`):**
```
# Bjorn Stabell

> Serial entrepreneur and technologist. Co-founder of App Annie (data.ai).

## Projects

- [Flexily](https://beorn.codes/flexily): Pure JavaScript flexbox layout engine
- [Loggily](https://beorn.codes/loggily): Unified debug logging, structured logs, and tracing
- [mdspec](https://beorn.codes/mdspec): Executable markdown testing
- [Silvery](https://silvery.dev): React framework for terminal UIs
- [Termless](https://termless.dev): Headless terminal testing
- [terminfo.dev](https://terminfo.dev): Terminal compatibility database
```

Create similar files for loggily and mdspec following the same pattern as flexily's.

---

## Priority 3: Medium Impact

### 3.1 Add BreadcrumbList Schema to Loggily and mdspec (Impact: +3 points)

Flexily already has BreadcrumbList schema on inner pages. Replicate for loggily and mdspec. This requires a VitePress build plugin or `transformHead` hook:

```ts
// .vitepress/config.ts
transformHead({ pageData }) {
  const breadcrumbs = buildBreadcrumbs(pageData)
  return [
    ['script', { type: 'application/ld+json' }, JSON.stringify(breadcrumbs)]
  ]
}
```

### 3.2 Add SoftwareApplication Schema (Impact: +3 points)

Add to each subpath's homepage:

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Flexily",
  "description": "Pure JavaScript flexbox layout engine - Yoga-compatible API, 1.5-5.5x faster, no WASM",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cross-platform",
  "programmingLanguage": "TypeScript",
  "offers": { "@type": "Offer", "price": "0", "priceCurrency": "USD" },
  "author": {
    "@type": "Person",
    "name": "Bjorn Stabell",
    "url": "https://beorn.codes"
  },
  "codeRepository": "https://github.com/beorn/flexily",
  "license": "https://opensource.org/licenses/MIT"
}
```

### 3.3 Improve Inner Page Schema (Impact: +2 points)

Replace duplicate `WebSite` schema on inner pages with `TechArticle`:

```json
{
  "@context": "https://schema.org",
  "@type": "TechArticle",
  "headline": "Getting Started with Flexily",
  "description": "Install Flexily and create your first flexbox layout in under 5 minutes.",
  "author": {
    "@type": "Person",
    "name": "Bjorn Stabell",
    "url": "https://beorn.codes"
  },
  "isPartOf": {
    "@type": "WebSite",
    "name": "Flexily",
    "url": "https://beorn.codes/flexily"
  }
}
```

### 3.4 Improve Home Page Titles (Impact: +2 points)

Current: "Flexily" / "Loggily" / "mdspec"
Better: Include descriptive keywords:

```ts
// flexily
title: 'Flexily',
titleTemplate: ':title | Flexily'
// Homepage override via frontmatter:
// title: "Flexily - Pure JavaScript Flexbox Layout Engine"
```

### 3.5 Add Logo Alt Text (Impact: +1 point)

VitePress navbar logos have `alt=""`. Configure meaningful alt text:

```ts
themeConfig: {
  logo: { src: '/logo.svg', alt: 'Flexily logo' }
}
```

---

## Priority 4: Nice to Have

### 4.1 Add twitter:site and twitter:creator Tags

```html
<meta name="twitter:site" content="@beorn">
<meta name="twitter:creator" content="@beorn">
```

### 4.2 Consider cleanUrls in VitePress

Enable `cleanUrls: true` to remove `.html` extensions. Slightly cleaner URLs for sharing, though not a significant SEO factor.

### 4.3 Cross-Link Between Subpaths

Add "See also" links in documentation:
- Flexily docs mention "Used by [Silvery](https://silvery.dev) for terminal layout"
- Loggily docs mention "Used by Silvery, Termless, and terminfo.dev"
- mdspec docs mention "Used by Silvery and Termless for executable documentation"

This builds topical authority and helps search engines understand the ecosystem.

### 4.4 Add FAQ Schema for Key Pages

Add FAQ structured data to comparison/migration pages (highly citable by AI search):

```json
{
  "@type": "FAQPage",
  "mainEntity": [{
    "@type": "Question",
    "name": "How does Flexily compare to Yoga?",
    "acceptedAnswer": {
      "@type": "Answer",
      "text": "Flexily is 1.5-5.5x faster than Yoga, 3x smaller, and requires no WASM..."
    }
  }]
}
```

---

## Implementation Order

1. **Sitemaps** (P1.1) -- unblock search engine discovery of all pages
2. **mdspec naming fix** (P1.2) -- 5-minute fix
3. **Root page metadata** (P2.1) -- makes the root page shareable
4. **Per-page descriptions** (P2.2) -- bulk but straightforward (frontmatter)
5. **OG images** (P2.3) -- design task
6. **llms.txt** (P2.4) -- quick text files
7. **Breadcrumbs on loggily/mdspec** (P3.1) -- VitePress config
8. **SoftwareApplication schema** (P3.2) -- VitePress head config
9. **Everything else** (P3-P4)

## Expected Score After P1+P2

| Dimension | Current | After P1+P2 |
|-----------|---------|-------------|
| Technical SEO | 52 | 82 |
| Content Quality | 58 | 72 |
| On-Page SEO | 48 | 70 |
| Schema | 42 | 50 |
| Performance | 78 | 78 |
| AI Readiness | 25 | 55 |
| Images | 30 | 60 |
| **Overall** | **50** | **72** |

After completing P3 as well: estimated **80+/100**.
