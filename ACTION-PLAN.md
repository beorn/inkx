# silvery.dev — SEO Action Plan

**Date:** 2026-04-02
**Overall Score:** 72/100
**Target Score:** 90/100

---

## Phase 1: Critical Fixes (This Week) — Expected Impact: +10 points

### 1. Unique Meta Descriptions for All Pages
**Priority:** Critical | **Effort:** 2-3 hours | **Impact:** High

Every page except `/examples/ai-chat.html` uses the same description: "React TUI framework for modern terminal apps". This is the single highest-ROI fix.

**Implementation:**
Add `description` to VitePress frontmatter for each page. Examples:

```yaml
# /getting-started/quick-start.html
description: "Get started with Silvery in 5 minutes. Install, create your first React TUI app, add responsive layouts and interactive lists."

# /guide/silvery-vs-ink.html  
description: "Silvery vs Ink: detailed comparison of rendering, performance (100x faster updates), components, terminal protocol support, and migration guide."

# /guide/why-silvery.html
description: "Why choose Silvery? Layout-first architecture, 100x faster interactive updates, 45+ components, 23 color palettes, and pure TypeScript with zero native deps."

# /api/box.html
description: "Box component API — flexbox layout for terminal UIs. 50+ props for sizing, spacing, borders, overflow, and responsive layouts."

# /components/SelectList.html
description: "SelectList — keyboard-navigable selection list with j/k/arrow support, disabled items, and controlled/uncontrolled modes."
```

**Template pattern:** `{What this page covers}. {Key benefit or differentiator}. {Action or detail}.`

### 2. Add Canonical Tags
**Priority:** High | **Effort:** 15 minutes | **Impact:** Medium

In `.vitepress/config.ts`, add canonical URL generation:

```ts
head: [
  // Per-page canonical (VitePress supports this via transformHead)
]
```

Or use VitePress `transformHead` hook to inject `<link rel="canonical" href="https://silvery.dev${page.url}">`.

### 3. Add Open Graph & Twitter Card Tags
**Priority:** High | **Effort:** 1 hour | **Impact:** High for social traffic

In `.vitepress/config.ts`:

```ts
head: [
  ['meta', { property: 'og:site_name', content: 'Silvery' }],
  ['meta', { property: 'og:type', content: 'website' }],
  ['meta', { name: 'twitter:card', content: 'summary_large_image' }],
  ['meta', { name: 'twitter:site', content: '@beaborncodes' }], // if applicable
]
```

Plus per-page `og:title`, `og:description`, `og:image` via `transformHead`.

**Create a default OG image** (1200x630px) showing:
- Silvery logo
- "Polished Terminal UIs in React"
- A terminal screenshot snippet

---

## Phase 2: Content Expansion (Next 2 Weeks) — Expected Impact: +5 points

### 4. Expand About Page
**Priority:** High | **Effort:** 2 hours

Add:
- Bjørn Stabell bio (experience, background, motivation)
- Project origin story (what problem, when started, how it evolved)
- Key stats (components count, test count, terminal support %, npm version)
- Community links (GitHub discussions, contributing guide)
- Related projects (km, terminfo.dev, Flexily, Termless)
- License and sustainability model

Target: 800-1000 words.

### 5. Expand "Why Silvery?" Page
**Priority:** High | **Effort:** 2 hours

Add inline:
- Performance benchmark table (currently only linked, not shown)
- Component count with categories
- Terminal protocol support percentage
- Code comparison: Silvery vs Ink for same task
- Feature summary matrix
- "Getting Started" CTA

Target: 1000-1500 words.

### 6. Add SoftwareApplication Schema to Homepage
**Priority:** Medium | **Effort:** 30 minutes

```json
{
  "@context": "https://schema.org",
  "@type": "SoftwareApplication",
  "name": "Silvery",
  "applicationCategory": "DeveloperApplication",
  "operatingSystem": "Cross-platform (macOS, Linux, Windows)",
  "programmingLanguage": "TypeScript",
  "url": "https://silvery.dev",
  "downloadUrl": "https://www.npmjs.com/package/silvery",
  "codeRepository": "https://github.com/beorn/silvery",
  "author": {
    "@type": "Person",
    "name": "Bjørn Stabell",
    "url": "https://beorn.codes"
  },
  "offers": {
    "@type": "Offer",
    "price": "0",
    "priceCurrency": "USD"
  }
}
```

---

## Phase 3: Content & Structure Polish (Month 1) — Expected Impact: +5 points

### 7. Consolidate `/guide/` and `/guides/` Paths
**Priority:** Medium | **Effort:** 2 hours

Pick one convention (recommend `/guide/`) and redirect `/guides/*` → `/guide/*`. Update all internal links.

### 8. Add FAQPage Schema to Comparison Pages
**Priority:** Medium | **Effort:** 2 hours

Extract natural Q&A from each comparison page:

```json
{
  "@type": "FAQPage",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What's the difference between Silvery and Ink?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Silvery uses layout-first architecture with incremental rendering (100x faster updates), while Ink uses render-first with full-tree reconciliation..."
      }
    }
  ]
}
```

### 9. Enrich Component Docs
**Priority:** Medium | **Effort:** 1-2 days

For each of the 49 component pages:
- Add rendered terminal output screenshot/ASCII art
- Expand usage examples (controlled + uncontrolled)
- Add "When to Use" section
- Cross-link related components
- Target: 500-800 words minimum per page

### 10. Add Terminal Screenshots to Homepage
**Priority:** Medium | **Effort:** 2-4 hours

Create hero image/GIF showing Silvery in action:
- Interactive list navigation
- Responsive layout resize
- Theme switching
- Code editor / AI chat example

---

## Phase 4: Authority Building (Ongoing) — Expected Impact: +3 points

### 11. Add Social Proof to Homepage
- npm download badge
- GitHub stars badge
- Version badge
- "Used by" section (km, other projects)

### 12. Create Blog / Changelog Page
- Release announcements
- Technical deep dives
- Performance improvement posts
- Fresh content signals for search engines

### 13. Improve Title Tags
Pattern: `{Component/Topic} — {Benefit/Context} | Silvery`

Examples:
- "Box — Flexbox Layout for Terminal UIs | Silvery"
- "Quick Start — Build Your First Terminal App in 5 Minutes | Silvery"
- "Silvery vs Ink — Performance, Features & Migration Guide"

### 14. Submit to Developer Directories
- awesome-react lists
- terminal-ui curated lists
- Dev.to / Hashnode cross-posts
- npm package README optimization

---

## Implementation Roadmap

```
Week 1:  Meta descriptions (all 128 pages) + canonical tags + OG tags
Week 2:  Expand About + Why Silvery pages + SoftwareApplication schema
Week 3:  Consolidate URLs + FAQ schema + homepage screenshots
Week 4:  Component docs enrichment (batch of 25/week)
Month 2: Component docs completion + social proof + blog setup
Ongoing: Authority building, fresh content, monitoring
```

## Monitoring

After implementing:
1. Submit updated sitemap in Google Search Console
2. Monitor indexing of pages with new meta descriptions
3. Track CTR changes in GSC for comparison page queries
4. Check rich result eligibility via Google Rich Results Test
5. Monitor Core Web Vitals in CrUX (once enough traffic)

---

*Generated by Claude Code SEO Audit — 2026-04-02*
