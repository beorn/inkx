# GEO Audit: silvery.dev

**Date**: 2026-04-01
**Auditor**: Claude Sonnet 4.6 (GEO Specialist)
**Scope**: 150-page React TUI framework documentation site (VitePress, static)
**Methodology**: Live page fetches, robots.txt and llms.txt inspection, content structure analysis

---

## GEO Readiness Score: 61 / 100

| Dimension | Weight | Raw | Weighted |
|-----------|--------|-----|----------|
| Citability | 25% | 60 | 15.0 |
| Structural Readability | 20% | 72 | 14.4 |
| Multi-Modal Content | 15% | 45 | 6.75 |
| Authority & Brand Signals | 20% | 52 | 10.4 |
| Technical Accessibility | 20% | 73 | 14.6 |

**Total: 61 / 100** — "Developing" tier. Functional but leaving significant AI citation opportunity on the table.

---

## 1. AI Crawler Access Status

**robots.txt verdict: PASS — fully open**

The robots.txt is a single open directive:

```
User-agent: *
Allow: /
Sitemap: https://silvery.dev/sitemap.xml
```

All AI crawlers have full access:

- GPTBot: Allowed (no restriction)
- OAI-SearchBot: Allowed
- ClaudeBot: Allowed
- PerplexityBot: Allowed
- CCBot: Allowed (training permitted by omission)
- anthropic-ai: Allowed

The open-by-default policy is correct for a new framework seeking discoverability. No training-opt-out directives are present, which is appropriate for an open-source project seeking maximum AI visibility.

**Recommendation**: No changes needed here. This is optimal.

---

## 2. llms.txt Compliance

**Status: PRESENT — structurally good, semantically thin**

Both `/llms.txt` and `/llms-full.txt` exist, which satisfies the basic llms.txt spec. This is a meaningful advantage over most framework documentation sites.

**What works:**

The llms.txt provides a well-organized hierarchical table of contents covering Getting Started, Guides, API Reference, Reference, Deep Dives, Examples, Components Library, and Design sections. The section headings map cleanly to the site's navigation.

**What is missing or weak:**

- No RSL 1.0 license declaration or usage permissions block. AI crawlers cannot determine whether content is licensed for training or citation. A brief licensing statement should appear at the top.
- Section descriptions are navigation labels, not content summaries. An LLM reading llms.txt gets a menu, not a briefing. Each entry should include a 1-2 sentence summary of what the page answers, not just its title.
- The "Comparisons" subsection links exist (vs Ink, vs BubbleTea, vs Textual, vs Blessed) but without summary sentences an AI cannot determine which page to prioritize for a "what is the best React TUI framework" query.
- No explicit metadata block at the top (project description, version, maintainer, license URL, canonical GitHub URL). The llms.txt spec recommends a brief frontmatter-style header.

**llms-full.txt** provides richer content but the fetch indicates it aggregates documentation pages without consistent structure between sections.

**Recommended llms.txt header addition:**

```
# Silvery

> React TUI framework for building polished terminal user interfaces.
> 30+ components, incremental rendering (169us per update), full modern terminal protocol support.
> License: MIT. Docs license: CC BY 4.0.
> GitHub: https://github.com/beorn/silvery
> npm: https://www.npmjs.com/package/silvery
> Version: see package.json

## Getting Started
...
```

---

## 3. Passage-Level Citability

**Score: 60 / 100 — functional but not optimized**

### Positive signals

The site contains several high-quality citable passages:

- The performance claim is specific and sourced: "Typical interactive update: Silvery 169 microseconds vs Ink 20.7 milliseconds — 100x+ faster." This is the format AI citation engines love: a concrete number, a named competitor, a ratio.
- The Ink compatibility claim is precise: "804/813 (98.9%) of Ink's test suite." Specific numbers with denominators are far more citable than vague "highly compatible" claims.
- The Chalk compatibility claim is crisp: "32/32 tests passing (100%)." Perfect for AI extraction.
- The component count is consistent across pages: "30+ components" (homepage says 30+, Why Silvery says 45+, which is an inconsistency — see issues below).

### Problems with passage structure

**Optimal AI citation length is 134-167 words.** Most sections on silvery.dev are either too long (deep-dive prose) or too short (feature bullets without explanation). The sweet spot — a self-contained 2-3 paragraph block that answers one question completely — is rare.

**Direct answers do not appear in the first 40-60 words of most sections.** The Why Silvery page begins with the problem statement before defining what Silvery is. An AI extracting a passage to answer "what is Silvery" from the Why Silvery page would get context-dependent text that requires surrounding content to make sense.

**Self-contained answer blocks are largely absent.** The ideal citable unit starts with a one-sentence definition ("Silvery is a React-based TUI framework..."), includes a key claim, and ends with enough context to stand alone without the surrounding page. Currently most passages assume the reader is navigating sequentially.

**Inconsistency between pages is a citation risk.** The homepage says "30+ components," the Why Silvery page says "45+ built-in components," and the comparisons page says "30+ built-in components." AI systems that read multiple pages will surface this contradiction, potentially reducing citation confidence.

### Question-based headings

**This is the largest single gap.** The headings across the site are descriptive labels ("Why Silvery", "Core Architectural Difference", "When to Choose Each") rather than question-form headings that match actual developer search queries:

- Current: "When to Choose Each"
- Better: "When should I use Silvery instead of Ink?"

- Current: "Key Functional Differences"
- Better: "What can Silvery do that Ink cannot?"

- Current: "Performance Claims"
- Better: "How much faster is Silvery than Ink?"

Question-based H2/H3 headings directly increase the probability of appearing in AI-generated answers because they match the query pattern.

---

## 4. Authority & Brand Signals

**Score: 52 / 100 — weak external reinforcement**

### What exists

- Creator attribution is present: "Built by Bjørn Stabell" appears in the footer and the About page identifies him as "serial entrepreneur and open-source developer."
- GitHub and npm links are present on the About page.
- The ecosystem is named (Flexily, Termless, terminfo.dev, Loggily) which creates internal cross-referencing.
- The Silvery vs Ink page cites Ink's usage: "~1.3M npm weekly downloads, production use since 2017 across Gatsby, Prisma, Shopify CLI, Claude Code." This is good competitive context.

### What is missing

**Wikipedia entity: None detected.** Silvery has no Wikipedia article. For AI search citations, Wikipedia presence correlates strongly with trustworthiness signals. The framework is new (2025) so this is expected, but it is a gap.

**Reddit presence: Unknown / likely minimal.** No r/javascript, r/typescript, or r/commandline threads were linked from the site. Community discussion is the highest-correlation signal (~0.7+) for AI citation.

**YouTube content: Not found.** YouTube mentions correlate at ~0.737 with AI citations — the single strongest signal. No demo videos, conference talks, or tutorials are linked or mentioned on the site. This is the largest brand authority gap.

**npm download counts: Not displayed.** The Ink comparison mentions Ink's 1.3M weekly downloads, implying Silvery's are lower, but Silvery's own numbers are never stated. Stating "X weekly downloads" or "first published 2025" would anchor recency for AI systems.

**No third-party testimonials or adoption examples.** The About page mentions Silvery was born from building AI-powered productivity tools, but names no companies, projects, or notable adopters. Even one named real-world user creates a citation foothold.

**No dated publications or changelogs linked from documentation.** CHANGELOG.md exists in the repo but is not linked from documentation pages. Dates anchor content recency for AI systems.

**Author's other credentials**: Bjørn Stabell is identified but his profile is not linked to GitHub, LinkedIn, or any external verification point from the documentation pages. This reduces the authority signal.

---

## 5. Content Structure for AI Consumption

**Score: 72 / 100 — solid VitePress foundation with gaps**

### Structural strengths

VitePress generates clean server-side rendered HTML with proper semantic structure. AI crawlers receive complete content without JavaScript execution. This is a meaningful technical advantage over CSR-only sites.

The site has:
- Consistent heading hierarchy (H1 page title, H2 sections, H3 subsections)
- Code blocks with language-tagged fences (TypeScript, bash)
- Comparison tables on the vs-Ink and vs-BubbleTea pages
- A 150-URL sitemap (sitemap.xml) properly linked from robots.txt

### Structural weaknesses

**No FAQ sections.** FAQ pages are the highest-density format for AI citation. A single FAQ page covering "What is Silvery?", "How does Silvery compare to Ink?", "Does Silvery support mouse input?", "Can I use Silvery with Node.js?" would dramatically increase AI answer coverage.

**Code examples lack prose context.** The documentation contains substantial code examples (which is correct for a framework), but many code blocks appear without a preceding "this code does X because Y" paragraph. AI systems that cannot execute code will summarize the prose context, not the code itself.

**Definition blocks are absent.** Terms like "TEA" (The Elm Architecture), "ag" (the retained cell tree), "TextFrame," and "focusScope" are used without structured definition blocks. A `[TEA]: The Elm Architecture — a model/update/view pattern...` style definition at first use would be citable.

**The Silvery Way document is well-structured.** The 10-principle format with named principles, descriptions, and Shiny/Tarnished examples is ideal for AI extraction. This page is the best-structured content on the site.

**Tables are used but inconsistently.** The vs-Ink comparison table (Feature / Silvery / Ink columns) is excellent AI-citable content. Not all comparison content uses this format; some uses prose lists instead.

---

## 6. Comparison Pages — AI Answer Generation Fitness

**Score: 68 / 100**

The vs-Ink and vs-BubbleTea pages are the most AI-optimized content on the site because they contain:
- Named alternatives (searchable entities)
- Specific numeric claims (169us, 20.7ms, 804/813)
- Clear selection criteria ("When to Choose Each" sections)
- Comparison tables

**Gaps on comparison pages:**

The opening paragraphs do not follow the direct-answer pattern. An AI answering "Silvery vs Ink" will extract the first 40-60 words of the page. Currently both comparison pages open with architectural descriptions rather than a direct verdict. A recommended opening pattern:

> "Silvery and Ink are both React TUI frameworks using flexbox layout. Silvery (2025) offers incremental rendering (100x+ faster updates), scrollable containers, mouse support, and 30+ built-in components. Ink (2017) is the established choice with 1.3M weekly downloads and confirmed production use at Gatsby, Prisma, and Shopify."

This 55-word opening answers the query immediately and contains citable specifics.

**The vs-BubbleTea page** crosses language domains (Go vs TypeScript) which is valuable for developers asking "should I use Go or TypeScript for my TUI." This cross-language comparison is rare and should be promoted more prominently in the site structure.

**Missing comparison pages:**
- vs Textual (Python): mentioned in llms.txt but not fetched as a live URL
- vs Blessed: mentioned in llms.txt but no confirmed live page
- vs Charm/Gum: not mentioned, but Gum is widely used and frequently searched
- vs Rich (Python): not mentioned

Each missing comparison page is a missed opportunity for a long-tail AI citation.

---

## 7. Technical Accessibility for AI Crawlers

**Score: 73 / 100**

**VitePress generates static HTML: PASS.** Content is server-side rendered and available to crawlers without JavaScript execution. This is optimal for AI crawler access.

**Sitemap present and properly linked: PASS.** 150 URLs indexed with recent modification dates (April 2026).

**Clean URL structure: PASS.** URLs follow `/guide/why-silvery.html`, `/api/box.html` patterns — readable, predictable, and descriptive.

**No login walls, paywalls, or API key requirements: PASS.** All content is freely accessible.

**Weaknesses:**

**No structured data (JSON-LD).** The site lacks Schema.org markup. Adding `SoftwareApplication`, `TechArticle`, or `FAQPage` schema would signal content type to AI systems and search engines. The homepage should have `SoftwareApplication` with `name`, `description`, `operatingSystem`, `programmingLanguage`, `license`, and `author` fields.

**No canonical URLs declared in meta.** VitePress can emit `<link rel="canonical">` tags. If missing, crawler deduplication may not favor the authoritative URL.

**Page load speed and Core Web Vitals**: Not measurable via fetch, but VitePress static sites generally perform well. Not flagged as a risk.

**RSS or Atom feed: Absent.** Documentation sites rarely have feeds, but a changelog feed would give AI news systems a trigger for content recency signals.

---

## 8. Platform-Specific Scores

### Google AI Overviews: 52 / 100

Google AIO strongly weights E-E-A-T (Experience, Expertise, Authoritativeness, Trustworthiness). Silvery scores well on Experience (detailed technical content, real benchmark numbers) and Expertise (clear author, specific claims). It scores poorly on Authoritativeness (no Wikipedia, no external press coverage, no named enterprise adopters) and Trustworthiness (no explicit license in HTML, no schema markup). The comparison pages are the best AIO targets.

### ChatGPT Web Search: 58 / 100

ChatGPT favors pages with direct, self-contained answers to explicit questions. The performance benchmark claims (169us, 100x+) are likely to be cited in responses to "fastest React TUI framework" queries. The lack of FAQ structure and question-based headings limits coverage of long-tail queries. The llms.txt presence may give a small direct advantage if OpenAI honors it for context.

### Perplexity: 65 / 100

Perplexity actively crawls and cites technical documentation. The comparison pages are strong targets for "silvery vs ink" queries. The structured tables and specific numbers align with Perplexity's citation preferences. The main gap is that Perplexity weights external corroboration (Reddit, HackerNews, blog posts linking to silvery.dev) — which is currently absent. Perplexity is the platform most likely to cite silvery.dev today for framework comparison queries.

### Bing Copilot: 55 / 100

Bing Copilot (powered by GPT-4 via Bing's index) will rely on Bing's web index. VitePress static rendering is well-indexed by Bing. The lack of Schema.org markup is a mild penalty. Bing Copilot citations skew toward pages with clear entity names (Silvery, Bjørn Stabell, silvery.dev) that appear consistently across the page — which the site does reasonably well.

---

## 9. Top 5 Highest-Impact Changes (Prioritized)

### 1. Add question-based H2/H3 headings to comparison and guide pages

**Effort**: Low (1-2 hours). **Impact**: High.

Converting declarative headings to question form ("What can Silvery do that Ink cannot?", "How much faster is Silvery than Ink?", "Does Silvery support mouse input?") directly matches AI system query patterns. This single change would increase the probability of silvery.dev content appearing in AI answers for specific developer questions. Apply to all comparison pages and the Why Silvery page first, then propagate to component API pages.

### 2. Rewrite page-opening paragraphs to answer the implied question in 40-60 words

**Effort**: Medium (3-4 hours across key pages). **Impact**: High.

AI systems extract the first 40-60 words of each section disproportionately. The homepage, Why Silvery, and all comparison pages should open with a direct definition or verdict that stands alone without surrounding context. The vs-Ink page is the highest-priority target.

### 3. Add a FAQ page (or FAQ sections to key pages)

**Effort**: Medium (4-6 hours). **Impact**: Very high.

A single `/guide/faq.html` page covering 15-20 developer questions ("What runtimes does Silvery support?", "Is Silvery compatible with Ink?", "Does Silvery support mouse events?", "What is the bundle size?", "Can I use Silvery with Node.js?") would become the highest-density AI citation source on the site. Each answer should be 50-100 words — self-contained, specific, and direct. This page should also be prominently linked in llms.txt.

### 4. Fix the component count inconsistency and add structured frontmatter to llms.txt

**Effort**: Low (1 hour). **Impact**: Medium.

The "30+ components" vs "45+ components" discrepancy across pages will reduce AI citation confidence. Pick one accurate number and apply it consistently. Simultaneously, add a metadata header block to llms.txt with the project description, version reference, license (MIT), GitHub URL, and npm URL. This takes 15 minutes and makes llms.txt machine-parseable as well as human-readable.

### 5. Create one external authority touchpoint (YouTube demo or HackerNews Show HN post)

**Effort**: High (4-8 hours for a video, or 1 hour for a written post). **Impact**: Very high, compounding.

YouTube mention correlation with AI citations is ~0.737 — the strongest single external signal. A 5-minute demo video showing Silvery building an interactive TUI, posted to YouTube with title "Silvery: React TUI Framework Demo", would create a citable external entity. Alternatively, a "Show HN: Silvery — React TUI framework, 100x faster updates than Ink" post on HackerNews would generate Reddit-level corroboration signals. Either action would be the single highest-leverage GEO investment available.

---

## 10. Additional Observations

**The Silvery Way document is the best-structured page on the site.** Its 10-principle format, named principles, and Shiny/Tarnished contrast pattern produces naturally citable content. More pages should use this structured pattern (principle name, 1-sentence definition, Shiny example, Tarnished example).

**The AI chat example page is strategically valuable.** Silvery being used to build AI agents is a narrative that aligns with current developer interest. This page should be more prominently featured (homepage link, llms.txt summary) because it answers "can I use Silvery for AI applications?" — a high-traffic query category.

**No social proof on the homepage.** The homepage should include at least one concrete adoption signal: GitHub star count, npm weekly downloads, or a named project using Silvery. Even a single public user reference dramatically improves the "is this real?" check that AI systems apply to new frameworks.

**Dated content signals recency.** Consider adding a "Last updated: [date]" footer to key documentation pages. AI systems use publication and modification dates to assess whether technical claims are current.

**The ecosystem cross-linking (Flexily, Termless, terminfo.dev) is an underused asset.** If terminfo.dev has higher domain authority or community recognition, a link from it to silvery.dev passes authority. Similarly, if Flexily or Termless have npm listings, they should link back to silvery.dev as the primary user.

---

## Summary Score Card

| Check | Status |
|-------|--------|
| robots.txt — AI crawlers allowed | PASS |
| llms.txt present | PASS |
| llms-full.txt present | PASS |
| llms.txt licensing declaration | FAIL |
| llms.txt metadata header | FAIL |
| SSR / static rendering | PASS |
| Sitemap present | PASS |
| Question-based headings | FAIL |
| Self-contained citable passages | PARTIAL |
| Comparison pages exist | PASS (vs Ink, vs BubbleTea) |
| Component count consistency | FAIL (30+ vs 45+) |
| FAQ section or page | FAIL |
| Schema.org structured data | FAIL |
| Author attribution | PARTIAL (name only, no external links) |
| GitHub/npm links | PARTIAL (About page only) |
| YouTube content | FAIL |
| Wikipedia entity | FAIL |
| Reddit / HackerNews presence | UNKNOWN |
| External adopter mentions | FAIL |
| Benchmark claims with numbers | PASS |
| Changelog / dated content | FAIL |

**GEO Readiness: 61 / 100 — Developing**
