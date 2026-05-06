---
mentions:
  - km
  - claude
id: "@km/storage/move-with-rewrite-refs"
aliases:
  - km-storage.move-with-rewrite-refs
  - km-storage-move-with-rewrite-refs
created_by: claude:da9990c5
created_at: 2026-04-28T19:10:43Z
started_at: 2026-04-28T19:13:18Z
owner: bjorn@stabell.org
assignee: claude:da9990c5
dependencies:
  - issue_id: km-storage.move-with-rewrite-refs
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-28T12:10:42Z
    created_by: claude:da9990c5
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage
---

# [/] Move/rename primitive that rewrites all incoming references (wikilinks, aliases, inline mentions) @km/storage #feature #P2 @claude:da9990c5

blocks:: [[@km/storage]]

Build a reusable move/rename primitive in @km/storage that rewrites every incoming reference when a node moves or is renamed. Used by ALL move/rename commands by default — km move, bd rename, future bd promote, etc.

Current state (gaps):

- km move: re-parents only (data layer). Wikilinks pointing at the moved node still resolve via name match IF the name didn't change.
- bd rename: changes id only. Wikilinks pointing at old name fail until rewritten.
- Backlink query exists (repo.getBacklinks) but no rewrite tool wired into commands.

Required primitive: repo.moveNodeWithRefs(id, { newName?, newParentId? }) that:

1. Computes the new path-form (frontmatter id) from name/parent change
2. Walks all .md files in the vault
3. Rewrites:
  - Wikilinks: [[old-path]] → [[new-path]], [[old-path|alias]] → [[new-path|alias]], ![[old-path]] → ![[new-path]]
  - Frontmatter aliases referencing old-path (when migrated beads add new-path to aliases of unchanged files)
  - Inline mentions matching the rewriteLegacyIdMentions regex (bare @<prefix>/old-path)
  - Dep edges: blocks::/blocked-by::/related:: lists
4. Updates the moved file: id frontmatter + filesystem path
5. Returns { rewroteFiles: number, rewroteRefs: number } for reporting

Wiring:

- km move (apps/@km/_orphan/cli/src/commands/move.ts) — call by default
- bd rename (apps/@km/_orphan/cli/src/commands/bd.ts:948) — call by default
- --no-rewrite flag for opt-out (if perf is an issue or user wants legacy behavior)

TUI background-task variant:

- In km view (interactive), if move/rename is invoked and rewrite is expected to be slow (>200ms or >100 files to scan), spawn it as a background task with progress reporting in the status bar. The data-layer move applies immediately (instant); only the file-rewrite walk runs async.

Performance: walking ~5000 .md files for grep should take <500ms with parallel reads. Use Bun.glob + Bun.file().text() with a worker pool. Cache the glob result if multiple moves happen in succession.

Tests:

- Wikilink rewrite (basic + with alias + transclusion ![[]])
- Frontmatter aliases rewrite
- Inline mentions rewrite (bare @prefix/path)
- Dep edges rewrite
- Backlink count before/after matches
- File location update
- Concurrent move-from-the-same-vault (ordering / conflict)
- --no-rewrite opt-out preserves legacy behavior
- TUI background-task variant (deferred — separate sub-bead)

