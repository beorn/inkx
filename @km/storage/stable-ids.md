---
id: "@km/storage/stable-ids"
aliases:
  - km-storage.stable-ids
  - km-storage-stable-ids
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:03:35Z
closed_at: 2026-04-21T20:27:05Z
close_reason: Superseded by km-storage.identity-recovery-cascade. RFC v2
  addendum reframes identity as a feature of the FS adapter (Rank 1-6 cascade
  using frontmatter id + inode + path + content hash), not a km-storage
  primitive. See hub/km/source-of-truth-rfc-v2-addendum-identity.md §7 for the
  adapter-architecture reframe.
---

# [x] Stable identity primitives — DocId / BlockId / RepoId branded types @km/storage #feature #P1

blocks:: [[@km/storage]]

Introduce stable identity primitives across km so paths stop being identity.

## Why now

Both dual-pro models independently landed on stable IDs as the single highest-leverage architectural move km is missing. From pro review:

> 'Stop using path as the primary identity of docs/blocks. Use stable IDs. This matters under both A and C: rename/move should not break identity; cross-repo federation needs durable references; wiki-links / block refs need stable targets; future CRDT migration becomes much easier; index invalidation becomes smaller. If you do not fix this now, both architectures stay brittle.'

Kimmi already does this (UUIDs + URI-scheme ref); cloudi has ID-instability flagged 🔴 Critical in its own ADR05 (Gmail messageId mutates on edit). Both reinforce: stable IDs are the hinge.

## Scope

- DocId = branded string (UUID or short ID in YAML frontmatter)
- BlockId = branded string (Obsidian ^blockid style) — only when load-bearing (headings with refs, block refs)
- RepoId = branded string (one per mounted repo; see @km/storage/federation)
- New file write: km writes 'id: dnhJf7k4' into YAML frontmatter
- Existing file: backfill migration in background job
- Wiki-links inside km resolve by DocId; external [[wikilinks]] still work by path for Obsidian interop
- Every module's state that holds 'string path' gets audited and migrated to DocId where identity is meant

## Acceptance

- DocId / BlockId / RepoId branded types exported from @km/core
- Migration writes id: into frontmatter of every indexed .md (idempotent)
- Grep shows zero 'path: string' in state types where identity is meant
- Wiki-link resolution by DocId works; path fallback for external Obsidian refs
- Existing beads that store paths (@km/tui/omnibox, undo) migrated to DocId