---
id: "@km/terminfo/linkify-plugin"
aliases:
  - km-terminfo.linkify-plugin
  - km-terminfo-linkify-plugin
created_by: claude:f8196c1c
created_at: 2026-03-26T06:53:30Z
closed_at: 2026-03-26T06:59:02Z
close_reason: Custom markdown-it glossary-links plugin replaces
  vitepress-plugin-glossary. 147 links on /standards page (was 1).
  Longest-match-first, every occurrence, works inside bold/italic, skips
  code/headings/existing links. data-tooltip for hover descriptions.
---

# [x] Custom markdown-it plugin: glossary tooltips + entity auto-linking (replace vitepress-plugin-glossary) @km/terminfo #task #P2 @claude:f8196c1c

The third-party vitepress-plugin-glossary is underperforming — only matches ~1 term per page despite 130+ terms. Write our own markdown-it plugin that:

1. Longest-match-first (Kitty Extensions before Kitty, Kitty keyboard protocol before Kitty)
2. Links every occurrence (not just first)
3. Works inside bold, italic, and other inline formatting
4. Combines glossary tooltip + page link in one element
5. data-tooltip for hover description, href for click-through
6. Loads terms from content/*.json (glossary, terminals, frameworks, standards, categories, baselines)
7. Handles both internal links (/terminal/kitty) and external links (spec URLs)
8. Skips terms inside code blocks, existing links, and headings
9. CSS: dotted underline always, brand color on hover, tooltip on hover

Replaces: vitepress-plugin-glossary + our custom GlossaryTooltip.vue component
Keeps: linkify-content.ts for v-html params (Vue template content that markdown-it can't reach)

Implementation: markdown-it plugin at docs/.vitepress/plugins/glossary-links.ts