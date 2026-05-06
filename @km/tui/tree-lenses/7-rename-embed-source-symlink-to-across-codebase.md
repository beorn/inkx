---
mentions:
  - km
id: "@km/tui/tree-lenses/7-rename-embed-source-symlink-to-across-codebase"
aliases:
  - km-tui.tree-lenses.7
  - km-tui-tree-lenses-7
  - "@km/tui/tree-lenses/7"
created_by: Bjørn Stabell
created_at: 2026-04-05T23:17:41Z
closed_at: 2026-04-06T03:09:50Z
close_reason: embed_source renamed to symlink_to across 104 files. DB schema
  updated with ALTER TABLE migration. All tests pass.
owner: bjorn@stabell.org
---

# [x] Rename embed_source → symlink_to across codebase @km/tui #task #P3

Rename KNode.embed_source to KNode.symlink_to across all packages.

Our embed IS a symlink — it structurally replaces the node with the target's
content and children. We don't have a separate non-embed link system;
[[wikilinks]] in content are just inline links.

Naming:

- symlink_to: structural embed (node-level, displays target content + children)
- [[wikilink]]: inline link (content-level, navigates on click)

This is a /refactor migrate — mechanical find-replace + tsc-guided fixes.

Acceptance:

- grep 'embed_source' in src/ = 0 (all packages)
- All tests pass

