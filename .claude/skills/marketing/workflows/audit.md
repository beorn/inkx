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
- [ ] Check for broken links

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
