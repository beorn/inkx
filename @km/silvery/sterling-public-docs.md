---
id: "@km/silvery/sterling-public-docs"
aliases:
  - km-silvery.sterling-public-docs
  - km-silvery-sterling-public-docs
created_by: claude:4274df30
created_at: 2026-04-19T21:43:30Z
closed_at: 2026-04-25T06:43:41Z
close_reason: "Phase E shipped: silvery de59e988 (silvery.dev refreshed for
  0.20.0/0.21.0) + 894fa7f1 (Vue-mustache pin), pushed to origin/main. 28 doc
  pages updated, new docs/guide/sterling.md primer added. km submodule pointer
  bumped via 894d5fd69."
owner: bjorn@stabell.org
assignee: claude:4274df30
dependencies:
  - issue_id: km-silvery.sterling-public-docs
    depends_on_id: km-all.sterling
    type: parent-child
    created_at: 2026-04-24T16:12:57Z
    created_by: claude:5e447b66
    metadata: "{}"
  - issue_id: km-silvery.sterling-public-docs
    depends_on_id: km-silvery.sterling-2d-release
    type: blocks
    created_at: 2026-04-19T14:43:30Z
    created_by: claude:4274df30
    metadata: "{}"
  - issue_id: km-silvery.sterling-public-docs
    depends_on_id: km-silvery.sterling-2e-interior-migration
    type: blocks
    created_at: 2026-04-24T16:14:50Z
    created_by: claude:5e447b66
    metadata: "{}"
---

# [x] Sterling: update silvery.dev public docs for 0.19.0 @km/silvery #task #P2 @claude:4274df30

blocks:: [[@km/all/sterling]], [[@km/silvery/sterling-2d-release]], [[@km/silvery/sterling-2e-interior-migration]]

After Sterling 0.19.0 ships, update silvery.dev public docs to reflect the new Theme shape, the 'Sterling' name, and the flat-token primacy.

## Scope (12 pages)
- vendor/silvery/docs/guide/styling.md
- vendor/silvery/docs/guide/theming.md
- vendor/silvery/docs/guide/token-taxonomy.md → rename or consolidate
- vendor/silvery/docs/guide/custom-tokens.md
- vendor/silvery/docs/guide/color-schemes.md
- vendor/silvery/docs/reference/theme.md
- vendor/silvery/docs/reference/theming.md
- vendor/silvery/docs/reference/style.md
- vendor/silvery/docs/components/ThemeProvider.md
- vendor/silvery/docs/themes.md (live preview landing)
- New: vendor/silvery/docs/guide/sterling.md (Sterling introduction / blog-shape)
- vendor/silvery/docs/guide/the-silvery-way.md (mentions of tokens)

## Approach
Each page reviewed individually — preserve SEO surface, don't merge ranked URLs without explicit user approval. Update code examples to new Theme shape + flat tokens + 'design' namespace.

DEPENDS: sterling-2d-release
Parent: @km/silvery/theme-v4