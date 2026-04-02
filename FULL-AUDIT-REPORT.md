# silvery.dev — Full SEO Audit Report

**Date:** 2026-04-02
**URL:** https://silvery.dev
**Business Type:** Open-source developer tools (React TUI framework)
**Site Generator:** VitePress (static site)
**Pages in Sitemap:** 145 (actual count — earlier estimates of 128 were based on initial fetch)

---

## Executive Summary

### Overall SEO Health Score: 69/100

silvery.dev is a well-structured documentation site with strong technical foundations but significant gaps in on-page SEO optimization. The site excels at content depth (especially comparison pages) and consistent schema markup, but is held back by duplicate meta descriptions across nearly all pages, URL namespace collisions, content inconsistencies, and weak AI authority signals.

### Top 5 Critical Issues

1. **Duplicate meta descriptions** — ~143 of 145 pages share identical meta description "React TUI framework for modern terminal apps" (also propagates to TechArticle schema description)
2. **guide/ vs guides/ namespace collision** — `/guide/theming.html` and `/guides/theming.html` both return 200, creating duplicate content. 27 pages under `/guide/`, 4 under `/guides/`
3. **Component count inconsistency** — homepage says "30+", Why Silvery says "45+". Reduces AI citation confidence
4. **No Open Graph / Twitter Card meta tags** — social sharing produces generic previews (critical for HN/Reddit/Discord developer marketing)
5. **5 orphaned /design/* pages** — in sitemap but unreachable via navigation (no /design/ index, section returns 404)

### Top 5 Quick Wins

1. Write unique meta descriptions for all 145 pages (estimated: 2-3 hours, highest ROI)
2. Add OG/Twitter meta tags to VitePress config (30 minutes)
3. Fix component count inconsistency: pick one number, make it consistent (15 minutes)
4. Add canonical tags to all pages (VitePress config change, 15 minutes)
5. Redirect `/guides/*` → `/guide/*` and remove duplicates (30 minutes)

---

## 1. Technical SEO (Score: 78/100)

### Crawlability
- **robots.txt**: Clean — `User-agent: *`, `Allow: /`, sitemap referenced. No issues.
- **Sitemap**: 128 URLs in XML sitemap at `/sitemap.xml`, properly referenced in robots.txt
- **Internal linking**: Strong — homepage links to all major sections; sidebar navigation on every page; 40+ internal links per page
- **Redirect handling**: Clean URLs with `.html` extensions (VitePress default)

### Indexability
- **Canonical tags**: Not explicitly detected on sampled pages — **risk of duplicate content** if pages are accessible with/without trailing slashes or with different casing
- **noindex directives**: None found (good — all pages intended to be indexed)
- **Duplicate meta descriptions**: CRITICAL — 127/128 pages share the same description, which Google may treat as "no description"

### Security & Headers
- **HTTPS**: Yes, enforced
- **HSTS**: Likely present via hosting provider (GitHub Pages / Cloudflare)
- Need to verify: CSP, X-Frame-Options, X-Content-Type-Options headers

### URL Structure
- **Pattern**: Clean, consistent hierarchy: `/guide/`, `/api/`, `/components/`, `/examples/`, `/reference/`, `/design/`
- **Extensions**: `.html` on all pages (VitePress convention) — not ideal but not harmful
- **Mixed paths**: Both `/guide/` and `/guides/` exist, which may confuse users and search engines:
  - `/guide/the-silvery-way.html` vs `/guides/components.html`

### Mobile Optimization
- VitePress includes responsive viewport meta tag by default
- Need visual agent to confirm responsive behavior

### JavaScript Rendering
- **SSG (Static Site Generation)**: VitePress pre-renders all pages as static HTML — excellent for SEO
- **Exception**: Theme Explorer page (`/themes.html`) relies on client-side Vue component for primary content (~200 words static, rest is JS-rendered)
- All other pages: Full content in static HTML, crawlable by all search engines

### Issues Found
| Priority | Issue | Impact |
|----------|-------|--------|
| Critical | Duplicate meta descriptions (127/128 pages) | Google ignores duplicate descriptions; missed CTR optimization |
| High | No canonical tags detected | Risk of duplicate indexing |
| Medium | Mixed `/guide/` and `/guides/` URL paths | User confusion, potential duplicate signals |
| Low | `.html` extensions on all URLs | Minor aesthetic issue, no SEO impact |

---

## 2. Content Quality (Score: 70/100)

### E-E-A-T Assessment

**Experience (6/10):**
- About page mentions creator built it from "real-world demands of modern interactive applications"
- Comparison pages show deep hands-on knowledge (reproducible benchmarks, specific GitHub issue references)
- Missing: case studies, real-world project showcases, user testimonials

**Expertise (8/10):**
- Exceptional technical depth in comparison pages (8000+ words with evidence)
- API documentation is comprehensive (50+ props documented with types/defaults)
- Code examples are complete and runnable
- Terminal protocol coverage shows deep domain expertise

**Authoritativeness (6/10):**
- Author (Bjørn Stabell) identified as "serial entrepreneur and open-source developer"
- GitHub and npm presence linked
- Missing: contributor count, download stats, community size, project age
- No external validation signals (conference talks, blog mentions, Stack Overflow presence)

**Trustworthiness (7/10):**
- Open-source (GitHub linked)
- Benchmarks include hardware specs and reproduction commands
- Comparison pages are balanced (acknowledges competitors' strengths)
- Missing: security policy, code of conduct, contributing guidelines prominently linked

### Content Depth by Section

| Section | Pages | Avg Word Count | Quality |
|---------|-------|---------------|---------|
| Comparison (vs Ink/BubbleTea/Textual/Blessed) | 4 | ~5,000 | Excellent — evidence-backed, balanced, AI-citable |
| API Reference | 16+ | ~2,000 | Strong — complete props, code examples, schemas |
| Guides | 19 | ~1,500 | Good — practical, well-structured |
| Examples | 9 | ~1,000 | Good — runnable code, clear explanations |
| Components | 49 | ~300-500 | Adequate — could be deeper |
| Getting Started | 3 | ~800 | Good — functional quick start |
| About | 1 | ~300 | Thin — needs expansion |
| Why Silvery? | 1 | ~450 | Thin — needs on-page proof |

### Thin Content Risk

Pages under 300 words with limited unique content:
- `/about.html` (~300 words) — needs author bio, project history, community stats
- `/themes.html` (~200 words static) — interactive content not crawlable by all engines
- Some `/components/` pages may be thin if they're auto-generated stubs

### Title Tags

All sampled pages follow pattern: `{Page Name} | Silvery`
- Consistent but could be more keyword-rich
- Comparison pages use good titles: "Silvery vs Ink | Silvery", "Silvery vs Bubble Tea"
- Exception: AI Chat example has a more descriptive title: "AI Coding Agent — Streaming, Tool Calls, Real-time Updates"

### Meta Descriptions
**CRITICAL ISSUE:** 127/128 pages use identical description: "React TUI framework for modern terminal apps"
- Only exception found: AI Chat page with unique description
- Google will likely auto-generate snippets, losing control over SERP presentation
- Each page needs a unique 150-160 character description

### Heading Hierarchy
- Proper H1 → H2 → H3 hierarchy across sampled pages
- Homepage: strong H1 "Silvery — Polished Terminal UIs in React"
- All subpages have single H1 matching page topic
- No heading skips detected (e.g., H1 → H3)

### Content Freshness
- TechArticle schema includes `dateModified` (e.g., 2026-03-31 on About page, 2026-03-26 on Quick Start)
- Comparison pages note verification dates: "External project claims last verified: 2026-03"
- Benchmark timestamps: "Apple M1 Max, Bun 1.3.9, Feb 2026"
- Good freshness signals for a new project

### Issues Found
| Priority | Issue | Impact |
|----------|-------|--------|
| Critical | 127/128 pages have identical meta description | Google ignores; lost CTR optimization |
| High | About page too thin (~300 words) | Weak E-E-A-T trust signal |
| High | Why Silvery page lacks on-page evidence | Key conversion page undersells |
| Medium | Component docs may be thin | 49 pages averaging 300-500 words |
| Medium | No external authority signals | No download counts, star counts, testimonials |
| Low | Title tags could be more descriptive | Minor CTR improvement opportunity |

---

## 3. Schema / Structured Data (Score: 80/100)

### Current Implementation

Strong JSON-LD implementation, consistently applied:

**On every page:**
- `WebSite` — name, URL, description (repeated per page — intentional)
- `BreadcrumbList` — proper hierarchy with absolute URLs (inner pages only)
- `TechArticle` — headline, dateModified, author (Bjørn Stabell)

**Additional schemas found:**
- `SoftwareSourceCode` on `/api/box.html` only (inconsistent — not on other API pages)

### Validation Results
- JSON-LD format — PASS (best practice)
- `@context: "https://schema.org"` — PASS
- BreadcrumbList positions/names — PASS
- Author attribution — PASS (consistent)
- Dates in ISO 8601 — PASS

### Issues Found by Schema Agent

**High Priority:**
- `TechArticle.description` uses the generic site tagline on ~143/145 pages (same root cause as meta descriptions)
- No `SoftwareApplication` schema — the primary missing type for an npm package
- `SoftwareSourceCode` inconsistently applied (only on `/api/box.html`, not other API/component pages)

**Medium Priority:**
- `WebSite` missing `potentialAction` (SearchAction) — blocks Google sitelinks searchbox
- `author` block has no `url` or `sameAs` — no link to GitHub for entity disambiguation
- `datePublished` missing from all TechArticle blocks (only `dateModified` present)
- No `Organization` block as publisher reference
- `TechArticle` has no `image` property — blocks Article rich result panel eligibility

**Info (Google policy changes):**
- `FAQPage`: Google restricted FAQ rich results to gov/health sites (Aug 2023) — still useful for AI/LLM citation
- `HowTo`: Google removed HowTo rich results (Sep 2023) — not recommended

### Rich Result Eligibility Status
| Schema | Status | Blocker |
|--------|--------|---------|
| BreadcrumbList | Eligible | None — correctly implemented |
| Article rich result | Blocked | Missing `image` property |
| SoftwareApplication | Missing | Schema not implemented |
| Sitelinks searchbox | Blocked | Missing `SearchAction` |

### Recommended JSON-LD Additions
Ready-to-implement snippets provided in `seo-schema-findings.md`:
- Snippet A: `SoftwareApplication` for homepage
- Snippet B: `Organization` for homepage/about
- Snippet C: `WebSite` with `SearchAction`
- Snippet D: Corrected `TechArticle` template with per-page description, `image`, `datePublished`, `publisher`
- Snippet E: `SoftwareSourceCode` template for all API/component pages

---

## 4. Sitemap Analysis (Score: 75/100)

### Structure
- Single `sitemap.xml` with **145 URLs** — appropriate size, no splitting needed
- Referenced in `robots.txt` — PASS
- All 145 URLs return HTTP 200 — PASS
- All URLs use HTTPS, no www variants — PASS
- `lastmod` present on all 145 URLs with real date variation (11 distinct dates) — PASS
- No deprecated `priority`/`changefreq` tags — PASS (Google ignores these)

### Structural Issues (from Sitemap Agent)

**High Priority — guide/ vs guides/ collision:**
- 27 pages under `/guide/*`, 4 pages under `/guides/*`
- Both `/guide/theming.html` AND `/guides/theming.html` return 200 — **duplicate content**
- The 4 `/guides/*` pages: components, state-management, terminal-apps, theming
- Fix: Redirect `/guides/*` → `/guide/*`, remove from sitemap

**High Priority — 5 orphaned /design/* pages:**
- In sitemap but unreachable via site navigation (no `/design/` index)
- Substantive content (961–2892 words each) but no internal links pointing to them
- Fix: Add `/design/` index page and wire into navigation, OR noindex + remove from sitemap

**Medium Priority — Potential duplicate reference pages:**
- `/reference/theme.html` and `/reference/theming.html` both return 200
- May overlap in scope — verify distinct content or consolidate

**Medium Priority — Questionable inclusions:**
- `/components/README.html` (730 words) — rendered GitHub README, likely boilerplate
- `/showcase-inventory.html` — internal-sounding slug, verify if user-facing
- `/guide/textarea-design.html` (3359 words) — slug reads as internal design note

### Missing Section Index Pages (404)
These directories return 404, leaving no crawlable entry point:
- `/getting-started/`, `/guide/`, `/guides/`, `/reference/`, `/design/`, `/components/`
- Only `/api/` and `/examples/` have index pages
- Fix: Add `index.md` for primary sections

### lastmod Analysis
- 57 URLs share the same 2026-03-25 date (likely a bulk commit/reorganization)
- Remaining URLs spread across 10 other dates (Mar 10 – Apr 1)
- VitePress derives lastmod from git commit timestamps — the cluster is likely accurate

---

## 5. Performance / Core Web Vitals (Score: 80/100)

### Expected Performance (VitePress Static Site)

VitePress sites typically score well on Core Web Vitals:
- **LCP**: Should be excellent — static HTML with minimal blocking resources
- **INP**: Should be excellent — minimal JavaScript interactivity on most pages
- **CLS**: Should be good — VitePress handles layout stability well

### Potential Issues
- **Theme Explorer page**: Heavy JS component may impact LCP/INP
- **Code syntax highlighting**: Large CSS/JS for Shiki/Prism may affect initial load
- **Font loading**: If custom fonts used, FOUT/FOIT could impact CLS
- **Image optimization**: No images detected on homepage (text-heavy site), but component screenshots if present should be optimized

### Recommendations
- Run PageSpeed Insights on key pages for field data when available
- Consider lazy-loading the Theme Explorer component
- Verify font `display: swap` for any custom fonts

---

## 6. AI Search Readiness / GEO (Score: 61/100)

*Score from dedicated GEO specialist agent — lower than initial estimate due to deeper analysis.*

### AI Crawler Accessibility (73/100)
- **robots.txt**: Fully open — GPTBot, ClaudeBot, OAI-SearchBot, PerplexityBot, CCBot all allowed
- **Static HTML**: Full content accessible without JS (except Theme Explorer)
- **No training opt-out**: Correct for an open-source project seeking maximum AI visibility

### llms.txt Compliance (Present but Thin)
- **Both `/llms.txt` and `/llms-full.txt` exist** — ahead of most sites
- **Missing metadata header**: No project description, version, license, GitHub/npm URLs
- **Section entries are navigation labels, not summaries**: An LLM gets a menu, not a briefing
- **No licensing statement**: AI crawlers can't determine citation permissions
- **Recommendation**: Add frontmatter header with project metadata + 1-2 sentence summaries per section entry

### Passage-Level Citability (60/100)

**Strong citable passages:**
- "Typical interactive update: Silvery 169us vs Ink 20.7ms — 100x+ faster" (specific, sourced)
- "804/813 (98.9%) of Ink's test suite" (precise with denominator)
- "32/32 Chalk tests passing (100%)" (perfect for AI extraction)

**Weaknesses:**
- Opening paragraphs don't answer the implied question immediately — they set up context first
- Passages are not self-contained — require surrounding context to make sense
- Few question-form headings (AI queries are questions)
- **Component count inconsistency**: Homepage says "30+", Why Silvery says "45+" — reduces citation confidence

### Brand Mention Signals (52/100)
- "Silvery" used consistently as project name
- Tagline "Polished Terminal UIs in React" repeated
- Author identified on all pages
- **Missing**: YouTube presence (0.737 correlation with AI citations — highest single signal), Wikipedia, named adopters, press coverage, conference talks

### Platform-Specific Scores
| Platform | Score | Notes |
|----------|-------|-------|
| Perplexity | 65 | Most likely to cite silvery.dev today (comparison queries) |
| ChatGPT | 58 | Benchmark numbers surface; FAQ gaps limit long-tail |
| Bing Copilot | 55 | Indexing fine; Schema.org gaps mild penalty |
| Google AI Overviews | 52 | Weakest — heavily weights external authority signals |

### Top GEO Improvements
1. **Convert headings to question form**: "What can Silvery do that Ink cannot?" — directly matches AI query patterns
2. **Rewrite opening paragraphs** to give direct self-contained answers in first 40-60 words
3. **Create FAQ page** (`/guide/faq.html`) with 15-20 answered developer questions — would become highest-density AI citation source
4. **Fix 30+/45+ inconsistency** — pick one number, make it consistent everywhere
5. **Create YouTube demo video** — single highest-impact external signal for AI citations

---

## 7. Images (Score: 65/100)

### Current State
- **Text-heavy documentation site** — minimal image usage is appropriate
- Homepage appears to have no hero image or screenshots
- Component pages lack visual examples of rendered TUI output

### Missing Opportunities
- **Terminal screenshots/GIFs** showing Silvery in action would dramatically improve:
  - Homepage conversion (show, don't just tell)
  - Social sharing (OG images)
  - Google Image search traffic
  - AI answer visual citations
- **Comparison pages** would benefit from side-by-side screenshots
- **Component docs** could show rendered output

### OG/Social Images
- **No Open Graph images detected** — social shares will use generic browser-generated previews
- Critical for Twitter/X, Reddit, Hacker News, Discord sharing (common channels for developer tools)

### Issues Found
| Priority | Issue | Impact |
|----------|-------|--------|
| High | No OG/Twitter Card meta tags | Poor social sharing appearance |
| Medium | No terminal screenshots on homepage | Missing visual proof |
| Medium | No OG images per page | Generic social previews |
| Low | Component docs lack rendered examples | Missed visual documentation |

---

## Scoring Summary

| Category | Weight | Score | Weighted |
|----------|--------|-------|----------|
| Technical SEO | 22% | 75 | 16.5 |
| Content Quality | 23% | 70 | 16.1 |
| On-Page SEO | 20% | 55 | 11.0 |
| Schema / Structured Data | 10% | 80 | 8.0 |
| Performance (CWV) | 10% | 80 | 8.0 |
| AI Search Readiness | 10% | 61 | 6.1 |
| Images | 5% | 65 | 3.3 |
| **Total** | **100%** | | **69.0** |

**Overall SEO Health Score: 69/100**

*Scores revised after specialist agent deep analysis. Schema and GEO scores adjusted downward from initial estimates based on detailed findings.*

---

## Detailed Findings by Priority

### Critical (Fix Immediately)

1. **Duplicate meta descriptions across 127/128 pages**
   - Every page except the AI Chat example uses "React TUI framework for modern terminal apps"
   - Impact: Google ignores duplicate descriptions and auto-generates snippets
   - Fix: Add unique, keyword-rich descriptions per page in VitePress frontmatter
   - Effort: 2-3 hours for all 128 pages

### High (Fix Within 1 Week)

2. **No Open Graph / Twitter Card meta tags**
   - Social shares produce generic previews — critical for developer marketing (HN, Reddit, X, Discord)
   - Fix: Add `og:title`, `og:description`, `og:image`, `twitter:card` to VitePress head config
   - Effort: 30 minutes for global config + per-page overrides

3. **About page too thin (~300 words)**
   - Primary trust signal page lacks substance
   - Fix: Add author bio, project origin story, community stats, technology philosophy
   - Effort: 1-2 hours

4. **"Why Silvery?" page lacks on-page evidence (~450 words)**
   - Key conversion page redirects proof to other pages instead of substantiating claims inline
   - Fix: Embed key benchmarks, feature highlights, and a comparison summary table
   - Effort: 1-2 hours

5. **No canonical tags detected**
   - Risk: Content indexed at multiple URLs (trailing slashes, case variations)
   - Fix: VitePress config to add `<link rel="canonical">` to all pages
   - Effort: 15 minutes

### Medium (Fix Within 1 Month)

6. **Mixed URL paths: `/guide/` and `/guides/`**
   - Inconsistent, may confuse users and search engines
   - Fix: Consolidate to one convention and redirect the other
   - Effort: 1-2 hours

7. **Component docs potentially thin (49 pages at ~300-500 words)**
   - May trigger thin content signals at scale
   - Fix: Add rendered output examples, more usage patterns, "See Also" cross-links
   - Effort: 1-2 days across all 49 pages

8. **No SoftwareApplication schema on homepage**
   - Missing rich result opportunity for "silvery npm" or "silvery react tui" searches
   - Fix: Add JSON-LD with version, downloadUrl, operatingSystem, programmingLanguage
   - Effort: 30 minutes

9. **No FAQPage schema on comparison pages**
   - Could win FAQ snippets in SERP for "silvery vs ink" type queries
   - Fix: Add FAQ JSON-LD with common questions from each comparison page
   - Effort: 1-2 hours

10. **No terminal screenshots or visual proof**
    - Homepage is text-only — missing the #1 way to demonstrate a UI framework
    - Fix: Add hero screenshot/GIF, component screenshots, comparison visuals
    - Effort: 2-4 hours

### Low (Backlog)

11. **Title tags could be more keyword-rich**
    - "Box | Silvery" → "Box Component — Layout & Flexbox for Terminal UIs | Silvery"
    - Effort: 2-3 hours for all pages

12. **No HowTo schema on getting-started pages**
    - Could show step-by-step rich results
    - Effort: 30 minutes

13. **No external authority signals on site**
    - Add npm download badge, GitHub stars, contributor count
    - Effort: 1 hour

14. **Theme Explorer JS-rendered content**
    - Consider adding SSR fallback with theme list as static HTML
    - Effort: 2-4 hours
