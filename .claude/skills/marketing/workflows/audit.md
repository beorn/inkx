# Content Audit Workflow

Monthly health check on content freshness, SEO performance, and quality.

## Checklist

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

### Linking Health

Internal and external linking directly impacts SEO authority and user experience.

**Internal links** (between your own pages):
- [ ] Every entity mention auto-linked via glossary-links plugin + linkify-content.ts
- [ ] New content files (terminals, features, standards) added to glossary map
- [ ] Cross-links between related pages (terminal ↔ standard, feature ↔ baseline)
- [ ] No orphan pages (every page reachable from sidebar + at least 2 internal links)

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

## After Audit

1. Create beads for any stale content that needs refresh
2. Update SKILL.md tracker with audit date and findings
3. Prioritize refreshes vs new content for next month
