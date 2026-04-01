# Infrastructure Workflow

Set up and maintain the content marketing platform.

## Initial Setup (Phase 0)

### Per-Site SEO Foundations

For each site (terminfo.dev, silvery.dev, termless.dev, beorn.codes):

1. **robots.txt** — Add to `docs/public/robots.txt`:
   ```
   User-agent: *
   Allow: /
   Sitemap: https://{site}/sitemap.xml
   ```

2. **Sitemap** — VitePress auto-generates from `sitemap: { hostname: "https://{site}" }` in config.
   For beorn.codes (multi-subpath), create a root sitemap index that references each subpath's sitemap.

3. **Search Console** — Submit to Google Search Console:
   - Own-domain sites: submit as domain property (terminfo.dev, silvery.dev, termless.dev)
   - beorn.codes: covers /flexily, /loggily, /mdspec in one property
   - Verify via DNS TXT record (recommended) or HTML file upload
   - Submit sitemap URL after verification

4. **Canonical URLs** — `@bearly/vitepress-enrich` seoTransformPageData handles this via sitemap.hostname

5. **JSON-LD schemas** — `@bearly/vitepress-enrich` provides: BreadcrumbList, TechArticle, SoftwareSourceCode (auto for /api/), FAQPage (frontmatter.faq), HowTo (frontmatter.howto)

6. **Glossary auto-linking** — `@bearly/vitepress-enrich` glossaryPlugin + loadTerminalGlossary() for shared terminal vocabulary

7. **Analytics** — All sites use Cloudflare Web Analytics (beacon.min.js). Optional: Plausible:
   ```html
   <script defer data-domain="{site}" src="https://plausible.io/js/script.js"></script>
   ```

### Current Status (2026-04-01)

| Site | robots.txt | Sitemap | Search Console | JSON-LD | Glossary |
|------|-----------|---------|----------------|---------|----------|
| terminfo.dev | Done | Done | Submitted | Done (custom) | Done (600+ terms) |
| silvery.dev | Done | Done | Submitted | Done (vitepress-enrich) | Done (211 terms) |
| termless.dev | Done | Done | Submitted | Done (vitepress-enrich) | Done (180 terms) |
| beorn.codes | Done | Needs root index | Submitted | Partial | — |
| beorn.codes/flexily | Done | Done | Via beorn.codes | Partial | — |
| beorn.codes/loggily | Done | Done | Via beorn.codes | Partial | — |

### Auto-Linking Infrastructure (all sites)

Every site should have automatic entity linking in both markdown content and Vue template params.

**Two systems work together**:

1. **markdown-it plugin** (`docs/.vitepress/plugins/glossary-links.ts`):
   - Processes markdown text tokens at build time
   - Handles: glossary acronyms, terminal names, framework names, standard names, category names, baseline names
   - Renders: `<a href="/path" class="hover-link" data-tooltip="description">Term</a>`
   - Longest-match-first, every occurrence, works inside bold/italic
   - Skips: code blocks, existing links, headings

2. **Build-time linkifier** (`docs/data/linkify-content.ts`):
   - Processes string params passed to Vue templates via paths.ts
   - Handles: same entities as the plugin
   - Used for: category descriptions, standard descriptions, feature body/probe text, terminal body
   - Called in each `[id].paths.ts` file: `linkifyContent(description)`

**Data sources** (both systems read from these):
- `content/glossary.json` — acronyms + compound terms (SGR, CSI, Kitty keyboard protocol)
- `content/terminals.json` — terminal names → /terminal/{slug}
- `content/frameworks.json` — framework names → /framework/{id}
- `content/standards.json` — standard names → /{id}
- `content/categories.json` — category names → /{id}
- `content/baselines.json` — baseline names → /baseline/{id}

**To add a new linkable term**: add it to the appropriate content JSON file. Both systems pick it up on next build.

**CSS** (`docs/.vitepress/theme/glossary-override.css` + `tooltip.css`):
- Dotted underline always visible (text-3 color)
- Brand color on hover for linked terms
- data-tooltip shows on hover (max-width 300px, wraps)

**For new sites** (silvery.dev, termless.dev, beorn.codes/flexily): copy the plugin + linkifier + CSS pattern. Create site-specific content JSON files with the entities relevant to that site.

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
