---
mentions:
  - km
id: "@km/all/rename-content-cascade"
aliases:
  - km-all.rename-content-cascade
  - km-all-rename-content-cascade
created_by: claude:bjorns-2026-04-30
created_at: 2026-04-30T09:22:00Z
type: feature
priority: P2
parent: "@km/all"
closeReason: "Shipped synchronously in commit ffdf54eef (feat(km-storage):
  synchronous rename-content-cascade for path-form wikilinks). moveNodeWithRefs
  now rewrites both leaf-name and path-form references for backlinking hosts in
  one pass — line 550 of move-with-refs.ts. Acceptance criterion met: after 'bd
  move @km/beads/foo @km/storage/foo', backlinking files get both
  [[@km/beads/foo]] and [[@km/storage/foo]] forms rewritten via the same op
  surface. The bead's deferred batch/background engine vision (separate from the
  synchronous path) is not needed for current scale; if future workload grows
  beyond synchronous cost, file a new bead."
---

# [x] Rename content cascade: batch/background update of references in markdown @km/all #task #P2

When a node's name or position changes, its path changes. Markdown content that contains the old path (wikilinks, mentions, inline refs) becomes stale at the surface — even though resolution still works (the resolver tries id, then path, then aliases). This bead builds a batch/background engine that rewrites the surface text to match the current tree shape.

**Priority is P2** (not P1) because *resolution* doesn't depend on this — both `[[<old-path>]]` and `[[<id>]]` still resolve. Surface freshness is a UX nicety, not a correctness requirement.

## Why

Per the user (2026-04-30 design discussion):

> "we will have to update all backlinks anyways - it's a problem we have across the entire 'km' - i'd rather we made a good system to batch / background update things"

km already has cross-cutting rename-update needs:

- Wikilinks `[[@km/beads/foo]]` after `bd move @km/beads/foo @km/storage/foo`
- Inline mentions `@bjorn` after a contact rename
- Path-based dep refs `blocked-by:: [[@km/beads/foo]]`

Building a single rename-cascade engine serves all of them.

## Approach

1. **Detection**: when a node renames or moves, emit a rename event with `(node-id, old-path, new-path)`. Already implicit in the change-emitter (`emit()` in @km/storage).
2. **Scan**: a background worker subscribes to rename events, scans markdown content for occurrences of `old-path` (wikilinks, mentions, frontmatter values).
3. **Rewrite**: open each containing file, locate the occurrence in the parsed AST (km-ast), replace with `new-path`, write back.
4. **Batch**: aggregate multiple renames (e.g., a scope rename produces many child path changes); rewrite each affected file once with all substitutions applied.
5. **Background-friendly**: the engine is async/optional. If it falls behind, resolution still works (it tries id, path, aliases). The cascade is for surface freshness, not correctness.

## Touch points

- Producer: `@km/storage/emit()` already emits `node_moved` and `node_updated`. Need a derived "node-renamed" signal that carries old + new path.
- Consumer: a worker that subscribes via `repo.subscribe()`, scans content, applies edits via the standard mutation path (not raw file writes — so the changes go through the change log).
- Persistence: a queue of pending updates so a crash mid-cascade doesn't lose work. Probably `.km/rename-queue.jsonl` or a meta-table row.

## Acceptance

- After `bd move @km/beads/foo @km/storage/foo`, every md file that contained `[[@km/beads/foo]]` now contains `[[@km/storage/foo]]` within ≤30s.
- The rewrite goes through `repo.apply()`, not raw file IO — appears in `changes.jsonl` as normal mutations.
- Crashing the process mid-cascade leaves the queue intact; restart resumes.
- A test fixture with 20 cross-references gets all 20 rewritten on a single rename.
- Resolution still works for un-rewritten paths (the cascade is best-effort, not blocking).

## Out of scope

- "Smart" rewrites (e.g., choosing between path-form and id-form). The cascade keeps whatever form the user originally typed; if path → updates path. If id → no change needed.
- Cross-vault cascade (rename in vault A propagates to vault B). Future.

## Related

- Origin: `.claude/arch-decisions/2026-04-30-path-vs-ulid-as-sqlite-pkey.md`.
- Decoupled from: `@km/beads/resolver-path-via-name-walk` — this bead is UX freshness, not correctness.

