# Content Audit Workflow

Monthly health check on content freshness, SEO performance, and quality.
Run this as part of `/marketing audit` or after feature releases that touch docs.

## Trigger Points

This audit should run at these moments:
- **Monthly**: Full audit (all sections below)
- **After feature releases**: Enrichment + Linking sections (new APIs/components may need glossary terms)
- **After `/pm review`**: Cross-check open content beads against audit findings
- **After census re-probe**: Freshness section (terminfo.dev data updated)

## Checklist

### Enrichment Health (glossary + auto-linking)

Run `docs:build` for each site and check the `[glossary]` output:

```bash
cd vendor/silvery && bun run docs:build 2>&1 | grep '\[glossary\]'
cd vendor/termless && bun run docs:build 2>&1 | grep '\[glossary\]'
cd vendor/terminfo.dev && bun run build 2>&1 | grep '\[glossary\]'
```

- [ ] No broken glossary links (build warns if hrefs point to non-existent pages)
- [ ] Glossary coverage reasonable (>70% of pages should have at least one auto-link)
- [ ] New doc pages added since last audit have corresponding glossary terms
- [ ] New API exports/components added since last audit are in the glossary
- [ ] Cross-site glossary terms (Flexily, Termless, terminfo.dev, Silvery) still point to correct URLs

**How to find gaps**: grep for component/API names in docs that don't appear in glossary.json:
```bash
# Find component names mentioned in silvery docs but not in glossary
grep -roh '\b[A-Z][a-z]*[A-Z]\w*\b' vendor/silvery/docs/guide/ | sort -u | while read term; do
  grep -q "\"$term\"" vendor/silvery/docs/content/glossary.json || echo "missing: $term"
done
```

### Freshness

- [ ] All benchmark articles have "last tested" dates within 3 months
- [ ] Comparison articles reflect current terminal versions
- [ ] terminfo.dev data reflects latest terminal releases
- [ ] Feature support claims verified against latest census

### SEO Health

- [ ] Check Google Search Console for:
  - Crawl errors (404s, 5xxs)
  - Index coverage (are all pages indexed?)
  - Top queries (any surprises?)
  - Click-through rates (any titles worth A/B testing?)
- [ ] Check sitemap is current
- [ ] Verify canonical URLs are working
- [ ] Check for broken links (internal + external)
- [ ] JSON-LD schemas valid (TechArticle, BreadcrumbList on every non-home page)
- [ ] `lastUpdated` dates are recent (not all pages showing same old date)

### Linking Health

Internal and external linking directly impacts SEO authority and user experience.

**Internal links** (between your own pages):
- [ ] Every entity mention auto-linked via glossary-links plugin + linkify-content.ts
- [ ] New content files (terminals, features, standards) added to glossary map
- [ ] Cross-links between related pages (terminal ↔ standard, feature ↔ baseline)
- [ ] No orphan pages (every page reachable from sidebar + at least 2 internal links)

**Cross-site links** (between ecosystem sites):
- [ ] silvery.dev links to terminfo.dev where terminal capabilities are discussed
- [ ] silvery.dev links to termless.dev in testing content
- [ ] silvery.dev links to beorn.codes/flexily in layout content
- [ ] termless.dev links to terminfo.dev for capability data
- [ ] termless.dev links to silvery.dev for framework integration
- [ ] terminfo.dev links to termless.dev for testing methodology

**External links** (to authoritative sources):
- [ ] Terminal pages link to official websites and GitHub repos
- [ ] Standard pages link to specification documents (ECMA-48 PDF, VT manuals, xterm ctlseqs)
- [ ] Framework pages link to official docs and repos
- [ ] Glossary entries link to external references where appropriate
- [ ] No `rel="nofollow"` on editorial links (only on user-generated or untrusted content)
- [ ] All external links use `target="_blank" rel="noopener"`

**Linking best practices**:
- Every page should have 5+ internal links (to related terminals, features, standards, baselines)
- Every substantive page should have 1-3 external links to authoritative sources
- Anchor text should be descriptive (link "Kitty keyboard protocol" not "click here")
- Auto-linking handles most internal links; manually add external links to editorial content
- The glossary-links markdown-it plugin handles markdown content; linkify-content.ts handles Vue v-html params
- Both systems load from the same content/*.json files — add terms there, not in code

### Content Quality

- [ ] Re-test code examples in top 5 articles (do they still run?)
- [ ] Check npm download trends (are articles driving installs?)
- [ ] Review dev.to/Hashnode cross-posts (formatting intact? canonical correct?)

### Competitive

- [ ] Check if Ink has released significant updates (update comparison if so)
- [ ] Check if new terminal emulators have appeared (add to terminfo.dev)
- [ ] Check if Yoga has released updates (update flexily comparison if so)

### SEO Quick Check
Run `/marketing check` or follow [seo-check.md](seo-check.md).
For a full audit, use `/marketing seo <site>` which delegates to 7 specialist SEO agents.

## After Audit

1. Create beads for any stale content that needs refresh
2. Update SKILL.md tracker with audit date and findings
3. Prioritize refreshes vs new content for next month

## Enrichment Infrastructure

The `@bearly/vitepress-enrich` package provides the shared enrichment engine:

| Component | What | Where |
|-----------|------|-------|
| `glossaryPlugin` | Auto-links terms in markdown prose | markdown-it plugin in VitePress config |
| `createLinkifier` | Linkifies strings for v-html content | Build-time in route generators |
| `seoHead` / `seoTransformPageData` | OG, canonical, breadcrumbs, TechArticle | VitePress config head + hook |
| `validateGlossary` | Build-time link validation + stats | VitePress buildEnd hook |
| `tooltip.css` + `glossary-links.css` | Hover tooltips and link styling | Theme CSS imports |

**Glossary data** lives in `docs/content/glossary.json` in each site repo.
**Build output** shows `[glossary] N terms (X linked, Y tooltip-only, Z external)` on every build.
