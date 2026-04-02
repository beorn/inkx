# SEO Health Check

Quick verification that SEO infrastructure is working correctly across all sites.
Run monthly or after major deployments.

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

3. Check Google Search Console:
   - [ ] No new crawl errors
   - [ ] Pages indexed count stable or growing
   - [ ] No manual actions

## After Check

Update SKILL.md SEO Audits table with check date and any issues found.
Create beads for any regressions.
