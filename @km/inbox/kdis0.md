---
mentions:
  - km
id: "@km/inbox/kdis0"
aliases:
  - km-kdis0
  - "@km/_orphan/kdis0"
created_by: claude:40fd010c
created_at: 2026-03-02T23:00:30Z
closed_at: 2026-03-02T23:04:34Z
owner: bjorn@stabell.org
---

# [x] Extract embed alias resolver from TreeNode.tsx @km/_orphan #task #P3

DRY: Extract embed alias/display resolution functions from TreeNode.tsx into apps/@km/tui/src/utils/embedAliases.ts. Currently 5 functions handle embed display logic inline in TreeNode.tsx:

- resolveEmbed(repo, node) — resolves embed_source to target node
- cleanEmbedRef(ref) — strips raw block refs for display
- tryResolveEmbedRef(repo, ref) — fallback reference resolution
- getDisplayContent(repo, node, displayNode, resolvedNode, isEmbedded) — full display pipeline
- cleanContentForDisplay(content) — defense-in-depth ![[]] stripping

Extract into a unified resolveEmbedAlias(repo, node) that encapsulates the full alias-to-display-text pipeline. Enables reuse from search, CLI, detail pane. Prevents test drift when embed display logic changes.

Mentioned in retros Feb 26 + Feb 27 (twice). Do when TreeNode.tsx is next touched.

