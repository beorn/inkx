# Write Article Workflow

Write a blog article from the content strategy plan.

## Input

Article ID from the strategy doc (e.g., "2.1" for Phase 2 article 1, "A3" for Building Silvery series #3, "B8" for Terminal History #8).

## Steps

### 1. Look Up Article Details

Read `vendor/internal/market/km-ecosystem-content-strategy.md` and find the article by ID. Extract:
- Title
- Description
- Site (silvery.dev / terminfo.dev / termless.dev / beorn.codes/flexily)
- Tags
- Content type (tutorial / deep-dive / comparison / ecosystem / reference / history)

### 2. Research & Outline

Based on content type:

**Tutorial**: Identify the exact code to write. Ensure it runs against current package versions. Plan step-by-step structure.

**Comparison/Migration**: Gather real data — benchmarks, feature matrices, bundle sizes. No speculation. Every claim must be verifiable.

**Deep Dive**: Read the relevant source code. Explain what actually happens, not what should happen. Include code snippets from the real codebase.

**Reference**: Pull data from terminfo.dev's features.json, results, and annotations. Every claim linked to a source.

**History**: Research via web search. Cite sources. Include dates, names, and specific facts. Surprise the reader.

### 3. Write Draft

Guidelines:
- **1500-3000 words** (not shorter, not longer)
- **SEO-first title** matching what developers actually search for
- **Code examples must compile and run** — test every snippet
- **Honest about limitations** — "Silvery doesn't support X yet" builds trust
- **Show, don't tell** — benchmarks > adjectives, code > prose
- **No marketing speak** — "blazingly fast" is banned. Show numbers.
- **Named author** — "By [name], maintainer of [project]"
- **Last tested date** on benchmarks and comparisons

### 4. Frontmatter

```yaml
---
title: "SEO-Optimized Title Here"
description: "150-160 char description with primary keyword"
date: YYYY-MM-DD
author: "Author Name"
tags: [tag1, tag2, tag3]
canonical: "https://[site]/blog/[slug]"
lastTested: "YYYY-MM-DD"  # For benchmarks/comparisons
---
```

### 5. CTA

Every article ends with one primary CTA:
- Tutorial → "Get started: `npm install silvery react`"
- Comparison → "Try it yourself: [quickstart link]"
- Deep dive → "Explore the source: [GitHub link]"
- Reference → "See the full matrix: [terminfo.dev link]"

### 6. Internal Links

Include 2-4 internal links to:
- Related articles on the same site
- Cross-site links (terminfo.dev ↔ silvery.dev)
- Docs pages
- GitHub repos

### 7. Review Checklist

- [ ] Title matches search intent (check Google autocomplete)
- [ ] All code examples tested and working
- [ ] Benchmark numbers reproducible
- [ ] No broken links
- [ ] Meta description under 160 chars
- [ ] At least 2 internal links
- [ ] Primary CTA present
- [ ] "Last tested" date on benchmarks
- [ ] Images/screenshots have alt text
- [ ] No marketing speak or superlatives without evidence

### 8. Save

Write the article to the appropriate site's blog directory:
- silvery.dev: `vendor/silvery/docs/blog/posts/YYYY-MM-DD-slug.md`
- terminfo.dev: `vendor/terminfo.dev/docs/blog/posts/YYYY-MM-DD-slug.md`
- termless.dev: `vendor/termless/docs/blog/posts/YYYY-MM-DD-slug.md`
- beorn.codes/flexily: `vendor/flexily/docs/blog/posts/YYYY-MM-DD-slug.md`

### 9. Update Tracker

Update the execution tracker in `/marketing SKILL.md` with the article status.
