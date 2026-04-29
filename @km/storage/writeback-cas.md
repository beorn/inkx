---
id: "@km/storage/writeback-cas"
aliases:
  - km-storage.writeback-cas
  - km-storage-writeback-cas
created_by: claude:8b5b9e1c
created_at: 2026-04-21T23:05:31Z
closed_at: 2026-04-22T07:32:15Z
close_reason: "Shipped §7 Phase A safe writeback: safeWriteFile (content-as-CAS,
  wrote/conflict/noop), writeFileAtomic (same-dir temp+fsync+rename, EXDEV
  fallback), createEchoGuard (mtime+size fast-path, hash slow-path, 5s TTL).
  Conflict emits conflict_created — never silent. Applier + mergeExternalDrift
  paths now keep fs_content_hash in lockstep with disk. 26 tests pass (incl.
  subprocess-kill atomicity). No multi-file journal (Phase A non-goal §7.3).
  withSync path deferred to follow-up."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.writeback-cas
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T22:30:08Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.writeback-cas
    depends_on_id: km-storage.fs-mount
    type: blocks
    created_at: 2026-04-21T23:05:22Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.writeback-cas
    depends_on_id: km-storage.markdown-fidelity-corpus
    type: blocks
    created_at: 2026-04-21T23:05:22Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Safe markdown writeback — content-as-CAS + minimal-patch + echo suppression + multi-file journal @km/storage #feature #P1 @claude:8b5b9e1c

blocks:: [[@km/storage]], [[@km/storage/fs-mount]], [[@km/storage/markdown-fidelity-corpus]]

The #1 unspoken risk flagged by the 2026-04-21 dual-pro review: km must never silently overwrite user edits. Ship a safe writeback contract alongside the FsMount extraction.

## Content-as-CAS

Every in-memory file state carries \`expectedContentHash\`. On write:
1. Read current file on disk
2. Compute \`actualContentHash = sha256(file)\`
3. If actual !== expected: reparse disk, replay change; if conflict → surface, never silent overwrite
4. Atomic write (temp file + rename)
5. Update expectedContentHash

## Minimal patching

Serializer preserves what it doesn't touch:
- whitespace (trailing, indentation, blank lines)
- frontmatter key order
- list marker choice
- line endings
- tabs vs spaces

Rewrites only the exact byte ranges that changed. Noisy git diffs = user-trust event.

## Watcher echo suppression

FsMount writes produce events the watcher sees. Options:
- origin cookie on writes
- short-term path+digest cache
- hash-compare on watch event → skip if match

## Multi-file journal

For operations spanning files (rename + backlink update cascade):
- Writes stored in \`.km/journal/pending/\`
- Applied best-effort + resumable-on-crash
- \`bun km doctor\` surfaces unresolved items

## Acceptance

- [ ] Content-as-CAS on all write paths
- [ ] Minimal-patch serializer verified against fidelity corpus
- [ ] Watcher echo suppression test (km writes, watcher doesn't re-ingest)
- [ ] Journal-based multi-file ops (rename + 10 backlinks)
- [ ] Property test: arbitrary user edit sequences → km never silently overwrites

## Depends on

- @km/storage/fs-mount (CAS lives inside FsMount)
- @km/storage/markdown-fidelity-corpus (gates minimal-patch regression)

See hub/km/storage-architecture.md §7.