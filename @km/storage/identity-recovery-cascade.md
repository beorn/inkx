---
mentions:
  - km
  - claude
id: "@km/storage/identity-recovery-cascade"
aliases:
  - km-storage.identity-recovery-cascade
  - km-storage-identity-recovery-cascade
created_by: claude:8b5b9e1c
created_at: 2026-04-21T20:25:50Z
closed_at: 2026-04-22T07:11:36Z
close_reason: "Shipped 3-step cascade per §3.2/§3.3: Step 1 repo-wide inode
  lookup with inode-reuse validation, Step 2 path fallback, Step 3
  content-hash+parent-dir composite. ReconcileState threaded for cross-dir
  rename support. 4 focused tests in reconcile-inode-cascade.test.ts. Harness
  unlocked: slow 6→10 pass, fuzz 0→4 pass. Post-git-restore Step 3 deferred
  (needs tombstone retention window). Total 7083 pass."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.identity-recovery-cascade
    depends_on_id: km-storage.fs-mount
    type: parent-child
    created_at: 2026-04-21T13:25:50Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
props:
  blocked-by:
    type: link
    target: km-storage.fs-mount
---

# [x] Identity recovery — paths-of-.name (primary) + content-hash/inode/structural heuristics (secondary) @km/storage #feature #P1 @claude:8b5b9e1c

blocks:: [[@km/storage/fs-mount]]

Reconciliation of FS → DB NodeIds for files, headings, blocks, and tags. No markdown pollution — no ULIDs written, no IDs in frontmatter, no inline anchors derived from hashes.

## Primary signal

**Path-of-.name** uniquely identifies a node externally:

- File: [repo, "notes/foo"]
- Heading: [repo, "notes/foo", "my-heading"] (slug, or anchor literal if present)
- Block: [repo, "notes/foo", "rec"] (anchor literal)
- Tag: [repo, sigil_kind, "inbox"]

If a fresh scan matches a DB row on its full path-of-.name, preserve that ULID. This handles 90%+ of all reconciliation cases.

## Secondary heuristics

When primary fails (file renamed, heading text edited, anchor removed), fall through:

- Content hash (sha256) — rename/move detection; strong signal
- Inode (fs_ino) — intra-FS moves; medium (unreliable across devices)
- Structural similarity — rename+edit or heading-text-edit; weak, heuristic
- Position among siblings — unnamed blocks, cosmetic session state only
- Parent-scope slug near-match — for unanchored headings

Heuristics only fire when .name changed. Mistakes are cosmetic for unreferenced content (self-healing); impossible for referenced content (literal string match is exact).

## Scope

- Branded NodeId + RepoId types in @km/core
- Path-of-.name resolver (tree traversal + match)
- Content-hash rename detection with fs_mtime cache
- Inode-based rename hint (secondary)
- Structural-similarity fallback (optional, for edge cases)
- No frontmatter writes, no inline anchor mutation, no metadata injection

## Acceptance

- [ ] Branded NodeId + RepoId types exported
- [ ] Primary path-of-.name match handles files/headings/blocks/tags
- [ ] Content-hash fallback covers offline rename (unchanged content)
- [ ] Property tests: arbitrary offline edit sequences → identity preserved where .name stable, cosmetic-only drift otherwise
- [ ] Zero writes to user .md files for identity purposes

## References

- Design: hub/km/storage-architecture.md §3 + §2 (.name model)
- Research: hub/km/research/kimmi-crdt-sync-id-deep-dive.md, cloudi-architecture-deep-dive.md
- Parent: @km/storage/adapter-architecture

