# Infrastructure Workflow

Set up and maintain the content marketing platform.

## Initial Setup (Phase 0)

### Per-Site SEO Foundations

For each site (terminfo.dev, silvery.dev, termless.dev, flexily.dev):

1. **robots.txt** — Add to `docs/public/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://{site}/sitemap.xml
   ```

2. **Search Console** — Submit sitemap at `https://{site}/sitemap.xml` to:
   - Google Search Console
   - Bing Webmaster Tools

3. **Canonical URLs** — Ensure VitePress config has `head` meta with canonical

4. **Breadcrumb schema** — Add BreadcrumbList JSON-LD to page layouts

5. **Analytics** — Add Plausible script to VitePress config `head`:
   ```html
   <script defer data-domain="{site}" src="https://plausible.io/js/script.js"></script>
   ```

### Blog Infrastructure (silvery.dev)

1. Replace `docs/blog/index.md` placeholder with blog list page
2. Add `docs/blog/posts/` directory for markdown posts
3. Add VitePress data loader for blog post discovery
4. Add RSS feed generation (use `feed` package in buildEnd hook)
5. Test locally with `bun run docs:dev`

### Newsletter

1. Create account on Beehiiv (or Buttondown)
2. Set up "Silver Bulletin" (or similar name) newsletter
3. Add signup embed/link to all four sites
4. Plan monthly cadence

### OG Image Generation (terminfo.dev)

Add auto-generated Open Graph images for comparison and feature pages using `@vercel/og` or similar.

## Maintenance

Run monthly:
- Verify all sitemaps are being crawled (Search Console)
- Check for 404s in Search Console
- Verify RSS feed is valid
- Update Plausible goals if needed
