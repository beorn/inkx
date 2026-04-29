---
id: "@km/storage/federation"
aliases:
  - km-storage.federation
  - km-storage-federation
created_by: claude:8b5b9e1c
created_at: 2026-04-21T19:04:30Z
closed_at: 2026-04-22T07:23:23Z
close_reason: "Shipped: readOrMintRepoId + loadWorkspace + parseKmUri. Bun.TOML
  parser + handwritten flat-kv writer (zero-dep). 49 tests passing. Phase
  A-appropriate: parse + resolve only; Repo-lifecycle wiring is a follow-up.
  fs-mount package extraction deferred as cosmetic refactor."
owner: bjorn@stabell.org
assignee: claude:8b5b9e1c
dependencies:
  - issue_id: km-storage.federation
    depends_on_id: km-storage
    type: parent-child
    created_at: 2026-04-21T22:30:08Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.federation
    depends_on_id: km-storage.fs-mount
    type: blocks
    created_at: 2026-04-21T23:05:22Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.federation
    depends_on_id: km-storage.identity-schema
    type: blocks
    created_at: 2026-04-21T23:05:22Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
  - issue_id: km-storage.federation
    depends_on_id: km-storage.three-seam-boundary
    type: blocks
    created_at: 2026-04-21T12:04:30Z
    created_by: claude:8b5b9e1c
    metadata: "{}"
---

# [x] Per-repo federation — .km/state.db per mounted repo + workspace composition @km/storage #feature #P2 @claude:8b5b9e1c

blocks:: [[@km/storage]], [[@km/storage/fs-mount]], [[@km/storage/identity-schema]], [[@km/storage/three-seam-boundary]]

Decompose the monolithic .km/state.db into per-repo stores with a workspace layer that composes them.

## Why now

Both pro models flagged federation as a do-now-regardless-of-A-vs-C decision. From GPT-5.4 Pro:

> 'This part of the user pushback is absolutely right. Per-repo storage is not a CRDT question. It is a topology question.'

From K2.6:

> 'AtomicStore boundary does NOT buy freedom to pivot if the first implementation uses FS paths as identity... Federation is trivial under stable IDs — repos are disjoint namespaces.'

User framing:

> 'Would it help if we decentralized the indexes per-repo — so ~vault doesn't have to index everything in ~gdrive for example (in fact at some point we have to decentralize/federate)?'

## Scope

- One .km/state.db per mounted repo (was: one per workspace root)
- WorkspaceFederation layer composes mounted repos
- Cross-repo links use RepoId-scoped DocId
- Mount = 'kimmi mount ~new-drive' - index builds once, stays local
- Unmount = forget cleanly
- Per-repo sync/backup/versioning (independent of others)

## Benefits

- cheap mount/unmount
- smaller startup scope per repo
- failure isolation (corrupt ~gdrive doesn't break ~vault)
- repo-local sync/backup (sync ~vault without exposing ~gdrive)
- forward-compat with any Family C flip (per-repo CRDT docs become natural)

## Depends on

- @km/storage/stable-ids (DocId needs RepoId scope)
- @km/storage/three-seam-boundary (WorkspaceFederation is one of the three seams)

## Scale-bench context

Current scale-bench failure at 2x (20k files, 102s cold-load) is not just a lazy-hydration problem — it's ALSO a federation problem. Federated per-repo topology caps the per-repo startup scope naturally.

See hub/km/source-of-truth-rfc-v2.md §2.2