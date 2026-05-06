---
mentions:
  - km
  - claude
id: "@km/silvery/era2-docs-reorg"
aliases:
  - km-silvery.era2-docs-reorg
  - km-silvery-era2-docs-reorg
created_by: claude:fed8de9e
created_at: 2026-03-25T04:35:56Z
closed_at: 2026-03-25T07:36:41Z
close_reason: "Docs reorganized into era2a/era2b/refs/archive structure:
  composability → era2a/, signals+commands+app → era2b/,
  decisions+migration+playground+landscape → refs/,
  architecture+rendering+packaging → archive/ (with deprecation headers).
  Overview and headless stay at root."
owner: bjorn@stabell.org
assignee: claude:fed8de9e
---

# [x] Era2 docs: file move to era2a/era2b/refs/archive structure @km/silvery #task #P2 @claude:fed8de9e

Perform the doc restructuring from 00-overview.md File Map.

1. Create dirs: era2a/, era2b/, refs/, archive/
2. Move files per file map
3. Add deprecation headers to archive/
4. Update all cross-references (links between docs)
5. Update era2b docs to reflect: render() direction, D30, D36, era2a-first boundary
6. Stub era2b/examples.md

Delete: old file locations (after move). No dangling cross-references.
/complete: grep for old file paths in all .md files → 0 hits. All links resolve. No docs reference archived files without 'archive/' prefix.

See 00-overview.md §File Map for exact mapping.

