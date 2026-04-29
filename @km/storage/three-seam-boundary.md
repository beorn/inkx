---
id: "@km/storage/three-seam-boundary"
aliases:
  - km-storage.three-seam-boundary
  - km-storage-three-seam-boundary
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:04:07Z
closed_at: 2026-04-21T20:27:05Z
close_reason: Superseded by km-storage.adapter-architecture. Three bespoke
  interfaces (RepoStore + MarkdownAdapter + WorkspaceFederation) replaced by a
  uniform Adapter contract following kimmi's RemoteRegistry + Connector pattern
  and cloudi's unstorage+driver pattern. See
  hub/km/source-of-truth-rfc-v2-addendum-identity.md §7.
owner: bjorn@stabell.org
dependencies:
  - issue_id: km-storage.three-seam-boundary
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T12:04:07Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.three-seam-boundary
    depends_on_id: km-storage.stable-ids
    type: blocks
    created_at: 2026-04-21T12:04:07Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Three-seam storage boundary — RepoStore + MarkdownAdapter + WorkspaceFederation @km/storage #feature #P1

blocks:: [[@km/storage]], [[@km/storage/stable-ids]]

Replace the speculative single AtomicStore interface (in source-of-truth-rfc v1) with three disjoint interfaces so km can flip A-vs-C later by replacing one seam, not three.

## Why

Pro review 2026-04-21 called v1's single AtomicStore interface leaky:

> 'This mixes three different concerns: content store, markdown projection/import, workspace/repo topology. That will lock you in. Use three seams, not one.'

## The three seams

- RepoStore — atomic structured-doc API; transact / readDoc / readBlock / query / subscribe. No FS knowledge.
- MarkdownAdapter — FS/watch/parse/materialize. scanExternal / importFile / materializeDoc / suppressSelfWrite.
- WorkspaceFederation — mount/unmount/query composition across repos.

Under Family A: RepoStore is thin SQLite-backed transactional mirror hydrated on demand from MarkdownAdapter. Under a future Family C: RepoStore becomes canonical; MarkdownAdapter becomes export-only projection.

## Acceptance

- Three interfaces exported from @km/storage (or @km/core)
- Current SQLite + watcher code refactored under these seams
- No raw fs calls outside MarkdownAdapter
- No raw path strings crossing RepoStore boundary (requires @km/storage/stable-ids)
- One integration test per seam with a mock implementation (proves swappability)

## Depends on

- @km/storage/stable-ids (DocId lands first; RepoStore interface uses DocId, not string path)

## Blocks

- @km/storage/lazy-hydration (HydrationPort becomes part of RepoStore, not parallel)
- @km/storage/federation (depends on RepoStore-per-repo shape)

See hub/km/source-of-truth-rfc-v2.md §2.2