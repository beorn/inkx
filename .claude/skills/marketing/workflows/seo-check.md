# SEO Health Check

Quick verification that SEO infrastructure is working correctly across all sites.
Run monthly or after major deployments. For a full audit, use `/marketing seo <site>`.

## Quick Check (5 minutes)

For each site (silvery.dev, terminfo.dev, termless.dev, beorn.codes/flexily):

1. Fetch homepage and one inner page
2. Verify:
   - [ ] Meta description is unique (not the generic site description)
   - [ ] OG tags present (og:title, og:description, og:image)
   - [ ] OG image is PNG (not SVG)
   - [ ] JSON-LD schema present (WebSite, BreadcrumbList, TechArticle)
   - [ ] Canonical URL present
   - [ ] No broken links on homepage

3. Check Google Search Console (manual — requires browser):
   - [ ] No new crawl errors
   - [ ] Pages indexed count stable or growing
   - [ ] No manual actions

## After Check

Update SKILL.md SEO Audits table with check date and any issues found.
Create beads for any regressions under `km-market.seo`.

## When to Run

- After major site changes (new pages, restructuring, schema changes)
- Every 3 weeks as a routine check
- After deploying SEO fixes (to verify they landed)

## Full Audit vs Quick Check

| | Quick Check | Full Audit |
|--|-------------|------------|
| **Command** | `/marketing check` | `/marketing seo <site>` |
| **Time** | 5 min | 15-30 min per site |
| **Agents** | None (direct fetch) | 7 specialist agents |
| **Scope** | Spot-check 2 pages/site | Full crawl, all pages |
| **Output** | Pass/fail checklist | Score, report, action plan |
| **Cadence** | Monthly / after deploys | Quarterly |
