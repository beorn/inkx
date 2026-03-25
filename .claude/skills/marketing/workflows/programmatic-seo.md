# Programmatic SEO Workflow

Generate and maintain programmatic pages from structured data.

## When to Run

- After a census run adds new terminals or features to terminfo.dev
- After adding new components to silvery
- After adding new properties to flexily
- Monthly: check for data staleness

## terminfo.dev Pages

### Terminal Comparisons (Already Implemented)

66 pairwise comparison pages at `/compare/{a}-vs-{b}`. Auto-generated from `docs/compare/[id].paths.ts`.

**To update**: Run a new census, rebuild the site. New terminals automatically generate new comparison pairs.

```bash
cd vendor/terminfo.dev
bun terminfo probe termless --all   # Run headless probes
bun terminfo probe app --all        # Run app probes
bun run build                       # Rebuild site (comparisons auto-generated)
```

### Use-Case Profile Pages (Not Yet Implemented)

Generate pages at `/best-for/{use-case}` by aggregating features by use-case category.

**Implementation**:
1. Create `docs/best-for/[id].paths.ts` — define use cases and their required features
2. Create `docs/best-for/[id].md` — template ranking terminals by category support %
3. Update config.ts — add to nav/sidebar, add SEO meta

**Use cases to generate**:
- tui-development (cursor, modes, SGR, mouse, keyboard)
- devops-automation (bracketed paste, modes, DSR, scroll regions)
- remote-ssh (clipboard OSC 52, focus reporting, synchronized output)
- unicode-emoji (wide chars, ZWJ, variation selectors, grapheme clusters)
- graphics (sixel, kitty graphics, iTerm inline images)
- accessibility (cursor shapes, focus, semantic prompts)

### Standard Adoption Pages (Not Yet Implemented)

Enhance existing tag pages at `/{standard}` with adoption statistics and narrative.

**Implementation**: Modify existing `docs/[id].md` template to add adoption summary at top.

### FAQ Schema (Not Yet Implemented)

Add JSON-LD FAQ schema to feature pages for rich snippets.

**Implementation**: Modify `docs/[category]/[id].md` to include FAQ structured data in the `<script>` block.

## silvery.dev Pages

### Component Gallery (Not Yet Implemented)

Generate per-component pages from component metadata.

### Protocol Support Pages (Not Yet Implemented)

Generate pages documenting silvery's protocol support, cross-linking to terminfo.dev.

## Verification

After any programmatic page generation:

```bash
bun run build              # Build the site
ls docs/.vitepress/dist/   # Count pages
# Verify sitemap includes new pages
cat docs/.vitepress/dist/sitemap.xml | grep -c "<url>"
```
